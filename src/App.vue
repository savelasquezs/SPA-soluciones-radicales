<script setup lang="ts">
import ToastViewport from '@/components/base/ToastViewport.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
</script>

<template>
  <main v-if="session.status === 'idle' || session.status === 'loading'" class="app-loading" aria-busy="true">
    <div class="app-loading__mark">SR</div>
    <p>Validando acceso…</p>
  </main>
  <RouterView v-else />
  <ToastViewport />
</template>

<style scoped>
.app-loading {
  display: grid;
  min-height: 100vh;
  place-content: center;
  justify-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
}

.app-loading__mark {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 16px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 850;
}

.app-loading p {
  margin: 0;
}
</style>
