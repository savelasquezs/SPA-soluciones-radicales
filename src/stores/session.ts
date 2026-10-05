import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { apiRequest, ApiClientError } from '@/services/apiService'
import { getAuthSession, signInWithGoogle, signOut as endAuthSession } from '@/services/authService'
import type { ActiveRole, SessionProfile } from '@/types/domain'

type SessionStatus = 'idle' | 'loading' | 'unauthenticated' | 'authenticated' | 'denied' | 'error'

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('idle')
  const profile = ref<SessionProfile | null>(null)
  const authEmail = ref<string | null>(null)
  const error = ref<string | null>(null)
  let initialization: Promise<void> | null = null

  const isAuthenticated = computed(() => status.value === 'authenticated')
  const isAdmin = computed(() => profile.value?.rolActivo === 'ADMINISTRADOR')

  async function initialize(force = false): Promise<void> {
    if (initialization && !force) {
      return initialization
    }
    if (!force && status.value !== 'idle') {
      return
    }

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
      const session = await getAuthSession()
      const user = session?.user

      if (!user) {
        status.value = 'unauthenticated'
        profile.value = null
        authEmail.value = null
        return
      }

      authEmail.value = user.email
      profile.value = await apiRequest<SessionProfile>('api/session')
      status.value = 'authenticated'
    } catch (restoreError) {
      profile.value = null
      error.value = restoreError instanceof Error ? restoreError.message : 'No fue posible validar la sesión'
      status.value = restoreError instanceof ApiClientError && restoreError.status === 403 ? 'denied' : 'error'
    }
  }

  async function login(selectAccount = false, callbackURL = window.location.origin): Promise<void> {
    error.value = null
    await signInWithGoogle(selectAccount, callbackURL)
  }

  async function selectRole(role: ActiveRole): Promise<void> {
    profile.value = await apiRequest<SessionProfile>('api/session/role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
  }

  async function logout(): Promise<void> {
    await endAuthSession()
    profile.value = null
    authEmail.value = null
    status.value = 'unauthenticated'
  }

  async function useAnotherAccount(): Promise<void> {
    await logout()
    await login(true)
  }

  return {
    status,
    profile,
    authEmail,
    error,
    isAuthenticated,
    isAdmin,
    initialize,
    login,
    selectRole,
    logout,
    useAnotherAccount,
  }
})
