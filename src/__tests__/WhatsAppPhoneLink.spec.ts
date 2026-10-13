import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WhatsAppPhoneLink from '@/components/base/WhatsAppPhoneLink.vue'

describe('WhatsAppPhoneLink', () => {
  it('muestra el celular formateado y abre WhatsApp con E.164', () => {
    const wrapper = mount(WhatsAppPhoneLink, { props: { phone: '+573001234567' } })
    const link = wrapper.get('a')

    expect(wrapper.text()).toBe('300 123 4567')
    expect(link.attributes('href')).toBe('https://wa.me/573001234567')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('aria-label')).toContain('WhatsApp')
  })
})
