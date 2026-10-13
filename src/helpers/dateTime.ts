import type { DateOnly, LocalDateTime, TimeOnly } from '../types/domain'

export const APP_TIME_ZONE = 'America/Bogota'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export type DateParts = { year: number; month: number; day: number }

export function isDateOnly(value: string): value is DateOnly {
  const parts = parseDateOnly(value)
  if (!parts) return false
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return probe.getUTCFullYear() === parts.year
    && probe.getUTCMonth() === parts.month - 1
    && probe.getUTCDate() === parts.day
}

export function parseDateOnly(value: string | null | undefined): DateParts | null {
  if (!value) return null
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function toDateOnly(parts: DateParts): DateOnly {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function formatDateOnly(value: DateOnly | null | undefined, long = false): string {
  const parts = parseDateOnly(value)
  if (!parts || !isDateOnly(value ?? '')) return ''
  const month = long ? MONTHS[parts.month - 1] : SHORT_MONTHS[parts.month - 1]
  return `${String(parts.day).padStart(2, '0')} ${month} ${parts.year}`
}

export function formatDateInput(value: DateOnly | null | undefined): string {
  const parts = parseDateOnly(value)
  return parts && isDateOnly(value ?? '')
    ? `${String(parts.day).padStart(2, '0')} / ${String(parts.month).padStart(2, '0')} / ${parts.year}`
    : ''
}

export function parseDateInput(value: string): DateOnly | null {
  const normalized = value.trim()
  if (isDateOnly(normalized)) return normalized
  const match = /^(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})$/.exec(normalized)
  if (!match) return null
  const result = toDateOnly({ day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) })
  return isDateOnly(result) ? result : null
}

export function isTimeOnly(value: string): value is TimeOnly {
  return TIME_PATTERN.test(value)
}

export function normalizeTime(value: string, minuteStep = 1): TimeOnly | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes % minuteStep !== 0) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function isLocalDateTime(value: string): value is LocalDateTime {
  const match = DATE_TIME_PATTERN.exec(value)
  return Boolean(match?.[1] && match[2] && match[3] && isDateOnly(match[1]) && isTimeOnly(`${match[2]}:${match[3]}`))
}

export function joinLocalDateTime(date: DateOnly, time: TimeOnly): LocalDateTime {
  return `${date}T${time}`
}

export function splitLocalDateTime(value: LocalDateTime | null | undefined): { date: DateOnly; time: TimeOnly } | null {
  if (!value || !isLocalDateTime(value)) return null
  const [date, time] = value.split('T')
  return { date, time } as { date: DateOnly; time: TimeOnly }
}

export function formatLocalDateTime(value: LocalDateTime | null | undefined): string {
  const parts = splitLocalDateTime(value)
  return parts ? `${formatDateOnly(parts.date)} · ${parts.time}` : ''
}

export function compareDateOnly(left: DateOnly, right: DateOnly): number {
  return left.localeCompare(right)
}

export function todayInTimeZone(timeZone = APP_TIME_ZONE, now = new Date()): DateOnly {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function firstWeekdayMonday(year: number, month: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return weekday === 0 ? 6 : weekday - 1
}

export function shiftMonth(year: number, month: number, amount: number): { year: number; month: number } {
  const index = year * 12 + month - 1 + amount
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 }
}

export function shiftDate(value: DateOnly, amount: number): DateOnly {
  const parts = parseDateOnly(value)
  if (!parts || !isDateOnly(value)) return value
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount))
  return toDateOnly({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? ''
}
