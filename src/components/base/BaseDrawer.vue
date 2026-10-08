<script setup lang="ts">
import BaseDialog from '@/components/base/BaseDialog.vue'
defineProps<{ modelValue: boolean; title: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
<template>
  <BaseDialog class="base-drawer" :model-value="modelValue" :title="title" @update:model-value="emit('update:modelValue', $event)"><slot /></BaseDialog>
</template>
<style scoped>
.base-drawer { width:min(39rem,100vw); height:100dvh; max-height:100dvh; margin:0 0 0 auto; border-radius:0; }
.base-drawer :deep(.base-dialog__panel) { height:100%; grid-template-rows:auto minmax(0,1fr); }
.base-drawer :deep(.base-dialog__header) { align-items:center; padding:0.8rem 1rem; border-bottom:1px solid var(--border); }
.base-drawer :deep(.base-dialog__header h2) { font-size:1rem; line-height:1.4; font-weight:600; overflow-wrap:anywhere; }
.base-drawer :deep(.base-dialog__body) { padding:1rem; overscroll-behavior:contain; }
@media(max-width:600px) { .base-drawer :deep(.base-dialog__header) { padding:calc(0.6rem + env(safe-area-inset-top)) 0.75rem 0.6rem; } .base-drawer :deep(.base-dialog__body) { padding:0.85rem 0.85rem calc(0.85rem + env(safe-area-inset-bottom)); } }
</style>
