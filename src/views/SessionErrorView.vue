<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const loading = ref(false)
const restarting = ref(false)
const recoveryError = ref<string | null>(null)

async function retry(): Promise<void> {
  loading.value = true
  recoveryError.value = null
  try {
    await session.initialize(true)
    if (session.status === 'authenticated') {
      await router.replace('/')
    } else if (session.status === 'unauthenticated') {
      await router.replace('/acceso')
    }
  } finally {
    loading.value = false
  }
}

async function restartWithGoogle(): Promise<void> {
  restarting.value = true
  recoveryError.value = null
  try {
    await session.logout()
    await session.login(true)
  } catch (error) {
    recoveryError.value = error instanceof Error ? error.message : 'No fue posible reiniciar el acceso'
    restarting.value = false
  }
}
</script>

<template>
  <main class="error-page">
    <section class="card error-card">
      <h1>No pudimos validar tu sesión</h1>
      <p>{{ session.error }}</p>
      <div class="actions">
        <BaseButton :loading="loading" :disabled="restarting" @click="retry">Reintentar</BaseButton>
        <BaseButton variant="secondary" :loading="restarting" :disabled="loading" @click="restartWithGoogle">
          Cerrar sesión y usar otra cuenta
        </BaseButton>
      </div>
      <p v-if="recoveryError" class="error" role="alert">{{ recoveryError }}</p>
    </section>
  </main>
</template>

<style scoped>
.error-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 1rem;
}

.error-card {
  display: grid;
  width: min(32rem, 100%);
  gap: 1rem;
  text-align: center;
}

h1,
p {
  margin: 0;
}

p {
  color: var(--text-secondary);
}

.actions {
  display: grid;
  gap: 0.65rem;
}

.error {
  border-radius: var(--radius);
  background: var(--danger-subtle);
  padding: 0.75rem;
  color: var(--danger);
}
</style>
