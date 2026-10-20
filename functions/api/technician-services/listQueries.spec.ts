import { describe,expect,it } from 'vitest'
import type { PoolClient } from 'pg'
import { listTechnicianHistory,listTechnicianAgenda } from './queries'

const actor='40000000-0000-4000-8000-000000000099'
function fake(){
  const calls:Array<{sql:string;params:unknown[]}>= []
  const client={
    query:async(sql:string,params:unknown[])=>{
      calls.push({sql,params})
      if(sql.startsWith('select count(*)'))return {rows:[{total:42}]}
      return {rows:[{record:{id:'assigned',solicitud:'SR-00001',estado:'FINALIZADO'}}]}
    },
  } as unknown as PoolClient
  return {client,calls}
}
describe('technician read-only lists',()=>{
  it('paginates the complete history using completion dates and scope bound to identity',async()=>{
    const {client,calls}=fake()
    const result=await listTechnicianHistory(client,actor,2,'Cliente','2026-10-01','2026-11-01')
    expect(result).toMatchObject({total:42,page:2,pageSize:20,items:[{id:'assigned'}]})
    expect(calls).toHaveLength(2)
    expect(calls[0]?.params).toEqual([actor,'2026-10-01','2026-11-01','Cliente'])
    expect(calls[1]?.params).toEqual([actor,'2026-10-01','2026-11-01','Cliente',20,20])
    expect(calls.every(c=>c.sql.includes('s.tecnico_responsable_id=$1::uuid'))).toBe(true)
    expect(calls.every(c=>c.sql.includes("s.estado='FINALIZADO'"))).toBe(true)
    expect(calls[1]?.sql).toContain('order by s.fin_real desc')
  })
  it('reads all assigned visits in a bounded week, including reinforcement but no cancellation',async()=>{
    const {client,calls}=fake()
    const result=await listTechnicianAgenda(client,actor,'2026-10-19','2026-10-26')
    expect(result).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.params).toEqual([actor,'2026-10-19','2026-10-26'])
    expect(calls[0]?.sql).toContain("s.tipo_servicio in ('PRINCIPAL','REFUERZO')")
    expect(calls[0]?.sql).toContain("s.estado<>'CANCELADO'")
    expect(calls[0]?.sql).toContain('s.tecnico_responsable_id=$1::uuid')
  })
})
