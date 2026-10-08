import { describe,expect,it } from 'vitest'
import { layoutServiceDay,serviceWeekBounds } from './serviceWeek'
import type { AdminService } from '../types/adminServices'

function record(id: string,start: string,end: string): AdminService {
  return {
    id,solicitud:id,tipoServicio:'PRINCIPAL',estado:'PROGRAMADO',version:1,inicioProgramado:start,finProgramado:end,
    tecnicoResponsableId:id,tecnicosColaboradoresIds:[],clientId:id,clienteNombre:'Cliente',sedeId:id,sedeNombre:'Sede',direccion:'Dirección',
    servicioPrincipalId:null,inicioReal:null,finReal:null,
    responsable:{ id,nombreCompleto:'Técnico',correoGoogle:'tech@example.invalid',activo:true,tieneCertificado:false,certificadoFechaVencimiento:null },
    colaboradores:[],contacto:{ nombre:null,celular:null,correos:[] },valorServicio:100000,observaciones:'',productos:[],refuerzo:null,principal:null,
    pago:{ metodoPago:null,estadoPago:'SIN_REGISTRAR',tecnicoRecaudoPrevistoId:null,recaudadoPorId:null,recaudadoPorNombre:null,pagoFecha:null,confirmadoAt:null,confirmadoPor:null,comprobanteStoragePath:null },
    calendar:{ estado:'PENDIENTE',ultimaSyncAt:null,error:null },executionLock:null,motivoCancelacion:null,canceladoAt:null,
  }
}
describe('weekly service calendar layout',()=>{
  it('uses 08:00–21:00 when all services fit inside the normal operating grid',()=>{
    expect(serviceWeekBounds([record('a','2030-10-07T14:00:00Z','2030-10-07T15:30:00Z')])).toEqual({ startMinute:480,endMinute:1260 })
  })
  it('expands by whole hours for services outside the default range',()=>{
    expect(serviceWeekBounds([record('a','2030-10-07T12:30:00Z','2030-10-08T03:15:00Z')])).toEqual({ startMinute:420,endMinute:1380 })
  })
  it('assigns overlapping services to parallel lanes and reuses a lane after the overlap ends',()=>{
    const rows=[
      record('a','2030-10-07T14:00:00Z','2030-10-07T15:30:00Z'),
      record('b','2030-10-07T14:30:00Z','2030-10-07T16:00:00Z'),
      record('c','2030-10-07T16:00:00Z','2030-10-07T17:00:00Z'),
    ]
    const layout=layoutServiceDay(rows,'2030-10-07')
    expect(layout.slice(0,2).map(item=>item.laneCount)).toEqual([2,2])
    expect(layout.slice(0,2).map(item=>item.lane)).toEqual([0,1])
    expect(layout[2]).toMatchObject({ lane:0,laneCount:1 })
  })
})
