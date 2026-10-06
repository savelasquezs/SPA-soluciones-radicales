import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import { transaction } from '../db'
import { deleteCertificateObject } from '../r2'
import { deleteGoogleDriveTemporaryFile } from '../google'

/** Shared master cleanup guard: used by existing form rollback/replacement flows too. */
export async function assertMasterUnreferenced(client: PoolClient, path: string): Promise<void> {
  const { rows } = await client.query<{ used: boolean }>(
    `select exists (
      select 1 from public.usuarios where certificado_storage_path = $1
      union all select 1 from public.negocios where plantilla_cert_establecimiento_storage_path = $1
      union all select 1 from public.sedes where plano_storage_path = $1 or plantilla_cert_vehiculo_storage_path = $1
      union all select 1 from public.configuracion where categoria = 'SISTEMA' and valor->>'storagePath' = $1
      union all select 1 from public.certificados where plantilla_storage_path_usada = $1
      union all select 1 from public.auditoria where accion = 'CERTIFICADO_GENERADO' and detalle_json->>'templatePath' = $1
      union all select 1 from public.auditoria where accion = 'PLANTILLA_CERTIFICADO_ACTUALIZADA'
        and (detalle_json->'current'->>'storagePath' = $1 or detalle_json->'previous'->>'storagePath' = $1)
      union all select 1 from private.integration_jobs where job_type = 'DOCUMENT' and status = 'RUNNING' and payload->>'templatePath' = $1
    ) as used`, [path],
  )
  if (rows[0]?.used) throw new ApiError(409, 'El archivo está en uso o forma parte del historial y se conserva.', 'FILE_IN_USE')
}

/** One due, bounded cleanup attempt per invocation. No scanning/deleting unrelated objects. */
export async function cleanupCertificateOrphans(): Promise<{ processed: number }> {
  return transaction(async (client) => {
    const { rows } = await client.query<{
      id: string
      payload: { scope?: string; paths?: string[]; sourceJobId?: string; fileId?: string }
    }>(
      `select id, payload from private.integration_jobs where job_type = 'STORAGE_CLEANUP'
       and payload->>'scope' in ('CERTIFICATE_ORPHANS', 'GOOGLE_DRIVE_TEMP')
       and status in ('PENDING', 'FAILED') and run_after <= now()
       order by run_after limit 1 for update skip locked`,
    )
    const job = rows[0]
    if (!job) return { processed: 0 }

    const complete = async () => {
      await client.query(
        "update private.integration_jobs set status = 'COMPLETED', attempts = attempts + 1, last_error = null, updated_at = now() where id = $1",
        [job.id],
      )
      return { processed: 1 }
    }
    const fail = async (message: string) => {
      await client.query(
        "update private.integration_jobs set status = 'FAILED', attempts = attempts + 1, run_after = now() + interval '1 hour', last_error = $2, updated_at = now() where id = $1",
        [job.id, message],
      )
      return { processed: 0 }
    }

    if (job.payload.scope === 'GOOGLE_DRIVE_TEMP') {
      const fileId = job.payload.fileId
      if (!fileId || fileId.length > 256) return fail('Tarea de limpieza de Google Drive no válida')
      try {
        await deleteGoogleDriveTemporaryFile(fileId)
        return complete()
      } catch {
        return fail('No fue posible limpiar el documento temporal de Google Drive')
      }
    }

    const sourceJobId = job.payload.sourceJobId
    const paths = job.payload.paths
    if (!sourceJobId || !Array.isArray(paths) || paths.length > 10) return fail('Tarea de limpieza no válida')

    const source = await client.query<{ status: string }>(
      'select status from private.integration_jobs where id = $1 for update',
      [sourceJobId],
    )
    if (!source.rows[0] || source.rows[0].status === 'RUNNING') {
      await client.query("update private.integration_jobs set run_after = now() + interval '1 hour' where id = $1", [job.id])
      return { processed: 0 }
    }

    try {
      for (const path of paths) {
        if (!path.includes(`/${sourceJobId}/`)) throw new ApiError(422, 'Tarea de limpieza no válida')
        const used = await client.query<{ used: boolean }>(
          `select exists (
             select 1 from public.certificados where pdf_storage_path = $1
             union all select 1 from public.auditoria where accion = 'CERTIFICADO_GENERADO'
             and (detalle_json->'current'->>'storagePath' = $1 or detalle_json->'previous'->>'storagePath' = $1)
           ) as used`, [path],
        )
        if (!used.rows[0]?.used) await deleteCertificateObject(path)
      }
      return complete()
    } catch {
      return fail('No fue posible limpiar el documento temporal')
    }
  })
}
