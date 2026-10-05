<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'

defineProps<{ title: string; message: string }>()
</script>

<template>
  <section class="error-state" role="alert">
    <CircleAlert :size="28" aria-hidden="true" />
    <h2>{{ title }}</h2>
    <p>{{ message }}</p>
    <slot />
  </section>
</template>

<style scoped>
.error-state { display: grid; min-height: 12rem; place-items: center; align-content: center; gap: 0.5rem; border: 1px solid var(--danger); border-radius: var(--radius-panel); background: var(--danger-subtle); padding: 2rem; color: var(--danger); text-align: center; }
.error-state h2, .error-state p { margin: 0; }
.error-state p { color: var(--text-secondary); }
</style>
