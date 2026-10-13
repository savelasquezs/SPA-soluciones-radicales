import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue'

const options = [
  { id: 'form-1', label: 'FO-PS-02 · v03' },
  { id: 'form-2', label: 'FO-PS-10 · v01' },
]

describe('BaseMultiSelect', () => {
  it('abre, selecciona, deselecciona y resume la selección', async () => {
    const wrapper = mount(BaseMultiSelect, { props: { modelValue: [], options, label: 'Formularios', name: 'forms', 'onUpdate:modelValue': (value: string[]) => wrapper.setProps({ modelValue: value }) } })
    await wrapper.get('.multi-select__trigger').trigger('click')
    await wrapper.findAll('[role="option"]')[0]!.trigger('click')
    expect(wrapper.props('modelValue')).toEqual(['form-1'])
    expect(wrapper.text()).toContain('1 formulario seleccionado')
    await wrapper.findAll('[role="option"]')[0]!.trigger('click')
    expect(wrapper.props('modelValue')).toEqual([])
  })

  it('soporta teclado, Escape, disabled y error', async () => {
    const wrapper = mount(BaseMultiSelect, { attachTo: document.body, props: { modelValue: [], options, label: 'Formularios', name: 'forms', error: 'Selecciona uno' } })
    await wrapper.get('.multi-select__trigger').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    await wrapper.get('[role="listbox"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Selecciona uno')
    await wrapper.setProps({ disabled: true })
    expect(wrapper.get<HTMLButtonElement>('.multi-select__trigger').element.disabled).toBe(true)
    wrapper.unmount()
  })
})
