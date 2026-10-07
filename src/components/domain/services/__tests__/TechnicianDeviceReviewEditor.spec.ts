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
  plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }],
  estadoAnterior: 'ACTIVO',
  creadoDuranteServicio: false,
  revisado: false,
  revision: null,
}

describe('TechnicianDeviceReviewEditor', () => {
  it('uses the frozen pest list and requires a photo for a new damaged state', async () => {
    const wrapper = mount(TechnicianDeviceReviewEditor, { props: { device, mutation: null, editable: true, syncing: false } })
    await wrapper.get('.device-summary').trigger('click')
    await wrapper.get('select').setValue('DANADO')
    await wrapper.get('input[type="number"]').setValue('3')
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.text()).toContain('Adjunta una fotografía del cambio de estado.')
    expect(wrapper.emitted('save')).toBeUndefined()

    const photo = new File(['photo'], 'dano.jpg', { type: 'image/jpeg' })
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { configurable: true, value: [photo] })
    await wrapper.get('input[type="file"]').trigger('change')
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual([expect.objectContaining({
      estadoObservado: 'DANADO',
      capturas: [{ plagaCodigo: 'CUCARACHA', cantidad: 3 }],
    }), photo])
  })

  it('does not request another photo when the frozen device was already damaged', async () => {
    const wrapper = mount(TechnicianDeviceReviewEditor, { props: {
      device: { ...device, estadoAnterior: 'DANADO' }, mutation: null, editable: true, syncing: false,
    } })
    await wrapper.get('.device-summary').trigger('click')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === 'Guardar revisión')!.trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ estadoObservado: 'DANADO' })
  })
})
