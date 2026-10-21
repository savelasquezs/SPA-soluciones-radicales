import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SessionRequest = { query?: { disableCookieCache: boolean }; fetchOptions: { signal: AbortSignal } }
type SessionResult = { data: { session: { token: string; id?: string }; user: { id: string } }; error: null }
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn<(options: SessionRequest) => Promise<SessionResult>>() }))
vi.mock('@neondatabase/auth', () => ({ createAuthClient: () => ({ getSession }) }))
import { getAccessToken, getAuthSession } from '@/services/authService'
import { RequestTimeoutError } from '@/services/requestControl'

const token = (expires: number) => `header.${btoa(JSON.stringify({ exp: expires }))}.signature`
const session = (value: string) => ({ data: { session: { token: value }, user: { id: 'user' } }, error: null })
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); sessionStorage.clear(); window.history.replaceState({}, '', '/') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('renovación de Neon Auth bajo demanda', () => {
  it.each([5, 10, 20])('renueva un JWT vencido tras %i minutos sin polling', async minutes => {
    const start = Date.now()
    const stale = token(start / 1000 + 60)
    await vi.advanceTimersByTimeAsync(minutes * 60_000)
    expect(getSession).not.toHaveBeenCalled()
    const fresh = token(Date.now() / 1000 + 900)
    getSession.mockResolvedValueOnce(session(stale)).mockResolvedValueOnce(session(fresh))
    await expect(getAccessToken()).resolves.toBe(fresh)
    expect(getSession).toHaveBeenNthCalledWith(2, expect.objectContaining({ query: { disableCookieCache: true }, fetchOptions: { signal: expect.any(AbortSignal), headers: { 'X-Force-Fetch': 'true' } } }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no fuerza renovaciones mientras el JWT sigue vigente', async () => {
    getSession.mockResolvedValue(session(token(Date.now() / 1000 + 900)))
    await getAccessToken()
    expect(getSession).toHaveBeenCalledOnce()
    expect(getSession.mock.calls[0]?.[0].query).toBeUndefined()
  })

  it('rechaza un token que el servidor no pudo renovar, sin bucle', async () => {
    getSession.mockResolvedValue(session(token(Date.now() / 1000 - 10)))
    await expect(getAccessToken()).rejects.toMatchObject({ status: 401, code: 'AUTH_EXPIRED' })
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('el timeout libera el acceso para un siguiente intento', async () => {
    getSession.mockReturnValueOnce(new Promise(() => undefined))
    const outcome = getAuthSession().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(12_001)
    expect(await outcome).toBeInstanceOf(RequestTimeoutError)
    expect(getSession.mock.calls[0]?.[0].fetchOptions.signal.aborted).toBe(true)
    getSession.mockResolvedValueOnce(session('recovered-token'))
    await expect(getAccessToken()).resolves.toBe('recovered-token')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no elimina el verificador OAuth si la sesión tarda demasiado', async () => {
    window.history.replaceState({}, '', '/usuarios?neon_auth_session_verifier=one-time')
    getSession.mockReturnValue(new Promise(() => undefined))
    const outcome = getAuthSession().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(12_001)
    expect(await outcome).toBeInstanceOf(RequestTimeoutError)
    expect(window.location.search).toContain('neon_auth_session_verifier')
  })

  it('restablece el rol de la misma sesión después de renovar el JWT, antes de consultar Servicios', async () => {
    const oldToken = `${token(Date.now() / 1000 + 900)}-first`
    const newToken = `${token(Date.now() / 1000 + 950)}-renewed`
    sessionStorage.setItem('sr-active-role-session', JSON.stringify({
      authUserId: 'user', sessionId: 'neon-session-1', role: 'ADMINISTRADOR',
    }))
    getSession.mockResolvedValueOnce({ data: { session: { id: 'neon-session-1', token: oldToken }, user: { id: 'user' } }, error: null })
      .mockResolvedValue({ data: { session: { id: 'neon-session-1', token: newToken }, user: { id: 'user' } }, error: null })
    // Every HTTP request needs its own Response; a body can only be read once.
    const fetchRole = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({
      rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchRole)

    await expect(getAccessToken()).resolves.toBe(oldToken)
    await expect(getAccessToken()).resolves.toBe(newToken)
    await expect(getAccessToken()).resolves.toBe(newToken)

    expect(fetchRole).toHaveBeenCalledTimes(2)
    expect(fetchRole.mock.calls[1]?.[0].toString()).toContain('/api/session/role')
    expect(fetchRole.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: 'POST', body: JSON.stringify({ role: 'ADMINISTRADOR' }),
      headers: expect.objectContaining({ Authorization: `Bearer ${newToken}` }),
    }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('comparte una sola reactivación entre peticiones simultáneas del mismo token', async () => {
    const jwt = `${token(Date.now() / 1000 + 901)}-parallel`
    sessionStorage.setItem('sr-active-role-session', JSON.stringify({
      authUserId: 'user', sessionId: 'neon-session-parallel', role: 'ADMINISTRADOR',
    }))
    getSession.mockResolvedValue({ data: { session: { id: 'neon-session-parallel', token: jwt }, user: { id: 'user' } }, error: null })
    const fetchRole = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchRole)

    expect(await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()])).toEqual([jwt, jwt, jwt])
    expect(fetchRole).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no restaura el rol de otra cuenta o sesión de Google', async () => {
    const jwt = `${token(Date.now() / 1000 + 902)}-other-session`
    sessionStorage.setItem('sr-active-role-session', JSON.stringify({
      authUserId: 'user', sessionId: 'old-neon-session', role: 'ADMINISTRADOR',
    }))
    getSession.mockResolvedValue({ data: { session: { id: 'other-neon-session', token: jwt }, user: { id: 'user' } }, error: null })
    const fetchRole = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchRole)

    await expect(getAccessToken()).resolves.toBe(jwt)
    expect(fetchRole).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
  })

  it('descarta el rol recordado revocado por el servidor, sin insistir ni conceder permisos', async () => {
    const jwt = `${token(Date.now() / 1000 + 903)}-revoked`
    sessionStorage.setItem('sr-active-role-session', JSON.stringify({
      authUserId: 'user', sessionId: 'neon-session-revoked', role: 'ADMINISTRADOR',
    }))
    getSession.mockResolvedValue({ data: { session: { id: 'neon-session-revoked', token: jwt }, user: { id: 'user' } }, error: null })
    const fetchRole = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Rol no autorizado' }), { status: 403 }))
    vi.stubGlobal('fetch', fetchRole)

    await expect(getAccessToken()).resolves.toBe(jwt)
    await expect(getAccessToken()).resolves.toBe(jwt)
    expect(fetchRole).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('sr-active-role-session')).toBeNull()
  })

  it('propaga la cancelación sin borrar una sesión o sus borradores', async () => {
    const controller = new AbortController()
    getSession.mockReturnValue(new Promise(() => undefined))
    const outcome = getAuthSession({ signal: controller.signal }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect(await outcome).toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
