import { cleanupCertificateOrphans } from './cleanup'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { pool, transaction } from '../db'
import { sendGmailMessage } from '../google'
import { createCertificateReadUrl, readMasterObject, putCertificateObject, readCertificateObject } from '../r2'
import type { CertificateDocument, CertificateGenerationResult, CertificateServiceOption, SendCertificatesInput } from '../../../src/types/certificates'
import { MAX_TEMPLATE_BYTES, sampleCertificateData, validateTemplate } from './docx'
import { generateCertificatePdf } from './generator'
import { claimCertificateJob, completeCertificateJob, failCertificateJob, lockCertificateJob, markEmailDispatching } from './jobs'
import { certificateSnapshot, effectiveTemplate, loadCertificateContext, loadSettings, targetKey, templateKey } from './repository'
import { assertTemplatePath, bodyObject, certificateType, generationInput, sendInput, uuid } from './validation'

export const certificateRoutes = new Hono<{ Variables: { identity: Identity; certificateAdminId: string } }>()
certificateRoutes.use('*', bodyLimit({ maxSize: 32_000, onError: (context) => context.json({ error: 'La solicitud supera el tamaño permitido' }, 413) }))
certificateRoutes.use('*', async (context, next) => {
  const admin = await transaction((client) => requireAdmin(client, context.get('identity')))
  context.set('certificateAdminId', admin.id)
  context.header('Cache-Control', 'no-store')
  await next()
})

certificateRoutes.get('/settings', async (context) => context.json(await transaction(loadSettings)))

certificateRoutes.put('/templates/:type', async (context) => {
  const type = certificateType(context.req.param('type'))
  const body = await bodyObject(context.req.raw)
  const path = body.storagePath
  assertTemplatePath(path, type)
  if (body.revision !== null && typeof body.revision !== 'string') throw new ApiError(422, 'Actualiza la configuración antes de guardar')
  const template = await readMasterObject(path, MAX_TEMPLATE_BYTES)
  validateTemplate(template, type)
  const result = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [templateKey(type)])
    const current = (await loadSettings(client)).templates.find((item) => item.type === type)!
    if (current.storagePath === path) return current
    if (current.revision !== body.revision) throw new ApiError(409, 'La plantilla cambió en otra sesión. Actualiza la configuración antes de reemplazarla.', 'VERSION_CONFLICT')
    const value = { storagePath: path, revision: randomUUID(), fileName: path.split('/').pop()!.replace(/^[0-9a-f-]{36}-/i, '') }
    await client.query(
      `insert into public.configuracion (categoria, clave, nombre, valor)
       values ('SISTEMA', $1, $2, $3::jsonb) on conflict (categoria, clave) do update set valor = excluded.valor, activo = true`,
      [templateKey(type), `Plantilla de certificado ${type.toLowerCase()}`, JSON.stringify(value)],
    )
    await client.query(
      `insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
       values ($1, 'PLANTILLA_CERTIFICADO_ACTUALIZADA', 'Configuracion', $2, $3::jsonb)`,
      [admin.id, admin.id, JSON.stringify({ type, previous: current, current: value })],
    )
    return { type, ...value }
  })
  return context.json(result)
})

certificateRoutes.post('/preview', async (context) => {
  const body = await bodyObject(context.req.raw)
  const type = certificateType(body.type)
  const settings = await transaction(loadSettings)
  const path = body.storagePath ?? settings.templates.find((template) => template.type === type)?.storagePath
  assertTemplatePath(path, type)
  const pdf = await generateCertificatePdf({ template: await readMasterObject(path, MAX_TEMPLATE_BYTES), type, data: sampleCertificateData(type), preview: true })
  context.header('Content-Type', 'application/pdf')
  context.header('Content-Disposition', 'inline; filename="prueba-sin-validez.pdf"')
  return context.body(new Uint8Array(pdf))
})

