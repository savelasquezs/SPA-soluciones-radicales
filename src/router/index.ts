import { createRouter, createWebHistory } from 'vue-router'

import { authGuard } from '@/router/guards'
import type { ActiveRole } from '@/types/domain'

const adminOnly: ActiveRole[] = ['ADMINISTRADOR']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/acceso', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/sin-acceso', name: 'access-denied', component: () => import('@/views/AccessDeniedView.vue'), meta: { public: true } },
    { path: '/error-sesion', name: 'session-error', component: () => import('@/views/SessionErrorView.vue'), meta: { public: true } },
    { path: '/seleccionar-rol', name: 'role-selection', component: () => import('@/views/RoleSelectionView.vue') },
    {
      path: '/',
      component: () => import('@/components/layout/AdminLayout.vue'),
      children: [
        { path: 'prohibido', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue') },
        { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { breadcrumb: 'Resumen' } },
        { path: 'agenda', name: 'agenda', component: () => import('@/views/AdminServicesView.vue'), meta: { roles: adminOnly, breadcrumb: 'Agenda' } },
        { path: 'servicios', name: 'services', component: () => import('@/views/ServicesView.vue'), meta: { breadcrumb: 'Servicios' } },
        { path: 'servicios/nuevo', name: 'admin-service-new', component: () => import('@/views/ServiceEditorView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Servicios', to: '/servicios' }, { label: 'Programar' }] } },
        { path: 'servicios/:id/editar', name: 'admin-service-edit', component: () => import('@/views/ServiceEditorView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Servicios', to: '/servicios' }, { label: 'Editar' }] } },
        { path: 'servicios/:id', name: 'service-detail', component: () => import('@/views/ServiceDetailView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Servicios', to: '/servicios' }, { label: 'Detalle' }] } },
        { path: 'negocios', redirect: '/clientes' },
        { path: 'clientes', name: 'clients', component: () => import('@/views/ClientsView.vue'), meta: { roles: adminOnly, breadcrumb: 'Clientes' } },
        { path: 'clientes/:id', name: 'client-detail', component: () => import('@/views/ClientDetailView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Clientes', to: '/clientes' }, { label: 'Detalle' }] } },
        { path: 'clientes/:id/sedes/:siteId', name: 'site-detail', component: () => import('@/views/SiteDetailView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Clientes', to: '/clientes' }, { label: 'Sede' }] } },
        { path: 'catalogos', redirect: '/configuracion/catalogos' },
        { path: 'documentos', name: 'documents', component: () => import('@/views/PlaceholderView.vue'), meta: { roles: adminOnly, breadcrumb: 'Documentos', placeholderTitle: 'Documentos', placeholderDescription: 'Los documentos se implementarán en su issue funcional.' } },
        { path: 'pagos', name: 'payments', component: () => import('@/views/PlaceholderView.vue'), meta: { roles: adminOnly, breadcrumb: 'Pagos y caja', placeholderTitle: 'Pagos y caja', placeholderDescription: 'Pagos y caja se implementará en su issue funcional.' } },
        { path: 'usuarios', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { roles: adminOnly, breadcrumb: 'Administración / Usuarios' } },
        { path: 'configuracion', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { roles: adminOnly } },
        { path: 'configuracion/catalogos', name: 'catalogs', component: () => import('@/views/MipCatalogsView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Configuración', to: '/configuracion' }, { label: 'Catálogos MIP' }] } },
        { path: 'configuracion/certificados', name: 'certificates', component: () => import('@/views/CertificatesView.vue'), meta: { roles: adminOnly, breadcrumb: [{ label: 'Configuración', to: '/configuracion' }, { label: 'Certificados' }] } },
        { path: 'integraciones', name: 'integrations', component: () => import('@/views/IntegrationsView.vue'), meta: { roles: adminOnly, breadcrumb: 'Integraciones' } },
      ],
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { public: true } },
  ],
})
router.beforeEach(authGuard)
export default router
