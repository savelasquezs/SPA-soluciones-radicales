import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import ServiceRecords from '@/components/domain/services/ServiceRecords.vue'

describe('ServiceRecords: historial contextual', () => {
  it('reutiliza la tabla de Servicios con datos resumidos, enlace, estado y valor', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/servicios/:id', name: 'service-detail', component: { template: '<div />' } }],
    })
    await router.push('/servicios/srv-1')
    await router.isReady()

    const wrapper = mount(ServiceRecords, {
      props: {
        summaryRecords: [{ id: 'srv-1', solicitud: 'SR-00000021', fecha: '2026-10-30T12:00:00Z', tipo: 'REFUERZO', tecnico: 'Técnico Uno', estado: 'PROGRAMADO', valor: 105000 }],
      },
      global: { plugins: [router] },
    })

    expect(wrapper.findAll('.svc-table tbody tr')).toHaveLength(1)
    expect(wrapper.find('.svc-table-region--summary').attributes('aria-label')).toBe('Historial de servicios')
    expect(wrapper.findAll('.svc-table th').map(item => item.text())).not.toContain('Contacto')
    expect(wrapper.find('.svc-record-name a').attributes('href')).toBe('/servicios/srv-1')
    expect(wrapper.find('.svc-record-actions a').attributes('href')).toBe('/servicios/srv-1')
    expect(wrapper.text()).toContain('SR-00000021')
    expect(wrapper.text()).toContain('Técnico Uno')
    expect(wrapper.text()).toContain('Refuerzo')
    expect(wrapper.text()).toContain('Programado')
    expect(wrapper.text()).toContain('105.000')
    wrapper.unmount()
  })
})
