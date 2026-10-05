<script setup lang="ts">
import BaseSpinner from '@/components/base/BaseSpinner.vue'

withDefaults(
  defineProps<{
    type?: 'button' | 'submit'
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    size?: 'medium' | 'compact'
    loading?: boolean
    disabled?: boolean
  }>(),
  { type: 'button', variant: 'primary', size: 'medium', loading: false, disabled: false },
)
</script>

<template>
  <button
    class="base-button"
    :class="[`base-button--${variant}`, `base-button--${size}`]"
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
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  transition: 150ms ease;
}

.base-button--medium {
  min-height: 44px;
  padding: 0.65rem 1rem;
}

.base-button--compact {
  min-height: 36px;
  gap: 0.4rem;
  padding: 0.42rem 0.75rem;
  font-size: 0.875rem;
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

@media (max-width: 680px) {
  .base-button--compact {
    min-height: 44px;
    padding: 0.6rem 0.8rem;
  }
}

</style>
