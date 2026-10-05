<script setup lang="ts">
import BaseField from '@/components/base/BaseField.vue'

withDefaults(defineProps<{
  modelValue: string
  label: string
  name: string
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  error?: string
  hint?: string
}>(), { required: false, disabled: false, readonly: false, error: undefined, hint: undefined })

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
    <select
      :id="name"
      :name="name"
      :value="modelValue"
      :required="required"
      :disabled="disabled || readonly"
      :aria-invalid="Boolean(error)"
      :aria-describedby="describedBy"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      @blur="emit('blur')"
    >
      <slot />
    </select>
  </BaseField>
</template>

<style scoped>
select {
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.65rem 0.75rem;
  color: var(--text);
}

select[aria-invalid='true'] {
  border-color: var(--danger);
}

</style>
