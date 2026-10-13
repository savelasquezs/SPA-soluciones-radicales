<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  disabled?: boolean
}>(), {
  required: false,
  hint: undefined,
  error: undefined,
  disabled: false,
})

const hintId = computed(() => props.hint ? `${props.name}-hint` : undefined)
const errorId = computed(() => props.error ? `${props.name}-error` : undefined)
const describedBy = computed(() => [hintId.value, errorId.value].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="base-field" :class="{ 'base-field--disabled': disabled }">
    <label class="base-field__label" :for="name">
      {{ label }}
      <span v-if="required" class="base-field__required" aria-hidden="true">*</span>
    </label>
    <slot :described-by="describedBy" />
    <p v-if="hint" :id="hintId" class="base-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="base-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.base-field {
  display: grid;
  min-width: 0;
  gap: var(--base-field-gap, 0.5rem);
}

.base-field__label {
  color: var(--text);
  font-size: var(--base-field-label-size, 0.875rem);
  font-weight: 500;
  line-height: var(--base-field-label-line-height, 1.25rem);
}

.base-field__required,
.base-field__error {
  color: var(--danger);
}

.base-field__hint,
.base-field__error {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.125rem;
}

.base-field__hint {
  color: var(--text-secondary);
}

.base-field--disabled {
  opacity: 0.78;
}
</style>
