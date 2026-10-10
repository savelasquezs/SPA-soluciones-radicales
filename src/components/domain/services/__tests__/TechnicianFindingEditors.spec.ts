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

  it('allows following up a prior finding and requires evidence to close it', async () => {
    const wrapper = mount(TechnicianFindingCard, { props: {
      finding, currentServiceId: '10000000-0000-4000-8000-000000000003', mutation: null, editable: true, saving: false,
    } })
    await wrapper.get('.finding-card__summary').trigger('click')
    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text() === 'Sigue igual')!.trigger('click')
    expect(wrapper.emitted('status')?.[0]?.[0]).toEqual({ estado: 'SIN_CAMBIOS', observacionCierre: '' })
    await buttons.find(button => button.text() === 'En proceso')!.trigger('click')
    expect(wrapper.emitted('status')?.[1]?.[0]).toEqual({ estado: 'EN_PROCESO', observacionCierre: '' })
    await buttons.find(button => button.text().includes('Cerrar Hallazgo'))!.trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Adjunta al menos una evidencia de cierre.')
    expect(wrapper.emitted('status')).toHaveLength(2)
  })
})
