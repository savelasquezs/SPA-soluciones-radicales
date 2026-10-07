<script setup lang="ts">
import { Camera, Image, X } from 'lucide-vue-next'
import { ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseField from '@/components/base/BaseField.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'

const props = withDefaults(defineProps<{
  modelValue: File[]
  name: string
  label: string
  required?: boolean
  disabled?: boolean
  error?: string
  max?: number
}>(), { required: false, disabled: false, error: undefined, max: 10 })
const emit = defineEmits<{ 'update:modelValue': [files: File[]] }>()
const input = ref<HTMLInputElement | null>(null)

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function select(event: Event): void {
  const selected = Array.from((event.target as HTMLInputElement).files ?? [])
  const current = new Map(props.modelValue.map(file => [fileKey(file), file]))
  for (const file of selected) if (current.size < props.max) current.set(fileKey(file), file)
  emit('update:modelValue', [...current.values()])
  if (input.value) input.value.value = ''
}

function remove(index: number): void {
  emit('update:modelValue', props.modelValue.filter((_, current) => current !== index))
}
</script>

<template>
  <BaseField v-slot="{ describedBy }" :name="name" :label="label" :required="required" :error="error" :disabled="disabled">
    <div class="evidence-picker" :class="{ 'evidence-picker--invalid': error }">
      <BaseButton variant="secondary" :disabled="disabled || modelValue.length >= max" @click="input?.click()">
        <Camera :size="18" aria-hidden="true" />Agregar fotos
      </BaseButton>
      <span>{{ modelValue.length ? `${modelValue.length} de ${max} seleccionadas` : 'JPG, PNG o WebP · hasta 10 MB cada una' }}</span>
      <input
        :id="name"
        ref="input"
        class="evidence-picker__input"
        type="file"
        :name="name"
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        @change="select"
      />
      <ul v-if="modelValue.length">
        <li v-for="(file, index) in modelValue" :key="fileKey(file)">
          <Image :size="17" aria-hidden="true" /><span>{{ file.name }}</span>
          <BaseIconButton label="Quitar evidencia" size="small" :disabled="disabled" @click="remove(index)"><X :size="17" /></BaseIconButton>
        </li>
      </ul>
    </div>
  </BaseField>
</template>

<style scoped>
.evidence-picker { display:grid; gap:0.65rem; border:1px dashed var(--control-border); border-radius:var(--radius); padding:0.75rem; }
.evidence-picker--invalid { border-color:var(--danger); }
.evidence-picker > span { color:var(--text-secondary); font-size:0.8125rem; }
.evidence-picker__input { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
ul { display:grid; gap:0.4rem; margin:0; padding:0; list-style:none; }
li { display:grid; min-height:44px; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:0.55rem; border-radius:var(--radius-sm); background:var(--surface-raised); padding:0.35rem 0.45rem 0.35rem 0.65rem; }
li span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.8125rem; }
</style>
