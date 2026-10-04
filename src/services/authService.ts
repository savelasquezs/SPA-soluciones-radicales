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

export async function signInWithGoogle(): Promise<void> {
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: window.location.origin,
  })
  if (error) {
    throw new Error(error.message)
  }
}

export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut()
  if (error) {
    throw new Error(error.message)
  }
}
