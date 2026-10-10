import { getAccessToken } from './authService'
import { ApiClientError, RequestTimeoutError, waitForRetry, withRequestDeadline } from './requestControl'

export type ApiRequestInit = RequestInit & { timeoutMs?: number }

export async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) return null as T
  try { return await response.json() as T }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new ApiClientError('El servidor no devolvió una respuesta válida.', 502, 'INVALID_RESPONSE')
  }
}

function retryableRead(error: unknown): boolean {
  return error instanceof RequestTimeoutError || error instanceof TypeError
    || (error instanceof ApiClientError && error.code !== 'INVALID_RESPONSE'
      && [401, 502, 503, 504].includes(error.status))
}

/** At most one automatic retry, and only for GET/HEAD. Never replay mutations. */
export async function authorizedRequest<T>(
  url: URL,
  init: ApiRequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { timeoutMs, ...request } = init
  const method = (request.method ?? 'GET').toUpperCase()
  const safeRead = method === 'GET' || method === 'HEAD'
  const timeout = timeoutMs ?? (safeRead ? 30_000 : 90_000)
  let forceRefresh = false
  for (let attempt = 0; ; attempt++) {
    let sent = false
    try {
      return await withRequestDeadline(async signal => {
        const token = await getAccessToken({ signal, forceRefresh })
        // Do not dispatch a stale mutation if auth finished after cancellation.
        signal.throwIfAborted()
        const headers = new Headers(request.headers)
        headers.set('Authorization', `Bearer ${token}`)
        if (request.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
        sent = true
        const response = await fetch(url, { ...request, method, headers, signal })
        signal.throwIfAborted()
        if (!response.ok) {
          const body = await response.json().catch(() => null) as {
            error?: string; message?: string; code?: string; details?: Record<string, unknown>
          } | null
          signal.throwIfAborted()
          throw new ApiClientError(body?.error ?? body?.message ?? `La solicitud falló (${response.status})`, response.status, body?.code, body?.details)
        }
        return read(response)
      }, timeout, request.signal)
    } catch (error) {
      request.signal?.throwIfAborted()
      if (safeRead && attempt === 0 && retryableRead(error)
        && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        forceRefresh = error instanceof ApiClientError && error.status === 401
        await waitForRetry(request.signal)
        continue
      }
      if (!safeRead && sent && (error instanceof RequestTimeoutError || error instanceof TypeError)) {
        throw new ApiClientError('No pudimos confirmar si se guardó la operación. Tus datos se conservan. Consulta el registro antes de repetirla.', 0, 'MUTATION_UNCONFIRMED')
      }
      throw error
    }
  }
}
