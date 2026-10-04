<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const loading = ref(false)

async function retry(): Promise<void> {
  loading.value = true
  await session.initialize(true)
  loading.value = false
  if (session.status === 'authenticated') {
    await router.replace('/')
  }
}
</script>

<template>
  <main class="error-page">
    <section class="card error-card">
      <h1>No pudimos validar tu sesión</h1>
      <p>{{ session.error }}</p>
      <BaseButton :loading="loading" @click="retry">Reintentar</BaseButton>
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
</style>
