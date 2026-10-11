import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAuthSession } = vi.hoisted(() => ({
  getAuthSession: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('./authService', () => ({ getAuthSession }))

import { sessionMatchesNewGoogleIdentity, waitForNewGoogleSession } from './googleSessionReady'

function jwt(id: string): string {
  const body = btoa(JSON.stringify({ sub: id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'header.' + body + '.signature'
}
function session(userId: string, sub = userId) {
  return { user: { id: userId }, session: { token: jwt(sub) } }
}

describe('retorno Google OAuth con sesión anterior en caché', () => {
  beforeEach(() => vi.resetAllMocks())

  it('nunca presenta al backend el mismo Google original como nuevo', () => {
    expect(sessionMatchesNewGoogleIdentity('old-google', jwt('old-google'), 'old-google')).toBe(false)
    expect(sessionMatchesNewGoogleIdentity('new-google', jwt('new-google'), 'old-google')).toBe(true)
    expect(sessionMatchesNewGoogleIdentity('new-google', jwt('old-google'), 'old-google')).toBe(false)
    expect(sessionMatchesNewGoogleIdentity(undefined, undefined, 'old-google')).toBe(false)
  })

  it('espera a que Neon Auth cambie del usuario anterior al nuevo', async () => {
    getAuthSession.mockResolvedValueOnce(session('old-google'))
      .mockResolvedValueOnce(session('new-google'))
    await expect(waitForNewGoogleSession('old-google')).resolves.toBeUndefined()
    expect(getAuthSession).toHaveBeenCalledTimes(2)
    expect(getAuthSession).toHaveBeenCalledWith({ forceRefresh: true })
  })

  it('no acepta un usuario nuevo con el JWT todavía perteneciente al anterior', async () => {
    getAuthSession.mockResolvedValueOnce(session('new-google', 'old-google'))
      .mockResolvedValueOnce(session('new-google', 'new-google'))
    await expect(waitForNewGoogleSession('old-google')).resolves.toBeUndefined()
    expect(getAuthSession).toHaveBeenCalledTimes(2)
  })

  it('una cuenta realmente igual no dispara confirmaciones inseguras', async () => {
    getAuthSession.mockResolvedValue(session('old-google'))
    await expect(waitForNewGoogleSession('old-google')).rejects.toThrow('La sesión de la nueva cuenta Google')
    expect(getAuthSession).toHaveBeenCalledTimes(5)
  })

  it('permite finalizar solicitudes anteriores que no almacenaron el ID original', async () => {
    getAuthSession.mockResolvedValue(session('new-google'))
    await expect(waitForNewGoogleSession(null)).resolves.toBeUndefined()
    expect(getAuthSession).toHaveBeenCalledOnce()
  })
})
