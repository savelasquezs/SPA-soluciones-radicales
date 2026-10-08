import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TechnicianDeviceReviewEditor from '@/components/domain/services/TechnicianDeviceReviewEditor.vue'
import type { TechnicianDevice } from '@/types/technicianServices'

const device: TechnicianDevice = {
  id: '10000000-0000-4000-8000-000000000001',
  dispositivoId: '10000000-0000-4000-8000-000000000002',
  numero: 'D-01',
  ubicacion: 'Bajo mesón',
  tipoCodigo: 'TRAMPA_ADHESIVA',
  tipoNombre: 'Trampa adhesiva',
  clasificacion: 'RASTREROS',
  plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }, { codigo: 'HORMIGA', nombre: 'Hormiga' }],
  estadoAnterior: 'ACTIVO',
  creadoDuranteServicio: false,
  revisado: false,
  revision: null,
}

describe('TechnicianDeviceReviewEditor', () => {
  it('records only pests that were actually evidenced and requires a photo for a new damaged state', async () => {
    const wrapper = mount(TechnicianDeviceReviewEditor, { props: { device, mutation: null, editable: true, syncing: false, expanded: true } })
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sin seleccionar = no se evidencia')
    await wrapper.get('select').setValue('DANADO')
    await wrapper.findAll('.pest-chip')[0]!.trigger('click')
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.text()).toContain('Adjunta una fotografía del cambio de estado.')
    expect(wrapper.emitted('save')).toBeUndefined()

    const photo = new File(['photo'], 'dano.jpg', { type: 'image/jpeg' })
    Object.defineProperty(wrapper.findAll('input[type="file"]')[0]!.element, 'files', { configurable: true, value: [photo] })
    await wrapper.findAll('input[type="file"]')[0]!.trigger('change')
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual([expect.objectContaining({
      estadoObservado: 'DANADO',
      capturas: [{ plagaCodigo: 'CUCARACHA', cantidad: 3 }],
    }), photo])
  })

  it('treats zero as no evidence instead of requiring a minimum capture', async () => {
    const wrapper = mount(TechnicianDeviceReviewEditor, { props: { device, mutation: null, editable: true, syncing: false, expanded: true } })
    await wrapper.findAll('.pest-chip')[0]!.trigger('click')
    await wrapper.get('input[type="number"]').setValue('0')
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ capturas: [] })
  })

  it('keeps photo capture available for a normal review and removes free-text chemical and antidote fields', async () => {
    const wrapper = mount(TechnicianDeviceReviewEditor, { props: {
      device: { ...device, estadoAnterior: 'DANADO' }, mutation: null, editable: true, syncing: false, expanded: true,
    } })
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Producto químico')
    expect(wrapper.text()).not.toContain('Antídoto')
    expect(wrapper.text()).not.toContain('Consumo')
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ estadoObservado: 'DANADO', capturas: [] })
  })
})
