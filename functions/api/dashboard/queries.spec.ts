import { describe, expect, it } from 'vitest'
import { dashboardKeys, dashValues, DASHBOARD_DAYS } from './queries'

describe('administrative dashboard aggregation rules',()=>{
  it('groups dates using the same Bogotá day, Monday week and calendar month buckets as PostgreSQL',()=>{
    expect(dashboardKeys('2026-10-19','2026-10-26','day')).toHaveLength(7)
    expect(dashboardKeys('2026-10-16','2026-11-16','week')).toEqual([
      '2026-10-12','2026-10-19','2026-10-26','2026-11-02','2026-11-09'
    ])
    expect(dashboardKeys('2026-01-22','2026-05-21','month')).toEqual([
      '2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'
    ])
  })
  it('does not invent growth when no previous services exist',()=>{
    expect(dashValues({ performedValue:'120000',previousValue:'0' })).toEqual({current:120000,change:null})
    expect(dashValues({ performedValue:'150000',previousValue:'100000' })).toEqual({current:150000,change:50})
    expect(dashValues({ performedValue:'50000',previousValue:'100000' })).toEqual({current:50000,change:-50})
  })
  it('limits the period to supported bounded choices',()=>{
    expect(DASHBOARD_DAYS).toEqual({'7d':7,'30d':30,'90d':90,'12m':365})
  })
})
