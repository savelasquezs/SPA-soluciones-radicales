import { describe,expect,it } from 'vitest'
import { addDateDays,draftToServiceInput,emptyServiceDraft,fromBogotaInput,isDateOnly,isZonedInstant,scheduleEnd,suggestReinforcement,toBogotaInput,todayBogota,validateServiceInput,validateSchedule } from './adminServices'
import type { ServiceInput,ServiceSchedule } from '../types/adminServices'
import { compareServiceHistory, serviceHistoryDate } from './adminServices'
const responsible='10000000-0000-4000-8000-000000000001'
const collaborator='10000000-0000-4000-8000-000000000002'
it('orders actual completion and cancellation dates with a scheduled fallback and stable ties',()=>{
  const base={id:'legacy',inicioProgramado:'2026-10-01T10:00:00Z'}
  const older={...base,id:'a',finReal:'2026-10-22T10:00:00Z'}
  const latest={...base,id:'b',finReal:'2026-10-23T05:00:00-05:00'}
  const tied={...latest,id:'c',finReal:'2026-10-23T10:00:00Z'}
  const cancelled={...base,id:'d',canceladoAt:'2026-10-24T10:00:00Z'}
  expect([base,older,latest,tied,cancelled].sort(compareServiceHistory).map(row=>row.id)).toEqual(['d','c','b','a','legacy'])
  expect(serviceHistoryDate({ ...base,finReal:null,canceladoAt:null })).toBe(base.inicioProgramado)
})
const schedule: ServiceSchedule={ inicioProgramado:'2026-10-06T09:00:00-05:00',duracionMinutos:90,tecnicoResponsableId:responsible,tecnicosColaboradoresIds:[collaborator] }
const input=(): ServiceInput=>({ sedeId:responsible,programacion:structuredClone(schedule),refuerzo:null,productos:[],cobro:{ metodoPago:null,tecnicoRecaudoPrevistoId:null },observaciones:'' })
describe('administrator service contracts',()=>{
  it('suggests exactly three weeks without mutating the original team',()=>{
    const result=suggestReinforcement(schedule)
    expect(toBogotaInput(result.inicioProgramado)).toBe('2026-10-27T09:00')
    expect(result.duracionMinutos).toBe(90)
    result.tecnicosColaboradoresIds.push(responsible)
    expect(schedule.tecnicosColaboradoresIds).toEqual([collaborator])
  })
  it('accepts an independently selected reinforcement date and time',()=>{
    const value=input(); value.refuerzo={ ...schedule,inicioProgramado:'2026-11-03T14:30:00-05:00' }
    expect(validateServiceInput(value).errors).toEqual({})
  })
  it('requires zoned instants and rejects impossible product expiration dates',()=>{
    expect(isZonedInstant('2026-10-06T09:00')).toBe(false)
    expect(isZonedInstant('2026-02-30T09:00:00-05:00')).toBe(false)
    expect(isDateOnly('2024-02-29')).toBe(true)
    expect(isDateOnly('2026-02-29')).toBe(false)
    const value=input();value.productos=[{ productoId:collaborator,lote:'L-1',fechaVencimiento:'2026-02-29' }]
    expect(validateServiceInput(value).errors).toHaveProperty('productos.0.fechaVencimiento')
  })
  it('rejects duplicate technicians, responsible-as-collaborator and duplicate products',()=>{
    expect(validateSchedule({ ...schedule,tecnicosColaboradoresIds:[responsible] }).errors).toHaveProperty('programacion.tecnicosColaboradoresIds')
    expect(validateSchedule({ ...schedule,tecnicosColaboradoresIds:[collaborator,collaborator] }).errors).toHaveProperty('programacion.tecnicosColaboradoresIds')
    const value=input();const product={ productoId:collaborator,lote:'',fechaVencimiento:null };value.productos=[product,product]
    expect(validateServiceInput(value).errors.productos).toBeTruthy()
  })
  it('validates manual price but strips untrusted state fields',()=>{
    const value=validateServiceInput({ ...input(),valorServicio:1,estado:'FINALIZADO',cobro:{ metodoPago:'TRANSFERENCIA',tecnicoRecaudoPrevistoId:responsible } })
    expect(value.errors).toHaveProperty('cobro.tecnicoRecaudoPrevistoId')
    expect(value.value.valorServicio).toBe(1)
    expect(value.value).not.toHaveProperty('estado')
  })
  it('requires a nonnegative integer price for residential services only',()=>{
    expect(validateServiceInput(input(),false,new Date(),true).errors).toHaveProperty('valorServicio')
    expect(validateServiceInput({ ...input(),valorServicio:0 },false,new Date(),true).errors).toEqual({})
    expect(validateServiceInput({ ...input(),valorServicio:-1 }).errors).toHaveProperty('valorServicio')
    expect(validateServiceInput({ ...input(),valorServicio:1.5 }).errors).toHaveProperty('valorServicio')
    expect(validateServiceInput({ ...input(),valorServicio:'30000' }).errors).toHaveProperty('valorServicio')
    const draft=emptyServiceDraft()
    draft.valorServicio='45000'
    expect(draftToServiceInput(draft).valorServicio).toBe(45000)
  })
  it('requires only the batch from the visit and ignores catalogue values sent by clients',()=>{
    const value=input();value.productos=[{ productoId:collaborator,lote:'',fechaVencimiento:null }]
    expect(validateServiceInput(value).errors).toEqual({ 'productos.0.lote':'Ingresa el lote previsto.', 'productos.0.fechaVencimiento':'Ingresa una fecha de vencimiento válida.' })
    const valid=validateServiceInput({ ...input(), productos:[{ ...value.productos[0], lote:'L-1',fechaVencimiento:'2030-11-01',dosis:'dosis manipulada',metodoAplicacionCodigo:'INVENTADO',fechaFabricacion:'2026-01-01' }] })
    expect(valid.errors).toEqual({})
    expect(valid.value.productos[0]).toEqual({ productoId:collaborator,lote:'L-1',fechaVencimiento:'2030-11-01' })
  })
  it('uses Colombian dates at the UTC day boundary and round-trips the editor',()=>{
    expect(todayBogota(new Date('2026-10-07T02:00:00Z'))).toBe('2026-10-06')
    expect(addDateDays('2026-12-20',21)).toBe('2027-01-10')
    expect(fromBogotaInput('2026-10-06T09:00')).toBe('2026-10-06T14:00:00.000Z')
    expect(toBogotaInput(fromBogotaInput('2026-10-06T09:00'))).toBe('2026-10-06T09:00')
    expect(scheduleEnd(schedule)).toBe('2026-10-06T15:30:00.000Z')
    const draft=emptyServiceDraft(undefined,new Date('2026-10-07T02:00:00Z'))
    expect(draft.programacion.inicioProgramado).toBe('2026-10-07T09:00')
    expect(draftToServiceInput(draft).programacion.inicioProgramado).toBe('2026-10-07T14:00:00.000Z')
  })
  it('bounds durations, collaborator counts and product counts',()=>{
    expect(validateSchedule({ ...schedule,duracionMinutos:NaN }).errors).toHaveProperty('programacion.duracionMinutos')
    expect(validateSchedule({ ...schedule,duracionMinutos:10_081 }).errors).toHaveProperty('programacion.duracionMinutos')
    expect(validateServiceInput({ ...input(),productos:Array.from({ length:101 },()=>({})) }).errors.productos).toBeTruthy()
  })
})
