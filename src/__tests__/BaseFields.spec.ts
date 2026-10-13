import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'

describe('base form fields', () => {
  it('connects an input error with the required field', async () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: '',
        label: 'Correo',
        name: 'correo',
        required: true,
        error: 'Ingresa un correo válido',
      },
    })

    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('correo-error')
    expect(wrapper.text()).toContain('*')
    await wrapper.get('input').setValue('persona@example.com')
    expect(wrapper.emitted('update:modelValue')).toEqual([['persona@example.com']])
  })

  it('announces why a linked identity field is disabled', () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: 'persona@example.com',
        label: 'Correo Google',
        name: 'correoGoogle',
        disabled: true,
        hint: 'La identidad Google ya está vinculada.',
      },
    })

    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('correoGoogle-hint')
    expect(wrapper.get('#correoGoogle-hint').text()).toContain('identidad Google')
  })

  it('emits select and textarea values', async () => {
    const select = mount(BaseSelect, {
      props: { modelValue: '', label: 'Rol', name: 'rol' },
      slots: { default: '<option value="TECNICO">Técnico</option>' },
    })
    const textarea = mount(BaseTextarea, {
      props: { modelValue: '', label: 'Mensaje', name: 'mensaje' },
    })

    await select.get('select').setValue('TECNICO')
    await textarea.get('textarea').setValue('Contenido')

    expect(select.emitted('update:modelValue')).toEqual([['TECNICO']])
    expect(textarea.emitted('update:modelValue')).toEqual([['Contenido']])
  })

  it('announces loading skeletons without exposing decorative lines', () => {
    const wrapper = mount(LoadingSkeleton, { props: { label: 'Cargando usuarios', lines: 3 } })

    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toBe('Cargando usuarios')
    expect(wrapper.findAll('.skeleton__line')).toHaveLength(3)
  })
})
