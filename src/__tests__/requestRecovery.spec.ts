import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }))
vi.mock('@/services/authService', () => ({ getAccessToken }))

import { apiBlobRequest, apiRequest, ApiClientError } from '@/services/apiService'
import { dataApiSelect } from '@/services/dataApiService'
import { RequestTimeoutError, withRequestDeadline } from '@/services/requestControl'

const fetchMock = vi.fn()
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  getAccessToken.mockResolvedValue('fresh-token')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('solicitudes después de inactividad', () => {
  it.each([5, 10, 20])('continúa una lectura después de %i minutos y un 503', async minutes => {
    await vi.advanceTimersByTimeAsync(minutes * 60_000)
    fetchMock.mockResolvedValueOnce(json({ error: 'Arrancando' }, 503)).mockResolvedValueOnce(json({ ok: true }))
    const result = apiRequest('api/users')
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renueva la sesión una sola vez cuando una lectura devuelve 401', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Venció' }, 401)).mockResolvedValueOnce(json([]))
    const result = apiRequest('api/users')
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual([])
    expect(getAccessToken).toHaveBeenNthCalledWith(2, expect.objectContaining({ forceRefresh: true }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403, 422])('no entra en bucle con un error permanente %i', async status => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ error: 'Denegado' }, status)))
    const assertion = expect(apiRequest('api/users')).rejects.toMatchObject({ status })
    await vi.advanceTimersByTimeAsync(750)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(status === 401 ? 2 : 1)
  })

  it('no oculta un JSON inválido como resultado nulo', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Error</html>'))
    await expect(apiRequest('api/users')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('permite respuestas vacías 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiRequest('api/users/1', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('limita también un cuerpo de respuesta que nunca termina', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => undefined) })
    const assertion = expect(apiRequest('api/users', { timeoutMs: 20 })).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(800)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('libera una autenticación bloqueada sin despachar solicitudes tardías', async () => {
    let finishAuth: (token: string) => void = () => undefined
    getAccessToken.mockReturnValue(new Promise(resolve => { finishAuth = resolve }))
    const controller = new AbortController()
    const assertion = expect(apiRequest('api/users', { method: 'POST', body: '{}', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await assertion
    finishAuth('late-token')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancela durante la espera antes del reintento', async () => {
    const controller = new AbortController()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const assertion = expect(apiRequest('api/users', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    await assertion
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('no reenvía %s ante un corte de red', async method => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiRequest('api/users', { method, body: '{}' })).rejects.toMatchObject({ code: 'MUTATION_UNCONFIRMED' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('no reenvía un guardado que agotó el tiempo aunque fetch ignore abort', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined))
    const assertion = expect(apiRequest('api/users', { method: 'POST', timeoutMs: 20 })).rejects.toMatchObject({ code: 'MUTATION_UNCONFIRMED' })
    await vi.advanceTimersByTimeAsync(30)
    await assertion
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no repite una escritura rechazada por autenticación', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Venció' }, 401))
    await expect(apiRequest('api/users', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('aplica la misma recuperación a Data API y conserva su mensaje', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Arrancando' }, 503)).mockResolvedValueOnce(json([{ id: 1 }]))
    const result = dataApiSelect('usuarios', new URLSearchParams('select=id'))
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual([{ id: 1 }])
    const headers = fetchMock.mock.calls[1]?.[1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer fresh-token')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('limita la lectura binaria y mantiene la cancelación del consumidor', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValue({ ok: true, headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: () => new Promise(() => undefined) })
    const assertion = expect(apiBlobRequest('api/certificates/1', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await assertion
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('cancela y limpia una promesa que ignora AbortSignal', async () => {
    let signal: AbortSignal | undefined
    const assertion = expect(withRequestDeadline(current => { signal = current; return new Promise(() => undefined) }, 10)).rejects.toBeInstanceOf(ApiClientError)
    await vi.advanceTimersByTimeAsync(11)
    await assertion
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
