<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    label: string
    name: string
    disabled?: boolean
    readonly?: boolean
    required?: boolean
    error?: string
    hint?: string
  }>(),
  { disabled: false, readonly: false, required: false, error: undefined, hint: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; blur: [] }>()
</script>

<template>
  <div class="checkbox-field">
    <label :for="name">
      <input
        :id="name"
        :name="name"
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled || readonly"
        :required="required"
        :aria-invalid="Boolean(error)"
        :aria-describedby="[hint ? `${name}-hint` : '', error ? `${name}-error` : ''].filter(Boolean).join(' ') || undefined"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        @blur="emit('blur')"
      />
      <span>{{ label }} <span v-if="required" class="required" aria-hidden="true">*</span></span>
    </label>
    <small v-if="hint" :id="`${name}-hint`" class="help">{{ hint }}</small>
    <small v-if="error" :id="`${name}-error`" class="error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.checkbox-field {
  display: grid;
  gap: 0.3rem;
}

label {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 0.6rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 650;
  cursor: pointer;
}

input {
  width: 1.2rem;
  height: 1.2rem;
  accent-color: var(--accent);
}

input[aria-invalid='true'] {
  outline: 2px solid var(--danger);
}

input:disabled,
input:disabled + span {
  cursor: not-allowed;
  opacity: 0.6;
}

.help {
  color: var(--text-muted);
}

.error {
  color: var(--danger);
}

.required {
  color: var(--danger);
}
</style>
