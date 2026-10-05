<script setup lang="ts">
defineProps<{
  modelValue: string
  label: string
  name: string
  required?: boolean
  disabled?: boolean
  error?: string
  help?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()
</script>

<template>
  <label class="field" :for="name">
    <span>{{ label }} <span v-if="required" class="required" aria-hidden="true">*</span></span>
    <small v-if="help" :id="`${name}-help`" class="help">{{ help }}</small>
    <select
      :id="name"
      :name="name"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${name}-error` : help ? `${name}-help` : undefined"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      @blur="emit('blur')"
    >
      <slot />
    </select>
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

select {
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.65rem 0.75rem;
  color: var(--text);
}

select[aria-invalid='true'] {
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
