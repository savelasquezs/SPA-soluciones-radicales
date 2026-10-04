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
  return data
}

export async function getAccessToken(): Promise<string> {
  const { data, error } = await authClient.token()
  if (error || !data?.token) {
    throw new Error(error?.message ?? 'No fue posible obtener un token de sesión')
  }
  return data.token
}

export async function signInWithGoogle(selectAccount = false): Promise<void> {
  const { data, error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: window.location.origin,
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
