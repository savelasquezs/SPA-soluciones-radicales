import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { login, logout, replace, session } = vi.hoisted(() => ({
  login: vi.fn<(selectAccount?: boolean) => Promise<void>>(),
  logout: vi.fn<() => Promise<void>>(),
  replace: vi.fn<(path: string) => Promise<void>>(),
  session: {
    error: 'No fue posible obtener un token de sesión',
    status: 'error',
    initialize: vi.fn<(force?: boolean) => Promise<void>>(),
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ ...session, login, logout }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
}))

import SessionErrorView from '@/views/SessionErrorView.vue'

describe('SessionErrorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears a partial session before requesting another Google account', async () => {
    const wrapper = mount(SessionErrorView)

    await wrapper.get('button:nth-of-type(2)').trigger('click')

    expect(logout).toHaveBeenCalledOnce()
    expect(login).toHaveBeenCalledWith(true)
  })
})
