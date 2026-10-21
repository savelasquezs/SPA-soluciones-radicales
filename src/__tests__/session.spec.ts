import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest, getAuthSession, signInWithGoogle, signOut } = vi.hoisted(() => ({
  apiRequest: vi.fn<(path: string, init?: { method?: string; body?: string }) => Promise<unknown>>(),
  getAuthSession: vi.fn<() => Promise<{
    session: { id: string; token: string }
    user: { id: string; email: string }
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

const dualRoleProfile = (role: 'ADMINISTRADOR' | 'TECNICO' | null) => ({
  id: 'user-id',
  nombreCompleto: 'Usuario con dos roles',
  correoGoogle: 'solucionesradicales1@gmail.com',
  esAdmin: true,
  esTecnico: true,
  rolActivo: role,
  requiereSeleccionRol: role === null,
})

async function selectTechnician() {
  apiRequest.mockImplementation(async path => path === 'api/session/role'
    ? dualRoleProfile('TECNICO') : dualRoleProfile(null))
  const auth = useAuthStore()
  await auth.initialize()
  await auth.selectRole('TECNICO')
  return auth
}

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    signOut.mockResolvedValue(undefined)
    signInWithGoogle.mockResolvedValue(undefined)
    setActivePinia(createPinia())
    getAuthSession.mockResolvedValue({
      session: { id: 'better-auth-session-1', token: 'header.payload.signature' },
      user: { id: 'google-user-1', email: 'solucionesradicales1@gmail.com' },
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

  it('no recuerda un rol único: el backend lo activa automáticamente al renovar JWT', async () => {
    const auth = useAuthStore()
    await auth.initialize()
    expect(auth.activeRole).toBe('ADMINISTRADOR')
    expect(auth.rolesAvailable).toEqual(['ADMINISTRADOR'])
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
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

  it('restaura el rol elegido tras recargar y renovar el JWT, sin mostrar el selector', async () => {
    await selectTechnician()
    expect(JSON.parse(sessionStorage.getItem('sr-active-role-session') ?? 'null')).toEqual({
      authUserId: 'google-user-1', sessionId: 'better-auth-session-1', role: 'TECNICO',
    })

    // Same authenticated Better Auth session, but a different access JWT.
    getAuthSession.mockResolvedValue({
      session: { id: 'better-auth-session-1', token: 'new.jwt.signature' },
      user: { id: 'google-user-1', email: 'solucionesradicales1@gmail.com' },
    })
    setActivePinia(createPinia()) // A new store instance simulates a page reload.
    apiRequest.mockClear()
    const restored = useAuthStore()
    await restored.initialize()

    expect(restored.profile?.rolActivo).toBe('TECNICO')
    expect(restored.profile?.requiereSeleccionRol).toBe(false)
    expect(apiRequest).toHaveBeenCalledWith('api/session/role', {
      method: 'POST', body: JSON.stringify({ role: 'TECNICO' }),
    })
  })

  it('no reutiliza el rol en otra sesión ni en otra cuenta de Google', async () => {
    await selectTechnician()
    getAuthSession.mockResolvedValue({
      session: { id: 'new-session-2', token: 'new.jwt.signature' },
      user: { id: 'google-user-2', email: 'otra@gmail.com' },
    })
    setActivePinia(createPinia())
    apiRequest.mockClear()
    const restored = useAuthStore()
    await restored.initialize()

    expect(restored.profile?.requiereSeleccionRol).toBe(true)
    expect(apiRequest).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
  })

  it('rechaza el rol recordado si ya no está asignado al usuario', async () => {
    await selectTechnician()
    apiRequest.mockClear()
    setActivePinia(createPinia())
    apiRequest.mockImplementation(async path => path === 'api/session'
      ? { ...dualRoleProfile(null), esTecnico: false }
      : dualRoleProfile('TECNICO'))
    const restored = useAuthStore()
    await restored.initialize()

    expect(restored.profile?.requiereSeleccionRol).toBe(true)
    expect(apiRequest).not.toHaveBeenCalledWith('api/session/role', expect.anything())
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
  })

  it('descarta el rol recordado si el servidor rechaza su restauración', async () => {
    await selectTechnician()
    setActivePinia(createPinia())
    apiRequest.mockImplementation(async path => {
      if (path === 'api/session/role') throw new Error('Rol no autorizado')
      return dualRoleProfile(null)
    })
    const restored = useAuthStore()
    await restored.initialize()

    expect(restored.status).toBe('authenticated')
    expect(restored.profile?.requiereSeleccionRol).toBe(true)
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
  })

  it('borra el rol recordado al cerrar la sesión', async () => {
    const auth = await selectTechnician()
    await auth.logout()
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
    expect(auth.status).toBe('unauthenticated')
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
