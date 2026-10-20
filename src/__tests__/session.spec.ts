import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest, getAuthSession, signInWithGoogle, signOut } = vi.hoisted(() => ({
  apiRequest: vi.fn<() => Promise<unknown>>(),
  getAuthSession: vi.fn<() => Promise<{
    session: { token: string }
    user: { email: string }
  }>>(),
  signInWithGoogle: vi.fn<(selectAccount?: boolean, callbackURL?: string) => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/services/authService', () => ({
  getAuthSession,
  signInWithGoogle,
  signOut,
}))

vi.mock('@/services/apiService', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message)
    }
  },
  apiRequest,
}))

import { ApiClientError } from '@/services/apiService'
import { useAuthStore } from '@/stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signOut.mockResolvedValue(undefined)
    signInWithGoogle.mockResolvedValue(undefined)
    setActivePinia(createPinia())
    getAuthSession.mockResolvedValue({
      session: { token: 'header.payload.signature' },
      user: { email: 'solucionesradicales1@gmail.com' },
    })
    apiRequest.mockResolvedValue({
      id: 'user-id',
      nombreCompleto: 'Administrador Soluciones Radicales',
      correoGoogle: 'solucionesradicales1@gmail.com',
      esAdmin: true,
      esTecnico: false,
      rolActivo: 'ADMINISTRADOR',
      requiereSeleccionRol: false,
    })
  })

  it('restores the remote session only once during normal navigation', async () => {
    const session = useAuthStore()

    await session.initialize()
    await session.initialize()

    expect(session.status).toBe('authenticated')
    expect(getAuthSession).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledOnce()
  })

  it('conserva el correo Google tras un 403 sin autenticar al usuario dentro de la SPA', async () => {
    apiRequest.mockRejectedValueOnce(new ApiClientError('La cuenta no está autorizada', 403))
    const auth = useAuthStore()

    await auth.initialize()

    expect(auth.status).toBe('denied')
    expect(auth.authEmail).toBe('solucionesradicales1@gmail.com')
    expect(auth.profile).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.activeRole).toBeNull()
    expect(auth.rolesAvailable).toEqual([])
    expect(auth.avatarUrl).toBeNull()

    await auth.logout()
    expect(auth.authEmail).toBeNull()
  })

  it('descarta la identidad cuando la validación falla por un error distinto de 403', async () => {
    apiRequest.mockRejectedValueOnce(new ApiClientError('No fue posible validar la sesión', 503))
    const auth = useAuthStore()

    await auth.initialize()

    expect(auth.status).toBe('error')
    expect(auth.authEmail).toBeNull()
    expect(auth.profile).toBeNull()
  })

  it('cierra la sesión anterior antes del primer OAuth de cambio de cuenta', async () => {
    const auth = useAuthStore()
    await auth.initialize()
    const destination = new URL('/cuenta/cambiar-google', window.location.origin).toString()
    const events: string[] = []
    signOut.mockImplementation(async () => { events.push('signed-out') })
    signInWithGoogle.mockImplementation(async (chooseAccount, callback) => {
      events.push('oauth-started')
      expect(auth.status).toBe('unauthenticated')
      expect(chooseAccount).toBe(true)
      expect(callback).toBe(destination)
    })

    await auth.useAnotherAccount(destination)

    expect(events).toEqual(['signed-out', 'oauth-started'])
    expect(signOut).toHaveBeenCalledOnce()
    expect(signInWithGoogle).toHaveBeenCalledOnce()
    expect(auth.profile).toBeNull()
  })

  it('no inicia Google OAuth si Neon Auth no pudo cerrar la cuenta original', async () => {
    const auth = useAuthStore()
    await auth.initialize()
    signOut.mockRejectedValueOnce(new Error('No fue posible cerrar la sesión'))

    await expect(auth.useAnotherAccount('/cuenta/cambiar-google')).rejects.toThrow(
      'No fue posible cerrar la sesión',
    )
    expect(auth.status).toBe('authenticated')
    expect(signInWithGoogle).not.toHaveBeenCalled()
  })
})
