import sharp from 'sharp'
import { ApiError } from '../auth'
import { transaction } from '../db'
import { putReportObject, readReportMedia } from '../r2'
import { loadReportData } from './data'
import { renderMipReport, type ReportPhoto } from './renderer'

const IMAGE_LIMIT = 80
async function jpeg(path:string,serviceId:string,signature=false):Promise<Uint8Array>{
  const original=await readReportMedia(path,serviceId)
  const pipeline=sharp(original,{limitInputPixels:40_000_000}).rotate().flatten({background:'#ffffff'})
    .resize({width:signature?720:960,height:signature?240:660,fit:'inside',withoutEnlargement:true})
  const converted=await pipeline.jpeg({quality:75,mozjpeg:true}).toBuffer()
  return new Uint8Array(converted)
}

/**
 * Retryable and idempotent. The job ID makes the destination stable, and a
 * successful persisted PDF is never regenerated from potentially expired photos.
 */
export async function generateReportForService(serviceId:string,jobId:string):Promise<'ALREADY_GENERATED'|'GENERATED'>{
  const existing=await transaction(async client=>{
    const s=(await client.query<{path:string|null}>('select informe_pdf_storage_path as path from public.servicios where id=$1',[serviceId])).rows[0]
    if(!s)throw new ApiError(404,'Servicio no encontrado','SERVICE_NOT_FOUND')
    return s.path
  })
  if(existing)return 'ALREADY_GENERATED'
  const data=await transaction(client=>loadReportData(client,serviceId))
  const evidence:Array<{area:string;caption:string;path:string}>=[]
  for(const area of data.areas){
    for(const path of area.fotos)evidence.push({area:area.nombre,caption:'Área sin acceso',path})
    for(const c of area.criterios)for(const path of c.fotos)evidence.push({area:area.nombre,caption:c.nombre,path})
    for(const p of area.puntos)if(p.foto)evidence.push({area:area.nombre,caption:'Puesto '+p.numero+' - '+p.tipo,path:p.foto})
    for(const h of area.hallazgos)for(const path of h.fotos)evidence.push({area:area.nombre,caption:'Hallazgo: '+h.descripcion,path})
  }
  if(evidence.length>IMAGE_LIMIT)throw new ApiError(422,'Hay demasiadas fotografías para esta versión del informe.','REPORT_IMAGE_LIMIT')
  const photos:ReportPhoto[]=[]
  // Avoid downloading every photo at once: memory is bounded for Neon Functions.
  for(const item of evidence){
    photos.push({area:item.area,caption:item.caption,bytes:await jpeg(item.path,serviceId)})
  }
  const technicianSignature=await jpeg(data.firmaTecnico,serviceId,true)
  const clientSignature=await jpeg(data.firmaCliente,serviceId,true)
  const pdf=await renderMipReport(data,photos,{tecnico:technicianSignature,cliente:clientSignature})
  const path='reports/'+serviceId+'/'+jobId+'.pdf'
  await putReportObject(path,serviceId,pdf)
  const applied=await transaction(async client=>{
    const result=await client.query(`update public.servicios
      set informe_pdf_storage_path=$2,informe_generado_at=now()
      where id=$1 and estado='FINALIZADO' and informe_pdf_storage_path is null
      returning id`,[serviceId,path])
    return Boolean(result.rowCount)
  })
  return applied?'GENERATED':'ALREADY_GENERATED'
}
