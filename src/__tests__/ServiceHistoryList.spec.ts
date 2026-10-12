import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import ServiceHistoryList from '@/components/domain/clients/ServiceHistoryList.vue'

describe('ServiceHistoryList responsive', () => {
  it('preserves all history data in desktop table and mobile cards', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/servicios/:id', component: { template: '<div />' } }],
    })
    await router.push('/servicios/srv-1')
    await router.isReady()
    const wrapper = mount(ServiceHistoryList, {
      props: {
        items: [{ id: 'srv-1', solicitud: 'SR-00000021', fecha: '2026-10-30T12:00:00', tipo: 'REFUERZO', tecnico: 'Técnico Uno', estado: 'PROGRAMADO', valor: 105000 }],
      },
      global: { plugins: [router] },
    })

    expect(wrapper.findAll('.history-table tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('.history-mobile-card')).toHaveLength(1)
    expect(wrapper.find('.history-mobile-card .service-link').attributes('href')).toBe('/servicios/srv-1')
    expect(wrapper.text()).toContain('SR-00000021')
    expect(wrapper.text()).toContain('Técnico Uno')
    expect(wrapper.text()).toContain('REFUERZO')
    expect(wrapper.text()).toContain('PROGRAMADO')
    expect(wrapper.text()).toContain('105.000')
    wrapper.unmount()
  })
})
