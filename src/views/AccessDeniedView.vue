<script setup lang="ts">
import { ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const loading = ref(false)

async function useAnotherAccount(): Promise<void> {
  loading.value = true
  try {
    await session.useAnotherAccount()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="denied-page">
    <section class="card denied-card">
      <span class="denied-card__icon" aria-hidden="true">!</span>
      <h1>Cuenta sin acceso</h1>
      <p>
        <strong>{{ session.authEmail }}</strong> inició sesión correctamente, pero no tiene un registro activo en
        Soluciones Radicales.
      </p>
      <p v-if="session.error" class="detail">{{ session.error }}</p>
      <BaseButton :loading="loading" @click="useAnotherAccount">Usar otra cuenta</BaseButton>
    </section>
  </main>
</template>

<style scoped>
.denied-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 1rem;
}

.denied-card {
  display: grid;
  width: min(32rem, 100%);
  justify-items: center;
  gap: 1rem;
  text-align: center;
}

.denied-card__icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 50%;
  background: var(--danger-subtle);
  color: var(--danger);
  font-size: 1.5rem;
  font-weight: 800;
}

h1,
p {
  margin: 0;
}

p {
  color: var(--text-secondary);
}

.detail {
  font-size: 0.88rem;
}
</style>
