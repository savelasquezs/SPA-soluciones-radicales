import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPendingGoogleHandoff, readPendingGoogleHandoff, savePendingGoogleHandoff,
} from './googleHandoff'

const validToken = 'A'.repeat(43)

describe('Estado temporal del cambio Google', () => {
  beforeEach(() => {
    vi.useRealTimers()
    clearPendingGoogleHandoff()
  })

  it('conserva el token válido durante la navegación OAuth sin colocarlo en la URL', () => {
    savePendingGoogleHandoff(validToken, 600)
    expect(readPendingGoogleHandoff()).toBe(validToken)
    const stored = JSON.parse(sessionStorage.getItem('sr:google-profile-handoff') ?? '{}')
    expect(stored).toMatchObject({ token: validToken })
    clearPendingGoogleHandoff()
    expect(readPendingGoogleHandoff()).toBeNull()
  })

  it('rechaza estados vencidos antes de reanudar una cuenta sin acceso', () => {
    vi.useFakeTimers()
    const now = Date.now()
    savePendingGoogleHandoff(validToken, 600)
    vi.setSystemTime(now + 601_000)
    expect(readPendingGoogleHandoff()).toBeNull()
    expect(sessionStorage.getItem('sr:google-profile-handoff')).toBeNull()
    vi.useRealTimers()
  })

  it('no acepta tokens inválidos ni alarga su vencimiento más de diez minutos', () => {
    expect(() => savePendingGoogleHandoff('incorrecto', 600)).toThrow()
    savePendingGoogleHandoff(validToken, 60_000)
    const state = JSON.parse(sessionStorage.getItem('sr:google-profile-handoff') ?? '{}')
    expect(state.expiresAt - Date.now()).toBeLessThanOrEqual(600_000)
    sessionStorage.setItem('sr:google-profile-handoff', '{"token":"falso","expiresAt":9999999999999}')
    expect(readPendingGoogleHandoff()).toBeNull()
  })
})
