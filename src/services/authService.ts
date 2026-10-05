import { createAuthClient } from '@neondatabase/auth'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

if (!authUrl) {
  throw new Error('VITE_NEON_AUTH_URL is required')
}

export const authClient = createAuthClient(authUrl)

export async function getAuthSession() {
  const { data, error } = await authClient.getSession()
  if (error) {
    throw new Error(error.message)
  }
  if (data?.session.token) {
    const url = new URL(window.location.href)
    if (url.searchParams.has('neon_auth_session_verifier')) {
      url.searchParams.delete('neon_auth_session_verifier')
      window.history.replaceState(window.history.state, '', url)
    }
  }
  return data
}

export async function getAccessToken(): Promise<string> {
  const session = await getAuthSession()
  const token = session?.session.token
  if (!token) {
    throw new Error('No fue posible obtener un token de sesión')
  }
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
