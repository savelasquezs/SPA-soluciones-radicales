import { getAccessToken } from './authService'

const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL

export async function dataApiSelect<T>(resource: string, query: URLSearchParams): Promise<T> {
  if (!dataApiUrl) {
    throw new Error('VITE_NEON_DATA_API_URL no está configurada')
  }

  const token = await getAccessToken()
  const url = new URL(`${resource}?${query.toString()}`, ensureTrailingSlash(dataApiUrl))
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const body = (await response.json().catch(() => null)) as { message?: string } | T | null

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : null
    throw new Error(message ?? `Data API respondió ${response.status}`)
  }

  return body as T
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}
