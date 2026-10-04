import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

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

    const wrapper = mount(App, { global: { plugins: [router] } })

    expect(wrapper.get('[data-testid="route-content"]').text()).toBe('Soluciones Radicales MIP')
  })
})
