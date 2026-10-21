import type { ActiveRole } from '@/types/domain'

const ROLE_STORAGE_KEY = 'sr-active-role-session'

export function clearRememberedRole(): void {
  try { sessionStorage.removeItem(ROLE_STORAGE_KEY) } catch { /* Storage can be disabled. */ }
}

export function rememberRoleForSession(authUserId: string | undefined, sessionId: string | undefined, role: ActiveRole): void {
  if (!authUserId || !sessionId) return
  try { sessionStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify({ authUserId, sessionId, role })) }
  catch { /* Role selection still works without browser storage. */ }
}

export function readRememberedRole(authUserId: string | undefined, sessionId: string | undefined): ActiveRole | null {
  try {
    const raw = sessionStorage.getItem(ROLE_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { authUserId?: unknown; sessionId?: unknown; role?: unknown } | null
    if (authUserId && sessionId && saved?.authUserId === authUserId && saved.sessionId === sessionId
      && (saved.role === 'ADMINISTRADOR' || saved.role === 'TECNICO')) return saved.role
  } catch { /* Ignore invalid or unavailable browser storage. */ }
  clearRememberedRole()
  return null
}
