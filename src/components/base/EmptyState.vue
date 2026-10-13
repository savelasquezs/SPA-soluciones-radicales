<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'

withDefaults(defineProps<{ title: string; message?: string }>(), { message: undefined })
</script>

<template>
  <section class="state-panel">
    <Inbox :size="28" aria-hidden="true" />
    <h2>{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <slot />
  </section>
</template>

<style scoped>
.state-panel { display: grid; min-height: 12rem; place-items: center; align-content: center; gap: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); padding: 2rem; text-align: center; }
.state-panel h2, .state-panel p { margin: 0; }
.state-panel p { color: var(--text-secondary); }
</style>
