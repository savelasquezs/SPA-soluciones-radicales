<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'

const props = withDefaults(
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
const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()
const messageId = useId()

watch(
  () => props.open,
  async (open) => {
    await nextTick()
    if (open && !dialog.value?.open) dialog.value?.showModal()
    if (!open && dialog.value?.open) dialog.value.close()
  },
  { immediate: true },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="messageId"
    @cancel.prevent="emit('cancel')"
  >
    <div class="confirm-dialog__content">
      <h2 :id="titleId">{{ title }}</h2>
      <p :id="messageId">{{ message }}</p>
      <div class="confirm-dialog__actions">
        <BaseButton variant="secondary" :disabled="loading" @click="emit('cancel')">{{ cancelLabel }}</BaseButton>
        <BaseButton :variant="danger ? 'danger' : 'primary'" :loading="loading" @click="emit('confirm')">
          {{ confirmLabel }}
        </BaseButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(30rem, calc(100vw - 2rem));
  max-width: 100vw;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}

.confirm-dialog::backdrop {
  background: var(--backdrop);
}

.confirm-dialog__content {
  display: grid;
  gap: 1rem;
  padding: 0.4rem;
}

h2,
p {
  margin: 0;
}

p {
  color: var(--text-secondary);
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}
</style>
