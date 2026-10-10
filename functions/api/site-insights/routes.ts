import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { PoolClient } from 'pg'
import { isServiceId } from '../../../src/helpers/adminServices'
import { isDateOnly } from '../../../src/helpers/dateTime'
import type { EvidenceAccess, EvidenceKind, InsightQuery } from '../../../src/types/siteInsights'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { createServiceMediaReadUrl, deviceReviewMediaObjectExists, findingEvidenceObjectExists } from '../r2'
import { findSiteEvidence, listMonitoringPoints, listMonitoringReviews, listSiteFindings } from './queries'

type Environment = { Variables: { identity: Identity } }
export const siteInsightsRoutes = new Hono<Environment>()
siteInsightsRoutes.use('*', async (context, next) => { context.header('Cache-Control', 'private, no-store'); await next() })

function id(value: string): string {
  if (!isServiceId(value)) throw new ApiError(422, 'El identificador no es válido.', 'VALIDATION')
  return value
}
export function insightQuery(values: Record<string, string>, mode: 'points' | 'reviews' | 'findings'): InsightQuery {
  const pageText = values.page ?? '1'
  if (!/^[1-9]\d{0,4}$/.test(pageText)) throw new ApiError(422, 'La página no es válida.', 'VALIDATION')
  const state = values.state ?? (mode === 'findings' ? 'PENDING' : '')
  const states = mode === 'points' ? ['', 'ACTIVO', 'DANADO', 'FUERA_DE_USO']
    : mode === 'findings' ? ['', 'PENDING', 'ABIERTO', 'EN_PROCESO', 'CERRADO'] : ['', 'FINALIZADO', 'EN_PROCESO']
  if (!states.includes(state)) throw new ApiError(422, 'El estado no es válido.', 'VALIDATION')
  const active = values.active ?? ''
  if (!['', 'true', 'false'].includes(active)) throw new ApiError(422, 'El filtro de habilitación no es válido.', 'VALIDATION')
  const from = values.from ?? '', to = values.to ?? ''
  if ((from && !isDateOnly(from)) || (to && !isDateOnly(to)) || (from && to && from > to)) {
    throw new ApiError(422, 'Revisa el rango de fechas.', 'VALIDATION')
  }
  const search = (values.search ?? '').trim(), trap = (values.trap ?? '').trim()
  if (search.length > 200 || trap.length > 160) throw new ApiError(422, 'El filtro es demasiado largo.', 'VALIDATION')
  return { page: Number(pageText), state, active, search, trap, from, to, area: values.area ? id(values.area) : '' }
}
async function read<T>(context: Context<Environment>, action: (client: PoolClient) => Promise<T>): Promise<T> {
  return transaction(async client => { await requireAdmin(client, context.get('identity')); return action(client) })
}

siteInsightsRoutes.get('/:siteId/monitoring-points', async context => {
  const result = await read(context, client => listMonitoringPoints(client, id(context.req.param('siteId')), insightQuery(context.req.query(), 'points')))
  return context.json(result)
})
siteInsightsRoutes.get('/:siteId/monitoring-points/:pointId/reviews', async context => {
  const result = await read(context, client => listMonitoringReviews(client, id(context.req.param('siteId')), id(context.req.param('pointId')), insightQuery(context.req.query(), 'reviews')))
  return context.json(result)
})
siteInsightsRoutes.get('/:siteId/findings', async context => {
  const result = await read(context, client => listSiteFindings(client, id(context.req.param('siteId')), insightQuery(context.req.query(), 'findings')))
  return context.json(result)
})

export function missingEvidenceStatus(retentionAt: string | null, now = Date.now()): 'MISSING' | 'EXPIRED' {
  const expires = retentionAt ? new Date(retentionAt).getTime() : NaN
  return Number.isFinite(expires) && expires <= now ? 'EXPIRED' : 'MISSING'
}
siteInsightsRoutes.get('/:siteId/photos/:kind/:recordId/:index', async context => {
  const kind = context.req.param('kind') as EvidenceKind
  if (!['REVIEW','OPENING','CLOSURE','FOLLOWUP'].includes(kind)) throw new ApiError(422, 'La evidencia no es válida.', 'VALIDATION')
  const indexText = context.req.param('index')
  if (!/^(0|[1-9]\d?)$/.test(indexText)) throw new ApiError(422, 'La fotografía no es válida.', 'VALIDATION')
  const source = await read(context, client => findSiteEvidence(client, id(context.req.param('siteId')), kind, id(context.req.param('recordId')), Number(indexText)))
  // Release the PostgreSQL connection before calling storage. A timeout/403 is never an absent photo.
  const storageKind = kind === 'FOLLOWUP' && source.path.startsWith(
    `services/${source.serviceId}/findings/${source.ownerId}/closure/`) ? 'CLOSURE' : kind
  const exists = kind === 'REVIEW'
    ? await deviceReviewMediaObjectExists(source.path, source.serviceId, source.ownerId)
    : await findingEvidenceObjectExists(source.path, source.serviceId, source.ownerId, storageKind)
  const result: EvidenceAccess = exists
    ? { status: 'AVAILABLE', ...createServiceMediaReadUrl(source.path, source.serviceId, source.ownerId, storageKind) }
    : { status: missingEvidenceStatus(source.retentionAt), url: null, expiresAt: null }
  return context.json(result)
})
siteInsightsRoutes.all('/*', context => context.json({ error: 'Esta sección es de solo consulta.' }, context.req.method === 'GET' ? 404 : 405))
siteInsightsRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error: error.message, code: error.code }, error.status as ContentfulStatusCode)
  return context.json({ error: 'No fue posible consultar la información. Vuelve a intentarlo.' }, 500)
})
