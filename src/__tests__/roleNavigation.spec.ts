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
})
