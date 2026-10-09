import { createHash, timingSafeEqual } from 'node:crypto'
import { pool, transaction } from '../db'
import { deleteRetainedServicePhoto } from '../r2'
import type { PoolClient } from 'pg'

type RetentionCandidate = {
  bucket: 'sr-service-media'
  category: 'DEVICE_REVIEW' | 'AREA_NO_ACCESS' | 'CRITERION' | 'FINDING_OPENING' | 'FINDING_CLOSURE'
  source_id: string
  storage_path: string
  expires_at: string
}
const LIMIT = 40

export async function verifyRetentionToken(rawToken: string | undefined): Promise<boolean> {
  if (!rawToken || rawToken.length > 256) return false
  const stored = await pool.query<{ token_sha256: string }>(
    "select token_sha256 from private.storage_retention_auth where name = 'cloudflare-cron'",
  )
  const expected = stored.rows[0]?.token_sha256
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) return false
  const digest = createHash('sha256').update(rawToken).digest()
  return timingSafeEqual(digest, Buffer.from(expected, 'hex'))
}

/** Called ONLY from a Cloudflare cron Worker, never a Neon scheduled trigger. */
export async function runRetentionBatch(mode: 'dry-run' | 'delete'): Promise<{
  mode: string
  candidates: number
  deleted: number
  failed: number
  preview: Record<string, number>
}> {
  const { rows } = await pool.query<RetentionCandidate>(
    `select bucket, category, source_id, storage_path, expires_at
       from private.storage_retention_candidates
       where expires_at <= now()
       order by expires_at, bucket, storage_path limit $1`,
    [LIMIT],
  )
  const preview: Record<string, number> = {}
  for (const item of rows) preview[item.category] = (preview[item.category] ?? 0) + 1
  if (mode === 'dry-run') return { mode, candidates: rows.length, deleted: 0, failed: 0, preview }

  let deleted = 0
  let failed = 0
  for (const item of rows) {
    try {
      const wasDeleted = await deleteEligibleObject(item)
      if (wasDeleted) deleted += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message.slice(0, 200) : 'Error de proveedor'
      // Failure of the audit must not erase the original error or cause a premature delete.
      await pool.query(
        `insert into private.storage_retention_failures
          (bucket, storage_path, attempts, error, retry_after)
          values ($1,$2,1,$3,now() + interval '1 hour')
          on conflict(bucket,storage_path) do update
          set attempts=private.storage_retention_failures.attempts+1, error=excluded.error,
              retry_after=now() + interval '1 hour', updated_at=now()`,
        [item.bucket, item.storage_path, message],
      )
    }
  }
  return { mode, candidates: rows.length, deleted, failed, preview }
}

async function lockSourceRow(client: PoolClient, item: RetentionCandidate): Promise<void> {
  // A row lock on Hallazgo serializes deletion against CERRADO transitions.
  if (item.category === 'FINDING_OPENING' || item.category === 'FINDING_CLOSURE') {
    await client.query('select id from public.hallazgos where id=$1 for update', [item.source_id])
  } else {
    const relation = item.category === 'DEVICE_REVIEW' ? 'revisiones_dispositivos'
      : item.category === 'CRITERION' ? 'evaluaciones_mip_area' : 'servicio_areas'
    const result = await client.query<{ servicio_id: string }>(
      `select servicio_id from public.${relation} where id=$1`, [item.source_id],
    )
    if (result.rows[0]) await client.query('select id from public.servicios where id=$1 for update', [result.rows[0].servicio_id])
  }
}

async function deleteEligibleObject(item: RetentionCandidate): Promise<boolean> {
  return transaction(async client => {
    // Re-check under lock; an opening photo can have an extended life when its
    // finding closes. A concurrent close waits for this short transaction.
    await lockSourceRow(client, item)
    const refreshed = await client.query<RetentionCandidate>(
      `select bucket,category,source_id,storage_path,expires_at
       from private.storage_retention_candidates
       where bucket=$1 and storage_path=$2 and source_id=$3 and category=$4
         and expires_at <= now()`,
      [item.bucket, item.storage_path, item.source_id, item.category],
    )
    const current = refreshed.rows[0]
    if (!current) return false
    if (item.bucket !== 'sr-service-media') throw new Error('Categoría de retención no autorizada')
    await deleteRetainedServicePhoto(item.storage_path)
    await client.query(
      `insert into private.storage_retention_deleted (bucket,storage_path,category,source_id,expired_at)
       values ($1,$2,$3,$4,$5) on conflict(bucket,storage_path) do nothing`,
      [item.bucket, item.storage_path, item.category, item.source_id, current.expires_at],
    )
    await client.query('delete from private.storage_retention_failures where bucket=$1 and storage_path=$2', [item.bucket, item.storage_path])
    return true
  })
}
