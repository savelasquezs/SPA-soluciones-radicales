<script setup lang="ts">
import { Building2, CalendarDays, CircleHelp, CloudOff, FileText, Gauge, Menu, Search, Settings2, Users, WalletCards, Wifi, X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AccountMenu from '@/components/layout/AccountMenu.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { accountTransitionKey, createAccountTransition } from '@/composables/useAccountTransition'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useTechnicianReportEmailStore } from '@/stores/technicianReportEmails'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { ThemePreference } from '@/types/domain'

type NavigationItem = { to: string; label: string; icon: typeof Gauge; admin?: boolean }
type NavigationGroup = { label: string; items: NavigationItem[] }
const auth = useAuthStore(), app = useAppStore()
provide(accountTransitionKey, createAccountTransition())
const { online } = useNetworkStatus()
const reportEmails = useTechnicianReportEmailStore()
const technicianServices = useTechnicianServicesStore()
let resuming = false
async function resumePendingWork(): Promise<void> {
  if (!online.value || auth.activeRole !== 'TECNICO' || resuming) return
  resuming = true
  try {
    await technicianServices.hydrateCaches()
    // Sync local service changes and the finalization BEFORE attempting the email outbox.
    for (const [serviceId, operations] of Object.entries(technicianServices.mutations)) {
      if (!navigator.onLine || auth.activeRole !== 'TECNICO') break
      if (operations.length && !operations.some(item => item.status === 'CONFLICT')) {
        try { await technicianServices.syncPending(serviceId) } catch { /* keep cached mutations for next reconnect */ }
      }
    }
    await reportEmails.flushAll()
  } catch { /* Offline operations remain durable; the next focus/reconnection retries. */ }
  finally { resuming = false }
}
function resumePendingWorkNow(): void { void resumePendingWork() }
function onVisibilityChange(): void { if (document.visibilityState === 'visible') resumePendingWorkNow() }
watch([online, () => auth.activeRole], resumePendingWorkNow, { immediate:true })
watch(() => reportEmails.pendingCount, count => { if (count) resumePendingWorkNow() })
let retryTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  window.addEventListener('focus', resumePendingWorkNow)
  document.addEventListener('visibilitychange', onVisibilityChange)
  // Retry deferred deliveries in the foreground without polling Gmail when there is no outbox.
  retryTimer = setInterval(() => {
    const pendingServiceChanges = Object.values(technicianServices.mutations)
      .some(items => items.length > 0 && !items.some(item => item.status === 'CONFLICT'))
    if (reportEmails.pendingCount || pendingServiceChanges) resumePendingWorkNow()
  }, 60_000)
})
onUnmounted(() => {
  if (retryTimer !== null) clearInterval(retryTimer)
  window.removeEventListener('focus', resumePendingWorkNow)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
const route = useRoute()
const compactRoutes = new Set(['dashboard', 'clients', 'client-detail', 'site-detail', 'payments', 'my-profile', 'users', 'settings', 'catalogs', 'certificates', 'integrations'])
const compactLayout = computed(() => compactRoutes.has(String(route.name)))
const navigationOpen = ref(false)
const groups: NavigationGroup[] = [
  { label: 'OPERACIÓN', items: [
    { to: '/', label: 'Resumen', icon: Gauge }, { to: '/agenda', label: 'Agenda', icon: CalendarDays, admin: true }, { to: '/servicios', label: 'Servicios', icon: FileText },
  ] },
  { label: 'GESTIÓN', items: [
    { to: '/clientes', label: 'Clientes', icon: Building2, admin: true },
    { to: '/pagos', label: 'Pagos y caja', icon: WalletCards, admin: true },
  ] },
  { label: 'ADMINISTRACIÓN', items: [
    { to: '/usuarios', label: 'Usuarios', icon: Users, admin: true },
    { to: '/configuracion', label: 'Configuración', icon: Settings2, admin: true },
  ] },
]
const visibleGroups = computed(() => groups.map(group => ({ ...group, items: group.items.filter(item => !item.admin || auth.isAdmin) })).filter(group => group.items.length))
type BreadcrumbItem = { label: string; to?: string }
const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const raw=route.meta.breadcrumb
  if(Array.isArray(raw)) return raw
    .filter(item=>item && typeof item.label==='string' && item.label.trim())
    .map(item=>({ label:item.label.trim(),to:typeof item.to==='string' ? item.to : undefined }))
  return typeof raw==='string' && raw.trim() ? [{ label:raw.trim() }] : []
})
function isActive(to: string): boolean { return route.path === to || (to !== '/' && route.path.startsWith(`${to}/`)) }
watch(() => route.fullPath, () => { navigationOpen.value = false })
function setTheme(event: Event): void { app.setTheme((event.target as HTMLSelectElement).value as ThemePreference) }
</script>

