<script setup lang="ts">
import BaseField from '@/components/base/BaseField.vue'

withDefaults(
  defineProps<{
    modelValue: string
    label: string
    name: string
    rows?: number
    maxlength?: number | string
    required?: boolean
    disabled?: boolean
    readonly?: boolean
    error?: string
    hint?: string
  }>(),
  { rows: 4, maxlength: undefined, required: false, disabled: false, readonly: false, error: undefined, hint: undefined },
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
    <textarea
      :id="name"
      :name="name"
      :rows="rows"
      :maxlength="maxlength"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="Boolean(error)"
      :aria-describedby="describedBy"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @blur="emit('blur')"
    ></textarea>
  </BaseField>
</template>

<style scoped>
textarea {
  min-height: 7rem;
  width: 100%;
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.75rem;
  color: var(--text);
  resize: vertical;
}

textarea[aria-invalid='true'] {
  border-color: var(--danger);
}

</style>
