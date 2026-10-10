import type { ReportCaptureLocation, ReportHistoricalVisit, ReportPestClassification } from '@/types/serviceResults'

export const REPORT_CHART_COLORS = {
  compliance:'#287FA8', voladores:'#2786B3', rastreros:'#E29462',
  grid:'#DDE7ED', guide:'#718B9D',
} as const

// Stable codes keep the same species color across visits, reports and additions.
const speciesColors:Record<string,string> = {
  MOSCA_DOMESTICA:'#258DA8', MOSCA_FRUTA:'#E49B6C', MOSCA_DE_FRUTA:'#E49B6C',
  CUCARRONES:'#597BC1', POLILLA:'#A88D45', ZANCUDO:'#B96A91',
  OTROS_VOLADORES:'#8776A7', CUCARACHA:'#287FA8', HORMIGA:'#D88962',
  ROEDOR:'#8265A2', OTROS_RASTREROS:'#58A48C',
}
const otherColors=['#2786B3','#D88962','#58A48C','#8265A2','#C99D44','#B96A91','#597BC1','#5A949E']
export function reportPestColor(code:string):string {
  if(speciesColors[code])return speciesColors[code]
  let hash=0
  for(const character of code)hash=(Math.imul(hash,31)+character.charCodeAt(0))|0
  return otherColors[(hash>>>0)%otherColors.length]!
}

export type ReportCategory = 'voladores'|'rastreros'
export interface ReportCategoryTotals {voladores:number|null;rastreros:number|null}
export function reportCategoryTotals(visit:ReportHistoricalVisit):ReportCategoryTotals {
  const result:ReportCategoryTotals={voladores:null,rastreros:null}
  for(const kind of ['voladores','rastreros'] as const){
    const reviewed=visit.puestosRevisados?.[kind]??0
    if(reviewed<=0)continue
    const clasificacion=kind==='voladores'?'VOLADORES':'RASTREROS'
    result[kind]=(visit.especies??[]).filter(c=>c.clasificacion===clasificacion)
      .reduce((sum,c)=>sum+(Number.isFinite(c.cantidad)?Math.max(0,c.cantidad):0),0)
  }
  return result
}

function bogotaParts(iso:string){
  const date=new Date(iso)
  if(!Number.isFinite(date.getTime()))return null
  const parts=new Intl.DateTimeFormat('es-CO',{
    timeZone:'America/Bogota',year:'numeric',month:'short',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(date)
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??''
  return {year:get('year'),month:get('month').replace('.','').toLowerCase(),
    day:get('day'),hour:get('hour'),minute:get('minute')}
}

/** Month and year normally; day for repeated months, time for repeated days. */
export function reportVisitAxisLabels(visits:ReadonlyArray<Pick<ReportHistoricalVisit,'fecha'>>):string[]{
  const parsed=visits.map(visit=>bogotaParts(visit.fecha))
  const monthCounts=new Map<string,number>(),dayCounts=new Map<string,number>()
  for(const p of parsed)if(p){
    const month=p.year+'-'+p.month,day=month+'-'+p.day
    monthCounts.set(month,(monthCounts.get(month)??0)+1)
    dayCounts.set(day,(dayCounts.get(day)??0)+1)
  }
  return parsed.map(p=>{
    if(!p)return '—'
    const month=p.year+'-'+p.month,day=month+'-'+p.day
    if((dayCounts.get(day)??0)>1)return p.hour+':'+p.minute
    if((monthCounts.get(month)??0)>1)return p.day+' '+p.month
    return p.month+' '+p.year
  })
}

export function reportCapturePlaces(visit:ReportHistoricalVisit,classification:ReportPestClassification,
  pestCode?:string):ReportCaptureLocation[]{
  return (visit.detallesCapturas??[]).filter(item=>item.clasificacion===classification &&
    (pestCode===undefined||item.plagaCodigo===pestCode) &&
    Number.isFinite(item.cantidad)&&item.cantidad>0)
    .slice().sort((a,b)=>a.area.localeCompare(b.area,'es')||
      a.puesto.localeCompare(b.puesto,'es')||a.plagaNombreSnapshot.localeCompare(b.plagaNombreSnapshot,'es'))
}

export function reportDelta(current:number|null,previous:number|null):number|null {
  return current===null||previous===null?null:current-previous
}
export function readableCaptureDelta(delta:number|null):string{
  if(delta===null)return 'Sin visita anterior comparable'
  if(delta===0)return 'Igual que en la visita anterior'
  const value=Math.abs(delta).toLocaleString('es-CO')
  return delta>0?value+' más que en la visita anterior':value+' menos que en la visita anterior'
}
