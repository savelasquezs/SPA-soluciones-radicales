<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
defineProps<{ to: string; title: string; description: string }>()
</script>
<template>
  <RouterLink :to="to" class="settings-entry"><span class="settings-entry__icon" aria-hidden="true"><slot name="icon" /></span><span class="settings-entry__copy"><strong>{{ title }}</strong><small>{{ description }}</small></span><ChevronRight :size="16" aria-hidden="true" /></RouterLink>
</template>
<style scoped>
.settings-entry { display: flex; align-items: center; gap: var(--space-8); min-height: 60px; padding: var(--space-8) var(--space-12); color: var(--text); text-decoration: none; background: var(--surface); }
.settings-entry + .settings-entry { border-top: 1px solid var(--border); }
.settings-entry:hover { background: var(--hover); }
.settings-entry:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.settings-entry__icon { flex: 0 0 22px; color: var(--text-secondary); }
.settings-entry__copy { flex: 1; min-width: 0; display: grid; gap: 0; }
.settings-entry strong { font-size: 0.9375rem; font-weight: 600; line-height: 1.4; }
.settings-entry small { color: var(--text-secondary); font-size: .75rem; line-height: 1.35; }
.settings-entry > svg { flex: 0 0 auto; color: var(--text-secondary); }
</style>
