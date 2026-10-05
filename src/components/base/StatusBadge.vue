<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleAlert, CircleX, Info, ShieldCheck, Wrench } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'technician'
  icon?: 'check' | 'x' | 'warning' | 'info' | 'shield' | 'technician' | 'error'
}>(), { tone: 'neutral', icon: undefined })

const icons = { check: CheckCircle2, x: CircleX, warning: AlertTriangle, info: Info, shield: ShieldCheck, technician: Wrench, error: CircleAlert }
</script>

<template>
  <span class="status-badge" :class="`status-badge--${tone}`">
    <component :is="props.icon ? icons[props.icon] : undefined" v-if="props.icon" :size="15" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.status-badge { display: inline-flex; min-height: 28px; align-items: center; gap: 0.375rem; border-radius: 6px; padding: 0.25rem 0.5rem; background: var(--hover); color: var(--text-secondary); font-size: 0.75rem; font-weight: 500; line-height: 1rem; white-space: nowrap; }
.status-badge--success { background: var(--success-subtle); color: var(--success); }
.status-badge--warning { background: var(--warning-subtle); color: var(--warning); }
.status-badge--danger { background: var(--danger-subtle); color: var(--danger); }
.status-badge--info { background: var(--info-subtle); color: var(--info); }
.status-badge--technician { background: var(--brand-secondary-subtle); color: var(--brand-secondary); }
</style>
