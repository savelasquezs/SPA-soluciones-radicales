<script setup lang="ts">
import StatusBadge from '@/components/base/StatusBadge.vue'
defineProps<{ active: boolean; feminine?: boolean }>()
</script>
<template><StatusBadge :tone="active ? 'success' : 'neutral'" :icon="active ? 'check' : 'x'">{{ active ? (feminine ? 'Activa' : 'Activo') : (feminine ? 'Inactiva' : 'Inactivo') }}</StatusBadge></template>
