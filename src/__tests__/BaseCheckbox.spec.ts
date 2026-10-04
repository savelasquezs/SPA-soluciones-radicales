import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseCheckbox from '@/components/base/BaseCheckbox.vue'

describe('BaseCheckbox', () => {
  it('emits the changed checked state with its accessible label', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: { modelValue: false, label: 'Usuario activo', name: 'activo' },
    })

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(wrapper.get('label').text()).toContain('Usuario activo')
  })
})
