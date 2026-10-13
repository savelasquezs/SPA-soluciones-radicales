<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    message?: string
    tone?: 'neutral' | 'danger' | 'warning' | 'success'
    busy?: boolean
    compact?: boolean
  }>(),
  { message: undefined, tone: 'neutral', busy: false, compact: false },
)
</script>

<template>
  <section class="status-panel" :class="[`status-panel--${tone}`, { 'status-panel--compact': compact }]" :aria-busy="busy">
    <span v-if="busy" class="status-panel__spinner" aria-hidden="true"></span>
    <div>
      <h2>{{ title }}</h2>
      <p v-if="message">{{ message }}</p>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.status-panel {
  display: flex;
  min-height: 9rem;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 2rem;
  text-align: center;
}

.status-panel--compact {
  min-height:0;
  justify-content:flex-start;
  align-items:center;
  padding:0.7rem 0.9rem;
  gap:0.6rem;
  text-align:left;
}
.status-panel--compact h2 { font-size:0.875rem; line-height:1.35; }
.status-panel--compact p { margin-top:0.15rem; font-size:0.8rem; line-height:1.4; }
.status-panel--danger {
  border-color: var(--danger);
  background: var(--danger-subtle);
}

.status-panel--warning {
  border-color: var(--warning);
  background: var(--warning-subtle);
}

.status-panel--success {
  border-color: var(--success);
  background: var(--success-subtle);
}

h2,
p {
  margin: 0;
}

p {
  margin-top: 0.4rem;
  color: var(--text-secondary);
}

.status-panel__spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid var(--accent-subtle);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
