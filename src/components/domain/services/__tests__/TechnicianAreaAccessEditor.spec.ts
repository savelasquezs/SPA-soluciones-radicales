import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'
import TechnicianAreaAccessEditor from '@/components/domain/services/TechnicianAreaAccessEditor.vue'
import type { TechnicianArea, TechnicianAreaAccessMutation } from '@/types/technicianServices'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

const area: TechnicianArea = {
  id: '10000000-0000-4000-8000-000000000001',
  areaId: '10000000-0000-4000-8000-000000000002', nombre: 'Cocina', esExterna: false,
  posicionInicial: 0, posicionRecorrido: 0, sinAcceso: false, sinAccesoDescripcion: null,
  sinAccesoFotoStoragePath: null, version: 1, criterios: [], dispositivos: [], hallazgos: [],
}

describe('TechnicianAreaAccessEditor', () => {
  it('shows the enable action immediately and validates motive with photographs', async () => {
    const wrapper = mount(TechnicianAreaAccessEditor, { props: { area, mutation: null, editable: true, syncing: false } })
    await wrapper.get('button.access-trigger').trigger('click')
    expect(wrapper.text()).toContain('Habilitar Área')
    await wrapper.get('.access-fields button.base-button--danger').trigger('click')
    expect(wrapper.text()).toContain('Describe por qué no fue posible ingresar.')
    expect(wrapper.text()).toContain('Adjunta al menos una fotografía del Área.')
    expect(wrapper.emitted('save')).toBeUndefined()

    await wrapper.get('textarea').setValue('Puerta cerrada')
    const photos = [new File(['one'], 'uno.jpg', { type: 'image/jpeg' }), new File(['two'], 'dos.jpg', { type: 'image/jpeg' })]
    const gallery = wrapper.get('input[type="file"]:not([capture])')
    Object.defineProperty(gallery.element, 'files', { configurable: true, value: photos })
    await gallery.trigger('change')
    await wrapper.get('.access-fields button.base-button--danger').trigger('click')
    const emitted = wrapper.emitted('save')?.[0]
    expect(emitted?.slice(0, 3)).toEqual([true, 'Puerta cerrada', photos])
    expect(typeof emitted?.[3]).toBe('function')
    expect(wrapper.find('.access-completed').exists()).toBe(false)
    const finish = emitted?.[3] as (saved: boolean) => void
    finish(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.access-completed').exists()).toBe(true)
    await wrapper.get('.access-completed button').trigger('click')
    expect(wrapper.emitted('continue')).toHaveLength(1)
  })

  it('discards an unsaved edit when the dialog is closed', async () => {
    const savedArea = { ...area, sinAcceso: true, sinAccesoDescripcion: 'Puerta cerrada',
      sinAccesoFotoStoragePath: 'services/s/areas/a/no-access/existing.jpg' }
    const wrapper = mount(TechnicianAreaAccessEditor, { props: {
      area: savedArea, mutation: null, editable: true, syncing: false,
    } })
    await wrapper.get('.access-summary__actions button').trigger('click')
    await wrapper.get('textarea').setValue('Motivo sin guardar')
    await wrapper.get('.base-dialog__header button').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('can open a stored conflict to resolve it and enable access', async () => {
    const mutation: TechnicianAreaAccessMutation = {
      schemaVersion: 1, requestId: '10000000-0000-4000-8000-000000000003', actorId: '10000000-0000-4000-8000-000000000004',
      serviceId: '10000000-0000-4000-8000-000000000005', deviceId: '10000000-0000-4000-8000-000000000006',
      lockToken: '10000000-0000-4000-8000-000000000007', kind: 'AREA_ACCESS', areaId: area.id,
      withoutAccess: true, description: 'Local', photoMediaId: null, photoStoragePath: 'services/s/areas/a/no-access/local.jpg',
      version: 1, status: 'CONFLICT', createdAt: '2026-10-07T13:00:00Z', updatedAt: '2026-10-07T13:00:00Z',
      conflict: { id: area.id, sinAcceso: false, sinAccesoDescripcion: null, sinAccesoFotoStoragePath: null, version: 2 }, error: 'El estado cambió.',
    }
    const wrapper = mount(TechnicianAreaAccessEditor, { props: {
      area: { ...area, sinAcceso: true, sinAccesoDescripcion: 'Local', sinAccesoFotoStoragePath: mutation.photoStoragePath },
      mutation, editable: true, syncing: false,
    } })
    await wrapper.get('.access-summary__actions button').trigger('click')
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
    const actions = wrapper.findAll('.access-actions button')
    await actions[0]!.trigger('click')
    await actions[1]!.trigger('click')
    expect(wrapper.emitted('useRemote')).toHaveLength(1)
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
