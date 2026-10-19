import { Hono } from 'hono'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { isServiceId } from '../../../src/helpers/adminServices'
import type { DashboardPeriod } from '../../../src/types/dashboard'
import { DASHBOARD_DAYS, dashboardSnapshot } from './queries'

type Environment = { Variables: { identity: Identity } }
export const dashboardRoutes = new Hono<Environment>()

dashboardRoutes.get('/', async context => {
  context.header('Cache-Control','private, no-store')
  const value=context.req.query('period') ?? '30d'
  if (!Object.hasOwn(DASHBOARD_DAYS,value)) {
    throw new ApiError(422,'El período del resumen no es válido.','VALIDATION')
  }
  const clientId=context.req.query('clientId') || null
  const siteId=context.req.query('siteId') || null
  if ((clientId && !isServiceId(clientId)) || (siteId && !isServiceId(siteId))) {
    throw new ApiError(422,'El filtro de Cliente o Sede no es válido.','VALIDATION')
  }
  const result=await transaction(async client => {
    await requireAdmin(client,context.get('identity'))
    if (clientId && siteId) {
      const owns=await client.query('select 1 from public.sedes where id=$1::uuid and negocio_id=$2::uuid',[siteId,clientId])
      if (!owns.rowCount) throw new ApiError(422,'La Sede no pertenece al Cliente seleccionado.','VALIDATION')
    }
    return dashboardSnapshot(client,value as DashboardPeriod,clientId,siteId)
  })
  return context.json(result)
})
