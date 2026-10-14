import { fromBogotaInput, isZonedInstant, scheduleEnd, toBogotaInput } from './adminServices'
import type { ScheduleConflict, ScheduleResolution, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'

export type ConflictAction = 'technician' | 'schedule'
export type ConflictChoice = {
  side: 'current' | 'existing'
  technicianId: string
  action?: ConflictAction
  start?: string
}
export type ConflictChoices = Record<string, ConflictChoice>
export interface ConflictResolutionRow {
  key: string
  conflict: ScheduleConflict
  conflictingTechnicianId: string
  selected: ConflictChoice
  options: ServiceTechnician[]
  valid: boolean
  validationMessage?: string
}
const team=(s:ServiceSchedule)=>[s.tecnicoResponsableId,...s.tecnicosColaboradoresIds]
const overlaps=(a:ServiceSchedule,b:ServiceSchedule)=>
  new Date(a.inicioProgramado).getTime()<new Date(scheduleEnd(b)).getTime()
  && new Date(b.inicioProgramado).getTime()<new Date(scheduleEnd(a)).getTime()
const sharesTechnician=(a:ServiceSchedule,b:ServiceSchedule)=>
  team(a).some(id=>team(b).includes(id))
const clashes=(a:ServiceSchedule,b:ServiceSchedule)=>overlaps(a,b)&&sharesTechnician(a,b)
const clone=(s:ServiceSchedule):ServiceSchedule=>({...s,tecnicosColaboradoresIds:[...s.tecnicosColaboradoresIds]})
const swap=(s:ServiceSchedule,from:string,to:string):ServiceSchedule=>
  s.tecnicoResponsableId===from ? {...s,tecnicoResponsableId:to} :
    {...s,tecnicosColaboradoresIds:s.tecnicosColaboradoresIds.map(id=>id===from ? to : id)}

export function buildConflictResolution(
  conflicts:ScheduleConflict[], source:ServiceSchedule[], choices:ConflictChoices, technicians:ServiceTechnician[],
  now = new Date(),
):{resolution:ScheduleResolution;rows:ConflictResolutionRow[];pending:number} {
  const schedules=source.map(clone), changed=new Map<string,{id:string;version:number;programacion:ServiceSchedule}>()
  const rows:ConflictResolutionRow[]=[]
  let pending=0
  for(const conflict of conflicts) {
    const ix=conflict.proposedIndex
    if(!schedules[ix]) {pending++;continue}
    for(const conflictingTechnicianId of conflict.conflictingTechnicianIds) {
      const key=`${ix}:${conflict.id}:${conflictingTechnicianId}`
      const current=schedules[ix]!
      const internal=Boolean(conflict.internal)
      const internalIndex=internal ? Number(conflict.id.split(':')[1]) : -1
      const existing=internal ? schedules[internalIndex] : changed.get(conflict.id)?.programacion ?? clone(conflict.programacion)
      if(!existing) {pending++;continue}
      // An earlier choice may already have fixed this conflict.
      if(!clashes(current,existing) || !team(current).includes(conflictingTechnicianId) || !team(existing).includes(conflictingTechnicianId)) continue
      const choice=choices[key] ?? {side:'current' as const,technicianId:''}
      const side=internal || conflict.existingEditable===false ? 'current' : choice.side
      const selected:ConflictChoice={side,technicianId:choice.technicianId,action:choice.action ?? 'technician',start:choice.start ?? ''}
      const target=side==='current' ? current : existing
      const busy=new Set(side==='current' ? conflict.unavailableProposedTechnicianIds : conflict.unavailableTechnicianIds)
      for(const [i,other] of schedules.entries()) if((side!=='current' || i!==ix) && overlaps(target,other)) {
        if(!(internal && i===internalIndex && side==='existing'))team(other).forEach(id=>busy.add(id))
      }
      for(const [id,other] of changed) if((side!=='existing' || id!==conflict.id) && overlaps(target,other.programacion))
        team(other.programacion).forEach(value=>busy.add(value))
      const date=toBogotaInput(target.inicioProgramado).slice(0,10)
      const options=technicians.filter(person=>
        person.activo && person.id!==conflictingTechnicianId && !team(target).includes(person.id)
        && !busy.has(person.id) && (!person.tieneCertificado || Boolean(person.certificadoFechaVencimiento && person.certificadoFechaVencimiento>=date))
      )
      let valid=false
      let validationMessage: string | undefined
      let updated:ServiceSchedule | undefined
      if(selected.action==='schedule') {
        const start=fromBogotaInput(selected.start ?? '')
        if(!start || !isZonedInstant(start)) validationMessage='Selecciona una nueva fecha y hora.'
        else if(new Date(start).getTime()<=now.getTime()) validationMessage='La nueva fecha y hora deben ser futuras.'
        else if(new Date(start).getTime()===new Date(target.inicioProgramado).getTime()) validationMessage='Selecciona una fecha u hora diferente.'
        else {
          const candidate={...target,inicioProgramado:start}
          const otherProposals=schedules.filter((_,i)=>side!=='current' || i!==ix)
          const changedOthers=[...changed.values()].filter(row=>side!=='existing' || row.id!==conflict.id).map(row=>row.programacion)
          // Keep the other affected appointment, and verify all the other edits already proposed.
          if([side==='current' ? existing : current,...otherProposals,...changedOthers].some(other=>clashes(candidate,other)))
            validationMessage='El nuevo horario todavía se cruza con otro servicio.'
          else { valid=true; updated=candidate }
        }
      } else {
        valid=Boolean(selected.technicianId && options.some(person=>person.id===selected.technicianId))
        if(valid) updated=swap(target,conflictingTechnicianId,selected.technicianId)
      }
      rows.push({key,conflict,conflictingTechnicianId,selected,options,valid,validationMessage})
      if(!valid || !updated) {pending++;continue}
      if(side==='current')schedules[ix]=updated
      else if(internal)schedules[internalIndex]=updated
      else changed.set(conflict.id,{id:conflict.id,version:conflict.version,programacion:updated})
    }
  }
  return {resolution:{schedules,reassignments:[...changed.values()]},rows,pending}
}
