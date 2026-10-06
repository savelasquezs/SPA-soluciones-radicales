<script setup lang="ts">
import { Camera, FileText, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import BaseField from '@/components/base/BaseField.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'

const props = withDefaults(defineProps<{
  modelValue: File | null
  name: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  accept?: string
  size?: 'default' | 'compact'
  icon?: 'camera' | 'file'
  buttonLabel?: string
}>(), { hint: undefined, error: undefined, required: false, disabled: false, readonly: false, accept: '.pdf,.jpg,.jpeg,.png', size: 'default', icon: 'camera', buttonLabel: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: File | null]; blur: [] }>()
const input = ref<HTMLInputElement | null>(null)
const displayName = computed(() => props.modelValue?.name ?? '')

function select(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).files?.[0] ?? null)
}

function clear(): void {
  if (input.value) input.value.value = ''
  emit('update:modelValue', null)
}
</script>

<template>
  <BaseField v-slot="{ describedBy }" :name="name" :label="label" :hint="hint" :error="error" :required="required" :disabled="disabled">
    <div class="file-upload" :class="{ 'file-upload--invalid': error, 'file-upload--disabled': disabled || readonly, 'file-upload--compact': size === 'compact' }">
      <component :is="displayName || icon === 'file' ? FileText : Camera" :size="size === 'compact' ? 20 : 24" aria-hidden="true" />
      <button type="button" :disabled="disabled || readonly" :aria-describedby="describedBy" @click="input?.click()">
        {{ displayName || buttonLabel || label }}
      </button>
      <BaseIconButton v-if="displayName && !readonly" label="Quitar archivo" size="small" :disabled="disabled" @click="clear"><X :size="18" /></BaseIconButton>
      <input
        :id="name"
        ref="input"
        class="file-upload__input"
        type="file"
        :name="name"
        :accept="accept"
        :disabled="disabled || readonly"
        :required="required"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        @change="select"
        @blur="emit('blur')"
      />
    </div>
  </BaseField>
</template>

<style scoped>
.file-upload { display: grid; min-height: 7rem; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.75rem; border: 1px dashed var(--control-border); border-radius: var(--radius-panel); background: var(--surface); padding: 1.25rem; color: var(--accent); }
.file-upload:focus-within { box-shadow: var(--focus-ring); }
.file-upload button:not(.icon-button) { min-height: 44px; border: 0; background: transparent; color: var(--text); font-weight: 500; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.file-upload--compact { min-height: 72px; padding: var(--space-12); border-style: solid; border-color: var(--border-strong); color: var(--text-secondary); }
.file-upload--invalid { border-color: var(--danger); }
.file-upload--disabled { background: var(--bg); opacity: 0.75; }
.file-upload__input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
