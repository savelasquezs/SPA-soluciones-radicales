import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest, getAuthSession } = vi.hoisted(() => ({
  apiRequest: vi.fn<() => Promise<unknown>>(),
  getAuthSession: vi.fn<() => Promise<{
    session: { token: string }
    user: { email: string }
  }>>(),
}))

vi.mock('@/services/authService', () => ({
  getAuthSession,
  signInWithGoogle: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
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

import { useSessionStore } from '@/stores/session'

describe('session store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const session = useSessionStore()

    await session.initialize()
    await session.initialize()

    expect(session.status).toBe('authenticated')
    expect(getAuthSession).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledOnce()
  })
})
