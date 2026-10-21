import { createAuthClient } from '@neondatabase/auth'
import { ApiClientError, withRequestDeadline } from './requestControl'
import { clearRememberedRole, readRememberedRole } from './sessionRole'

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

// A refreshed Neon JWT has new iat/exp claims, so the backend's
// per-token role record must be restored before any protected request.
// Better Auth's session.id stays stable for the actual browser session.
let roleActivatedToken: string | null = null
let roleActivation: { token: string; promise: Promise<void> } | null = null

async function activateRememberedRole(session: Awaited<ReturnType<typeof getAuthSession>>, token: string): Promise<void> {
  if (roleActivatedToken === token) return
  if (roleActivation?.token === token) return roleActivation.promise
  const role = readRememberedRole(session?.user?.id, session?.session?.id)
  if (!role) { roleActivatedToken = token; return }

  // Do not call apiRequest here: it calls getAccessToken, which would recurse.
  const pending = (async () => {
    const functionUrl = import.meta.env.VITE_NEON_FUNCTION_URL
    if (!functionUrl) throw new ApiClientError('VITE_NEON_FUNCTION_URL no está configurada', 500)
    const url = new URL('api/session/role', functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`)
    const { response, body } = await withRequestDeadline(async signal => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
        signal,
      })
      const body = await response.json().catch(() => null) as {
        error?: string; rolActivo?: unknown; requiereSeleccionRol?: boolean
      } | null
      return { response, body }
    }, 12_000)

    if (response.status === 403 || response.status === 422) {
      // The server is authoritative: a revoked or invalid role is never reused.
      clearRememberedRole()
      return
    }
    if (!response.ok) throw new ApiClientError(body?.error ?? 'No fue posible recuperar el rol activo.', response.status)
    if (body?.rolActivo !== role || body.requiereSeleccionRol) {
      throw new ApiClientError('El servidor no pudo restaurar el rol activo.', 502, 'INVALID_RESPONSE')
    }
  })()

  roleActivation = { token, promise: pending }
  try {
    await pending
    if (roleActivation?.promise === pending) roleActivatedToken = token
  } finally {
    if (roleActivation?.promise === pending) roleActivation = null
  }
}

export async function getAccessToken(options: SessionOptions = {}): Promise<string> {
  let session = await getAuthSession(options)
  if (!options.forceRefresh && session?.session.token && tokenExpiresSoon(session.session.token)) {
    session = await getAuthSession({ ...options, forceRefresh: true })
  }
  const token = session?.session.token
  if (!token) throw new ApiClientError('No fue posible obtener un token de sesión. Inicia sesión nuevamente.', 401, 'AUTH_REQUIRED')
  if (tokenExpiresSoon(token)) throw new ApiClientError('La sesión venció. Inicia sesión nuevamente.', 401, 'AUTH_EXPIRED')
  await activateRememberedRole(session, token)
  options.signal?.throwIfAborted()
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
    // First-time Google identities use a separate redirect in Better Auth.
    // Keep the transfer callback for BOTH existing and newly created identities.
    newUserCallbackURL: callback.toString(),
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
