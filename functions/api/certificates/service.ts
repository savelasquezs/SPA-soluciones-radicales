import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import { pool, transaction } from '../db'
import { readMasterObject, putCertificateObject } from '../r2'
import type { CertificateDocument, CertificateGenerationResult, GenerateCertificateInput } from '../../../src/types/certificates'
import { MAX_TEMPLATE_BYTES } from './docx'
import { generateCertificatePdf } from './generator'
import { claimCertificateJob, completeCertificateJob, failCertificateJob, lockCertificateJob } from './jobs'
import { certificateSnapshot, effectiveTemplate, loadCertificateContext, targetKey } from './repository'
import { assertTemplatePath } from './validation'

export type CertificateAuthorization = (client: PoolClient) => Promise<unknown>
export type CertificateGenerationPlan = Omit<GenerateCertificateInput, 'requestId' | 'serviceId'>
type CertificateBundleInput = { requestId: string; serviceId: string; plans: CertificateGenerationPlan[] }

export async function generateServiceCertificates(
  input: GenerateCertificateInput | CertificateBundleInput, actorId: string, authorize: CertificateAuthorization,
): Promise<CertificateGenerationResult & { replayed: boolean }> {
  await transaction(authorize)
  const job = await claimCertificateJob('DOCUMENT', input.requestId, input, actorId)
  if (job.completed) return { ...job.result as CertificateGenerationResult, replayed: true }
  const uploaded: string[] = []
  try {
    const loaded = await transaction(client => loadCertificateContext(client, input.serviceId))
    const plans = 'plans' in input ? input.plans : [input]
    const snapshots = plans.flatMap(plan => {
      const templatePath = effectiveTemplate(loaded, plan.type)
      assertTemplatePath(templatePath, plan.type)
      const targets = plan.type === 'VEHICULO' ? plan.vehicleIds : [null]
      return targets.map(vehicleId => {
        const snapshot = certificateSnapshot(loaded, plan.type, vehicleId)
        const expected = plan.previousPaths[targetKey(plan.type, vehicleId)]
        if ((snapshot.previous?.storagePath ?? null) !== expected) throw new ApiError(409,
          'Un certificado cambió. Actualiza el servicio antes de regenerar.', 'VERSION_CONFLICT')
        if (snapshot.previous && snapshot.previous.pdfAvailable !== false && !plan.confirmReplace) throw new ApiError(409,
          'Confirma el reemplazo de los certificados existentes', 'REPLACEMENT_CONFIRMATION_REQUIRED')
        return { ...snapshot, templatePath }
      })
    })
    await pool.query("update private.integration_jobs set payload=payload||jsonb_build_object('templatePath',$3::text,'templatePaths',$4::jsonb) where id=$1 and payload->>'token'=$2",
      [job.id,job.token,snapshots[0]?.templatePath,JSON.stringify([...new Set(snapshots.map(snapshot => snapshot.templatePath))])])
    const templates = new Map<string, Uint8Array>()
    const documents: CertificateDocument[] = []
    for (const snapshot of snapshots) {
      await transaction(async client => {
        await authorize(client)
        await lockCertificateJob(client, job)
        await client.query("update private.integration_jobs set lease_until=now()+interval '15 minutes' where id=$1", [job.id])
      })
      if (!templates.has(snapshot.templatePath)) templates.set(snapshot.templatePath, await readMasterObject(snapshot.templatePath, MAX_TEMPLATE_BYTES))
      const pdf = await generateCertificatePdf({ template: templates.get(snapshot.templatePath)!, type: snapshot.type, data: snapshot.data })
      const storagePath = `certificates/${input.serviceId}/${job.id}/${randomUUID()}.pdf`
      uploaded.push(storagePath)
      await putCertificateObject(storagePath, pdf)
      const { data: _data, previous: _previous, templatePath: _templatePath, ...metadata } = snapshot
      documents.push({ ...metadata, storagePath, pdfAvailable: true })
    }
    const result = { documents }
    await transaction(async client => {
      await authorize(client)
      await lockCertificateJob(client, job)
      const service = await client.query<{ version: string }>('select version::text from public.servicios where id=$1 for update', [input.serviceId])
      if (service.rows[0]?.version !== loaded.source.version) throw new ApiError(409,
        'El servicio cambió durante la generación. Actualiza e inténtalo de nuevo.', 'VERSION_CONFLICT')
      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i]!
        const document = documents[i]!
        if (snapshot.previous) {
          const updated = await client.query(`update public.certificados set plantilla_storage_path_usada=$2,pdf_storage_path=$3,pdf_generado_at=now(),
            estado_generacion='GENERADO',error=null,enviado_at=null,destinatarios_json=null
            where id=$1 and pdf_storage_path=$4`, [document.id,snapshot.templatePath,document.storagePath,snapshot.previous.storagePath])
          if (!updated.rowCount) throw new ApiError(409, 'El certificado cambió en otra sesión. Actualiza el servicio.', 'VERSION_CONFLICT')
        } else {
          const months = snapshot.type === 'ESTABLECIMIENTO' ? loaded.source.businessMonths : loaded.source.vehicleMonths
          await client.query(`insert into public.certificados(id,servicio_id,tipo_certificado,vehiculo_id,fecha_expedicion,
            vigencia_meses,fecha_vencimiento,plantilla_storage_path_usada,pdf_storage_path,estado_generacion)
            values($1,$2,$3,$4,$5::date,$6,$7::date,$8,$9,'GENERADO')`,
            [document.id,input.serviceId,snapshot.type,document.vehicleId,document.issuedOn,months,document.expiresOn,snapshot.templatePath,document.storagePath])
        }
        await client.query(`insert into public.auditoria(usuario_id,accion,entidad,registro_id,detalle_json)
          values($1,'CERTIFICADO_GENERADO','Certificados',$2,$3::jsonb)`,
          [actorId,document.id,JSON.stringify({jobId:job.id,templatePath:snapshot.templatePath,previous:snapshot.previous??null,current:document})])
      }
      await completeCertificateJob(client, job, result, {
        sourceVersion: loaded.source.version, templatePath: snapshots[0]?.templatePath,
        certificates: snapshots.map(({ previous: _previous, ...snapshot }) => snapshot),
      })
    })
    return { ...result, replayed: false }
  } catch (error) {
    if (uploaded.length) await pool.query(`insert into private.integration_jobs(job_type,idempotency_key,payload,run_after)
      values('STORAGE_CLEANUP',$1,$2::jsonb,now()+interval '1 day') on conflict do nothing`,
      [`certificate-orphans:${job.id}:${job.token}`,JSON.stringify({scope:'CERTIFICATE_ORPHANS',sourceJobId:job.id,paths:uploaded})]).catch(() => undefined)
    await failCertificateJob(job,error).catch(() => undefined)
    throw error
  }
}
