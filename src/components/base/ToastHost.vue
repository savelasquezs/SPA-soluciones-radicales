<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-vue-next'

import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()
const icons = { success: CheckCircle2, error: CircleAlert, warning: AlertTriangle, info: Info }
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <article v-for="item in notifications.items" :key="item.id" class="toast" :class="`toast--${item.tone}`" role="status">
      <component :is="icons[item.tone]" :size="20" aria-hidden="true" />
      <span>{{ item.message }}</span>
      <button type="button" aria-label="Cerrar notificación" @click="notifications.dismiss(item.id)"><X :size="18" /></button>
    </article>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 100;
  right: 1rem;
  bottom: 1rem;
  display: grid;
  width: min(25rem, calc(100vw - 2rem));
  gap: 0.65rem;
  pointer-events: none;
}

.toast {
  display: grid;
  min-height: 52px;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--border-strong);
  border-left: 4px solid var(--info);
  border-radius: var(--radius-panel);
  background: var(--surface-raised);
  padding: 0.5rem 0.75rem;
  box-shadow: var(--shadow-lg);
  color: var(--info);
  pointer-events: auto;
}

.toast span { color: var(--text); }
.toast--success { border-left-color: var(--success); color: var(--success); }
.toast--warning { border-left-color: var(--warning); color: var(--warning); }
.toast--error { border-left-color: var(--danger); color: var(--danger); }
.toast button { display: grid; min-width: 44px; min-height: 44px; place-items: center; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
</style>
