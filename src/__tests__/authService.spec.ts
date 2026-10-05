import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSession, token } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{
    data: { session: { token: string }, user: { id: string } }
    error: null
  }>>(),
  token: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@neondatabase/auth', () => ({
  createAuthClient: () => ({ getSession, token }),
}))

import { getAccessToken } from '@/services/authService'

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the JWT injected into the active Neon Auth session', async () => {
    getSession.mockResolvedValue({
      data: {
        session: { token: 'header.payload.signature' },
        user: { id: 'auth-user' },
      },
      error: null,
    })

    await expect(getAccessToken()).resolves.toBe('header.payload.signature')
    expect(token).not.toHaveBeenCalled()
  })

  it('rejects a session without a JWT', async () => {
    getSession.mockResolvedValue({
      data: {
        session: { token: '' },
        user: { id: 'auth-user' },
      },
      error: null,
    })

    await expect(getAccessToken()).rejects.toThrow('No fue posible obtener un token de sesión')
  })
})
