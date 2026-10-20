import { Hono } from 'hono'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { isServiceId } from '../../../src/helpers/adminServices'
import type { DashboardPeriod } from '../../../src/types/dashboard'
import { DASHBOARD_DAYS, dashboardSnapshot } from './queries'
import { resolveDashboardRange } from '../../../src/helpers/dashboardRanges'
import { dashboardDetailPage } from './details'
import type { DashboardDetailKind } from '../../../src/types/dashboard'

type Environment = { Variables: { identity: Identity } }
export const dashboardRoutes = new Hono<Environment>()

dashboardRoutes.get('/details',async context=>{
  context.header('Cache-Control','private, no-store')
  const kind=context.req.query('kind')
  if(!['findings','recentFindings','certificates'].includes(kind??''))throw new ApiError(422,'La consulta de detalle no existe.','VALIDATION')
  const pageText=context.req.query('page')??'1'
  if(!/^[1-9]\d{0,4}$/.test(pageText))throw new ApiError(422,'La página no es válida.','VALIDATION')
  const clientId=context.req.query('clientId')||null
  const siteId=context.req.query('siteId')||null
  if((clientId&&!isServiceId(clientId))||(siteId&&!isServiceId(siteId)))
    throw new ApiError(422,'El filtro seleccionado no es válido.','VALIDATION')
  return context.json(await transaction(async client=>{
    await requireAdmin(client,context.get('identity'))
    return dashboardDetailPage(client,kind as DashboardDetailKind,Number(pageText),clientId,siteId)
  }))
})
dashboardRoutes.get('/', async context => {
  context.header('Cache-Control','private, no-store')
  const value=context.req.query('period') ?? '30d'
  if (value!=='custom' && !Object.hasOwn(DASHBOARD_DAYS,value)) {
    throw new ApiError(422,'El período del resumen no es válido.','VALIDATION')
  }
  const clientId=context.req.query('clientId') || null
  const siteId=context.req.query('siteId') || null
  if ((clientId && !isServiceId(clientId)) || (siteId && !isServiceId(siteId))) {
    throw new ApiError(422,'El filtro de Cliente o Sede no es válido.','VALIDATION')
  }
  const custom=value==='custom' ? {from:context.req.query('from')??'',to:context.req.query('to')??''} : null
  try{resolveDashboardRange(value as DashboardPeriod,custom)}
  catch{throw new ApiError(422,'Selecciona un rango válido de máximo diez años.','VALIDATION')}
  const result=await transaction(async client => {
    await requireAdmin(client,context.get('identity'))
    if (clientId && siteId) {
      const owns=await client.query('select 1 from public.sedes where id=$1::uuid and negocio_id=$2::uuid',[siteId,clientId])
      if (!owns.rowCount) throw new ApiError(422,'La Sede no pertenece al Cliente seleccionado.','VALIDATION')
    }
    return dashboardSnapshot(client,value as DashboardPeriod,clientId,siteId,custom)
  })
  return context.json(result)
})
