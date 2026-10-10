<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, LogOut, UserRound, UsersRound, Wrench } from 'lucide-vue-next'

import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import type { ActiveRole } from '@/types/domain'

const props = defineProps<{ placement: 'topbar' | 'sidebar' }>()
const auth = useAuthStore()
const notifications = useNotificationsStore()
const router = useRouter()
const route = useRoute()
const details = ref<HTMLDetailsElement | null>(null)
const switchingRole = ref(false)
const changingAccount = ref(false)
const imageFailed = ref(false)
const initials = computed(() => (auth.profile?.nombreCompleto ?? 'Usuario')
  .trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join(''))
const roleLabel = computed(() => auth.activeRole === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico')

watch(() => auth.avatarUrl, () => { imageFailed.value = false })
watch(() => route.fullPath, close)

function close(): void {
  if (details.value) details.value.open = false
}
function handleClick(event: PointerEvent): void {
  if (details.value && !details.value.contains(event.target as Node)) close()
}
function handleKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && details.value?.open) {
    close()
    details.value.querySelector('summary')?.focus()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', handleClick)
  document.addEventListener('keydown', handleKey)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', handleClick)
  document.removeEventListener('keydown', handleKey)
})

async function switchRole(role: ActiveRole): Promise<void> {
  if (switchingRole.value || !auth.rolesAvailable.includes(role) || role === auth.activeRole) return
  switchingRole.value = true
  try {
    await auth.selectRole(role)
    if (route.meta.roles?.length && !route.meta.roles.includes(role)) await router.replace('/')
    close()
    notifications.show('Rol activo: ' + (role === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico'), 'success')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No se pudo cambiar el rol', 'error')
  } finally {
    switchingRole.value = false
  }
}

async function changeAccount(): Promise<void> {
  if (changingAccount.value) return
  changingAccount.value = true
  try { await auth.useAnotherAccount() }
  catch (error) {
    changingAccount.value = false
    notifications.show(error instanceof Error ? error.message : 'No fue posible cambiar de cuenta', 'error')
  }
}

async function signOut(): Promise<void> {
  if (changingAccount.value) return
  try {
    await auth.logout()
    close()
    await router.replace('/acceso')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cerrar sesión', 'error')
  }
}
</script>

<template>
  <details
    ref="details"
    class="account-control"
    :class="'account-control--' + props.placement"
  >
    <summary :aria-label="'Opciones de cuenta de ' + (auth.profile?.nombreCompleto ?? 'usuario')">
      <span class="account-control__avatar">
        <img v-if="auth.avatarUrl && !imageFailed" :src="auth.avatarUrl" alt="" @error="imageFailed = true" />
        <span v-else aria-hidden="true">{{ initials }}</span>
      </span>
      <span class="account-control__identity">
        <strong>{{ auth.profile?.nombreCompleto }}</strong>
        <small>{{ roleLabel }}</small>
      </span>
      <ChevronDown class="account-control__chevron" :size="16" aria-hidden="true" />
    </summary>

    <div class="account-control__panel">
      <div class="account-control__email">{{ auth.authEmail }}</div>
      <RouterLink :to="{ name: 'my-profile' }" class="account-control__action" @click="close">
        <UserRound :size="18" aria-hidden="true" /> Mi perfil
      </RouterLink>
      <div v-if="auth.rolesAvailable.length > 1" class="account-control__roles">
        <span class="account-control__section">Trabajar como</span>
        <button
          v-for="role in auth.rolesAvailable"
          :key="role"
          type="button"
          class="account-control__action"
          :aria-pressed="auth.activeRole === role"
          :disabled="switchingRole || changingAccount || auth.activeRole === role"
          @click="switchRole(role)"
        >
          <Wrench v-if="role === 'TECNICO'" :size="18" aria-hidden="true" />
          <UsersRound v-else :size="18" aria-hidden="true" />
          {{ role === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico' }}
        </button>
      </div>
      <div class="account-control__divider"></div>
      <button type="button" class="account-control__action" :disabled="changingAccount" @click="changeAccount">
        <UsersRound :size="18" aria-hidden="true" /> Cambiar cuenta
      </button>
      <button type="button" class="account-control__action" :disabled="changingAccount" @click="signOut">
        <LogOut :size="18" aria-hidden="true" /> Cerrar sesión
      </button>
    </div>
  </details>
</template>

<style scoped>
.account-control { position: relative; min-width: 0; color: var(--text); }
.account-control summary {
  display: flex; width: 100%; min-height: 48px; align-items: center; gap: 0.7rem;
  border-radius: var(--radius-panel); padding: 0.35rem 0.45rem;
  list-style: none; cursor: pointer; user-select: none;
}
.account-control summary::-webkit-details-marker { display: none; }
.account-control summary:hover, .account-control[open] summary { background: var(--hover); }
.account-control summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.account-control__avatar {
  display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center;
  overflow: hidden; border: 1px solid var(--border); border-radius: 50%;
  background: var(--accent-subtle); color: var(--text); font-size: 0.82rem; font-weight: 600;
}
.account-control__avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
.account-control__identity { display: grid; min-width: 0; flex: 1; gap: 0.1rem; text-align: left; }
.account-control__identity strong { overflow: hidden; color: var(--text); font-size: 0.8125rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.account-control__identity small { color: var(--text-secondary); font-size: 0.75rem; }
.account-control__chevron { flex: 0 0 auto; color: var(--text-secondary); }
.account-control__panel {
  position: absolute; z-index: 80; top: calc(100% + 0.35rem); right: 0;
  display: grid; width: min(18rem, calc(100vw - 2rem)); max-height: min(75dvh, 28rem);
  overflow-y: auto; gap: 0.15rem; border: 1px solid var(--border);
  border-radius: var(--radius-panel); background: var(--surface-raised);
  padding: 0.45rem; box-shadow: var(--shadow-lg);
}
.account-control__email { padding: 0.6rem 0.7rem; color: var(--text-secondary); font-size: 0.75rem; overflow-wrap: anywhere; }
.account-control__action {
  display: flex; width: 100%; min-height: 44px; align-items: center; gap: 0.7rem;
  border: 0; border-radius: var(--radius); background: transparent;
  padding: 0.65rem 0.7rem; color: var(--text); font-size: 0.875rem;
  font-weight: 500; text-align: left; text-decoration: none; cursor: pointer;
}
.account-control__action svg { color: var(--text-secondary); flex: 0 0 auto; }
.account-control__action:hover:not(:disabled), .account-control__action:focus-visible { background: var(--hover); }
.account-control__action:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.account-control__action:disabled { opacity: 0.6; cursor: default; }
.account-control__action[aria-pressed='true'] { background: var(--accent-subtle); }
.account-control__section { display: block; padding: 0.65rem 0.7rem 0.25rem; color: var(--text-secondary); font-size: 0.75rem; }
.account-control__divider { height: 1px; margin: 0.35rem 0.2rem; background: var(--border); }
.account-control--sidebar { width: 100%; }
.account-control--sidebar .account-control__panel { top: auto; bottom: calc(100% + 0.35rem); left: 0; right: auto; }
@media (max-width: 1024px) {
  .account-control--topbar .account-control__identity,
  .account-control--topbar .account-control__chevron { display: none; }
  .account-control--topbar summary { width: 48px; height: 48px; justify-content: center; padding: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .account-control summary { scroll-behavior: auto; }
}
</style>
