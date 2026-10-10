import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { apiRequest, ApiClientError } from '@/services/apiService'
import { getAuthSession, signInWithGoogle, signOut as endAuthSession } from '@/services/authService'
import type { ActiveRole, PersonalProfile, SessionProfile } from '@/types/domain'

type AuthStatus = 'idle' | 'loading' | 'unauthenticated' | 'authenticated' | 'denied' | 'error'
type AuthSession = Awaited<ReturnType<typeof getAuthSession>>

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('idle')
  const session = ref<AuthSession>(null)
  const user = ref<SessionProfile | null>(null)
  const privateAvatarUrl = ref<string | null>(null)
  const error = ref<string | null>(null)
  let initialization: Promise<void> | null = null

  const profile = computed(() => user.value)
  const avatarUrl = computed(() => privateAvatarUrl.value ?? session.value?.user?.image ?? null)
  const authEmail = computed(() => session.value?.user?.email ?? null)
  const isAuthenticated = computed(() => status.value === 'authenticated')
  const activeRole = computed(() => user.value?.rolActivo ?? null)
  const rolesAvailable = computed<ActiveRole[]>(() => [
    user.value?.esAdmin ? 'ADMINISTRADOR' : null,
    user.value?.esTecnico ? 'TECNICO' : null,
  ].filter((role): role is ActiveRole => Boolean(role)))
  const isAdmin = computed(() => activeRole.value === 'ADMINISTRADOR')

  async function initialize(force = false): Promise<void> {
    if (initialization && !force) return initialization
    if (!force && status.value !== 'idle') return
    initialization = restore()
    try {
      await initialization
    } finally {
      initialization = null
    }
  }

  async function restore(): Promise<void> {
    status.value = 'loading'
    error.value = null
    try {
      session.value = await getAuthSession()
      if (!session.value?.user) {
        status.value = 'unauthenticated'
        user.value = null
        return
      }
      user.value = await apiRequest<SessionProfile>('api/session')
      status.value = 'authenticated'
      void refreshAvatar()
    } catch (restoreError) {
      session.value = null
      user.value = null
      privateAvatarUrl.value = null
      error.value = restoreError instanceof Error ? restoreError.message : 'No fue posible validar la sesión'
      status.value = restoreError instanceof ApiClientError && restoreError.status === 403 ? 'denied' : 'error'
    }
  }

  async function refreshAvatar(): Promise<void> {
    if (!isAuthenticated.value) return
    try {
      const response = await apiRequest<{ url: string | null }>('api/profile/avatar-url')
      privateAvatarUrl.value = response.url
    } catch {
      privateAvatarUrl.value = null
    }
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
    user.value = await apiRequest<SessionProfile>('api/session/role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
  }

  async function logout(): Promise<void> {
    await endAuthSession()
    session.value = null
    user.value = null
    privateAvatarUrl.value = null
    status.value = 'unauthenticated'
  }

  async function useAnotherAccount(): Promise<void> {
    await logout()
    await login(true)
  }

  return {
    status,
    session,
    user,
    profile,
    avatarUrl,
    refreshAvatar,
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