certificateRoutes.get('/services', async (context) => {
  const siteId = uuid(context.req.query('siteId'))
  const page = Number(context.req.query('page') ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new ApiError(422, 'La página no es válida')
  const { rows } = await pool.query<CertificateServiceOption>(
    `select sv.id, sv.solicitud, sv.fin_real::text as fecha from public.servicios sv
     join public.sedes s on s.id = sv.sede_id join public.negocios n on n.id = s.negocio_id
     where sv.sede_id = $1 and sv.estado = 'FINALIZADO' and sv.tipo_servicio = 'PRINCIPAL'
     and sv.fin_real is not null and s.tipo_sede = 'NEGOCIO' and n.tipo_cliente = 'NEGOCIO'
     order by sv.fin_real desc, sv.id limit 26 offset $2`, [siteId, (page - 1) * 25],
  )
  return context.json({ items: rows.slice(0, 25), page, hasMore: rows.length > 25 })
})
certificateRoutes.get('/services/:id/context', async (context) => {
  const loaded = await transaction((client) => loadCertificateContext(client, uuid(context.req.param('id'))))
  return context.json(loaded.context)
})

certificateRoutes.post('/generate', async (context) => {
  const input = generationInput(await bodyObject(context.req.raw))
  const actorId = context.get('certificateAdminId')
  const job = await claimCertificateJob('DOCUMENT', input.requestId, input, actorId)
  if (job.completed) return context.json(job.result as CertificateGenerationResult)
  const uploaded: string[] = []
  try {
    const loaded = await transaction((client) => loadCertificateContext(client, input.serviceId))
    const path = effectiveTemplate(loaded, input.type)
    assertTemplatePath(path, input.type)
    const targets = input.type === 'VEHICULO' ? input.vehicleIds : [null]
    const snapshots = targets.map((vehicleId) => certificateSnapshot(loaded, input.type, vehicleId))
    for (const snapshot of snapshots) {
      const expected = input.previousPaths[targetKey(input.type, snapshot.vehicleId)]
      if ((snapshot.previous?.storagePath ?? null) !== expected) throw new ApiError(409, 'Un certificado cambió. Actualiza el servicio antes de regenerar.', 'VERSION_CONFLICT')
      if (snapshot.previous && snapshot.previous.pdfAvailable !== false && !input.confirmReplace) throw new ApiError(409, 'Confirma el reemplazo de los certificados existentes', 'REPLACEMENT_CONFIRMATION_REQUIRED')
    }
    await pool.query("update private.integration_jobs set payload = payload || jsonb_build_object('templatePath', $3::text) where id = $1 and payload->>'token' = $2", [job.id, job.token, path])
    const template = await readMasterObject(path, MAX_TEMPLATE_BYTES)
    const documents: CertificateDocument[] = []
    for (const snapshot of snapshots) {
      const pdf = await generateCertificatePdf({ template, type: input.type, data: snapshot.data })
      const storagePath = `certificates/${input.serviceId}/${job.id}/${randomUUID()}.pdf`
      // Record before PUT too: a timeout can follow a successful R2 write.
      uploaded.push(storagePath)
      await putCertificateObject(storagePath, pdf)
      const { data: _data, previous: _previous, ...metadata } = snapshot
      documents.push({ ...metadata, storagePath, pdfAvailable: true })
    }
    const result = { documents }
    await transaction(async (client) => {
      await requireAdmin(client, context.get('identity'))
      await lockCertificateJob(client, job)
      const service = await client.query<{ version: string }>('select version::text from public.servicios where id = $1 for update', [input.serviceId])
      if (service.rows[0]?.version !== loaded.source.version) throw new ApiError(409, 'El servicio cambió durante la generación. Actualiza e inténtalo de nuevo.', 'VERSION_CONFLICT')
      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i]!
        const document = documents[i]!
        if (snapshot.previous) {
          const updated = await client.query(
            `update public.certificados set plantilla_storage_path_usada = $2, pdf_storage_path = $3, pdf_generado_at=now(),
             estado_generacion = 'GENERADO', error = null, enviado_at = null, destinatarios_json = null
             where id = $1 and pdf_storage_path = $4`, [document.id, path, document.storagePath, snapshot.previous.storagePath],
          )
          if (!updated.rowCount) throw new ApiError(409, 'El certificado cambió en otra sesión. Actualiza el servicio.', 'VERSION_CONFLICT')
        } else {
          const months = input.type === 'ESTABLECIMIENTO' ? loaded.source.businessMonths : loaded.source.vehicleMonths
          await client.query(
            `insert into public.certificados (id, servicio_id, tipo_certificado, vehiculo_id, fecha_expedicion,
             vigencia_meses, fecha_vencimiento, plantilla_storage_path_usada, pdf_storage_path, estado_generacion)
             values ($1, $2, $3, $4, $5::date, $6, $7::date, $8, $9, 'GENERADO')`,
            [document.id, input.serviceId, input.type, document.vehicleId, document.issuedOn, months, document.expiresOn, path, document.storagePath],
          )
        }
        await client.query(
          `insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
           values ($1, 'CERTIFICADO_GENERADO', 'Certificados', $2, $3::jsonb)`,
          [actorId, document.id, JSON.stringify({ jobId: job.id, templatePath: path, previous: snapshot.previous ?? null, current: document })],
        )
      }
      await completeCertificateJob(client, job, result, { sourceVersion: loaded.source.version, templatePath: path, certificates: snapshots.map(({ previous: _previous, ...snapshot }) => snapshot) })
    })
    return context.json(result, 201)
  } catch (error) {
    // Never delete a possibly committed or historical PDF after a transport/commit error.
    // The existing durable cleanup queue receives only this attempt's paths, not prior results.
    if (uploaded.length) await pool.query(
      `insert into private.integration_jobs (job_type, idempotency_key, payload, run_after)
       values ('STORAGE_CLEANUP', $1, $2::jsonb, now() + interval '1 day') on conflict do nothing`,
      [`certificate-orphans:${job.id}:${job.token}`, JSON.stringify({ scope: 'CERTIFICATE_ORPHANS', sourceJobId: job.id, paths: uploaded })],
    ).catch(() => undefined)
    await failCertificateJob(job, error).catch(() => undefined)
    throw error
  }
})

