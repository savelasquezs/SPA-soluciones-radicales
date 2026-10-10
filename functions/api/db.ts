import { attachDatabasePool } from '@neon/functions'
import { Pool, type PoolClient } from 'pg'
import { ApiError } from './auth'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

export const pool = new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 8_000,
  idleTimeoutMillis: 10_000,
  statement_timeout: 20_000,
  query_timeout: 25_000,
})

// An idle connection can disappear when compute suspends. pg removes that
// client itself; handling the event prevents an unhandled process error.
pool.on('error', () => { console.warn('Se descartó una conexión inactiva de PostgreSQL.') })
attachDatabasePool(pool)

function connectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? String(error.code) : ''
  return code.startsWith('08') || ['57P01', '57P02', '57P03', '53300', '57014', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(code)
    || /query read timeout|connection terminated|timeout exceeded when trying to connect/i.test(error.message)
}

function unavailable(): ApiError {
  return new ApiError(503, 'No fue posible conectar con los datos. Vuelve a intentarlo.', 'DATABASE_UNAVAILABLE')
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect().catch(() => { throw unavailable() })
  let discard = false
  try {
    await client.query('begin')
    const result = await work(client)
    await client.query('commit')
    return result
  } catch (error) {
    discard = connectionFailure(error)
    // Preserve the original failure, even when the broken connection cannot
    // roll back. Never rerun work: COMMIT may have succeeded before disconnect.
    try { await client.query('rollback') }
    catch { discard = true }
    if (connectionFailure(error)) throw unavailable()
    throw error
  } finally {
    client.release(discard)
  }
}
