import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { apiRequest, ApiClientError } from '@/services/apiService'
import { getAuthSession, signInWithGoogle, signOut as endAuthSession } from '@/services/authService'
import type { ActiveRole, PersonalProfile, SessionProfile } from '@/types/domain'

type AuthStatus = 'idle' | 'loading' | 'unauthenticated' | 'authenticated' | 'denied' | 'error'
type AuthSession = Awaited<ReturnType<typeof getAuthSession>>
const ROLE_STORAGE_KEY = 'sr-active-role-session'

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('idle')
  const session = ref<AuthSession>(null)
  const deniedEmail = ref<string | null>(null)
  const user = ref<SessionProfile | null>(null)
  const privateAvatarUrl = ref<string | null>(null)
  const error = ref<string | null>(null)
  let initialization: Promise<void> | null = null
  let avatarRefreshing: Promise<void> | null = null
  let lastAvatarRecoveryAt = 0

  const profile = computed(() => user.value)
  const avatarUrl = computed(() => privateAvatarUrl.value ?? session.value?.user?.image ?? null)
  const authEmail = computed(() => session.value?.user?.email ?? deniedEmail.value)
  const isAuthenticated = computed(() => status.value === 'authenticated')
  const activeRole = computed(() => user.value?.rolActivo ?? null)
  const rolesAvailable = computed<ActiveRole[]>(() => [
    user.value?.esAdmin ? 'ADMINISTRADOR' : null,
    user.value?.esTecnico ? 'TECNICO' : null,
  ].filter((role): role is ActiveRole => Boolean(role)))
  const isAdmin = computed(() => activeRole.value === 'ADMINISTRADOR')

  function clearRememberedRole(): void {
    try { sessionStorage.removeItem(ROLE_STORAGE_KEY) } catch { /* Storage can be disabled. */ }
  }

  function rememberRole(role: ActiveRole): void {
    const authUserId = session.value?.user?.id
    const sessionId = session.value?.session?.id
    if (!authUserId || !sessionId) return
    try {
      sessionStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify({ authUserId, sessionId, role }))
    } catch { /* Role selection still works without browser storage. */ }
  }

  function rememberedRole(): ActiveRole | null {
    const authUserId = session.value?.user?.id
    const sessionId = session.value?.session?.id
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


  async function initialize(force = false): Promise<void> {
    if (initialization && !force) return initialization
    if (!force && status.value !== 'idle') return
    initialization = restore(force)
    try {
      await initialization
    } finally {
      initialization = null
    }
  }

  async function restore(forceSession = false): Promise<void> {
    status.value = 'loading'
    error.value = null
    deniedEmail.value = null
    let currentSession: AuthSession = null
    try {
      currentSession = await getAuthSession({ forceRefresh: forceSession })
      session.value = currentSession
      if (!session.value?.user) {
        clearRememberedRole()
        status.value = 'unauthenticated'
        user.value = null
        privateAvatarUrl.value = null
        return
      }
      user.value = await apiRequest<SessionProfile>('api/session')
      privateAvatarUrl.value = user.value.avatarUrl ?? null
      if (user.value.requiereSeleccionRol) {
        const savedRole = rememberedRole()
        if (savedRole && rolesAvailable.value.includes(savedRole)) {
          try { await selectRole(savedRole) }
          catch { clearRememberedRole() } // Let the user choose again if the server rejects it.
        } else if (savedRole) clearRememberedRole()
      } else if (user.value.rolActivo && rolesAvailable.value.includes(user.value.rolActivo)) {
        rememberRole(user.value.rolActivo)
      }
      status.value = 'authenticated'
    } catch (restoreError) {
      const denied = restoreError instanceof ApiClientError && restoreError.status === 403
      // Conservar únicamente el correo de la identidad Google actual, nunca su token.
      deniedEmail.value = denied ? currentSession?.user?.email ?? null : null
      session.value = null
      user.value = null
      privateAvatarUrl.value = null
      error.value = restoreError instanceof Error ? restoreError.message : 'No fue posible validar la sesión'
      if (denied) clearRememberedRole()
      status.value = denied ? 'denied' : 'error'
    }
  }

  async function refreshAvatar(): Promise<void> {
    if (avatarRefreshing) return avatarRefreshing
    if (!isAuthenticated.value || !user.value) return
    const currentUserId = user.value.id
    avatarRefreshing = (async () => {
      try {
        const response = await apiRequest<{ url: string | null }>('api/profile/avatar-url')
        if (user.value?.id === currentUserId && isAuthenticated.value) privateAvatarUrl.value = response.url
      } catch {
        // Keep the Google fallback when R2 or the profile endpoint is unavailable.
        if (user.value?.id === currentUserId) privateAvatarUrl.value = null
      }
    })()
    try { await avatarRefreshing }
    finally { avatarRefreshing = null }
  }

  async function recoverExpiredAvatar(): Promise<void> {
    if (!privateAvatarUrl.value || Date.now() - lastAvatarRecoveryAt < 90_000) return
    lastAvatarRecoveryAt = Date.now()
    await refreshAvatar()
  }

  function applyPersonalProfile(record: PersonalProfile): void {
    if (user.value?.id !== record.id) return
    user.value = { ...user.value, nombreCompleto: record.nombreCompleto, correoGoogle: record.correoGoogle }
  }

  async function login(selectAccount = false, callbackURL = window.location.origin): Promise<void> {
    error.value = null
    await signInWithGoogle(selectAccount, callbackURL)
  }

  async function selectRole(role: ActiveRole): Promise<void> {
    if (!rolesAvailable.value.includes(role)) throw new Error('El rol seleccionado no está disponible')
    const selected = await apiRequest<SessionProfile>('api/session/role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
    if (selected.rolActivo !== role || selected.requiereSeleccionRol) {
      throw new Error('El servidor no pudo activar el rol seleccionado')
    }
    user.value = selected
    rememberRole(role)
  }

  async function logout(): Promise<void> {
    await endAuthSession()
    clearRememberedRole()
    deniedEmail.value = null
    session.value = null
    user.value = null
    privateAvatarUrl.value = null
    status.value = 'unauthenticated'
  }

  async function useAnotherAccount(callbackURL = window.location.origin): Promise<void> {
    // Better Auth keeps the current session during signIn.social, which can
    // return the old Google identity on the first attempt. Invalidate that
    // session before starting OAuth, while the short-lived handoff remains in
    // sessionStorage (owned by the profile flow).
    await logout()
    await login(true, callbackURL)
  }

  return {
    status,
    session,
    user,
    profile,
    avatarUrl,
    refreshAvatar,
    recoverExpiredAvatar,
    applyPersonalProfile,
    authEmail,
    error,
    isAuthenticated,
    activeRole,
    rolesAvailable,
    isAdmin,
    initialize,
    login,
    selectRole,
    logout,
    useAnotherAccount,
  }
})
