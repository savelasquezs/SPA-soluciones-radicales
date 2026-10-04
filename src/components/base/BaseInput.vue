<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label: string
    name: string
    type?: 'text' | 'email' | 'date' | 'datetime-local' | 'number'
    required?: boolean
    disabled?: boolean
    placeholder?: string
    min?: string
    max?: string
    step?: string
    autocomplete?: string
    error?: string
    help?: string
  }>(),
  {
    type: 'text',
    required: false,
    disabled: false,
    placeholder: undefined,
    min: undefined,
    max: undefined,
    step: undefined,
    autocomplete: undefined,
    error: undefined,
    help: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()
</script>

<template>
  <label class="field" :for="name">
    <span>{{ label }} <span v-if="required" class="required" aria-hidden="true">*</span></span>
    <small v-if="help" :id="`${name}-help`" class="help">{{ help }}</small>
    <input
      :id="name"
      :name="name"
      :type="type"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step"
      :autocomplete="autocomplete"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${name}-error` : help ? `${name}-help` : undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur')"
    />
    <small v-if="error" :id="`${name}-error`" class="error" role="alert">{{ error }}</small>
  </label>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.45rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 650;
}

input {
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.65rem 0.75rem;
  color: var(--text);
}

input:disabled {
  background: var(--surface-hover);
  color: var(--text-muted);
}

input[aria-invalid='true'] {
  border-color: var(--danger);
}

.required,
.error {
  color: var(--danger);
}

.help {
  color: var(--text-muted);
  font-weight: 500;
}
</style>
