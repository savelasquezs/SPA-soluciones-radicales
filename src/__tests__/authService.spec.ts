import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSession, signIn, token } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{
    data: { session: { token: string }, user: { id: string } }
    error: null
  }>>(),
  signIn: vi.fn<() => Promise<never>>(),
  token: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@neondatabase/auth', () => ({
  createAuthClient: () => ({ getSession, signIn: { social: signIn }, token }),
}))

import { getAccessToken, signInWithGoogle } from '@/services/authService'

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
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

  it('removes the one-time OAuth verifier after restoring the session', async () => {
    window.history.replaceState({}, '', '/usuarios?neon_auth_session_verifier=one-time&filter=active')
    getSession.mockResolvedValue({
      data: {
        session: { token: 'header.payload.signature' },
        user: { id: 'auth-user' },
      },
      error: null,
    })

    await getAccessToken()

    expect(window.location.pathname).toBe('/usuarios')
    expect(window.location.search).toBe('?filter=active')
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

  it('preserves a protected same-origin destination through Google OAuth', async () => {
    signIn.mockRejectedValue(new Error('stop before navigation'))

    await expect(signInWithGoogle(false, '/usuarios')).rejects.toThrow('stop before navigation')
    expect(signIn).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: new URL('/usuarios', window.location.origin).toString(),
      disableRedirect: true,
    })
  })

  it('rejects an external OAuth return URL', async () => {
    await expect(signInWithGoogle(false, 'https://example.com/usuarios')).rejects.toThrow(
      'La ruta de regreso no pertenece a esta aplicación',
    )
    expect(signIn).not.toHaveBeenCalled()
  })
})
