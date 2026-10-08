<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
const props = defineProps<{ page: number; total: number; pageSize: number; loading: boolean }>()
const emit = defineEmits<{ change: [page: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>
<template>
  <nav v-if="total > pageSize || page > 1" class="insight-pagination" aria-label="Paginación">
    <span>Página {{ page }} de {{ pages }}</span>
    <BaseIconButton label="Página anterior" size="small" :disabled="loading || page <= 1" @click="emit('change', page - 1)"><ChevronLeft :size="18" /></BaseIconButton>
    <BaseIconButton label="Página siguiente" size="small" :disabled="loading || page >= pages" @click="emit('change', page + 1)"><ChevronRight :size="18" /></BaseIconButton>
  </nav>
</template>
<style scoped>
.insight-pagination { display:flex; justify-content:flex-end; align-items:center; gap:0.5rem; padding:0.6rem 0; color:var(--text-secondary); font-size:0.8125rem; }
</style>
