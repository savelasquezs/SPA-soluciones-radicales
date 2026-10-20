import { Hono } from 'hono'
import { ApiError, requireTechnician, type Identity } from '../auth'
import { transaction } from '../db'
import { DASHBOARD_DAYS, resolveDashboardRange } from '../../../src/helpers/dashboardRanges'
import type { DashboardPeriod } from '../../../src/types/dashboard'
import { technicianDashboardSnapshot } from './queries'

type Environment = { Variables: { identity: Identity } }
export const technicianDashboardRoutes = new Hono<Environment>()

technicianDashboardRoutes.get('/', async context => {
  context.header('Cache-Control', 'private, no-store')
  const period = context.req.query('period') ?? '30d'
  if (period !== 'custom' && !Object.hasOwn(DASHBOARD_DAYS, period)) {
    throw new ApiError(422, 'El período del resumen no es válido.', 'VALIDATION')
  }
  const custom = period === 'custom'
    ? { from: context.req.query('from') ?? '', to: context.req.query('to') ?? '' }
    : null
  try { resolveDashboardRange(period as DashboardPeriod, custom) }
  catch { throw new ApiError(422, 'Selecciona un rango válido de máximo diez años.', 'VALIDATION') }

  const snapshot = await transaction(async client => {
    const profile = await requireTechnician(client, context.get('identity'))
    return technicianDashboardSnapshot(client, profile.id, period as DashboardPeriod, custom)
  })
  return context.json(snapshot)
})
