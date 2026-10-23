import type { NavigationGuard, RouteLocationNormalized } from 'vue-router'

import { readPendingGoogleHandoff } from '@/helpers/googleHandoff'
import { useAuthStore } from '@/stores/auth'
import type { ActiveRole } from '@/types/domain'

type BreadcrumbMeta = string | Array<{ label: string; to?: string }>

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    publicReport?: boolean
    googleHandoff?: boolean
    roles?: ActiveRole[]
    breadcrumb?: BreadcrumbMeta
    placeholderTitle?: string
    placeholderDescription?: string
  }
}

export function hasRequiredRole(activeRole: ActiveRole | null, required: ActiveRole[] | undefined): boolean {
  return !required?.length || Boolean(activeRole && required.includes(activeRole))
}

export const authGuard: NavigationGuard = async (to) => {
  if (to.meta.publicReport || to.meta.googleHandoff) return true
  const auth = useAuthStore()
  await auth.initialize()

  if (auth.status === 'denied') {
    // A new Google account has no SPA record *until* the pending transfer finishes.
    // Recover when the provider returns to the default landing page instead of
    // our handoff callback. This does not grant access or change a user by itself.
    if (readPendingGoogleHandoff()) return namedUnlessCurrent(to, 'google-change-confirm')
    return namedUnlessCurrent(to, 'access-denied')
  }
  if (auth.status === 'error') return namedUnlessCurrent(to, 'session-error')
  if (auth.status === 'unauthenticated') return to.meta.public ? true : { name: 'login', query: { redirect: to.fullPath } }
  if (auth.status !== 'authenticated') return true
  if (Object.prototype.hasOwnProperty.call(to.query, 'neon_auth_session_verifier')) {
    const query = { ...to.query }
    delete query.neon_auth_session_verifier
    return { path: to.path, query, hash: to.hash, replace: true }
  }
  if (auth.profile?.requiereSeleccionRol && to.name !== 'role-selection') {
    return { name: 'role-selection', query: { redirect: to.fullPath } }
  }
  if (!auth.profile?.requiereSeleccionRol && to.name === 'role-selection') return { name: 'dashboard' }
  if (!hasRequiredRole(auth.activeRole, to.meta.roles)) return { name: 'dashboard', replace: true }
  if (['login', 'access-denied', 'session-error'].includes(String(to.name))) return { name: 'dashboard' }
  return true
}

function namedUnlessCurrent(to: RouteLocationNormalized, name: string): true | { name: string } {
  return to.name === name ? true : { name }
}
