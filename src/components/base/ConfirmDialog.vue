<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    loading?: boolean
  }>(),
  { confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', danger: false, loading: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <BaseDialog :model-value="open" :title="title" @update:model-value="!$event && emit('cancel')">
    <p class="confirm-dialog__message">{{ message }}</p>
    <template #footer>
      <div class="confirm-dialog__actions">
        <BaseButton variant="secondary" :disabled="loading" @click="emit('cancel')">{{ cancelLabel }}</BaseButton>
        <BaseButton :variant="danger ? 'danger' : 'primary'" :loading="loading" @click="emit('confirm')">
          {{ confirmLabel }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.confirm-dialog__message {
  margin: 0;
  color: var(--text-secondary);
}

.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}
</style>
