import { toBogotaInput } from './adminServices'
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
