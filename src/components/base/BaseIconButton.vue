<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  disabled?: boolean
  pressed?: boolean
  size?: 'small' | 'medium'
}>(), { disabled: false, pressed: undefined, size: 'medium' })
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="`icon-button--${size}`"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    :title="label"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-button {
  display: inline-grid;
  min-width: 44px;
  min-height: 44px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-button);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.icon-button:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}

.icon-button--small {
  min-width: 36px;
  min-height: 36px;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
