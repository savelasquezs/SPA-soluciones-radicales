import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import { transaction } from '../db'
import { deleteCertificateObject } from '../r2'

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

/** One due, bounded attempt per invocation. No scanning/deleting unrelated bucket objects. */
export async function cleanupCertificateOrphans(): Promise<{ processed: number }> {
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string; payload: { paths: string[]; sourceJobId: string } }>(
      `select id, payload from private.integration_jobs where job_type = 'STORAGE_CLEANUP'
       and payload->>'scope' = 'CERTIFICATE_ORPHANS' and status in ('PENDING', 'FAILED') and run_after <= now()
       order by run_after limit 1 for update skip locked`,
    )
    const job = rows[0]
    if (!job) return { processed: 0 }
    const source = await client.query<{ status: string }>('select status from private.integration_jobs where id = $1 for update', [job.payload.sourceJobId])
    if (!source.rows[0] || source.rows[0].status === 'RUNNING') {
      await client.query("update private.integration_jobs set run_after = now() + interval '1 hour' where id = $1", [job.id])
      return { processed: 0 }
    }
    try {
      if (!Array.isArray(job.payload.paths) || job.payload.paths.length > 10) throw new ApiError(422, 'Tarea de limpieza no válida')
      for (const path of job.payload.paths) {
        if (!path.includes(`/${job.payload.sourceJobId}/`)) throw new ApiError(422, 'Tarea de limpieza no válida')
        const used = await client.query<{ used: boolean }>(
          `select exists (
             select 1 from public.certificados where pdf_storage_path = $1
             union all select 1 from public.auditoria where accion = 'CERTIFICADO_GENERADO'
             and (detalle_json->'current'->>'storagePath' = $1 or detalle_json->'previous'->>'storagePath' = $1)
           ) as used`, [path],
        )
        if (!used.rows[0]?.used) await deleteCertificateObject(path)
      }
      await client.query("update private.integration_jobs set status = 'COMPLETED', attempts = attempts + 1, last_error = null, updated_at = now() where id = $1", [job.id])
      return { processed: 1 }
    } catch {
      await client.query("update private.integration_jobs set status = 'FAILED', attempts = attempts + 1, run_after = now() + interval '1 hour', last_error = 'No fue posible limpiar el documento temporal', updated_at = now() where id = $1", [job.id])
      return { processed: 0 }
    }
  })
}
