import { describe, expect, it } from 'vitest'
import { dashboardPeriodLabel, dashboardWeekLabel, resolveDashboardRange } from './dashboardRanges'

describe('dashboard inclusive calendar ranges', () => {
  const today = '2026-10-22'

  it('counts today in both seven and thirty days in Bogotá', () => {
    expect(resolveDashboardRange('7d', null, today)).toEqual({
      from: '2026-10-16', to: today, days: 7, bucket: 'day'
    })
    expect(resolveDashboardRange('30d', null, today)).toEqual({
      from: '2026-09-23', to: today, days: 30, bucket: 'week'
    })
  })

  it('shows both real endpoints of a thirty-day reporting period', () => {
    const period = resolveDashboardRange('30d', null, today)
    expect(dashboardPeriodLabel(period)).toMatch(/^23 sept.*22 oct/i)
  })

  it('clips the first and current partial weeks to the selected days', () => {
    const period = resolveDashboardRange('30d', null, today)
    expect(dashboardWeekLabel('2026-09-21', period)).toMatch(/^23–27 sept/i)
    expect(dashboardWeekLabel('2026-09-28', period)).toMatch(/^28 sept.*4 oct/i)
    expect(dashboardWeekLabel('2026-10-19', period)).toMatch(/^19–22 oct/i)
  })

  it('includes years when the reporting window crosses New Year', () => {
    const period = resolveDashboardRange('30d', null, '2026-01-05')
    expect(dashboardPeriodLabel(period)).toContain('2025')
    expect(dashboardPeriodLabel(period)).toContain('2026')
    expect(dashboardWeekLabel('2026-01-05', period)).toMatch(/^5 ene/i)
  })
})
