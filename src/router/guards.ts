import type { NavigationGuard, RouteLocationNormalized } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import type { ActiveRole } from '@/types/domain'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    roles?: ActiveRole[]
    breadcrumb?: string
    placeholderTitle?: string
    placeholderDescription?: string
  }
}

export function hasRequiredRole(activeRole: ActiveRole | null, required: ActiveRole[] | undefined): boolean {
  return !required?.length || Boolean(activeRole && required.includes(activeRole))
}

export const authGuard: NavigationGuard = async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (auth.status === 'denied') return namedUnlessCurrent(to, 'access-denied')
  if (auth.status === 'error') return namedUnlessCurrent(to, 'session-error')
  if (auth.status === 'unauthenticated') return to.meta.public ? true : { name: 'login', query: { redirect: to.fullPath } }
  if (auth.status !== 'authenticated') return true
  if (auth.profile?.requiereSeleccionRol && to.name !== 'role-selection') {
    return { name: 'role-selection', query: { redirect: to.fullPath } }
  }
  if (!auth.profile?.requiereSeleccionRol && to.name === 'role-selection') return { name: 'dashboard' }
  if (!hasRequiredRole(auth.activeRole, to.meta.roles)) return { name: 'forbidden' }
  if (['login', 'access-denied', 'session-error'].includes(String(to.name))) return { name: 'dashboard' }
  return true
}

function namedUnlessCurrent(to: RouteLocationNormalized, name: string): true | { name: string } {
  return to.name === name ? true : { name }
}
