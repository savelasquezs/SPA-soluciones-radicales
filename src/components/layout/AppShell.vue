<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const notifications = useNotificationsStore()
const router = useRouter()
const isDark = ref(document.documentElement.dataset.theme === 'dark')
const switchingRole = ref(false)

const links = computed(() => {
  const shared = [{ to: '/', label: 'Inicio' }, { to: '/servicios', label: 'Servicios' }]
  if (session.isAdmin) {
    shared.push({ to: '/usuarios', label: 'Usuarios' }, { to: '/integraciones', label: 'Integraciones' })
  }
  return shared
})

function toggleTheme(): void {
  isDark.value = !isDark.value
  document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

async function logout(): Promise<void> {
  try {
    await session.logout()
    await router.replace('/acceso')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cerrar sesión', 'danger')
  }
}

async function switchRole(): Promise<void> {
  const nextRole = session.profile?.rolActivo === 'ADMINISTRADOR' ? 'TECNICO' : 'ADMINISTRADOR'
  switchingRole.value = true
  try {
    await session.selectRole(nextRole)
    if (nextRole === 'TECNICO' && router.currentRoute.value.meta.admin) {
      await router.replace('/')
    }
    notifications.show(`Rol ${nextRole === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico'} activo`, 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cambiar el rol', 'danger')
  } finally {
    switchingRole.value = false
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand" aria-label="Soluciones Radicales MIP">
        <span class="brand__mark">SR</span>
        <span>
          <strong>Soluciones Radicales</strong>
          <small>Manejo Integrado de Plagas</small>
        </span>
      </RouterLink>

      <nav aria-label="Navegación principal">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
      </nav>

      <div class="sidebar__footer">
        <div class="identity">
          <strong>{{ session.profile?.nombreCompleto }}</strong>
          <span>{{ session.profile?.rolActivo }}</span>
        </div>
        <div class="sidebar__actions">
          <BaseButton
            v-if="session.profile?.esAdmin && session.profile.esTecnico"
            variant="ghost"
            :loading="switchingRole"
            @click="switchRole"
          >
            {{ session.isAdmin ? 'Usar rol Técnico' : 'Usar rol Admin' }}
          </BaseButton>
          <BaseButton variant="ghost" @click="toggleTheme">{{ isDark ? 'Tema claro' : 'Tema oscuro' }}</BaseButton>
          <BaseButton variant="secondary" @click="logout">Salir</BaseButton>
        </div>
      </div>
    </aside>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 10;
  display: flex;
  width: 17rem;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--sidebar);
  padding: 1.25rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text);
  text-decoration: none;
}

.brand__mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 13px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 800;
}

.brand strong,
.brand small {
  display: block;
}

.brand small {
  margin-top: 0.15rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}

nav {
  display: grid;
  gap: 0.4rem;
  margin-top: 2rem;
}

nav a {
  min-height: 44px;
  border-radius: var(--radius);
  padding: 0.72rem 0.8rem;
  color: var(--text-secondary);
  font-weight: 650;
  text-decoration: none;
}

nav a:hover,
nav a.router-link-active {
  background: var(--surface-hover);
  color: var(--accent);
}

.sidebar__footer {
  display: grid;
  gap: 0.9rem;
  margin-top: auto;
}

.identity {
  display: grid;
  gap: 0.2rem;
  overflow-wrap: anywhere;
}

.identity span {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.sidebar__actions {
  display: grid;
  gap: 0.5rem;
}

.content {
  max-width: 96rem;
  min-height: 100vh;
  margin-left: 17rem;
  padding: 2rem clamp(1rem, 3vw, 3rem);
}

@media (max-width: 760px) {
  .sidebar {
    position: sticky;
    top: 0;
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--border);
    padding: 0.8rem 1rem;
  }

  .brand small {
    display: none;
  }

  nav {
    display: flex;
    margin-top: 0.65rem;
    overflow-x: auto;
  }

  nav a {
    flex: 0 0 auto;
  }

  .sidebar__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.65rem;
  }

  .identity {
    display: none;
  }

  .sidebar__actions {
    display: flex;
    width: 100%;
    overflow-x: auto;
  }

  .sidebar__actions :deep(.base-button) {
    flex: 0 0 auto;
  }

  .content {
    margin-left: 0;
    padding: 1.25rem 1rem 5rem;
  }
}
</style>
