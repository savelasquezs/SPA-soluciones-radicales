import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import { pool, transaction } from '../db'

type JobPayload = { fingerprint: string; actorId: string; token?: string; result?: unknown; dispatching?: boolean; uncertain?: boolean }
export type CertificateJob = { id: string; token: string; completed: boolean; result?: unknown }

/** Durable idempotency, isolated from Calendar jobs; no in-memory locks. */
export async function claimCertificateJob(kind: 'DOCUMENT' | 'EMAIL', requestId: string, input: unknown, actorId: string): Promise<CertificateJob> {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return transaction(async (client) => {
    await client.query(
      `insert into private.integration_jobs (job_type, idempotency_key, payload)
       values ($1, $2, $3::jsonb) on conflict (job_type, idempotency_key) do nothing`,
      [kind, `certificate:${requestId}`, JSON.stringify({ fingerprint, actorId, request: input })],
    )
    const { rows } = await client.query<{ id: string; status: string; payload: JobPayload; leased: boolean }>(
      `select id, status, payload, coalesce(lease_until > now(), false) as leased
       from private.integration_jobs where job_type = $1 and idempotency_key = $2 for update`, [kind, `certificate:${requestId}`],
    )
    const row = rows[0]!
    if (row.payload.actorId !== actorId || row.payload.fingerprint !== fingerprint) throw new ApiError(409, 'Este intento pertenece a otra operación. Inicia una nueva acción.', 'IDEMPOTENCY_CONFLICT')
    if (row.status === 'COMPLETED') return { id: row.id, token: '', completed: true, result: row.payload.result }
    if (row.payload.uncertain || (kind === 'EMAIL' && row.payload.dispatching)) {
      throw new ApiError(409, 'No se pudo confirmar la entrega. Revisa Enviados en Gmail antes de iniciar otro envío.', 'EMAIL_DELIVERY_UNKNOWN')
    }
    if (row.status === 'RUNNING' && row.leased) throw new ApiError(409, 'La operación sigue en curso. Espera antes de reintentar.', 'OPERATION_RUNNING')
    const token = randomUUID()
    await client.query(
      `update private.integration_jobs set status = 'RUNNING', attempts = attempts + 1,
       lease_until = now() + interval '15 minutes', last_error = null, updated_at = now(),
       payload = payload || jsonb_build_object('token', $2::text)
       where id = $1`, [row.id, token],
    )
    return { id: row.id, token, completed: false }
  })
}

export async function lockCertificateJob(client: PoolClient, job: CertificateJob): Promise<void> {
  const result = await client.query(
    `select id from private.integration_jobs where id = $1 and status = 'RUNNING'
     and payload->>'token' = $2 for update`, [job.id, job.token],
  )
  if (!result.rowCount) throw new ApiError(409, 'Otro intento tomó la operación. Consulta el resultado antes de continuar.', 'OPERATION_REPLACED')
}

export async function completeCertificateJob(client: PoolClient, job: CertificateJob, result: unknown, snapshot?: unknown): Promise<void> {
  await client.query(
    `update private.integration_jobs set status = 'COMPLETED', lease_until = null, updated_at = now(),
     payload = payload || $3::jsonb where id = $1 and payload->>'token' = $2`,
    [job.id, job.token, JSON.stringify({ result, ...(snapshot ? { snapshot } : {}) })],
  )
}

export async function markEmailDispatching(job: CertificateJob): Promise<void> {
  const result = await pool.query(
    `update private.integration_jobs set payload = payload || '{"dispatching":true}'::jsonb,
     updated_at = now() where id = $1 and status = 'RUNNING' and payload->>'token' = $2`, [job.id, job.token],
  )
  if (!result.rowCount) throw new ApiError(409, 'El intento de envío ya no está activo')
}

export async function failCertificateJob(job: CertificateJob, error: unknown, uncertain = false): Promise<void> {
  const message = error instanceof ApiError ? error.message : 'No fue posible completar la operación'
  await pool.query(
    `update private.integration_jobs set status = 'FAILED', lease_until = null, last_error = $3,
     payload = payload || jsonb_build_object('uncertain', $4::boolean, 'dispatching', false), updated_at = now()
     where id = $1 and status = 'RUNNING' and payload->>'token' = $2`, [job.id, job.token, message, uncertain],
  )
}
