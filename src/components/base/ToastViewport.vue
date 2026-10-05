<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()
</script>

<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <article v-for="item in notifications.items" :key="item.id" class="toast" :class="`toast--${item.tone}`">
      <span>{{ item.message }}</span>
      <button type="button" aria-label="Cerrar notificación" @click="notifications.dismiss(item.id)">×</button>
    </article>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  z-index: 50;
  right: 1rem;
  bottom: 1rem;
  display: grid;
  width: min(24rem, calc(100vw - 2rem));
  gap: 0.65rem;
}

.toast {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--border-strong);
  border-left: 4px solid var(--info);
  border-radius: var(--radius);
  background: var(--surface-raised);
  padding: 0.75rem 0.9rem;
  box-shadow: var(--shadow-lg);
}

.toast--success {
  border-left-color: var(--success);
}

.toast--warning {
  border-left-color: var(--warning);
}

.toast--danger {
  border-left-color: var(--danger);
}

button {
  min-width: 44px;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 1.35rem;
  cursor: pointer;
}
</style>
