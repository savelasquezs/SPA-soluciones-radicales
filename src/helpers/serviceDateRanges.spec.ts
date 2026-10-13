import { describe,expect,it } from 'vitest'
import { SERVICE_DATE_SHORTCUTS, serviceDateShortcutRange } from './serviceDateRanges'

describe('service date shortcuts',()=>{
  it('keeps the operational labels ordered from narrow to broad ranges',()=>{
    expect(SERVICE_DATE_SHORTCUTS.map(item=>item.label)).toEqual(['Ayer','Hoy','Mañana','Esta semana','Este mes'])
  })
  it('builds single-day shortcuts around the Colombian business date',()=>{
    expect(serviceDateShortcutRange('yesterday','2026-10-07')).toEqual({ from:'2026-10-06',to:'2026-10-06' })
    expect(serviceDateShortcutRange('today','2026-10-07')).toEqual({ from:'2026-10-07',to:'2026-10-07' })
    expect(serviceDateShortcutRange('tomorrow','2026-10-07')).toEqual({ from:'2026-10-08',to:'2026-10-08' })
  })
  it('uses Monday through Sunday for This week',()=>{
    expect(serviceDateShortcutRange('week','2026-10-07')).toEqual({ from:'2026-10-05',to:'2026-10-11' })
    expect(serviceDateShortcutRange('week','2026-10-11')).toEqual({ from:'2026-10-05',to:'2026-10-11' })
  })
  it('uses the complete calendar month including leap years',()=>{
    expect(serviceDateShortcutRange('month','2026-10-07')).toEqual({ from:'2026-10-01',to:'2026-10-31' })
    expect(serviceDateShortcutRange('month','2028-02-14')).toEqual({ from:'2028-02-01',to:'2028-02-29' })
  })
})
