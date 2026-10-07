import { daysInMonth, isDateOnly, parseDateOnly, shiftDate, toDateOnly, todayInTimeZone } from './dateTime'
import type { DateOnly } from '../types/domain'

export type ServiceDateShortcutId = 'yesterday' | 'today' | 'tomorrow' | 'week' | 'month'
export type ServiceDateRange = { from: DateOnly; to: DateOnly }

export const SERVICE_DATE_SHORTCUTS: ReadonlyArray<{ id: ServiceDateShortcutId; label: string }> = [
  { id:'yesterday',label:'Ayer' },
  { id:'today',label:'Hoy' },
  { id:'tomorrow',label:'Mañana' },
  { id:'week',label:'Esta semana' },
  { id:'month',label:'Este mes' },
]

export function serviceDateShortcutRange(id: ServiceDateShortcutId, today: DateOnly = todayInTimeZone()): ServiceDateRange {
  if(!isDateOnly(today)) throw new Error('La fecha base no es válida.')
  if(id==='yesterday') return single(shiftDate(today,-1))
  if(id==='today') return single(today)
  if(id==='tomorrow') return single(shiftDate(today,1))
  if(id==='week') {
    const weekday=new Date(`${today}T00:00:00Z`).getUTCDay()
    const from=shiftDate(today,-((weekday+6)%7))
    return { from,to:shiftDate(from,6) }
  }
  const parts=parseDateOnly(today)!
  return {
    from:toDateOnly({ year:parts.year,month:parts.month,day:1 }),
    to:toDateOnly({ year:parts.year,month:parts.month,day:daysInMonth(parts.year,parts.month) }),
  }
}

function single(value: DateOnly): ServiceDateRange { return { from:value,to:value } }
