import { addDateDays, compareServices, fromBogotaInput, toBogotaInput, todayBogota } from './adminServices'
import type { AdminService } from '../types/adminServices'

export const DEFAULT_WEEK_START_MINUTE=8*60
export const DEFAULT_WEEK_END_MINUTE=21*60

export interface ServiceWeekBounds { startMinute: number; endMinute: number }
export interface ServiceWeekEventLayout {
  record: AdminService
  startMinute: number
  endMinute: number
  lane: number
  laneCount: number
}

function minuteOfDay(value: string): number {
  const local=toBogotaInput(value)
  const parts=local.slice(11,16).split(':')
  const hour=Number(parts[0] ?? 0)
  const minute=Number(parts[1] ?? 0)
  return hour*60+minute
}
function localDate(value: string): string { return toBogotaInput(value).slice(0,10) }
function eventWindow(record: AdminService,date: string): { record: AdminService; startMinute: number; endMinute: number } | null {
  if(localDate(record.inicioProgramado)!==date) return null
  const startMinute=minuteOfDay(record.inicioProgramado)
  const endDate=localDate(record.finProgramado)
  const rawEnd=endDate===date ? minuteOfDay(record.finProgramado) : 24*60
  return { record,startMinute,endMinute:Math.max(startMinute+1,rawEnd) }
}

export function serviceWeekBounds(records: AdminService[]): ServiceWeekBounds {
  let startMinute=DEFAULT_WEEK_START_MINUTE,endMinute=DEFAULT_WEEK_END_MINUTE
  for(const record of records) {
    const start=minuteOfDay(record.inicioProgramado)
    const end=localDate(record.inicioProgramado)===localDate(record.finProgramado) ? minuteOfDay(record.finProgramado) : 24*60
    startMinute=Math.min(startMinute,Math.floor(start/60)*60)
    endMinute=Math.max(endMinute,Math.ceil(end/60)*60)
  }
  return { startMinute:Math.max(0,startMinute),endMinute:Math.min(24*60,endMinute) }
}

export function serviceWeekHours(bounds: ServiceWeekBounds): number[] {
  const hours: number[]=[]
  for(let minute=bounds.startMinute;minute<bounds.endMinute;minute+=60) hours.push(minute)
  return hours
}

export function layoutServiceDay(records: AdminService[],date: string): ServiceWeekEventLayout[] {
  const windows=records.map(record=>eventWindow(record,date)).filter((item): item is NonNullable<typeof item>=>Boolean(item))
    .sort((a,b)=>a.startMinute-b.startMinute || a.endMinute-b.endMinute || a.record.id.localeCompare(b.record.id))
  const result: ServiceWeekEventLayout[]=[]
  let cluster: typeof windows=[]
  let clusterEnd=-1
  const flush=()=>{
    if(!cluster.length) return
    const laneEnds: number[]=[]
    const pending=cluster.map(item=>{
      let lane=laneEnds.findIndex(end=>end<=item.startMinute)
      if(lane<0) { lane=laneEnds.length; laneEnds.push(item.endMinute) }
      else laneEnds[lane]=item.endMinute
      return { ...item,lane }
    })
    const laneCount=Math.max(1,laneEnds.length)
    result.push(...pending.map(item=>({ ...item,laneCount })))
    cluster=[];clusterEnd=-1
  }
  for(const item of windows) {
    if(cluster.length && item.startMinute>=clusterEnd) flush()
    cluster.push(item)
    clusterEnd=Math.max(clusterEnd,item.endMinute)
  }
  flush()
  return result
}


/** Round a calendar pointer position to a 15-minute start, inside the visible day. */
export function snapServiceWeekMinute(minute: number, bounds: ServiceWeekBounds, step = 15): number {
  if (!Number.isFinite(minute) || !Number.isInteger(step) || step < 1) return bounds.startMinute
  const lower=Math.ceil(bounds.startMinute/step)*step
  const upper=Math.floor(Math.min(23*60+59,bounds.endMinute-step)/step)*step
  return Math.max(lower,Math.min(Math.max(lower,upper),Math.round(minute/step)*step))
}

/** Keep calendar slots in the same Bogotá timezone as service scheduling. */
export function serviceWeekInstantAt(date: string, minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 24*60) return ''
  const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')
  return fromBogotaInput(date+'T'+time)
}


/** Group by the service START date in Bogotá, including overnight services only once. */
export function serviceWeekDayRecords(records: AdminService[], date: string): AdminService[] {
  return records.filter(record=>localDate(record.inicioProgramado)===date).sort(compareServices)
}
export function serviceWeekDayCounts(records: AdminService[], from: string): Record<string,number> {
  const result: Record<string,number>=Object.fromEntries(
    Array.from({ length:7 },(_,day)=>[addDateDays(from,day),0]),
  )
  for(const record of records) {
    const day=localDate(record.inicioProgramado)
    if(Object.prototype.hasOwnProperty.call(result,day)) result[day]=(result[day] ?? 0)+1
  }
  return result
}
export function preferredServiceWeekDay(records: AdminService[], from: string, today=todayBogota()): string {
  const end=addDateDays(from,6)
  if(today>=from && today<=end) return today
  const first=Object.entries(serviceWeekDayCounts(records,from)).find(([,count])=>count>0)
  return first?.[0] ?? from
}
