import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseButton from '@/components/base/BaseButton.vue'

describe('BaseButton', () => {
  it('prevents repeated actions while loading', async () => {
    const wrapper = mount(BaseButton, {
      props: { loading: true },
      slots: { default: 'Guardar' },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
