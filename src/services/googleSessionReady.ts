import { getAuthSession } from './authService'

/**
 * Neon Auth may briefly return the previous Google session immediately after
 * the OAuth redirect. Never submit a handoff under the old JWT.
 */
const MAX_SESSION_CHECKS = 5

function jwtSubject(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const body = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const data = JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '='))) as { sub?: unknown }
    return typeof data.sub === 'string' && data.sub ? data.sub : null
  } catch {
    return null
  }
}

export function sessionMatchesNewGoogleIdentity(
  userId: string | undefined,
  token: string | undefined,
  originalAuthUserId: string | null,
): boolean {
  if (!userId || !token || (originalAuthUserId && userId === originalAuthUserId)) return false
  const sub = jwtSubject(token)
  // The backend checks JWT signatures. This extra consistency check prevents a
  // session/user mismatch during the OAuth cookie transition. Opaque mock
  // tokens remain supported in browser tests.
  return sub === null || (sub === userId && (!originalAuthUserId || sub !== originalAuthUserId))
}

export async function waitForNewGoogleSession(originalAuthUserId: string | null): Promise<void> {
  for (let attempt = 0; attempt < MAX_SESSION_CHECKS; attempt++) {
    const session = await getAuthSession({ forceRefresh: true })
    if (sessionMatchesNewGoogleIdentity(session?.user?.id, session?.session?.token, originalAuthUserId)) return
    if (attempt + 1 < MAX_SESSION_CHECKS) {
      // A few bounded checks immediately after OAuth, never background polling.
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }
  throw new Error('La sesión de la nueva cuenta Google todavía no está disponible. Elige otra cuenta o vuelve a verificar.')
}
