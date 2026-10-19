import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ServiceConflictResolver from '@/components/domain/services/ServiceConflictResolver.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import type { ScheduleConflict, ScheduleResolution, ServiceSchedule, ServiceTechnician } from '@/types/adminServices'

const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const start='2030-10-13T14:00:00.000Z'
const schedule=(person:number):ServiceSchedule=>({
  inicioProgramado:start,duracionMinutos:90,tecnicoResponsableId:id(person),tecnicosColaboradoresIds:[],
})
const technician=(n:number):ServiceTechnician=>({
  id:id(n),nombreCompleto:n===1?'Técnico ocupado':'Técnico disponible '+n,
  correoGoogle:'tecnico'+n+'@example.com',activo:true,tieneCertificado:false,certificadoFechaVencimiento:null,
})
function conflict(available=true):ScheduleConflict {
  return {
    id:id(20),solicitud:'SR-00000026',clienteNombre:'Alejandro Pérez',sedeNombre:'Sede',
    inicioProgramado:start,finProgramado:'2030-10-13T15:30:00.000Z',
    tecnicos:['Técnico ocupado'],version:2,programacion:schedule(1),
    conflictingTechnicianIds:[id(1)],proposedIndex:0,
    unavailableProposedTechnicianIds:available?[id(1)]:[id(1),id(2)],
    unavailableTechnicianIds:available?[id(1)]:[id(1),id(2)],existingEditable:true,
  }
}
function mountResolver(c=conflict()) {
  return mount(ServiceConflictResolver,{
    props:{
      open:true,conflicts:[c],technicians:[technician(1),technician(2)],
      schedules:[schedule(1)],saving:false,currentClientName:'Juanito Pérez',currentServiceIsNew:true,
    },
    global:{stubs:{BaseDialog:{template:'<section><slot/><slot name="footer"/></section>'}}},
  })
}

describe('Modal de cruces de horario',()=>{
  it('muestra los dos clientes y permite elegir qué servicio modificar sin un select de acciones',async()=>{
    const wrapper=mountResolver()
    expect(wrapper.text()).toContain('Juanito Pérez')
    expect(wrapper.text()).toContain('Servicio que estás creando')
    expect(wrapper.text()).toContain('Alejandro Pérez')
    expect(wrapper.text()).toContain('Servicio ya agendado')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(4)
    expect(wrapper.findAll('select')).toHaveLength(1)
    expect(wrapper.get('select').attributes('aria-invalid')).toBe('false')
    expect(wrapper.findAll('option').map(item=>item.text())).toEqual([
      'Seleccionar técnico disponible','Técnico disponible 2',
    ])
    expect(wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.attributes('disabled')).toBeDefined()

    await wrapper.findAll('input[type="radio"]')[1]!.setValue()
    expect(wrapper.text()).toContain('Nuevo técnico para Alejandro Pérez')
    await wrapper.get('select').setValue(id(2))
    await wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.trigger('click')

    const saved=wrapper.emitted('accept')?.[0]?.[0] as ScheduleResolution | undefined
    expect(saved).toBeDefined()
    expect(saved?.schedules[0]?.tecnicoResponsableId).toBe(id(1))
    expect(saved?.reassignments[0]?.programacion.tecnicoResponsableId).toBe(id(2))
  })
  it('solo permite reemplazar en el servicio actual cuando el otro está en ejecución',async()=>{
    const wrapper=mountResolver({...conflict(),existingEditable:false})
    expect(wrapper.findAll('input[type="radio"]')[1]?.attributes('disabled')).toBeDefined()
    await wrapper.get('select').setValue(id(2))
    await wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.trigger('click')
    const saved=wrapper.emitted('accept')?.[0]?.[0] as ScheduleResolution | undefined
    expect(saved?.schedules[0]?.tecnicoResponsableId).toBe(id(2))
    expect(saved?.reassignments).toEqual([])
  })
  it('permite mover fecha y hora del servicio ya agendado conservando al técnico',async()=>{
    const wrapper=mountResolver()
    await wrapper.findAll('input[type="radio"]')[1]!.setValue()
    await wrapper.findAll('input[type="radio"]')[3]!.setValue()
    expect(wrapper.findAll('select[name^="conflict-replacement-"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('Nueva fecha y hora para Alejandro Pérez')
    expect(wrapper.text()).toContain('Se conservarán los técnicos y la duración')
    expect(wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.attributes('disabled')).toBeDefined()

    wrapper.findComponent(BaseDateTimePicker).vm.$emit('update:modelValue','2030-10-15T11:00')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.attributes('disabled')).toBeUndefined()
    await wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.trigger('click')
    const saved=wrapper.emitted('accept')?.[0]?.[0] as ScheduleResolution | undefined
    expect(saved?.schedules[0]?.tecnicoResponsableId).toBe(id(1))
    expect(saved?.reassignments[0]?.programacion).toMatchObject({
      inicioProgramado:'2030-10-15T16:00:00.000Z',tecnicoResponsableId:id(1),duracionMinutos:90,
    })
  })
  it('no permite confirmar si la nueva hora sigue cruzada con el otro servicio',async()=>{
    const wrapper=mountResolver()
    await wrapper.findAll('input[type="radio"]')[3]!.setValue()
    wrapper.findComponent(BaseDateTimePicker).vm.$emit('update:modelValue','2030-10-13T10:00')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('todavía se cruza')
    expect(wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.attributes('disabled')).toBeDefined()
  })
  it('deshabilita confirmar cuando no hay técnicos disponibles',()=>{
    const wrapper=mountResolver(conflict(false))
    expect(wrapper.findAll('option')).toHaveLength(1)
    expect(wrapper.text()).toContain('No hay técnicos disponibles')
    expect(wrapper.findAll('button').find(button=>button.text().includes('Confirmar cambio'))!.attributes('disabled')).toBeDefined()
  })
})
