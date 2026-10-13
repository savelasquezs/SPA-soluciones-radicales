import { describe, expect, it } from 'vitest'
import type { ServiceSite } from '@/types/adminServices'
import {
  draftToServiceInput, emptyServiceDraft, validateServiceInput, fromBogotaInput,
} from '@/helpers/adminServices'

const uuid=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
function input() {
  const draft=emptyServiceDraft()
  draft.sedeId=uuid(1)
  draft.programacion.tecnicoResponsableId=uuid(2)
  draft.programacion.inicioProgramado='2030-10-09T09:00'
  draft.refuerzo=null
  return draftToServiceInput(draft)
}

describe('Formularios de programación: fecha y pago real',()=>{
  it('precarga la tarifa de Casa sin impedir modificar el valor de una visita', () => {
    const home: ServiceSite = {
      id: uuid(1), clientId: uuid(2), clienteNombre: 'Cliente residencial',
      nombre: 'Casa', direccion: 'Calle 1', tipoSede: 'RESIDENCIAL',
      valorServicio: 105000, periodicidadMeses: null, duracionServicioMinutos: null,
      manejaRefuerzo: false, contacto: { nombre: 'Cliente residencial', celular: null, correos: [] },
    }
    const draft = emptyServiceDraft(home)
    expect(draft.valorServicio).toBe('105000')
    expect(draftToServiceInput({ ...draft, valorServicio: '95000' }).valorServicio).toBe(95000)
    expect(home.valorServicio).toBe(105000)
    expect(emptyServiceDraft({ ...home, valorServicio: null }).valorServicio).toBe('')
  })

  it('rechaza pasado y fecha igual al momento de guardar; respeta histórico durante edición',()=>{
    const data=input()
    data.programacion.inicioProgramado=fromBogotaInput('2024-01-01T09:00')
    const now=new Date('2026-10-09T20:00:00.000Z')
    expect(validateServiceInput(data,true,now).errors['programacion.inicioProgramado']).toMatch(/posteriores/)
    expect(validateServiceInput(data,false,now).errors['programacion.inicioProgramado']).toBeUndefined()
    data.programacion.inicioProgramado=now.toISOString()
    expect(validateServiceInput(data,true,now).errors['programacion.inicioProgramado']).toMatch(/posteriores/)
    data.programacion.inicioProgramado='2030-10-09T14:00:00.000Z'
    expect(validateServiceInput(data,true,now).errors['programacion.inicioProgramado']).toBeUndefined()
  })
  it('requiere método y receptor para pago confirmado en efectivo',()=>{
    const data=input()
    data.cobro={metodoPago:null,tecnicoRecaudoPrevistoId:null,pagado:true,recaudadoPorId:null}
    expect(validateServiceInput(data).errors['cobro.metodoPago']).toBeTruthy()
    data.cobro.metodoPago='EFECTIVO'
    expect(validateServiceInput(data).errors['cobro.recaudadoPorId']).toBeTruthy()
    data.cobro.recaudadoPorId=uuid(3)
    const validated=validateServiceInput(data)
    expect(validated.errors['cobro.recaudadoPorId']).toBeUndefined()
    expect(validated.value.cobro).toMatchObject({pagado:true,recaudadoPorId:uuid(3),metodoPago:'EFECTIVO'})
  })
  it('acepta transferencia confirmada sin receptor e impide campos de pago incompatibles',()=>{
    const data=input()
    data.cobro={metodoPago:'TRANSFERENCIA',tecnicoRecaudoPrevistoId:null,pagado:true,recaudadoPorId:null}
    expect(validateServiceInput(data).errors).toEqual({})
    data.cobro.recaudadoPorId=uuid(4)
    expect(validateServiceInput(data).errors['cobro.recaudadoPorId']).toBeTruthy()
    data.cobro={metodoPago:'EFECTIVO',tecnicoRecaudoPrevistoId:uuid(2),pagado:false,recaudadoPorId:null}
    expect(validateServiceInput(data).errors).toEqual({})
  })
})