<template>
  <div class="admin-layout">
    <header class="topbar">
      <RouterLink to="/" class="brand" aria-label="Soluciones Radicales MIP"><img class="brand__symbol" src="/favicon.png" alt="" aria-hidden="true" /><div class="brand__copy"><strong>Soluciones Radicales</strong><small>MANEJO INTEGRADO DE PLAGAS</small></div></RouterLink>
      <label class="global-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">Búsqueda global</span><input type="search" readonly placeholder="Buscar cliente, servicio o documento" /></label>
      <div class="topbar__activity">
        <span class="sync-state" :class="{ 'sync-state--offline': !online }"><Wifi v-if="online" :size="16" aria-hidden="true" /><CloudOff v-else :size="16" aria-hidden="true" />{{ online ? 'En línea' : 'Sin conexión' }}</span>
        <label class="theme-select"><span class="sr-only">Apariencia</span><select :value="app.theme" @change="setTheme"><option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Sistema</option></select></label>
        <AccountMenu placement="topbar" />

      </div>
      <BaseIconButton class="menu-button" :label="navigationOpen ? 'Cerrar navegación' : 'Abrir navegación'" aria-controls="admin-navigation" :aria-expanded="navigationOpen" @click="navigationOpen = !navigationOpen"><X v-if="navigationOpen" :size="22" /><Menu v-else :size="22" /></BaseIconButton>
    </header>
    <div class="shell-body">
      <button v-if="navigationOpen" type="button" class="drawer-backdrop" aria-label="Cerrar navegación" @click="navigationOpen = false"></button>
      <aside id="admin-navigation" class="sidebar" :class="{ 'sidebar--open': navigationOpen }">
        <nav aria-label="Navegación principal"><section v-for="group in visibleGroups" :key="group.label"><h2>{{ group.label }}</h2><RouterLink v-for="item in group.items" :key="item.to" :to="item.to" :class="{ 'nav-active': isActive(item.to) }" @click="navigationOpen = false"><component :is="item.icon" :size="17" aria-hidden="true" />{{ item.label }}</RouterLink></section></nav>
        <div class="sidebar__footer">
          <a href="https://soluciones-radicales.mintlify.app" target="_blank" rel="noreferrer">
            <CircleHelp :size="17" aria-hidden="true" /> Ayuda y documentación
          </a>
          <AccountMenu placement="sidebar" />
        </div>
      </aside>
      <main class="content" :class="{ 'content--services': route.name==='agenda' || route.name==='services', 'content--compact': compactLayout }"><nav v-if="breadcrumbItems.length && (!compactLayout || breadcrumbItems.length > 1)" class="breadcrumb" :class="{ 'breadcrumb--agenda':route.name==='agenda' || (route.name==='services' && route.query.view==='week') }" aria-label="Ruta de navegación"><template v-for="(item,index) in breadcrumbItems" :key="`${item.label}-${index}`"><RouterLink v-if="item.to" :to="item.to">{{ item.label }}</RouterLink><span v-else :aria-current="index===breadcrumbItems.length-1 ? 'page' : undefined">{{ item.label }}</span><span v-if="index<breadcrumbItems.length-1" class="breadcrumb__separator" aria-hidden="true">/</span></template></nav><RouterView /></main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout { min-width: 0; min-height: 100vh; overflow-x: clip; background: var(--bg); }
