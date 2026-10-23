import { Hono, type Context } from 'hono'
import QRCode from 'qrcode'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { bodyLimit } from 'hono/body-limit'
import type { PoolClient } from 'pg'
import { ApiError, requireAdmin, requireTechnician, type Identity, type DomainProfile } from '../auth'
import { transaction } from '../db'
import { sendGmailMessage, getGoogleStatus } from '../google'
import { readCertificateObject, createServiceResultMediaReadUrl } from '../r2'
import {
  claimCertificateJob, completeCertificateJob, failCertificateJob, lockCertificateJob, markEmailDispatching,
} from '../certificates/jobs'
import { loadServiceResultsData } from './data'
import { productSheetIndex, reportProductSheetUrl } from './productSheets'
import { assignedServiceState } from '../technician-services/queries'
import { isServiceId } from '../../../src/helpers/adminServices'
import { publicReportData, reportPaths, newReportToken, reportTokenHash, validReportToken } from './public'
import type { ServiceReportShareOptions, SendServiceReportInput } from '../../../src/types/reportSharing'
import { buildReportEmailContent } from './email'
import { ensureReportCertificates } from './certificates'

type Env = { Variables: { identity: Identity } }
export const reportSharingRoutes = new Hono<Env>()
export const technicianReportSharingRoutes = new Hono<Env>()
export const publicReportRoutes = new Hono()
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REPORT_LINK_DAYS = 90

function serviceId(value: unknown): string {
  if (!isServiceId(value)) throw new ApiError(422, 'Servicio no válido', 'VALIDATION')
  return value
}
function readRecipients(values: unknown): string[] {
  if (!Array.isArray(values) || !values.length || values.length > 20 ||
    !values.every(value => typeof value === 'string' && value.length <= 254 && EMAIL.test(value.trim()))) {
    throw new ApiError(422, 'Selecciona entre 1 y 20 direcciones de correo válidas', 'VALIDATION')
  }
  return [...new Set(values.map((email: string) => email.trim().toLowerCase()))].sort()
}
export function assertReportOrigin(value: unknown, allowed: string): string {
  if (typeof value !== 'string' || value.length > 250) throw new ApiError(422, 'El origen del informe no es válido')
  let url: URL
  try { url = new URL(value) } catch { throw new ApiError(422, 'El origen del informe no es válido') }
  const origins = allowed.split(',').map(s => s.trim()).filter(Boolean)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (value !== url.origin || !origins.includes(url.origin) || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new ApiError(422, 'No puedes enviar enlaces desde un origen no autorizado', 'INVALID_REPORT_ORIGIN')
  }
  return url.origin
}
export function parseReportSend(body: Record<string, unknown>, origins: string): SendServiceReportInput {
  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) throw new ApiError(422, 'La solicitud de envío no es válida')
  const recipients = readRecipients(body.recipients)
  if (!Array.isArray(body.certificateIds) || body.certificateIds.length > 10 ||
    !body.certificateIds.every(x => typeof x === 'string' && UUID.test(x))) {
    throw new ApiError(422, 'Selecciona certificados válidos, como máximo 10')
  }
  const certificateIds = [...new Set(body.certificateIds as string[])].sort()
  if (certificateIds.length !== body.certificateIds.length) throw new ApiError(422, 'Hay certificados repetidos')
  const subject = body.subject === undefined ? null : body.subject
  const message = body.message === undefined ? null : body.message
  if (subject !== null && (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject))) {
    throw new ApiError(422, 'El asunto debe tener entre 1 y 200 caracteres y no contener saltos de línea', 'VALIDATION')
  }
  if (message !== null && (typeof message !== 'string' || !message.trim() || message.length > 4000)) {
    throw new ApiError(422, 'El mensaje debe tener entre 1 y 4000 caracteres', 'VALIDATION')
  }
  return {
    requestId: body.requestId, recipients, certificateIds,
    origin: assertReportOrigin(body.origin, origins),
    subject: subject === null ? null : (subject as string).trim(),
    message: message === null ? null : (message as string).trim(),
  }
}

