import { Hono } from 'hono'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { createServiceResultMediaReadUrl } from '../r2'
import { productSheetIndex, reportProductSheetUrl } from './productSheets'
import { loadServiceResultsData } from './data'
import { reportPaths } from './public'
import { isServiceId } from '../../../src/helpers/adminServices'

type Environment={Variables:{identity:Identity}}
export const serviceResultRoutes=new Hono<Environment>()
function id(raw:unknown):string{
  if(!isServiceId(raw))throw new ApiError(422,'Servicio no válido.','VALIDATION')
  return raw
}
serviceResultRoutes.use('*',async(context,next)=>{
  await transaction(client=>requireAdmin(client,context.get('identity')))
  context.header('Cache-Control','no-store')
  await next()
})
serviceResultRoutes.get('/:id/results',async context=>{
  const serviceId=id(context.req.param('id'))
  const data=await transaction(client=>loadServiceResultsData(client,serviceId))
  return context.json({data})
})
serviceResultRoutes.get('/:id/media/read-url',async context=>{
  const serviceId=id(context.req.param('id'))
  const path=context.req.query('path')
  if(!path||path.length>1000)throw new ApiError(422,'Ruta de evidencia no válida.','VALIDATION')
  const data=await transaction(client=>loadServiceResultsData(client,serviceId))
  // Membership is derived from the authorized report, never from a requested service ID.
  if(!reportPaths(data).includes(path))throw new ApiError(404,'Evidencia no disponible.','EVIDENCE_NOT_FOUND')
  const ownerId=path.split('/')[1]!
  return context.json({url:createServiceResultMediaReadUrl(path,ownerId)})
})

serviceResultRoutes.get('/:id/results/product-sheet',async context=>{
  const serviceId=id(context.req.param('id'))
  const index=productSheetIndex(context.req.query('index'))
  const url=await transaction(async client=>{
    await loadServiceResultsData(client,serviceId)
    return reportProductSheetUrl(client,serviceId,index)
  })
  return context.json({url})
})
serviceResultRoutes.onError((error,context)=>{
  if(error instanceof ApiError)return context.json({error:error.message,code:error.code},error.status as 400|401|403|404|409|422|500)
  console.error('ADMIN_REPORTS_ERROR')
  return context.json({error:'No fue posible consultar el informe.'},500)
})
