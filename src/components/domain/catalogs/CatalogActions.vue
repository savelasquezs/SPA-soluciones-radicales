<script setup lang="ts">
import { Pencil, Power, RotateCcw, Trash2 } from 'lucide-vue-next'
import BaseIconButton from '@/components/base/BaseIconButton.vue'

defineProps<{ name: string; active: boolean; disabled?: boolean }>()
const emit = defineEmits<{ edit: []; state: []; delete: [] }>()
</script>
<template>
  <span class="catalog-actions">
    <BaseIconButton size="small" :label="`Editar ${name}`" :disabled="disabled" @click="emit('edit')"><Pencil :size="17" /></BaseIconButton>
    <BaseIconButton size="small" :label="`${active ? 'Desactivar' : 'Reactivar'} ${name}`" :disabled="disabled" @click="emit('state')"><Power v-if="active" :size="17" /><RotateCcw v-else :size="17" /></BaseIconButton>
    <BaseIconButton size="small" :label="`Eliminar ${name}`" :disabled="disabled" @click="emit('delete')"><Trash2 :size="17" /></BaseIconButton>
  </span>
</template>
<style scoped>
.catalog-actions { display: inline-flex; align-items: center; gap: var(--space-4); white-space: nowrap; }
</style>
