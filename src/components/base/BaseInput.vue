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
  }>(),
  { type: 'text', required: false, disabled: false, placeholder: undefined, min: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="field" :for="name">
    <span>{{ label }}</span>
    <input
      :id="name"
      :name="name"
      :type="type"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :placeholder="placeholder"
      :min="min"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
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
</style>
