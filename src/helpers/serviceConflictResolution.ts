import { scheduleEnd, toBogotaInput } from './adminServices'
import type { ScheduleConflict, ScheduleResolution, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'

export type ConflictChoice = { side: 'current' | 'existing'; technicianId: string }
export type ConflictChoices = Record<string, ConflictChoice>
export interface ConflictResolutionRow {
  key: string
  conflict: ScheduleConflict
  conflictingTechnicianId: string
  selected: ConflictChoice
  options: ServiceTechnician[]
  valid: boolean
}
const team=(s:ServiceSchedule)=>[s.tecnicoResponsableId,...s.tecnicosColaboradoresIds]
const overlaps=(a:ServiceSchedule,b:ServiceSchedule)=>
  new Date(a.inicioProgramado).getTime()<new Date(scheduleEnd(b)).getTime()
  && new Date(b.inicioProgramado).getTime()<new Date(scheduleEnd(a)).getTime()
const clone=(s:ServiceSchedule):ServiceSchedule=>({...s,tecnicosColaboradoresIds:[...s.tecnicosColaboradoresIds]})
const swap=(s:ServiceSchedule,from:string,to:string):ServiceSchedule=>
  s.tecnicoResponsableId===from ? {...s,tecnicoResponsableId:to} :
    {...s,tecnicosColaboradoresIds:s.tecnicosColaboradoresIds.map(id=>id===from ? to : id)}

export function buildConflictResolution(
  conflicts:ScheduleConflict[], source:ServiceSchedule[], choices:ConflictChoices, technicians:ServiceTechnician[],
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
      // Another selected replacement may already have eliminated this same conflict.
      if(!overlaps(current,existing) || !team(current).includes(conflictingTechnicianId) || !team(existing).includes(conflictingTechnicianId)) continue
      const selected=choices[key] ?? {side:'current' as const,technicianId:''}
      const side=internal || conflict.existingEditable===false ? 'current' : selected.side
      const target=side==='current' ? current : existing
      const busy=new Set(side==='current' ? conflict.unavailableProposedTechnicianIds : conflict.unavailableTechnicianIds)
      // Recheck choices against the updated schedules, not only the original server warning.
      for(const [i,other] of schedules.entries()) if((side!=='current' || i!==ix) && overlaps(target,other)) {
        // For an internal conflict, do not count the target service twice.
        if(!(internal && i===internalIndex && side==='existing'))team(other).forEach(id=>busy.add(id))
      }
      for(const [id,other] of changed) if((side!=='existing' || id!==conflict.id) && overlaps(target,other.programacion))
        team(other.programacion).forEach(value=>busy.add(value))
      const date=toBogotaInput(target.inicioProgramado).slice(0,10)
      const options=technicians.filter(person=>
        person.activo && person.id!==conflictingTechnicianId && !team(target).includes(person.id)
        && !busy.has(person.id) && (!person.tieneCertificado || Boolean(person.certificadoFechaVencimiento && person.certificadoFechaVencimiento>=date))
      )
      const valid=Boolean(selected.technicianId && options.some(person=>person.id===selected.technicianId))
      rows.push({key,conflict,conflictingTechnicianId,selected:{side,technicianId:selected.technicianId},options,valid})
      if(!valid) {pending++;continue}
      if(side==='current')schedules[ix]=swap(current,conflictingTechnicianId,selected.technicianId)
      else changed.set(conflict.id,{id:conflict.id,version:conflict.version,programacion:swap(existing,conflictingTechnicianId,selected.technicianId)})
    }
  }
  return {resolution:{schedules,reassignments:[...changed.values()]},rows,pending}
}
