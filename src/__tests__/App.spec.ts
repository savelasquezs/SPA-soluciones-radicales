import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({ status: 'authenticated' }),
}))

import App from '../App.vue'

describe('App', () => {
  it('renders the active route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: { template: '<main data-testid="route-content">Soluciones Radicales MIP</main>' },
        },
      ],
    })

    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })

    expect(wrapper.get('[data-testid="route-content"]').text()).toBe('Soluciones Radicales MIP')
  })
})
