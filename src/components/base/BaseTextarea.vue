<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label: string
    name: string
    rows?: number
    required?: boolean
    disabled?: boolean
    error?: string
    help?: string
  }>(),
  { rows: 4, required: false, disabled: false, error: undefined, help: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()
</script>

<template>
  <label class="field" :for="name">
    <span>{{ label }} <span v-if="required" class="required" aria-hidden="true">*</span></span>
    <small v-if="help" :id="`${name}-help`" class="help">{{ help }}</small>
    <textarea
      :id="name"
      :name="name"
      :rows="rows"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${name}-error` : help ? `${name}-help` : undefined"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @blur="emit('blur')"
    ></textarea>
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

textarea {
  min-height: 7rem;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.75rem;
  color: var(--text);
  resize: vertical;
}

textarea[aria-invalid='true'] {
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