certificateRoutes.post('/documents/:id/read-url', async (context) => {
  const id = uuid(context.req.param('id'))
  const inline = (await bodyObject(context.req.raw)).inline === true
  const { rows } = await pool.query<{ path: string; available: boolean }>(
    `select c.pdf_storage_path as path,
      not exists(select 1 from private.storage_retention_deleted d
        where d.bucket='sr-generated-documents' and d.storage_path=c.pdf_storage_path) as available
      from public.certificados c where c.id=$1 and c.estado_generacion in ('GENERADO', 'ENVIADO')`, [id],
  )
  if (!rows[0]) throw new ApiError(404, 'El PDF no está disponible')
  if (!rows[0].available) throw new ApiError(410, 'El PDF venció. Regenera el certificado con la plantilla actual.', 'PDF_EXPIRED')
  return context.json({ url: createCertificateReadUrl(rows[0].path, inline ? undefined : `certificado-${id}.pdf`) })
})

async function prepareMail(input: SendCertificatesInput) {
  return transaction(async (client) => {
    const loaded = await loadCertificateContext(client, input.serviceId)
    if (!input.recipients.every((email) => loaded.context.recipients.includes(email))) throw new ApiError(422, 'Selecciona correos registrados en el negocio o la sede')
    const documents = input.documents.map((selected) => {
      const document = loaded.context.documents.find((item) => item.id === selected.id && item.storagePath === selected.storagePath)
      if (!document) throw new ApiError(409, 'Un certificado cambió. Actualiza antes de enviar.', 'VERSION_CONFLICT')
      if (document.pdfAvailable === false) throw new ApiError(422, 'El PDF venció. Regenera el certificado antes de enviarlo.', 'PDF_EXPIRED')
      return document
    })
    return { documents, solicitud: loaded.source.solicitud }
  })
}

certificateRoutes.post('/send', async (context) => {
  const input = sendInput(await bodyObject(context.req.raw))
  const actorId = context.get('certificateAdminId')
  const job = await claimCertificateJob('EMAIL', input.requestId, input, actorId)
  if (job.completed) return context.json(job.result as { sent: boolean; messageId: string })
  let dispatched = false
  try {
    const prepared = await prepareMail(input)
    const attachments = []
    let total = 0
    for (const document of prepared.documents) {
      const bytes = await readCertificateObject(document.storagePath)
      total += bytes.length
      if (total > 15 * 1024 * 1024) throw new ApiError(422, 'Selecciona menos certificados: los adjuntos superan 15 MB')
      attachments.push({ name: `${prepared.solicitud}-${document.label}.pdf`, bytes })
    }
    const messageId = await sendGmailMessage({
      to: input.recipients, subject: input.subject, text: input.text, attachments,
      messageId: `${job.id}@certificados.solucionesradicales.invalid`,
      onDispatch: async () => {
        await transaction((client) => requireAdmin(client, context.get('identity')))
        await prepareMail(input)
        await markEmailDispatching(job)
        dispatched = true
      },
    })
    const result = { sent: true, messageId }
    await transaction(async (client) => {
      await lockCertificateJob(client, job)
      for (const document of prepared.documents) {
        // An intervening regeneration must not inherit the old PDF's send status.
        await client.query(
          `update public.certificados set estado_generacion = 'ENVIADO', enviado_at = now(), destinatarios_json = $3::jsonb
           where id = $1 and pdf_storage_path = $2`, [document.id, document.storagePath, JSON.stringify(input.recipients)],
        )
      }
      await client.query(
        `insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
         values ($1, 'CERTIFICADOS_ENVIADOS', 'Certificados', $2, $3::jsonb)`,
        [actorId, input.serviceId, JSON.stringify({ jobId: job.id, messageId, documents: input.documents, recipients: input.recipients })],
      )
      await completeCertificateJob(client, job, result)
    })
    return context.json(result)
  } catch (error) {
    const uncertain = dispatched && !(error instanceof ApiError && error.code === 'EMAIL_REJECTED')
    await failCertificateJob(job, error, uncertain).catch(() => undefined)
    if (uncertain) throw new ApiError(502, 'No fue posible confirmar la entrega. Revisa Enviados en Gmail antes de iniciar otro envío.', 'EMAIL_DELIVERY_UNKNOWN')
    throw error
  }
})

certificateRoutes.post('/maintenance/cleanup', async (context) => context.json(await cleanupCertificateOrphans()))

certificateRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error: error.message, code: error.code }, error.status as 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 500 | 502 | 503)
  const code = (error as Error & { code?: string }).code
  if (code === '23505') return context.json({ error: 'Un certificado cambió en otra sesión. Actualiza el servicio.', code: 'VERSION_CONFLICT' }, 409)
  return context.json({ error: 'No fue posible completar la operación. Conservamos el resultado anterior; vuelve a intentarlo.' }, 500)
})
