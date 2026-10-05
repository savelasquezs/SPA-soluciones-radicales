<script setup lang="ts">
import BaseSpinner from '@/components/base/BaseSpinner.vue'

withDefaults(
  defineProps<{
    type?: 'button' | 'submit'
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    loading?: boolean
    disabled?: boolean
  }>(),
  { type: 'button', variant: 'primary', loading: false, disabled: false },
)
</script>

<template>
  <button
    class="base-button"
    :class="`base-button--${variant}`"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <BaseSpinner v-if="loading" size="small" label="Procesando" />
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 0.65rem 1rem;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  transition: 150ms ease;
}

.base-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.base-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.base-button--primary {
  background: var(--accent);
  color: var(--accent-contrast);
}

.base-button--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.base-button--secondary {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--text);
}

.base-button--danger {
  background: var(--danger);
  color: #fff;
}

.base-button--ghost {
  background: transparent;
  color: var(--text-secondary);
}

</style>