.topbar { position: sticky; top: 0; z-index: 40; display: grid; height: 64px; grid-template-columns: 240px minmax(16rem, 330px) 1fr; align-items: center; gap: 1.5rem; border-bottom: 1px solid var(--border); background: var(--surface); padding: 0 1.5rem; }
.brand { display: inline-flex; width: fit-content; min-width: 0; align-items: center; gap: 0.65rem; color: var(--text); text-decoration: none; }
.brand__symbol { display: block; width: 42px; height: 42px; flex: 0 0 auto; object-fit: contain; }
.brand__copy { min-width: 0; }
.brand__copy strong, .brand__copy small { display: block; }
.brand__copy strong { font-size: 0.95rem; font-weight: 600; line-height: 1.15rem; white-space: nowrap; }
.brand__copy small { margin-top: 0.1rem; color: var(--text-secondary); font-size: 0.62rem; line-height: 0.8rem; letter-spacing: 0.03em; white-space: nowrap; }
.global-search { display: flex; min-width: 0; height: 36px; align-items: center; gap: 0.5rem; border-radius: 6px; background: var(--bg); padding: 0.5rem; color: var(--text-secondary); }
.global-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 0.8125rem; }
.topbar__activity { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 1rem; }
.sync-state { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.8125rem; white-space: nowrap; }
.sync-state--offline { color: var(--warning); }
.theme-select select { min-height: 36px; border: 0; background: transparent; color: var(--text-secondary); font-size: 0.8125rem; }
.topbar__activity :deep(.account-control--topbar) { width: min(16rem, 30vw); }
.menu-button { display: none; justify-self: end; }
.shell-body { display: grid; min-width: 0; grid-template-columns: 220px minmax(0, 1fr); }
.sidebar { position: sticky; top: 64px; display: flex; height: calc(100vh - 64px); flex-direction: column; overflow-y: auto; background: var(--sidebar); padding: 0.875rem 0.625rem 0.75rem; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
.sidebar nav { display: grid; gap: 0.375rem; }
.sidebar nav section { display: grid; gap: 0.125rem; }
.sidebar nav h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0.2rem 0 0.1rem; padding: 0.35rem 0.625rem; color: var(--accent); font-size: 0.625rem; font-weight: 700; letter-spacing: 0.075em; line-height: 1rem; }
.sidebar nav h2::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.sidebar nav a { display: flex; min-height: 38px; align-items: center; gap: 0.625rem; border-radius: var(--radius-button); padding: 0.4rem 0.75rem; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 500; line-height: 1.25rem; text-decoration: none; }
.sidebar nav a:hover { background: var(--hover); color: var(--text); }
.sidebar nav a.nav-active { background: var(--accent-subtle); color: var(--accent); }
.sidebar__footer { display: grid; gap: 0.25rem; margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--border); }
.sidebar__footer a { display: flex; min-height: 38px; align-items: center; gap: 0.625rem; padding: 0 0.75rem; color: var(--text-secondary); font-size: 0.8125rem; text-decoration: none; }
.sidebar__footer a:hover { color: var(--text); text-decoration: underline; }
.content { width: 100%; max-width: 1184px; min-width: 0; margin: 0 auto; padding: 1.75rem 2rem 3rem; }
.breadcrumb { display:flex; align-items:center; gap:0.35rem; margin:0 0 1rem; color:var(--text-secondary); font-size:0.75rem; }
.content--services { padding-top:1rem; }
.content--compact { max-width: none; padding: 1rem 1.5rem 2rem; }
.content--compact .breadcrumb { margin-bottom: 0.625rem; }
.content--services .breadcrumb { display:none; }
.breadcrumb a { color:inherit; text-decoration:none; }
.breadcrumb a:hover, .breadcrumb a:focus-visible { color:var(--text); text-decoration:underline; text-underline-offset:2px; }
.breadcrumb__separator { color:var(--text-muted); }
.drawer-backdrop { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 1024px) {
  .topbar { grid-template-columns: minmax(0, 1fr) auto auto; column-gap: 0.6rem; }
  .global-search, .sync-state, .theme-select { display: none; }
  .topbar__activity { display: flex; }
  .topbar__activity :deep(.account-control--topbar) { width: auto; }
  .menu-button { display: inline-grid; }
  .shell-body { grid-template-columns: 1fr; }
  .sidebar { position: fixed; z-index: 35; top: 64px; bottom: 0; left: 0; width: min(19rem, calc(100vw - 3rem)); height: auto; visibility: hidden; transform: translateX(-105%); transition: transform 180ms ease; box-shadow: var(--shadow-lg); }
  .sidebar--open { visibility: visible; transform: translateX(0); }
  .drawer-backdrop { position: fixed; z-index: 30; inset: 64px 0 0; display: block; border: 0; background: var(--backdrop); }
  .content { padding: 1.5rem; }
  .content--compact { padding: 1rem 1.25rem 2rem; }
  .sidebar nav a, .sidebar__footer a { min-height: 44px; }
}
@media (max-width: 680px) {
  .breadcrumb--agenda { display:none; }
}
@media (max-width: 560px) {
  .topbar { height: 60px; padding: 0 1rem; }
  .brand__symbol { width: 34px; height: 34px; }
  .brand__copy strong { max-width: calc(100vw - 190px); overflow: hidden; text-overflow: ellipsis; font-size: 0.82rem; }
  .brand__copy small { display: none; }
  .shell-body { display: block; }
  .sidebar { top: 60px; }
  .drawer-backdrop { inset-block-start: 60px; }
  .content { padding: 1.25rem 1rem 5rem; }
  .content--compact { padding: 0.875rem 0.875rem 4rem; }
}
</style>