type ShareCertificate = { id: string; label: string; type: 'ESTABLECIMIENTO' | 'VEHICULO'; expiresOn: string; path: string }
type ShareContext = {
  solicitud: string; cliente: string; sede: string
  registeredEmails: string[]; documents: ShareCertificate[]
}
async function loadSharingContext(client: PoolClient, id: string): Promise<ShareContext> {
  const report = await loadServiceResultsData(client, id)
  const { rows: [source] } = await client.query<{
    businessEmails: unknown; siteEmails: unknown; contactEmail: string | null
  }>("select n.correos_json as \"businessEmails\", se.correos_json as \"siteEmails\", se.contacto_principal_correo as \"contactEmail\" " +
    "from public.servicios s join public.sedes se on se.id=s.sede_id " +
    "join public.negocios n on n.id=se.negocio_id where s.id=$1", [id])
  if (!source) throw new ApiError(404, 'Servicio no encontrado')
  const emails: unknown[] = [source.businessEmails, source.siteEmails].flatMap(value => Array.isArray(value) ? value : [])
  emails.push(source.contactEmail)
  const registeredEmails = [...new Set(emails.filter((v): v is string => typeof v === 'string' && EMAIL.test(v.trim()))
    .map(v => v.trim().toLowerCase()))].sort()
  const { rows: documents } = await client.query<ShareCertificate>(
    "select c.id, c.tipo_certificado as type, coalesce(v.placa,'Establecimiento') as label, " +
    "c.fecha_vencimiento::text as \"expiresOn\", c.pdf_storage_path as path " +
    "from public.certificados c left join public.vehiculos v on v.id=c.vehiculo_id " +
    "where c.servicio_id=$1 and c.estado_generacion in ('GENERADO','ENVIADO') " +
    "and c.pdf_storage_path is not null and not exists (select 1 from private.storage_retention_deleted d " +
    "where d.bucket='sr-generated-documents' and d.storage_path=c.pdf_storage_path) " +
    "order by c.tipo_certificado, c.fecha_expedicion desc, c.id", [id])
  return { solicitud:report.solicitud, cliente:report.cliente, sede:report.sede, registeredEmails, documents }
}

type ShareMode = 'ADMINISTRADOR' | 'TECNICO'

async function authorizeSharing(client: PoolClient, identity: Identity, id: string, mode: ShareMode): Promise<DomainProfile> {
  if (mode === 'ADMINISTRADOR') return requireAdmin(client, identity)
  const technician = await requireTechnician(client, identity)
  const assigned = await assignedServiceState(client, technician.id, id)
  if (assigned.estado !== 'FINALIZADO' || assigned.tipo_servicio !== 'PRINCIPAL') {
    throw new ApiError(409, 'El informe solo puede enviarse después de confirmar la finalización del servicio.', 'SERVICE_NOT_FINALIZED')
  }
  return technician
}

for (const [routes, mode] of [
  [reportSharingRoutes, 'ADMINISTRADOR'],
  [technicianReportSharingRoutes, 'TECNICO'],
] as const) {
  routes.use('*', bodyLimit({ maxSize: 7_000, onError: c => c.json({ error:'Solicitud demasiado grande' }, 413) }))
  routes.use('*', async (context, next) => {
    await transaction(client => mode === 'TECNICO'
      ? requireTechnician(client, context.get('identity'))
      : requireAdmin(client, context.get('identity')))
    context.header('Cache-Control', 'no-store')
    await next()
  })
}

