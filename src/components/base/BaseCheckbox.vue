<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    label: string
    name: string
    disabled?: boolean
    error?: string
    help?: string
  }>(),
  { disabled: false, error: undefined, help: undefined },
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
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? `${name}-error` : help ? `${name}-help` : undefined"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        @blur="emit('blur')"
      />
      <span>{{ label }}</span>
    </label>
    <small v-if="help" :id="`${name}-help`" class="help">{{ help }}</small>
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
</style>
