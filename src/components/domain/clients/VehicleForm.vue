<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseInput from '@/components/base/BaseInput.vue'
import type { VehicleInput } from '@/types/domain'

const props = defineProps<{ modelValue: VehicleInput; mode: 'create' | 'edit'; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: VehicleInput]; submit: []; invalid: [] }>()
const touched = ref(false)
const submitted = ref(false)
const error = computed(() => {
  const plate = props.modelValue.placa.trim()
  if (!plate) return 'Ingresa la placa'
  if (!/^[A-Z0-9-]{3,12}$/.test(plate)) return 'Utiliza entre 3 y 12 letras, números o guiones'
  return ''
})
function submit(): void {
  submitted.value = true
  if (error.value) emit('invalid')
  else emit('submit')
}
</script>
<template>
  <form id="vehicle-form" novalidate @submit.prevent="submit">
    <BaseInput
      :model-value="modelValue.placa"
      name="vehicle-plate"
      label="Placa"
      placeholder="ABC123"
      required
      autocomplete="off"
      :maxlength="12"
      :disabled="disabled"
      :error="touched || submitted ? error : undefined"
      @update:model-value="emit('update:modelValue', { ...modelValue, placa: $event.toUpperCase() })"
      @blur="touched = true"
    />
  </form>
</template>