async function reportShareOptions(context: Context<Env>, mode: ShareMode) {
  const id = serviceId(context.req.param('id'))
  await transaction(client => authorizeSharing(client, context.get('identity'), id, mode))
  const [options, sharing, google, generation] = await Promise.all([
    transaction(client => loadSharingContext(client, id)),
    transaction(async client => (await client.query<{ activeLinks: number; lastSharedAt: string | null }>(
      "select count(*) filter (where sent_at is not null and revoked_at is null and expires_at>now())::int as \"activeLinks\", " +
      "max(sent_at)::text as \"lastSharedAt\" from private.service_report_links where servicio_id=$1", [id])).rows[0]!),
    getGoogleStatus(),
    transaction(async client => (await client.query<{
      status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'; error: string | null
    }>("select status,last_error as error from private.integration_jobs where job_type='DOCUMENT' and idempotency_key=$1",
    ['service-certificates:'+id])).rows[0] ?? null),
  ])
  const response: ServiceReportShareOptions = {
    registeredEmails: options.registeredEmails,
    certificates: options.documents.map(({ path: _path, ...document }) => document),
    activeLinks: sharing.activeLinks,
    lastSharedAt: sharing.lastSharedAt,
    gmailConnected: google.connected,
    gmailNeedsReauthorization: google.needsReauthorization,
    certificateGeneration: generation,
  }
  return context.json(response)
}
reportSharingRoutes.get('/:id/report-sharing', c => reportShareOptions(c, 'ADMINISTRADOR'))
technicianReportSharingRoutes.get('/:id/report-sharing', c => reportShareOptions(c, 'TECNICO'))

reportSharingRoutes.post('/:id/report-sharing/revoke', async context => {
  const id = serviceId(context.req.param('id'))
  const body = await context.req.json().catch(() => ({})) as { confirm?: unknown }
  if (body.confirm !== true) throw new ApiError(422, 'Confirma la revocación de enlaces')
  const count = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    await loadSharingContext(client, id)
    const response = await client.query(
      "update private.service_report_links set revoked_at=now() " +
      "where servicio_id=$1 and revoked_at is null and sent_at is not null returning id", [id])
    await client.query("insert into public.auditoria(usuario_id,accion,entidad,registro_id,detalle_json) " +
      "values ($1,'INFORME_ENLACES_REVOCADOS','Servicios',$2,$3::jsonb)",
    [admin.id,id,JSON.stringify({ cantidad: response.rowCount })])
    return response.rowCount ?? 0
  })
  return context.json({ revoked: count })
})

