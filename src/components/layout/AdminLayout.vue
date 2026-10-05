<script setup lang="ts">
import {
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileText,
  Gauge,
  LogOut,
  Menu,
  Search,
  Settings2,
  Users,
  WalletCards,
  Wrench,
  X,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useNotificationsStore } from '@/stores/notifications'
import type { ActiveRole, ThemePreference } from '@/types/domain'

type NavigationItem = { to: string; label: string; icon: typeof Gauge; admin?: boolean }
type NavigationGroup = { label: string; items: NavigationItem[] }

const auth = useAuthStore()
const app = useAppStore()
const notifications = useNotificationsStore()
const route = useRoute()
const router = useRouter()
const navigationOpen = ref(false)
const switchingRole = ref(false)

const groups: NavigationGroup[] = [
  { label: 'OPERACIÓN', items: [
    { to: '/', label: 'Resumen', icon: Gauge },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/servicios', label: 'Servicios', icon: FileText },
  ] },
  { label: 'GESTIÓN', items: [
    { to: '/clientes', label: 'Clientes', icon: Building2, admin: true },
    { to: '/catalogos', label: 'Catálogos', icon: Boxes, admin: true },
    { to: '/documentos', label: 'Documentos', icon: FileText, admin: true },
    { to: '/pagos', label: 'Pagos y caja', icon: WalletCards, admin: true },
  ] },
  { label: 'ADMINISTRACIÓN', items: [
    { to: '/usuarios', label: 'Usuarios', icon: Users, admin: true },
    { to: '/configuracion', label: 'Configuración', icon: Settings2, admin: true },
  ] },
]

const visibleGroups = computed(() => groups
  .map((group) => ({ ...group, items: group.items.filter((item) => !item.admin || auth.isAdmin) }))
  .filter((group) => group.items.length))
const breadcrumb = computed(() => route.meta.breadcrumb ?? '')

watch(() => route.fullPath, () => { navigationOpen.value = false })

async function logout(): Promise<void> {
  try {
    await auth.logout()
    await router.replace('/acceso')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cerrar sesión', 'error')
  }
}

