import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StatusBadge from '@/components/base/StatusBadge.vue'
import ToastHost from '@/components/base/ToastHost.vue'
import { useNotificationsStore } from '@/stores/notifications'

describe('componentes de feedback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('muestra y descarta los cuatro tonos de toast', async () => {
    const wrapper = mount(ToastHost)
    const notifications = useNotificationsStore()

    notifications.show('Guardado', 'success')
    notifications.show('Falló', 'error')
    notifications.show('Revisa', 'warning')
    notifications.show('Información', 'info')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[role="status"]')).toHaveLength(4)
    expect(wrapper.find('.toast--success').text()).toContain('Guardado')
    expect(wrapper.find('.toast--error').text()).toContain('Falló')
    expect(wrapper.find('.toast--warning').text()).toContain('Revisa')
    expect(wrapper.find('.toast--info').text()).toContain('Información')

    await wrapper.find('.toast--success button').trigger('click')
    expect(notifications.items).toHaveLength(3)
    vi.runAllTimers()
    expect(notifications.items).toHaveLength(0)
    vi.useRealTimers()
  })

  it('renderiza el badge con tono e icono accesibles', () => {
    const wrapper = mount(StatusBadge, { props: { tone: 'success', icon: 'check' }, slots: { default: 'Activo' } })
    expect(wrapper.classes()).toContain('status-badge--success')
    expect(wrapper.text()).toBe('Activo')
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  })
})