async function sendReportWithRole(context: Context<Env>, mode: ShareMode) {
  const id = serviceId(context.req.param('id'))
  const body = await context.req.json().catch(() => ({})) as Record<string, unknown>
  const input = parseReportSend(body, process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  const actor = await transaction(client => authorizeSharing(client, context.get('identity'), id, mode))
  const job = await claimCertificateJob('EMAIL', input.requestId, { serviceId:id, ...input }, actor.id, 'report')
  if (job.completed) return context.json(job.result)
  let dispatching = false
  let shareId: string | null = null
  try {
    const prepared = await ensureReportCertificates(id, actor.id, async client => {
      await authorizeSharing(client, context.get('identity'), id, mode)
      await lockCertificateJob(client, job)
      await client.query("update private.integration_jobs set lease_until=now()+interval '15 minutes' where id=$1", [job.id])
    })
    const selected = await transaction(async client => {
      const ready = await loadSharingContext(client, id)
      const documents = prepared.map(certificate => {
        const found = ready.documents.find(document => document.id === certificate.id && document.path === certificate.storagePath)
        if (!found) throw new ApiError(409, 'Un certificado cambió durante la preparación. Reintenta el envío.', 'CERTIFICATE_CHANGED')
        return found
      })
      return { ready, documents }
    })
    const certificateIds = selected.documents.map(document => document.id)
    const attachments: { name: string; bytes: Uint8Array }[] = []
    let size = 0
    for (const certificate of selected.documents) {
      const bytes = await readCertificateObject(certificate.path)
      size += bytes.length
      if (size > 15 * 1024 * 1024) throw new ApiError(422, 'Los certificados del servicio superan 15 MB. Solicita al administrador revisar su tamaño antes de enviar.')
      attachments.push({ name: selected.ready.solicitud + '-' + certificate.label + '.pdf', bytes })
    }
    const token = newReportToken()
    const expiresAt = new Date(Date.now() + REPORT_LINK_DAYS * 86400_000).toISOString()
    const reportLink = input.origin + '/informe/consulta/' + encodeURIComponent(token)
    const subject = input.subject ?? 'Informe técnico MIP · ' + selected.ready.solicitud + ' · ' + selected.ready.sede
    const personalMessage = input.message ?? 'Buen día,\n\nCompartimos el informe técnico de la visita realizada. Gracias por confiar en Soluciones Radicales.'
    const contentId = 'report-qr@solucionesradicales.invalid'
    const mail = buildReportEmailContent({
      message: personalMessage,
      solicitud: selected.ready.solicitud,
      cliente: selected.ready.cliente,
      sede: selected.ready.sede,
      link: reportLink,
      expiresOn: new Intl.DateTimeFormat('es-CO', {
        timeZone:'America/Bogota',day:'2-digit',month:'long',year:'numeric',
      }).format(new Date(expiresAt)),
      certificateCount: attachments.length,
      qrContentId: contentId,
    })
    // Pure JS QR: no external service receives the private URL, no native image packages.
    const qr = await QRCode.toBuffer(reportLink, {
      type:'png',errorCorrectionLevel:'M',width:192,margin:2,
      color:{ dark:'#17324d',light:'#ffffff' },
    })
    shareId = await transaction(async client => {
      await lockCertificateJob(client, job)
      const { rows } = await client.query<{ id: string }>(
        "insert into private.service_report_links " +
          "(servicio_id,job_id,token_sha256,expires_at,created_by_id) " +
          "values ($1,$2,$3,$4,$5) returning id",
      [id,job.id,reportTokenHash(token),expiresAt,actor.id])
      return rows[0]!.id
    })
    const messageId = await sendGmailMessage({
      to: input.recipients,
      subject, text: mail.text, html: mail.html,
      inlineImages: [{
        contentId,bytes:qr,name:'codigo-qr-' + selected.ready.solicitud + '.png',
      }],
      attachments,
      messageId: job.id + '@informes.solucionesradicales.invalid',
      onDispatch: async () => {
        await transaction(async client => {
          await authorizeSharing(client, context.get('identity'), id, mode)
          await loadSharingContext(client, id)
          if (certificateIds.length) {
            const latest = await client.query<{ id: string; path: string }>(
              "select id,pdf_storage_path as path from public.certificados " +
              "where servicio_id=$1 and id=any($2::uuid[]) and estado_generacion in ('GENERADO','ENVIADO')",
              [id,certificateIds])
            for (const item of selected.documents) {
              if (!latest.rows.some(row => row.id === item.id && row.path === item.path)) {
                throw new ApiError(409, 'Un certificado cambió durante el envío. No se envió el correo.', 'CERTIFICATE_CHANGED')
              }
            }
          }
          await lockCertificateJob(client, job)
          await client.query("update private.service_report_links set sent_at=now(), " +
            "recipients_json=$2::jsonb,certificate_ids_json=$3::jsonb " +
            "where id=$1 and revoked_at is null",
          [shareId,JSON.stringify(input.recipients),JSON.stringify(certificateIds)])
        })
        await markEmailDispatching(job)
        dispatching = true
      },
    })
    const result = { sent:true,linkExpiresAt:expiresAt,attachmentCount:attachments.length }
    await transaction(async client => {
      await lockCertificateJob(client, job)
      await client.query("insert into public.auditoria(usuario_id,accion,entidad,registro_id,detalle_json) " +
        "values ($1,'INFORME_ENVIADO','Servicios',$2,$3::jsonb)",
      [actor.id,id,JSON.stringify({ jobId:job.id,messageId,recipients:input.recipients,certificateIds,expiresAt })])
      await client.query("update public.certificados c set estado_generacion='ENVIADO',enviado_at=now(),destinatarios_json=$3::jsonb " +
        "from unnest($2::uuid[],$4::text[]) as sent(id,path) where c.servicio_id=$1 and c.id=sent.id and c.pdf_storage_path=sent.path",
      [id,certificateIds,JSON.stringify(input.recipients),selected.documents.map(document => document.path)])
      await completeCertificateJob(client, job, result)
    })
    return context.json(result)
  } catch (error) {
    const rejected = error instanceof ApiError && error.code === 'EMAIL_REJECTED'
    const uncertain = dispatching && !rejected
    if (shareId && !uncertain) {
      await transaction(client => client.query('update private.service_report_links set revoked_at=now() where id=$1',[shareId])).catch(() => undefined)
    }
    await failCertificateJob(job,error,uncertain).catch(() => undefined)
    if (uncertain) throw new ApiError(502,'No se pudo confirmar el envío. Revisa la carpeta Enviados antes de repetirlo.','EMAIL_DELIVERY_UNKNOWN')
    throw error
  }
}
reportSharingRoutes.post('/:id/report-sharing/send', c => sendReportWithRole(c, 'ADMINISTRADOR'))
technicianReportSharingRoutes.post('/:id/report-sharing/send', c => sendReportWithRole(c, 'TECNICO'))

// Tokens travel in POST bodies to avoid exposing them in API path or query logs.
publicReportRoutes.use('*', bodyLimit({ maxSize: 2_000, onError: c => c.json({ error:'Solicitud demasiado grande' }, 413) }))
publicReportRoutes.use('*', async (context, next) => {
  await next()
  context.header('Cache-Control','no-store')
  context.header('Referrer-Policy','no-referrer')
})
async function lookupPublicReport(client: PoolClient, token: unknown): Promise<string> {
  if (!validReportToken(token)) throw new ApiError(404,'El enlace no está disponible','REPORT_NOT_FOUND')
  const { rows } = await client.query<{ serviceId: string }>(
    "select l.servicio_id as \"serviceId\" from private.service_report_links l " +
    "join public.servicios s on s.id=l.servicio_id " +
    "where l.token_sha256=$1 and l.sent_at is not null and l.revoked_at is null " +
    "and l.expires_at>now() and s.estado='FINALIZADO' and s.tipo_servicio='PRINCIPAL'",
  [reportTokenHash(token)])
  if (!rows[0]) throw new ApiError(404,'El enlace venció o fue revocado','REPORT_NOT_FOUND')
  return rows[0].serviceId
}
publicReportRoutes.post('/resolve', async context => {
  const body = await context.req.json().catch(() => ({})) as { token?: unknown }
  const data = await transaction(async client => loadServiceResultsData(client, await lookupPublicReport(client, body.token)))
  return context.json({ data:publicReportData(data) })
})
publicReportRoutes.post('/media', async context => {
  const body = await context.req.json().catch(() => ({})) as { token?: unknown; mediaId?: unknown }
  const result = await transaction(async client => {
    const id = await lookupPublicReport(client, body.token)
    const media = typeof body.mediaId === 'string' && /^e:(0|[1-9]\d{0,3})$/.test(body.mediaId)
      ? Number(body.mediaId.slice(2)) : -1
    const data = await loadServiceResultsData(client, id)
    const path = reportPaths(data)[media]
    if (!path) throw new ApiError(404,'Esta evidencia no está disponible','EVIDENCE_NOT_FOUND')
    return { url:createServiceResultMediaReadUrl(path,path.split('/')[1]!) }
  })
  return context.json(result)
})

reportSharingRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error:error.message,code:error.code },error.status as ContentfulStatusCode)
  console.error('SERVICE_REPORT_SHARING_ERROR')
  return context.json({ error:'No fue posible realizar la operación' },500)
})
technicianReportSharingRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error:error.message,code:error.code },error.status as ContentfulStatusCode)
  console.error('TECHNICIAN_REPORT_SHARING_ERROR')
  return context.json({ error:'No fue posible enviar el informe' },500)
})
publicReportRoutes.post('/product-sheet', async context => {
  const body = await context.req.json().catch(() => ({})) as {token?:unknown;index?:unknown}
  const index=productSheetIndex(body.index)
  const url=await transaction(async client=>{
    const id=await lookupPublicReport(client,body.token)
    await loadServiceResultsData(client,id)
    return reportProductSheetUrl(client,id,index)
  })
  return context.json({url})
})
publicReportRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error:error.message,code:error.code },error.status as ContentfulStatusCode)
  console.error('PUBLIC_SERVICE_REPORT_ERROR')
  return context.json({ error:'No fue posible consultar el informe' },500)
})
