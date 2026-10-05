import { describe, expect, it } from 'vitest'

import {
  formatDateInput,
  isDateOnly,
  parseDateInput,
  shiftDate,
  todayInTimeZone,
} from '@/helpers/dateTime'

describe('dateTime helpers', () => {
  it('mantiene fechas sin convertirlas silenciosamente a UTC', () => {
    expect(isDateOnly('2024-02-29')).toBe(true)
    expect(isDateOnly('2025-02-29')).toBe(false)
    expect(formatDateInput('2026-10-04')).toBe('04 / 10 / 2026')
    expect(parseDateInput('04/10/2026')).toBe('2026-10-04')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('calcula hoy en America/Bogota en el límite UTC', () => {
    const instant = new Date('2026-10-05T03:30:00.000Z')
    expect(todayInTimeZone('America/Bogota', instant)).toBe('2026-10-04')
    expect(todayInTimeZone('UTC', instant)).toBe('2026-10-05')
  })
})
