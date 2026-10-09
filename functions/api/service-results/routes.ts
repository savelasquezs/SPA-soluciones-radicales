import { Hono } from 'hono'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { createServiceResultMediaReadUrl } from '../r2'
import { productSheetIndex, reportProductSheetUrl } from './productSheets'
import { loadServiceResultsData } from './data'
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
  const authorized=new Set<string>([data.firmaTecnico,data.firmaCliente])
  for(const area of data.areas){
    for(const item of area.fotos)authorized.add(item)
    for(const criterion of area.criterios)for(const item of criterion.fotos)authorized.add(item)
    for(const point of area.puntos)if(point.foto)authorized.add(point.foto)
    for(const finding of area.hallazgos)for(const item of finding.fotos)authorized.add(item)
  }
  if(!authorized.has(path))throw new ApiError(404,'Evidencia no disponible.','EVIDENCE_NOT_FOUND')
  return context.json({url:createServiceResultMediaReadUrl(path,serviceId)})
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
