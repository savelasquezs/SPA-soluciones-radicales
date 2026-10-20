<script setup lang="ts">
import { ref } from 'vue'
import { LockKeyhole } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'

const session = useAuthStore()
const notifications = useNotificationsStore()
const router = useRouter()
const loading = ref(false)

async function useAnotherAccount(): Promise<void> {
  loading.value = true
  try {
    await session.useAnotherAccount()
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cambiar de cuenta', 'error')
  } finally {
    loading.value = false
  }
}

async function logout(): Promise<void> {
  loading.value = true
  try {
    await session.logout()
    await router.replace('/acceso')
  } catch (error) {
    notifications.show(error instanceof Error ? error.message : 'No fue posible cerrar sesión', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="denied-page">
    <section class="card denied-card" aria-labelledby="denied-title">
      <span class="denied-card__icon" aria-hidden="true"><LockKeyhole :size="24" :stroke-width="1.8" /></span>
      <h1 id="denied-title">Acceso restringido</h1>
      <p class="denied-card__description">
        Tu cuenta de Google no tiene permiso para acceder a Soluciones Radicales.
      </p>
      <p v-if="session.authEmail" class="denied-card__email">
        Cuenta: <strong>{{ session.authEmail }}</strong>
      </p>
      <p class="denied-card__hint">Solicita autorización a un administrador.</p>
      <div class="actions">
        <BaseButton :loading="loading" @click="useAnotherAccount">Cambiar de cuenta</BaseButton>
        <BaseButton variant="ghost" :disabled="loading" @click="logout">Cerrar sesión</BaseButton>
      </div>
    </section>
  </main>
</template>

<style scoped>
.denied-page {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: 1rem;
}

.denied-card {
  display: grid;
  width: min(27rem, 100%);
  justify-items: center;
  gap: 0.75rem;
  padding: clamp(1.5rem, 4vw, 2.25rem);
  text-align: center;
}

.denied-card__icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 50%;
  background: var(--hover);
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

h1,
p {
  margin: 0;
}

h1 {
  font-size: clamp(1.4rem, 3vw, 1.75rem);
  line-height: 1.2;
}

.denied-card__description {
  color: var(--text-secondary);
  line-height: 1.5;
}

.denied-card__email {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}

.denied-card__hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.actions {
  display: grid;
  width: min(18rem, 100%);
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.actions :deep(.base-button) {
  width: 100%;
}
</style>
