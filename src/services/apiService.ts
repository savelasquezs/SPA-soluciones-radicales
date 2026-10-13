import { authorizedRequest, readJson, type ApiRequestInit } from './authorizedRequest'
import { ApiClientError } from './requestControl'

export { ApiClientError } from './requestControl'
export type { ApiRequestInit } from './authorizedRequest'

const functionUrl = import.meta.env.VITE_NEON_FUNCTION_URL

function apiUrl(path: string): URL {
  if (!functionUrl) throw new ApiClientError('VITE_NEON_FUNCTION_URL no está configurada', 500)
  return new URL(path.replace(/^\//, ''), functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`)
}

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  return authorizedRequest(apiUrl(path), init, readJson<T>)
}

/** Same authorization/error contract as JSON, with a bounded PDF body download. */
export async function apiBlobRequest(path: string, init: ApiRequestInit = {}): Promise<Blob> {
  return authorizedRequest(apiUrl(path), { timeoutMs: 90_000, ...init }, async response => {
    if (!response.headers.get('content-type')?.includes('application/pdf')) {
      throw new ApiClientError('El servidor no devolvió un PDF válido', 502, 'INVALID_RESPONSE')
    }
    return response.blob()
  })
}
