import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import TechnicianFindingCard from '@/components/domain/services/TechnicianFindingCard.vue'
import TechnicianFindingCreateEditor from '@/components/domain/services/TechnicianFindingCreateEditor.vue'
import type { TechnicianFinding } from '@/types/technicianServices'

const finding: TechnicianFinding = {
  id: '10000000-0000-4000-8000-000000000001',
  servicioAperturaId: '10000000-0000-4000-8000-000000000002',
  fechaApertura: '2026-09-07T14:00:00Z',
  descripcion: 'Abertura junto al muro',
  recomendacionAccion: 'Sellar el paso',
  evidenciasAperturaStoragePaths: ['services/opening/photo.jpg'],
  estado: 'ABIERTO',
  responsableNombre: 'Mantenimiento',
  responsableCorreo: null,
  servicioCierreId: null,
  fechaCierre: null,
  evidenciasCierreStoragePaths: [],
  observacionCierre: null,
  version: 1,
}

describe('technician finding editors', () => {
  it('keeps multiple selected evidence files and allows removing one', async () => {
    const wrapper = mount(TechnicianEvidencePicker, { props: { modelValue: [], name: 'evidence', label: 'Evidencias' } })
    const files = [new File(['one'], 'one.jpg', { type: 'image/jpeg' }), new File(['two'], 'two.png', { type: 'image/png' })]
    const inputs = wrapper.findAll('input[type="file"]')
    expect(inputs[0]!.attributes('capture')).toBe('environment')
    expect(inputs[1]!.attributes('capture')).toBeUndefined()
    const input = inputs[1]!
    Object.defineProperty(input.element, 'files', { configurable: true, value: files })
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual(files)
    await wrapper.setProps({ modelValue: files })
    await wrapper.get('button[aria-label="Quitar evidencia"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]?.[0]).toEqual([files[1]])
  })

  it('validates the required finding fields before emitting a create intent', async () => {
    const wrapper = mount(TechnicianFindingCreateEditor, { props: { saving: false } })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Describe el Hallazgo.')
    expect(wrapper.emitted('save')).toBeUndefined()
    const textareas = wrapper.findAll('textarea')
    await textareas[0]!.setValue('Abertura junto al muro')
    await textareas[1]!.setValue('Sellar el paso')
    expect(wrapper.find('input[name="finding-responsible-name"]').exists()).toBe(false)
    expect(wrapper.find('input[name="finding-responsible-email"]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({ descripcion: 'Abertura junto al muro', recomendacionAccion: 'Sellar el paso' })
  })

  it('allows correcting an existing evaluation with optional comments and photos', async () => {
    const wrapper = mount(TechnicianFindingCard, { props: {
      finding, currentServiceId: '10000000-0000-4000-8000-000000000003', mutation: null, editable: true, saving: false,
    } })
    await wrapper.get('.finding-card__summary').trigger('click')
    await wrapper.get('button[aria-pressed="false"]').trigger('click')
    await wrapper.get('button').trigger('blur')
    expect(wrapper.emitted('status')).toBeUndefined()
    const choices = wrapper.findAll('.finding-review__choices button')
    await choices[0]!.trigger('click')
    expect(wrapper.text()).toContain('Recomendado: añade foto u observación')
    await wrapper.get('.finding-review > .base-button').trigger('click')
    expect(wrapper.emitted('status')?.[0]?.[0]).toEqual({ estado: 'SIN_CAMBIOS', observacionCierre: '' })
    await (wrapper.emitted('status')![0]![2] as (saved: boolean) => Promise<void>)(true)
    await wrapper.setProps({ finding: { ...finding, resultadoSeguimiento: 'SIN_CAMBIOS', observacionSeguimiento: null, version: 2 } })
    await choices[1]!.trigger('click')
    await wrapper.get('.finding-review > .base-button').trigger('click')
    expect(wrapper.emitted('status')?.[1]?.[0]).toEqual({ estado: 'EN_PROCESO', observacionCierre: '' })
    await (wrapper.emitted('status')![1]![2] as (saved: boolean) => Promise<void>)(true)
    await choices[2]!.trigger('click')
    await wrapper.get('.finding-review > .base-button').trigger('click')
    expect(wrapper.text()).toContain('debes adjuntar una fotografía')
    expect(wrapper.emitted('status')).toHaveLength(2)
  })

  it('preserves newly selected photos and comments across a background acknowledgement', async () => {
    const wrapper = mount(TechnicianFindingCard, { props: {
      finding: { ...finding, resultadoSeguimiento: 'SIN_CAMBIOS', observacionSeguimiento: 'Texto guardado' },
      currentServiceId: '10000000-0000-4000-8000-000000000003', editable: true, saving: false,
    } })
    await wrapper.get('.finding-card__summary').trigger('click')
    await wrapper.get('textarea').setValue('Nueva observación sin guardar')
    await wrapper.get('.finding-review__extras .base-button:nth-child(2)').trigger('click')
    const files = [new File(['new'], 'nueva.jpg', {type:'image/jpeg'})]
    wrapper.getComponent(TechnicianEvidencePicker).vm.$emit('update:modelValue',files)
    await wrapper.setProps({ finding: { ...finding, version: 2, resultadoSeguimiento: 'SIN_CAMBIOS', observacionSeguimiento: 'Texto guardado', evidenciasSeguimientoLocalIds: [crypto.randomUUID()] } })
    expect(wrapper.getComponent(TechnicianEvidencePicker).props('modelValue')).toEqual(files)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Nueva observación sin guardar')
  })

  it('shows the current visit notes and photos in read-only mode without duplicating its history row', async () => {
    const currentServiceId = '10000000-0000-4000-8000-000000000003'
    const wrapper = mount(TechnicianFindingCard, { props: {
      finding: { ...finding, resultadoSeguimiento:'EN_PROCESO',observacionSeguimiento:'Reparación parcial',
        evidenciasSeguimientoStoragePaths:['services/current/photo.jpg'],
        historialSeguimientos:[{id:crypto.randomUUID(),servicioId:currentServiceId,solicitud:'SR-101',fecha:'2026-10-01T14:00:00Z',
          resultado:'EN_PROCESO',observacion:'Reparación parcial',evidenciasStoragePaths:['services/current/photo.jpg']}] },
      currentServiceId, editable:false,saving:false,
    } })
    await wrapper.get('.finding-card__summary').trigger('click')
    expect(wrapper.text()).toContain('Reparación parcial')
    expect(wrapper.text()).toContain('Ver fotos de esta visita (1)')
    expect(wrapper.find('.finding-history').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})
