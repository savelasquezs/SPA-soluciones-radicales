<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
const props=defineProps<{ page: number; pageSize: number; total: number; disabled?: boolean }>()
const emit=defineEmits<{ page: [value: number] }>()
const pages=computed(()=>Math.max(1,Math.ceil(props.total/props.pageSize)))
</script>
<template>
  <nav class="svc-pagination" aria-label="Paginación">
    <span>{{ total }} {{ total===1 ? 'registro' : 'registros' }} · Página {{ page }} de {{ pages }}</span>
    <span class="svc-actions"><BaseButton size="compact" variant="secondary" :disabled="disabled || page<=1" @click="emit('page',page-1)">Anterior</BaseButton><BaseButton size="compact" variant="secondary" :disabled="disabled || page>=pages" @click="emit('page',page+1)">Siguiente</BaseButton></span>
  </nav>
</template>
