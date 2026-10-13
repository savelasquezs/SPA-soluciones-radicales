import { describe, expect, it } from 'vitest'
import { buildConflictResolution, type ConflictChoices } from '@/helpers/serviceConflictResolution'
import type { ScheduleConflict, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'

const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const time='2030-10-13T14:30:00.000Z'
const schedule=(responsible:number, collaborators:number[]=[]):ServiceSchedule=>({
  inicioProgramado:time,duracionMinutos:90,tecnicoResponsableId:id(responsible),tecnicosColaboradoresIds:collaborators.map(id),
})
const tech=(n:number,active=true):ServiceTechnician=>({
  id:id(n),nombreCompleto:`Técnico ${n}`,correoGoogle:`tech${n}@example.com`,
  activo:active,tieneCertificado:false,certificadoFechaVencimiento:null,
})
const technicians=[tech(1),tech(2),tech(3),tech(4),tech(5),tech(6,false)]
function conflict(overrides:Partial<ScheduleConflict>={}):ScheduleConflict {
  return {
    id:id(40),solicitud:'SR-0040',clienteNombre:'Cliente existente',sedeNombre:'Sede 1',
    inicioProgramado:time,finProgramado:'2030-10-13T16:00:00.000Z',
    tecnicos:['Técnico 1'],version:2,programacion:schedule(1),
    conflictingTechnicianIds:[id(1)],proposedIndex:0,
    unavailableProposedTechnicianIds:[id(1),id(2)],
    unavailableTechnicianIds:[id(1),id(2)],
    existingEditable:true,...overrides,
  }
}
const key=(row:ScheduleConflict,person=1)=>`${row.proposedIndex}:${row.id}:${id(person)}`
describe('Resolver cruces de técnicos',()=>{
  it('excluye al técnico en conflicto, ocupados e inactivos del select',()=>{
    const c=conflict()
    const result=buildConflictResolution([c],[schedule(1)],{},technicians)
    expect(result.pending).toBe(1)
    expect(result.rows[0]?.options.map(person=>person.id)).toEqual([id(3),id(4),id(5)])
  })
  it('cambia el técnico del servicio nuevo sin alterar el servicio existente',()=>{
    const c=conflict()
    const choices:ConflictChoices={ [key(c)]:{side:'current',technicianId:id(3)} }
    const result=buildConflictResolution([c],[schedule(1,[5])],choices,technicians)
    expect(result.pending).toBe(0)
    expect(result.resolution.schedules[0]?.tecnicoResponsableId).toBe(id(3))
    expect(result.resolution.schedules[0]?.tecnicosColaboradoresIds).toEqual([id(5)])
    expect(result.resolution.reassignments).toEqual([])
  })
  it('permite reasignar al servicio existente en vez de cambiar el nuevo',()=>{
    const c=conflict()
    const result=buildConflictResolution([c],[schedule(1)],{
      [key(c)]:{side:'existing',technicianId:id(4)},
    },technicians)
    expect(result.pending).toBe(0)
    expect(result.resolution.schedules[0]?.tecnicoResponsableId).toBe(id(1))
    expect(result.resolution.reassignments).toEqual([{id:c.id,version:2,programacion:schedule(4)}])
  })
  it('resuelve dos cruces del mismo técnico con un único cambio del servicio nuevo',()=>{
    const first=conflict(),second=conflict({id:id(41),solicitud:'SR-0041'})
    const result=buildConflictResolution([first,second],[schedule(1)],{
      [key(first)]:{side:'current',technicianId:id(3)},
    },technicians)
    expect(result.rows).toHaveLength(1)
    expect(result.pending).toBe(0)
    expect(result.resolution.schedules[0]?.tecnicoResponsableId).toBe(id(3))
  })
  it('preserva la posición del colaborador al reemplazarlo',()=>{
    const c=conflict({conflictingTechnicianIds:[id(5)],programacion:schedule(3,[5]),tecnicos:['Técnico 5']})
    const result=buildConflictResolution([c],[schedule(4,[5])],{
      [key(c,5)]:{side:'current',technicianId:id(3)},
    },technicians)
    expect(result.pending).toBe(0)
    expect(result.resolution.schedules[0]?.tecnicoResponsableId).toBe(id(4))
    expect(result.resolution.schedules[0]?.tecnicosColaboradoresIds).toEqual([id(3)])
  })
  it('no permite reemplazar al técnico de un servicio que ya está en ejecución',()=>{
    const c=conflict({existingEditable:false})
    const result=buildConflictResolution([c],[schedule(1)],{
      [key(c)]:{side:'existing',technicianId:id(3)},
    },technicians)
    expect(result.rows[0]?.selected.side).toBe('current')
    expect(result.pending).toBe(0)
    expect(result.resolution.schedules[0]?.tecnicoResponsableId).toBe(id(3))
    expect(result.resolution.reassignments).toHaveLength(0)
  })
  it('impide usar un técnico libre que tenga certificado vencido',()=>{
    const c=conflict(), expired:ServiceTechnician={...tech(5),tieneCertificado:true,certificadoFechaVencimiento:'2029-01-01'}
    const result=buildConflictResolution([c],[schedule(1)],{},[tech(1),tech(2),expired])
    expect(result.rows[0]?.options).toEqual([])
    expect(result.pending).toBe(1)
  })
  it('gestiona cruces simultáneos entre principal y refuerzo',()=>{
    const c=conflict({id:'internal:0:1',solicitud:'Servicios de esta operación',internal:true,
      proposedIndex:1,unavailableProposedTechnicianIds:[id(1)],programacion:schedule(1)})
    const result=buildConflictResolution([c],[schedule(1),schedule(1)],{
      [key(c)]:{side:'current',technicianId:id(3)},
    },technicians)
    expect(result.pending).toBe(0)
    expect(result.resolution.schedules[0]?.tecnicoResponsableId).toBe(id(1))
    expect(result.resolution.schedules[1]?.tecnicoResponsableId).toBe(id(3))
  })
})
