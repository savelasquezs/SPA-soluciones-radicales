import type { ReportHistoricalVisit, ReportPestClassification, ServiceAreaResult } from '@/types/serviceResults'
import { visitDateLabel } from '@/helpers/serviceTrends'

export const SPECIES_CHART = { width: 650, height: 204, left: 42, right: 628, top: 18, bottom: 163 } as const
const palette = ['#206b89','#c36a43','#478f79','#806da5','#b28a36','#b45766','#617a95','#797e54']

export interface SpeciesBar { code:string; color:string; name:string; count:number; x:number; y:number; width:number; height:number }
export interface SpeciesVisit {
  fecha:string; solicitud:string; label:string; reviewed:number; total:number; center:number;
  bars:SpeciesBar[]; hasMonitoring:boolean
}
export interface SpeciesChart {
  classification:ReportPestClassification
  title:string; species:Array<{code:string;name:string;color:string}>
  visits:SpeciesVisit[]; max:number; hasHistory:boolean; hasMonitoring:boolean
}

export function buildSpeciesCharts(history:ReportHistoricalVisit[]):SpeciesChart[] {
  const visits = history.map((visit,index)=>({visit,index}))
    .sort((a,b)=>Date.parse(a.visit.fecha)-Date.parse(b.visit.fecha)||a.index-b.index)
    .slice(-6).map(item=>item.visit)
  return (['VOLADORES','RASTREROS'] as const).map(classification=>{
    const names=new Map<string,string>()
    for(const visit of visits) for(const capture of visit.especies??[])
      if(capture.clasificacion===classification && capture.plagaCodigo && capture.plagaNombreSnapshot &&
        Number.isFinite(capture.cantidad) && capture.cantidad>0)
        names.set(capture.plagaCodigo,capture.plagaNombreSnapshot)
    const species=[...names.entries()].sort((a,b)=>
      a[1].localeCompare(b[1],'es')||a[0].localeCompare(b[0]))
      .map(([code,name],index)=>({code,name,color:palette[index%palette.length]!}))
    const counts=visits.map(visit=>{
      const byCode=new Map<string,number>()
      for(const capture of visit.especies??[]) if(capture.clasificacion===classification && byCode !== null &&
        Number.isFinite(capture.cantidad) && capture.cantidad>0)
        byCode.set(capture.plagaCodigo,(byCode.get(capture.plagaCodigo)??0)+capture.cantidad)
      return byCode
    })
    const largest=Math.max(0,...counts.flatMap(values=>[...values.values()]))
    const max=Math.max(1,Math.ceil(largest/5)*5)
    const clusterWidth=(SPECIES_CHART.right-SPECIES_CHART.left)/Math.max(1,visits.length)
    const width=Math.min(24,clusterWidth*.76/Math.max(1,species.length))
    const valueY=(value:number)=>SPECIES_CHART.bottom-
      value/max*(SPECIES_CHART.bottom-SPECIES_CHART.top)
    const plotted=visits.map((visit,index)=>{
      const reviewed=classification==='VOLADORES' ? visit.puestosRevisados?.voladores : visit.puestosRevisados?.rastreros
      const center=SPECIES_CHART.left+clusterWidth*(index+.5)
      const bars:SpeciesBar[]=species.map((item,seriesIndex)=>{
        const count=counts[index]!.get(item.code)??0
        const y=valueY(count)
        return {code:item.code,name:item.name,color:item.color,count,
          x:center+(seriesIndex-species.length/2)*width,
          y,width:Math.max(1,width-1.5),height:SPECIES_CHART.bottom-y}
      })
      return {solicitud:visit.solicitud,fecha:visit.fecha,label:visitDateLabel(visit.fecha),
        reviewed:reviewed??0,hasMonitoring:(reviewed??0)>0,
        total:[...counts[index]!.values()].reduce((sum,value)=>sum+value,0),
        center,bars}
    })
    return {classification,title:classification==='VOLADORES'?'Lámparas UV · Voladores':'Cebaderos y trampas adhesivas · Rastreros',
      species,visits:plotted,max,hasHistory:visits.length>0,
      hasMonitoring:plotted.some(v=>v.hasMonitoring)}
  })
}

export interface CapturePointRow {
  area:string;numero:string;ubicacion:string;tipo:string;estado:string|null;
  capturas:Array<{plagaNombreSnapshot:string;cantidad:number}>;observaciones:string|null;foto:string|null
}
export function buildCapturePointSummary(areas:ServiceAreaResult[]){
  const points=areas.filter(area=>!area.sinAcceso).flatMap(area=>
    area.puntos.map(point=>({...point,area:area.nombre})))
  const rows:CapturePointRow[]=points.filter(p=>p.capturas.some(c=>c.cantidad>0))
  const reviewed=points.filter(point=>point.estado!==null).length
  const captured=rows.length
  return {
    rows, reviewed, captured,
    total:rows.reduce((sum,p)=>sum+p.capturas.reduce((n,c)=>n+Math.max(0,c.cantidad),0),0),
    withoutCaptures:points.filter(p=>p.estado!==null && !p.capturas.some(c=>c.cantidad>0)).length,
    withoutReview:points.length-reviewed,
    attention:points.filter(p=>Boolean(p.foto||p.observaciones?.trim()||
      (p.estado!==null && p.estado!=='ACTIVO' && p.estado!=='BUENO'))),
  }
}
