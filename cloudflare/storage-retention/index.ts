/**
 * Cloudflare Cron es el único programador de la retención.
 * Neon Functions verifica cada referencia y borra objetos R2 con PostgreSQL
 * bloqueado; nunca usar este Worker para operaciones de cliente.
 */
export interface Env {
  RETENTION_API_URL: string
  RETENTION_CRON_TOKEN: string
  RETENTION_MODE?: string
}

const BATCH_LIMIT = 40
const MAX_BATCHES = 10

type Summary = { mode: string; candidates: number; deleted: number; failed: number }

export async function runScheduledRetention(env: Env): Promise<{ batches: number; candidates: number; deleted: number; failed: number }> {
  const mode = env.RETENTION_MODE === 'delete' ? 'delete' : 'dry-run'
  if (!env.RETENTION_API_URL?.startsWith('https://') || !env.RETENTION_CRON_TOKEN || env.RETENTION_CRON_TOKEN.length < 32) {
    throw new Error('Falta configuración privada de retención')
  }
  const totals = { batches: 0, candidates: 0, deleted: 0, failed: 0 }
  for (let i = 0; i < (mode === 'delete' ? MAX_BATCHES : 1); i += 1) {
    const response = await fetch(env.RETENTION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RETENTION_CRON_TOKEN}`,
      },
      body: JSON.stringify({ mode }),
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`La API de retención respondió HTTP ${response.status}`)
    const batch = await response.json() as Summary
    if (batch.mode !== mode || !Number.isInteger(batch.candidates) || !Number.isInteger(batch.deleted) ||
        !Number.isInteger(batch.failed) || batch.candidates < 0 || batch.candidates > BATCH_LIMIT ||
        batch.deleted < 0 || batch.deleted > batch.candidates || batch.failed < 0 || batch.failed > batch.candidates) {
      throw new Error('Respuesta de retención inválida')
    }
    totals.batches += 1
    totals.candidates += batch.candidates
    totals.deleted += batch.deleted
    totals.failed += batch.failed
    if (batch.candidates < BATCH_LIMIT || mode === 'dry-run') break
  }
  return totals
}

export default {
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 })
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledRetention(env).then(result => {
      console.log('storage retention run', JSON.stringify(result))
    }).catch(error => {
      console.error('storage retention failed', error instanceof Error ? error.message : 'Unexpected error')
      throw error
    }))
  },
}
