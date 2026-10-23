import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'

const session = vi.hoisted(() => ({
  status: 'authenticated',
  profile: { requiereSeleccionRol: false },
  activeRole: 'TECNICO',
  initialize: vi.fn<() => Promise<void>>(async () => undefined),
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => session }))
vi.mock('@/helpers/googleHandoff', () => ({ readPendingGoogleHandoff: () => false }))

import { authGuard } from '@/router/guards'

const view = { render: () => null }
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: view },
  { path: '/clientes', name: 'clients', component: view, meta: { roles: ['ADMINISTRADOR'] } },
  { path: '/servicios', name: 'services', component: view },
  { path: '/seleccionar-rol', name: 'role-selection', component: view },
  { path: '/acceso', name: 'login', component: view, meta: { public: true } },
]

describe('navegación por rol', () => {
  beforeEach(() => {
    session.status = 'authenticated'
    session.profile.requiereSeleccionRol = false
    session.activeRole = 'TECNICO'
    session.initialize.mockClear()
  })

  it('redirige al inicio cuando un técnico abre una pantalla de administrador', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(authGuard)
    await router.push('/clientes')
    expect(router.currentRoute.value.name).toBe('dashboard')
    expect(session.initialize).toHaveBeenCalled()
  })

  it('permite al administrador entrar a clientes', async () => {
    session.activeRole = 'ADMINISTRADOR'
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(authGuard)
    await router.push('/clientes')
    expect(router.currentRoute.value.name).toBe('clients')
  })

  it('permite al técnico entrar a las páginas compartidas', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(authGuard)
    await router.push('/servicios')
    expect(router.currentRoute.value.name).toBe('services')
  })

  it.each(['TECNICO', 'ADMINISTRADOR'])('retira el verificador OAuth al confirmar la sesión %s y conserva filtros y hash', async role => {
    session.activeRole = role
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(authGuard)
    await router.push('/servicios?neon_auth_session_verifier=used&period=7d&tag=a&tag=b#pendientes')
    expect(router.currentRoute.value.fullPath).toBe('/servicios?period=7d&tag=a&tag=b#pendientes')
  })

  it('no lleva el verificador consumido a la selección de rol ni a su regreso', async () => {
    session.profile.requiereSeleccionRol = true
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(authGuard)
    await router.push('/servicios?neon_auth_session_verifier=used&period=7d')
    expect(router.currentRoute.value.name).toBe('role-selection')
    expect(router.currentRoute.value.query.redirect).toBe('/servicios?period=7d')
  })

  it('no descarta el verificador antes de confirmar una sesión válida', async () => {
    session.status = 'unauthenticated'
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach(authGuard)
    await router.push('/?neon_auth_session_verifier=pending&period=7d')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/?neon_auth_session_verifier=pending&period=7d')
  })
})
