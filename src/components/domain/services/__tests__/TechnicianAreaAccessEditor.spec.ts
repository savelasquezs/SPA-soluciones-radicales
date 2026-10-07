import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TechnicianAreaAccessEditor from '@/components/domain/services/TechnicianAreaAccessEditor.vue'
import type { TechnicianArea, TechnicianAreaAccessMutation } from '@/types/technicianServices'

const area: TechnicianArea = {
  id: '10000000-0000-4000-8000-000000000001',
  areaId: '10000000-0000-4000-8000-000000000002',
  nombre: 'Cocina',
  esExterna: false,
  posicionInicial: 0,
  posicionRecorrido: 0,
  sinAcceso: false,
  sinAccesoDescripcion: null,
  sinAccesoFotoStoragePath: null,
  version: 1,
  criterios: [],
  dispositivos: [],
}

describe('TechnicianAreaAccessEditor', () => {
  it('requires a description and a photo before saving a no-access exception', async () => {
    const wrapper = mount(TechnicianAreaAccessEditor, { props: { area, mutation: null, editable: true, syncing: false } })
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('button.base-button').trigger('click')
    expect(wrapper.text()).toContain('Describe por qué no fue posible ingresar.')
    expect(wrapper.text()).toContain('Adjunta una fotografía del Área.')
    expect(wrapper.emitted('save')).toBeUndefined()

    await wrapper.get('textarea').setValue('Puerta cerrada')
    const photo = new File(['photo'], 'evidencia.jpg', { type: 'image/jpeg' })
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { configurable: true, value: [photo] })
    await wrapper.get('input[type="file"]').trigger('change')
    const saved = wrapper.emitted('save') ?? []
    expect(saved[saved.length - 1]).toEqual([true, 'Puerta cerrada', photo])
  })

  it('shows an explicit conflict and blocks editing until it is resolved', async () => {
    const mutation: TechnicianAreaAccessMutation = {
      schemaVersion: 1,
      requestId: '10000000-0000-4000-8000-000000000003', actorId: '10000000-0000-4000-8000-000000000004',
      serviceId: '10000000-0000-4000-8000-000000000005', deviceId: '10000000-0000-4000-8000-000000000006',
      lockToken: '10000000-0000-4000-8000-000000000007', kind: 'AREA_ACCESS', areaId: area.id,
      withoutAccess: true, description: 'Local', photoMediaId: null, photoStoragePath: 'services/s/areas/a/no-access/local.jpg',
      version: 1, status: 'CONFLICT', createdAt: '2026-10-07T13:00:00Z', updatedAt: '2026-10-07T13:00:00Z',
      conflict: { id: area.id, sinAcceso: false, sinAccesoDescripcion: null, sinAccesoFotoStoragePath: null, version: 2 },
      error: 'El estado cambió.',
    }
    const wrapper = mount(TechnicianAreaAccessEditor, { props: { area: { ...area, sinAcceso: true, sinAccesoDescripcion: 'Local', sinAccesoFotoStoragePath: mutation.photoStoragePath }, mutation, editable: true, syncing: false } })
    expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    const actions = wrapper.findAll('.access-actions button')
    await actions[0]!.trigger('click')
    await actions[1]!.trigger('click')
    expect(wrapper.emitted('useRemote')).toHaveLength(1)
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
