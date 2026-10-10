import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@neondatabase/auth', () => ({ createAuthClient: () => ({ getSession }) }))
import { getAccessToken, getAuthSession } from '@/services/authService'
import { RequestTimeoutError } from '@/services/requestControl'

const token = (expires: number) => `header.${btoa(JSON.stringify({ exp: expires }))}.signature`
const session = (value: string) => ({ data: { session: { token: value }, user: { id: 'user' } }, error: null })
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); window.history.replaceState({}, '', '/') })
afterEach(() => { vi.useRealTimers() })

describe('renovación de Neon Auth bajo demanda', () => {
  it.each([5, 10, 20])('renueva un JWT vencido tras %i minutos sin polling', async minutes => {
    const start = Date.now()
    const stale = token(start / 1000 + 60)
    await vi.advanceTimersByTimeAsync(minutes * 60_000)
    expect(getSession).not.toHaveBeenCalled()
    const fresh = token(Date.now() / 1000 + 900)
    getSession.mockResolvedValueOnce(session(stale)).mockResolvedValueOnce(session(fresh))
    await expect(getAccessToken()).resolves.toBe(fresh)
    expect(getSession).toHaveBeenNthCalledWith(2, expect.objectContaining({ query: { disableCookieCache: true }, fetchOptions: { signal: expect.any(AbortSignal) } }))
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
    const assertion = expect(getAuthSession()).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(12_001)
    await assertion
    expect(getSession.mock.calls[0]?.[0].fetchOptions.signal.aborted).toBe(true)
    getSession.mockResolvedValueOnce(session('recovered-token'))
    await expect(getAccessToken()).resolves.toBe('recovered-token')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no elimina el verificador OAuth si la sesión tarda demasiado', async () => {
    window.history.replaceState({}, '', '/usuarios?neon_auth_session_verifier=one-time')
    getSession.mockReturnValue(new Promise(() => undefined))
    const assertion = expect(getAuthSession()).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(12_001)
    await assertion
    expect(window.location.search).toContain('neon_auth_session_verifier')
  })

  it('propaga la cancelación sin borrar una sesión o sus borradores', async () => {
    const controller = new AbortController()
    getSession.mockReturnValue(new Promise(() => undefined))
    const assertion = expect(getAuthSession({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
})
