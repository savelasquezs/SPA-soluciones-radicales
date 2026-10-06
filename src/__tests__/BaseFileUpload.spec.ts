import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'

describe('selector de archivos compartido', () => {
  it('mantiene el modo existente y permite una presentación compacta de documentos', () => {
    const wrapper = mount(BaseFileUpload, { props: { modelValue: null, name: 'sheet', label: 'Ficha técnica', size: 'compact', icon: 'file', buttonLabel: 'Adjuntar archivo' } })
    expect(wrapper.get('.file-upload').classes()).toContain('file-upload--compact')
    expect(wrapper.get('button').text()).toBe('Adjuntar archivo')
    expect(wrapper.get('label').attributes('for')).toBe('sheet')
    expect(wrapper.get('input[type=file]').attributes('accept')).toBe('.pdf,.jpg,.jpeg,.png')
    wrapper.unmount()
  })
  it('conserva nombre, limpieza, readonly y errores accesibles', async () => {
    const file = new File(['synthetic'], 'ficha.pdf', { type: 'application/pdf' })
    const wrapper = mount(BaseFileUpload, { props: { modelValue: file, name: 'sheet', label: 'Ficha técnica', error: 'Archivo rechazado' } })
    expect(wrapper.text()).toContain('ficha.pdf')
    expect(wrapper.get('input[type=file]').attributes('aria-invalid')).toBe('true')
    await wrapper.get('button[aria-label="Quitar archivo"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null])
    await wrapper.setProps({ readonly: true })
    expect(wrapper.find('button[aria-label="Quitar archivo"]').exists()).toBe(false)
    expect(wrapper.get('input[type=file]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
