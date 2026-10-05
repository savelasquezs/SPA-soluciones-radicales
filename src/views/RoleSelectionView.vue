<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import type { ActiveRole } from '@/types/domain'

const session = useSessionStore()
const notifications = useNotificationsStore()
const route = useRoute()
const router = useRouter()
const loadingRole = ref<ActiveRole | null>(null)

async function choose(role: ActiveRole): Promise<void> {
  loadingRole.value = role
  try {
    await session.selectRole(role)
    const redirect = typeof route.query.redirect === 'string'
      && route.query.redirect.startsWith('/')
      && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/'
    await router.replace(redirect)
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible seleccionar el rol', 'danger')
  } finally {
    loadingRole.value = null
  }
}
</script>

<template>
  <main class="role-page">
    <section class="card role-card">
      <p class="eyebrow">ROL ACTIVO</p>
      <h1>¿Cómo vas a trabajar hoy?</h1>
      <p>La autorización del servidor cambiará según el rol que elijas para esta sesión.</p>
      <div class="role-actions">
        <BaseButton :loading="loadingRole === 'ADMINISTRADOR'" @click="choose('ADMINISTRADOR')">
          Administrador
        </BaseButton>
        <BaseButton variant="secondary" :loading="loadingRole === 'TECNICO'" @click="choose('TECNICO')">
          Técnico
        </BaseButton>
      </div>
    </section>
  </main>
</template>

<style scoped>
.role-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 1rem;
}

.role-card {
  display: grid;
  width: min(34rem, 100%);
  gap: 1rem;
  text-align: center;
}

.eyebrow,
h1,
p {
  margin: 0;
}

.eyebrow {
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

p {
  color: var(--text-secondary);
}

.role-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
</style>
