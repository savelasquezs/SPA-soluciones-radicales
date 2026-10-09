// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { PoolClient } from 'pg'
import { productSheetIndex, reportProductSheetUrl, technicianProductSheetUrl } from './productSheets'

vi.mock('../r2',()=>({ createMasterReadUrl:vi.fn<(path:string)=>string>(path=>'https://r2.example.test/'+path) }))
const sid='10000000-0000-4000-8000-000000000101'
const pid='10000000-0000-4000-8000-000000000102'
function fake(path:string|null) {
  const query=vi.fn<(sql:string,params:unknown[])=>Promise<{rows:Array<{path:string|null}>}>>()
    .mockResolvedValue({rows:[{path}]})
  return {client:{query} as unknown as PoolClient,query}
}
describe('Fichas técnicas de productos asignados a servicios',()=>{
  it('valida el índice del informe y limita las fichas a productos aplicados',async()=>{
    expect(productSheetIndex('0')).toBe(0)
    expect(productSheetIndex(99)).toBe(99)
    expect(()=>productSheetIndex(-1)).toThrow('Producto no válido')
    expect(()=>productSheetIndex(100)).toThrow('Producto no válido')
    const db=fake('products/technical-sheets/ficha.pdf')
    const url=await reportProductSheetUrl(db.client,sid,0)
    expect(url).toContain('ficha.pdf')
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('where pa.servicio_id=$1 and pa.aplicado'),[sid,0])
  })
  it('el técnico solo puede consultar un producto que pertenece a su servicio',async()=>{
    const db=fake('products/technical-sheets/ficha.pdf')
    expect(await technicianProductSheetUrl(db.client,sid,pid)).toContain('ficha.pdf')
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('where pa.servicio_id=$1 and pa.id=$2'),[sid,pid])
    await expect(technicianProductSheetUrl(db.client,sid,'mal-id')).rejects.toMatchObject({code:'VALIDATION'})
  })
  it('no permite rutas de otros buckets ni fichas ausentes',async()=>{
    for(const path of [null,'staff/certificates/private.pdf','../products/technical-sheets/ficha.pdf','products/technical-sheets/../otra.pdf']) {
      const db=fake(path)
      await expect(reportProductSheetUrl(db.client,sid,0)).rejects.toMatchObject({code:'PRODUCT_SHEET_NOT_FOUND'})
    }
  })
})
