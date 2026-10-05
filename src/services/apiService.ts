import { getAccessToken } from './authService'

const functionUrl = import.meta.env.VITE_NEON_FUNCTION_URL

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!functionUrl) {
    throw new ApiClientError('VITE_NEON_FUNCTION_URL no está configurada', 500)
  }

  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(new URL(path.replace(/^\//, ''), ensureTrailingSlash(functionUrl)), {
    ...init,
    headers,
  })
  const body = (await response.json().catch(() => null)) as { error?: string } | T | null

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? body.error : null
    throw new ApiClientError(message ?? `La solicitud falló (${response.status})`, response.status)
  }

  return body as T
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}