async function switchRole(role: ActiveRole): Promise<void> {
  if (auth.activeRole === role || switchingRole.value) return
  switchingRole.value = true
  try {
    await auth.selectRole(role)
    if (role === 'TECNICO' && route.meta.roles?.includes('ADMINISTRADOR')) await router.replace('/')
    notifications.show(`Rol ${role === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico'} activo`, 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cambiar el rol', 'error')
  } finally {
    switchingRole.value = false
  }
}

function setTheme(event: Event): void {
  app.setTheme((event.target as HTMLSelectElement).value as ThemePreference)
}
</script>

<template>
  <div class="admin-layout">
    <header class="topbar">
      <div class="brand">
        <span aria-hidden="true"></span>
        <div><strong>Soluciones Radicales</strong><small>MANEJO INTEGRADO DE PLAGAS</small></div>
      </div>

      <label class="global-search">
        <Search :size="16" aria-hidden="true" />
        <span class="sr-only">Búsqueda global</span>
        <input type="search" readonly placeholder="Buscar cliente, servicio o documento" />
      </label>

      <div class="topbar__activity">
        <span class="sync-state"><CheckCircle2 :size="16" aria-hidden="true" />Al día</span>
        <label class="theme-select">
          <span class="sr-only">Apariencia</span>
          <select :value="app.theme" @change="setTheme">
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
            <option value="system">Sistema</option>
          </select>
        </label>
        <details class="account-menu">
          <summary>
            <strong>{{ auth.profile?.nombreCompleto }}</strong>
            <span>{{ auth.activeRole === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico' }}</span>
            <ChevronDown :size="16" aria-hidden="true" />
          </summary>
          <div class="account-menu__panel">
            <p>{{ auth.authEmail }}</p>
            <div v-if="auth.rolesAvailable.length > 1" class="role-options">
              <BaseButton
                v-for="role in auth.rolesAvailable"
                :key="role"
                variant="ghost"
                :disabled="switchingRole || auth.activeRole === role"
                @click="switchRole(role)"
              >
                <Wrench v-if="role === 'TECNICO'" :size="17" />
                <Users v-else :size="17" />
                {{ role === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico' }}
              </BaseButton>
            </div>
            <BaseButton variant="secondary" @click="logout"><LogOut :size="17" />Cerrar sesión</BaseButton>
          </div>
        </details>
      </div>

      <BaseIconButton class="menu-button" :label="navigationOpen ? 'Cerrar navegación' : 'Abrir navegación'" @click="navigationOpen = !navigationOpen">
        <X v-if="navigationOpen" :size="22" />
        <Menu v-else :size="22" />
      </BaseIconButton>
    </header>

    <div class="shell-body">
      <button v-if="navigationOpen" type="button" class="drawer-backdrop" aria-label="Cerrar navegación" @click="navigationOpen = false"></button>
      <aside class="sidebar" :class="{ 'sidebar--open': navigationOpen }">
        <nav aria-label="Navegación principal">
          <section v-for="group in visibleGroups" :key="group.label">
            <h2>{{ group.label }}</h2>
            <RouterLink v-for="item in group.items" :key="item.to" :to="item.to">
              <component :is="item.icon" :size="17" aria-hidden="true" />
              {{ item.label }}
            </RouterLink>
          </section>
        </nav>
        <div class="sidebar__footer">
          <div><span>Tu espacio de trabajo</span><strong>Soluciones Radicales</strong></div>
          <a href="https://github.com/savelasquezs/SPA-soluciones-radicales/tree/main/docs" target="_blank" rel="noreferrer">
            <CircleHelp :size="17" aria-hidden="true" />Ayuda y documentación
          </a>
        </div>
      </aside>

      <main class="content">
        <p v-if="breadcrumb" class="breadcrumb">{{ breadcrumb }}</p>
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout { min-width: 0; min-height: 100vh; overflow-x: clip; background: var(--bg); }
.topbar { position: sticky; top: 0; z-index: 40; display: grid; height: 64px; grid-template-columns: 260px minmax(16rem, 330px) 1fr; align-items: center; gap: 1.5rem; border-bottom: 1px solid var(--border); background: var(--surface); padding: 0 1.5rem; }
.brand { display: flex; min-width: 0; align-items: center; gap: 0.75rem; }
.brand > span { width: 4px; height: 32px; flex: 0 0 auto; background: var(--brand-secondary); }
.brand strong, .brand small { display: block; }
.brand strong { font-size: 1rem; font-weight: 500; line-height: 1.5rem; }
.brand small { color: var(--text-secondary); font-size: 0.75rem; line-height: 1rem; }
.global-search { display: flex; min-width: 0; height: 36px; align-items: center; gap: 0.5rem; border-radius: 6px; background: var(--bg); padding: 0.5rem; color: var(--text-secondary); }
.global-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 0.8125rem; }
.topbar__activity { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 1rem; }
.sync-state { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.8125rem; white-space: nowrap; }
.theme-select select { min-height: 36px; border: 0; background: transparent; color: var(--text-secondary); font-size: 0.8125rem; }
.account-menu { position: relative; min-width: 0; }
.account-menu summary { display: flex; min-height: 44px; align-items: center; gap: 0.5rem; list-style: none; cursor: pointer; }
.account-menu summary::-webkit-details-marker { display: none; }
.account-menu summary strong { max-width: 15rem; overflow: hidden; font-size: 0.875rem; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.account-menu summary span { color: var(--text-secondary); font-size: 0.8125rem; white-space: nowrap; }
.account-menu__panel { position: absolute; top: calc(100% + 0.5rem); right: 0; display: grid; width: 18rem; gap: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface-raised); padding: 1rem; box-shadow: var(--shadow-lg); }
.account-menu__panel p { margin: 0; overflow-wrap: anywhere; color: var(--text-secondary); font-size: 0.8125rem; }
.role-options { display: grid; }
.menu-button { display: none; justify-self: end; }
.shell-body { display: grid; min-width: 0; grid-template-columns: 240px minmax(0, 1fr); }
.sidebar { position: sticky; top: 64px; display: flex; height: calc(100vh - 64px); flex-direction: column; overflow-y: auto; background: var(--sidebar); padding: 1.5rem 1rem 1rem; }
.sidebar nav { display: grid; gap: 0.25rem; }
.sidebar nav section { display: grid; gap: 0.25rem; }
.sidebar nav h2 { margin: 0; padding: 0.5rem; color: var(--text-secondary); font-size: 0.75rem; font-weight: 500; line-height: 1rem; }
.sidebar nav a { display: flex; min-height: 44px; align-items: center; gap: 0.5rem; border-radius: var(--radius-panel); padding: 0.75rem; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; line-height: 1.25rem; text-decoration: none; }
.sidebar nav a:hover { background: var(--hover); color: var(--text); }
.sidebar nav a.router-link-exact-active { background: var(--accent-subtle); color: var(--accent); }
.sidebar__footer { display: grid; gap: 0.75rem; margin-top: auto; }
.sidebar__footer > div { display: grid; gap: 0.5rem; border-radius: 8px; background: var(--surface); padding: 0.75rem; }
.sidebar__footer span { color: var(--text-secondary); font-size: 0.8125rem; }
.sidebar__footer strong { font-size: 0.8125rem; font-weight: 500; }
.sidebar__footer a { display: flex; min-height: 44px; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.8125rem; text-decoration: none; }
.content { width: 100%; max-width: 1184px; min-width: 0; margin: 0 auto; padding: 1.75rem 2rem 3rem; }
.breadcrumb { margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.75rem; }
.drawer-backdrop { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

@media (max-width: 1024px) {
  .topbar { grid-template-columns: 1fr auto; }
  .global-search, .topbar__activity { display: none; }
  .menu-button { display: inline-grid; }
  .shell-body { grid-template-columns: 1fr; }
  .sidebar { position: fixed; z-index: 35; top: 64px; bottom: 0; left: 0; width: min(19rem, calc(100vw - 3rem)); height: auto; transform: translateX(-105%); transition: transform 180ms ease; box-shadow: var(--shadow-lg); }
  .sidebar--open { transform: translateX(0); }
  .drawer-backdrop { position: fixed; z-index: 30; inset: 64px 0 0; display: block; border: 0; background: var(--backdrop); }
  .content { padding: 1.5rem; }
}

@media (max-width: 560px) {
  .topbar { height: 60px; padding: 0 1rem; }
  .brand small { display: none; }
  .shell-body { display: block; }
  .sidebar { top: 60px; }
  .drawer-backdrop { inset-block-start: 60px; }
  .content { padding: 1.25rem 1rem 5rem; }
}
</style>
