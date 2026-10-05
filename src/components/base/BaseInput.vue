<script setup lang="ts">
import BaseField from '@/components/base/BaseField.vue'

withDefaults(
  defineProps<{
    modelValue: string
    label: string
    name: string
    type?: 'text' | 'email' | 'number' | 'search'
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
    min?: string
    max?: string
    step?: string
    autocomplete?: string
    error?: string
    hint?: string
  }>(),
  {
    type: 'text',
    required: false,
    disabled: false,
    readonly: false,
    placeholder: undefined,
    min: undefined,
    max: undefined,
    step: undefined,
    autocomplete: undefined,
    error: undefined,
    hint: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()
</script>

<template>
  <BaseField
    v-slot="{ describedBy }"
    :name="name"
    :label="label"
    :required="required"
    :hint="hint"
    :error="error"
    :disabled="disabled"
  >
    <input
      :id="name"
      :name="name"
      :type="type"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :readonly="readonly"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step"
      :autocomplete="autocomplete"
      :aria-invalid="Boolean(error)"
      :aria-describedby="describedBy"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur')"
    />
  </BaseField>
</template>

<style scoped>
input {
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.65rem 0.75rem;
  color: var(--text);
}

input:disabled {
  background: var(--surface-hover);
  color: var(--text-muted);
}

input:read-only:not(:disabled) {
  background: var(--surface-raised);
}

input[aria-invalid='true'] {
  border-color: var(--danger);
}

</style>
