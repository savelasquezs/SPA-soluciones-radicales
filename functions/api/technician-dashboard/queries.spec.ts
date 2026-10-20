import { describe, expect, it } from 'vitest'
import type { PoolClient } from 'pg'
import { technicianDashboardSnapshot } from './queries'

const actor = '30000000-0000-4000-8000-000000000001'
const visit = '30000000-0000-4000-8000-000000000002'
function mockDatabase(empty = false) {
  const calls: Array<{ sql:string; params:unknown[] }> = []
  const client = {
    query: async (sql:string, params:unknown[]) => {
      calls.push({sql,params})
      if (sql.includes('as "avgMinutes"')) return {rows:[{
        completed:empty?0:2,scheduled:1,ongoing:1,overdue:1,sites:empty?0:2,clients:empty?0:1,
        started:empty?0:4,onTime:empty?0:3,avgMinutes:empty?null:47,
      }]}
      if (sql.includes('date_trunc($4::text')) return {rows:empty?[]:[{date:'2026-10-20',count:2}]}
      if (sql.includes('as "mipCompliance"')) return {rows:[{
        findings:empty?0:3,followUps:empty?0:2,findingsClosed:empty?0:1,reviewedDevices:empty?0:7,
        installedDevices:empty?0:2,appliedProducts:empty?0:4,mipCompliance:empty?null:83.3,
      }]}
      if (sql.includes("s.estado in ('EN_PROCESO','PROGRAMADO')")) return {rows:[{
        id:visit,reference:'SR-01',clientName:'Cliente',siteName:'Sede',
        scheduledAt:'2026-10-22T15:00:00Z',completedAt:null,status:'PROGRAMADO',role:'COLABORADOR',
      }]}
      if (sql.includes('order by s.fin_real desc')) return {rows:[]}
      throw new Error('Unrecognized dashboard query: '+sql.slice(0,120))
    },
  } as unknown as PoolClient
  return {client,calls}
}

describe('technician dashboard',()=>{
  it('fills zero days in the completion-date line and accounts for shared visits',async()=>{
    const {client,calls}=mockDatabase()
    const data=await technicianDashboardSnapshot(client,actor,'custom',{from:'2026-10-19',to:'2026-10-22'})
    expect(data.charts.completed).toEqual([
      {date:'2026-10-19',count:0},{date:'2026-10-20',count:2},
      {date:'2026-10-21',count:0},{date:'2026-10-22',count:0},
    ])
    expect(data.kpis).toMatchObject({completed:2,scheduled:1,ongoing:1,sites:2,clients:1,
      punctuality:75,onTime:3,started:4,avgMinutes:47})
    expect(data.activity).toMatchObject({findings:3,followUps:2,findingsClosed:1,
      reviewedDevices:7,installedDevices:2,appliedProducts:4,mipCompliance:83.3})
    expect(data.tables.upcoming[0]?.role).toBe('COLABORADOR')
    expect(calls).toHaveLength(5)
    expect(calls.every(call=>call.params[0]===actor)).toBe(true)
    expect(calls.every(call=>call.sql.includes('tecnico_responsable_id=$1::uuid')
      || call.sql.includes('hs.tecnico_id=$1::uuid'))).toBe(true)
    expect(calls.find(call=>call.sql.includes('date_trunc($4::text'))?.sql).toContain('s.fin_real')
  })
  it('does not fabricate punctuality or MIP scores when observations are absent',async()=>{
    const {client}=mockDatabase(true)
    const data=await technicianDashboardSnapshot(client,actor,'custom',{from:'2026-10-19',to:'2026-10-19'})
    expect(data.kpis.punctuality).toBeNull()
    expect(data.kpis.avgMinutes).toBeNull()
    expect(data.activity.mipCompliance).toBeNull()
    expect(data.charts.completed).toEqual([{date:'2026-10-19',count:0}])
  })
})
