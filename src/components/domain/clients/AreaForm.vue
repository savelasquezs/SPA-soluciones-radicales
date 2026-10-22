<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import { validateAreaInput } from '@/helpers/clients'
import type { AreaInput } from '@/types/domain'

const props = withDefaults(defineProps<{ mode: 'create' | 'edit'; formId?: string; idPrefix?: string; typeDisabled?: boolean }>(), {
  formId: 'area-form',
  idPrefix: 'area',
  typeDisabled: false,
})
const model = defineModel<AreaInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: [] }>()
const touched = ref(false)
const submitted = ref(false)
const errors = computed(() => validateAreaInput(model.value))
const nameField = computed(() => `${props.idPrefix}-name`)
const externalField = computed(() => `${props.idPrefix}-external`)

function submit(): void {
  submitted.value = true
  if (Object.keys(errors.value).length) emit('invalid')
  else emit('submit')
}
</script>

<template>
  <form :id="formId" class="area-form" novalidate @submit.prevent="submit">
    <BaseInput
      :model-value="modelValue.nombre"
      :name="nameField"
      label="Nombre del Área"
      required
      :error="touched || submitted ? errors.nombre : undefined"
      @update:model-value="model = { ...model, nombre: $event }"
      @blur="touched = true"
    />
    <BaseCheckbox :model-value="modelValue.esExterna" :name="externalField" label="Zona exterior o perimetral" :disabled="typeDisabled" @update:model-value="model = { ...model, esExterna: $event }" />
  </form>
</template>

<style scoped>.area-form { display: grid; gap: 1rem; }</style>
