import { authorizedRequest, readJson, type ApiRequestInit } from './authorizedRequest'

const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL

export async function dataApiSelect<T>(
  resource: string,
  query: URLSearchParams,
  options: Pick<ApiRequestInit, 'signal' | 'timeoutMs'> = {},
): Promise<T> {
  if (!dataApiUrl) throw new Error('VITE_NEON_DATA_API_URL no está configurada')
  const url = new URL(`${resource}?${query.toString()}`, dataApiUrl.endsWith('/') ? dataApiUrl : `${dataApiUrl}/`)
  return authorizedRequest(url, { ...options, headers: { Accept: 'application/json' } }, readJson<T>)
}
