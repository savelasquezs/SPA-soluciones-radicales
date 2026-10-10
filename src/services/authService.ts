import { createAuthClient } from '@neondatabase/auth'
import { ApiClientError, withRequestDeadline } from './requestControl'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL
if (!authUrl) throw new Error('VITE_NEON_AUTH_URL is required')
export const authClient = createAuthClient(authUrl)

type SessionOptions = { signal?: AbortSignal; forceRefresh?: boolean }

export async function getAuthSession(options: SessionOptions = {}) {
  const { data, error } = await withRequestDeadline(signal => authClient.getSession({
    ...(options.forceRefresh ? { query: { disableCookieCache: true } } : {}),
    // The Neon SDK has an in-memory cache in addition to Better Auth cookies.
    // This SDK-only header is stripped before the actual HTTP request.
    fetchOptions: { signal, ...(options.forceRefresh ? { headers: { 'X-Force-Fetch': 'true' } } : {}) },
  }), 12_000, options.signal)
  if (error) throw new ApiClientError(error.message ?? 'No fue posible consultar la sesión.', error.status ?? 0, 'AUTH_ERROR')
  if (data?.session.token) {
    const url = new URL(window.location.href)
    if (url.searchParams.has('neon_auth_session_verifier')) {
      url.searchParams.delete('neon_auth_session_verifier')
      window.history.replaceState(window.history.state, '', url)
    }
  }
  return data
}

// Expiry is only a refresh hint. Authorization remains on the server/JWKS.
function tokenExpiresSoon(token: string): boolean {
  try {
    const part = token.split('.')[1]
    if (!part) return false
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { exp?: unknown }
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() + 30_000
  } catch { return false }
}

export async function getAccessToken(options: SessionOptions = {}): Promise<string> {
  let session = await getAuthSession(options)
  if (!options.forceRefresh && session?.session.token && tokenExpiresSoon(session.session.token)) {
    session = await getAuthSession({ ...options, forceRefresh: true })
  }
  const token = session?.session.token
  if (!token) throw new ApiClientError('No fue posible obtener un token de sesión. Inicia sesión nuevamente.', 401, 'AUTH_REQUIRED')
  if (tokenExpiresSoon(token)) throw new ApiClientError('La sesión venció. Inicia sesión nuevamente.', 401, 'AUTH_EXPIRED')
  return token
}

export async function signInWithGoogle(
  selectAccount = false,
  callbackURL = window.location.origin,
): Promise<void> {
  const callback = new URL(callbackURL, window.location.origin)
  if (callback.origin !== window.location.origin) {
    throw new Error('La ruta de regreso no pertenece a esta aplicación')
  }

  const { data, error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: callback.toString(),
    disableRedirect: true,
  })
  if (error) {
    throw new Error(error.message)
  }
  if (!data?.url) {
    throw new Error('Neon Auth no devolvió la URL de acceso de Google')
  }

  const authorizationUrl = new URL(data.url)
  if (selectAccount) authorizationUrl.searchParams.set('prompt', 'select_account')
  window.location.assign(authorizationUrl)
}

export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut()
  if (error) {
    throw new Error(error.message)
  }
}
