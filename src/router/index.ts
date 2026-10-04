import { createRouter, createWebHistory } from 'vue-router'

import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    { path: '/acceso', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    {
      path: '/sin-acceso',
      name: 'access-denied',
      component: () => import('@/views/AccessDeniedView.vue'),
      meta: { public: true },
    },
    {
      path: '/error-sesion',
      name: 'session-error',
      component: () => import('@/views/SessionErrorView.vue'),
      meta: { public: true },
    },
    {
      path: '/seleccionar-rol',
      name: 'role-selection',
      component: () => import('@/views/RoleSelectionView.vue'),
    },
    {
      path: '/usuarios',
      name: 'users',
      component: () => import('@/views/UsersView.vue'),
      meta: { admin: true },
    },
    {
      path: '/integraciones',
      name: 'integrations',
      component: () => import('@/views/IntegrationsView.vue'),
      meta: { admin: true },
    },
    { path: '/servicios', name: 'services', component: () => import('@/views/ServicesView.vue') },
    { path: '/prohibido', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { public: true } },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.initialize()

  if (session.status === 'denied') {
    return to.name === 'access-denied' ? true : { name: 'access-denied' }
  }
  if (session.status === 'error') {
    return to.name === 'session-error' ? true : { name: 'session-error' }
  }
  if (session.status === 'unauthenticated') {
    return to.meta.public ? true : { name: 'login', query: { redirect: to.fullPath } }
  }
  if (session.status === 'authenticated') {
    if (session.profile?.requiereSeleccionRol && to.name !== 'role-selection') {
      return { name: 'role-selection' }
    }
    if (!session.profile?.requiereSeleccionRol && to.name === 'role-selection') {
      return { name: 'dashboard' }
    }
    if (to.meta.admin && !session.isAdmin) {
      return { name: 'forbidden' }
    }
    if (to.name === 'login' || to.name === 'access-denied' || to.name === 'session-error') {
      return { name: 'dashboard' }
    }
  }

  return true
})

export default router
