import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TechnicianNewDeviceEditor from '@/components/domain/services/TechnicianNewDeviceEditor.vue'

const types = [{
  codigo: 'TRAMPA_ADHESIVA',
  nombre: 'Trampa adhesiva',
  clasificacion: 'RASTREROS' as const,
  plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }],
}]

describe('TechnicianNewDeviceEditor', () => {
  it('validates the permanent device fields and emits normalized input', async () => {
    const wrapper = mount(TechnicianNewDeviceEditor, { props: { deviceTypes: types, saving: false } })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Escribe el número')
    await wrapper.get('#new-device-number').setValue(' D-02 ')
    await wrapper.get('#new-device-location').setValue(' Junto a la puerta ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')?.[0]).toEqual([{ numero: 'D-02', tipoCodigo: 'TRAMPA_ADHESIVA', ubicacion: 'Junto a la puerta' }])
  })

  it('loads a conflict for explicit correction or discard', async () => {
    const wrapper = mount(TechnicianNewDeviceEditor, { props: {
      deviceTypes: types,
      saving: false,
      conflict: {
        schemaVersion: 1, requestId: crypto.randomUUID(), actorId: crypto.randomUUID(), serviceId: crypto.randomUUID(),
        deviceId: crypto.randomUUID(), lockToken: crypto.randomUUID(), kind: 'DEVICE_CREATE', areaId: crypto.randomUUID(),
        permanentDeviceId: crypto.randomUUID(), serviceDeviceId: crypto.randomUUID(), numero: 'D-01', tipoCodigo: 'TRAMPA_ADHESIVA',
        ubicacion: 'Puerta', status: 'CONFLICT', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        error: 'Ya existe un dispositivo con ese número en la Sede.',
      },
    } })
    expect(wrapper.text()).toContain('Corregir alta')
    expect(wrapper.text()).toContain('Ya existe un dispositivo')
    await wrapper.get('button.base-button--ghost').trigger('click')
    expect(wrapper.emitted('discard')).toHaveLength(1)
  })
})
