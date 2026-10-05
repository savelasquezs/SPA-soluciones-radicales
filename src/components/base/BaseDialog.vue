<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { X } from 'lucide-vue-next'

import BaseIconButton from '@/components/base/BaseIconButton.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  description?: string
  closeLabel?: string
  closeOnEscape?: boolean
}>(), { description: undefined, closeLabel: 'Cerrar', closeOnEscape: true })

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; closed: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()
const descriptionId = useId()
let returnFocus: HTMLElement | null = null

watch(() => props.modelValue, async (open) => {
  await nextTick()
  if (open && dialog.value && !dialog.value.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.value.showModal()
  } else if (!open && dialog.value?.open) {
    dialog.value.close()
  }
}, { immediate: true })

function close(): void {
  emit('update:modelValue', false)
}

function handleCancel(event: Event): void {
  event.preventDefault()
  if (props.closeOnEscape) close()
}

function handleClosed(): void {
  emit('closed')
  returnFocus?.focus()
  returnFocus = null
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="base-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="description ? descriptionId : undefined"
    @cancel="handleCancel"
    @close="handleClosed"
  >
    <section class="base-dialog__panel">
      <header class="base-dialog__header">
        <div>
          <h2 :id="titleId">{{ title }}</h2>
          <p v-if="description" :id="descriptionId">{{ description }}</p>
        </div>
        <BaseIconButton :label="closeLabel" size="small" @click="close"><X :size="18" /></BaseIconButton>
      </header>
      <div class="base-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="base-dialog__footer"><slot name="footer" /></footer>
    </section>
  </dialog>
</template>

<style scoped>
.base-dialog {
  width: min(35rem, calc(100vw - 2rem));
  max-width: 100vw;
  max-height: calc(100dvh - 2rem);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
  padding: 0;
}

.base-dialog::backdrop { background: var(--backdrop); }
.base-dialog__panel { display: grid; max-height: inherit; }
.base-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 2rem 2rem 0; }
.base-dialog__header h2 { margin: 0; font-size: 1.25rem; font-weight: 500; line-height: 1.75rem; }
.base-dialog__header p { margin: 1.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.3125rem; }
.base-dialog__body { min-height: 0; overflow-y: auto; padding: 1.5rem 2rem; }
.base-dialog__footer { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 0 2rem 2rem; }

@media (max-width: 600px) {
  .base-dialog {
    width: 100vw;
    max-width: 100vw;
    max-height: calc(100dvh - 1rem);
    margin: auto 0 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .base-dialog__header { padding: 1.5rem 1.25rem 0; }
  .base-dialog__body { padding: 1.25rem; }
  .base-dialog__footer { position: sticky; bottom: 0; padding: 1rem 1.25rem calc(1rem + env(safe-area-inset-bottom)); background: var(--surface); }
}
</style>
