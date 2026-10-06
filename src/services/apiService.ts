import { getAccessToken } from './authService'

const functionUrl = import.meta.env.VITE_NEON_FUNCTION_URL

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) { super(message) }
}

async function authorizedResponse(path: string, init: RequestInit): Promise<Response> {
  if (!functionUrl) throw new ApiClientError('VITE_NEON_FUNCTION_URL no está configurada', 500)
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(new URL(path.replace(/^\//, ''), functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`), { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; code?: string; details?: Record<string, unknown> } | null
    throw new ApiClientError(body?.error ?? `La solicitud falló (${response.status})`, response.status, body?.code, body?.details)
  }
  return response
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedResponse(path, init)
  return await response.json().catch(() => null) as T
}

/** Same authorization/error contract as JSON, without buffering a binary document as JSON. */
export async function apiBlobRequest(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await authorizedResponse(path, init)
  if (!response.headers.get('content-type')?.includes('application/pdf')) {
    throw new ApiClientError('El servidor no devolvió un PDF válido', 502)
  }
  return response.blob()
}
