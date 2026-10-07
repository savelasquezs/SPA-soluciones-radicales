<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'

import BaseInput from '@/components/base/BaseInput.vue'
import { validateCriterionInput } from '@/helpers/mipCatalogs'
import type { CatalogErrors, MipCriterionInput } from '@/types/mipCatalogs'

const props = defineProps<{ saving?: boolean; serverErrors?: CatalogErrors }>()
const model = defineModel<MipCriterionInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: []; change: [] }>()
const form = ref<HTMLFormElement | null>(null)
const touched = reactive({ nombre: false, soloAreaExterna: false })
const submitted = ref(false)
const validation = computed(() => validateCriterionInput(model.value))

function error(key: keyof MipCriterionInput): string | undefined {
  return props.serverErrors?.[key]
    ?? (touched[key] || submitted.value ? validation.value.errors[key] : undefined)
}

function update<K extends keyof MipCriterionInput>(key: K, value: MipCriterionInput[K]): void {
  model.value = { ...model.value, [key]: value }
  emit('change')
}

async function submit(): Promise<void> {
  if (props.saving) return
  submitted.value = true
  if (Object.keys(validation.value.errors).length) {
    emit('invalid')
    await nextTick()
    form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  emit('submit')
}
</script>

<template>
  <form
    id="mip-criterion-form"
    ref="form"
    class="criterion-form"
    novalidate
    :inert="saving || undefined"
    :aria-busy="Boolean(saving)"
    @submit.prevent="submit"
  >
    <BaseInput
      name="mip-criterion-name"
      label="Nombre"
      required
      :model-value="model.nombre"
      :error="error('nombre')"
      @update:model-value="update('nombre', $event)"
      @blur="touched.nombre = true"
    />

    <fieldset>
      <legend>Aplicación <span aria-hidden="true">*</span></legend>
      <div class="criterion-form__groups">
        <label :class="{ selected: !model.soloAreaExterna }">
          <input
            type="radio"
            name="mip-criterion-scope"
            value="ALL"
            :checked="!model.soloAreaExterna"
            required
            @change="update('soloAreaExterna', false); touched.soloAreaExterna = true"
          />
          Todas las áreas
        </label>
        <label :class="{ selected: model.soloAreaExterna }">
          <input
            type="radio"
            name="mip-criterion-scope"
            value="EXTERNAL"
            :checked="model.soloAreaExterna"
            required
            @change="update('soloAreaExterna', true); touched.soloAreaExterna = true"
          />
          Solo exterior / perímetro
        </label>
      </div>
      <p v-if="error('soloAreaExterna')" role="alert">{{ error('soloAreaExterna') }}</p>
    </fieldset>
  </form>
</template>

<style scoped>
.criterion-form { display: grid; gap: var(--space-16); }
fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
legend { padding: 0; margin-bottom: var(--space-8); font-size: .875rem; }
legend span, fieldset p[role='alert'] { color: var(--danger); }
fieldset p { margin: .5rem 0 0; font-size: .8125rem; }
.criterion-form__groups { display: flex; gap: var(--space-8); }
.criterion-form__groups label { display: flex; min-height: 44px; flex: 1; gap: var(--space-8); align-items: center; border: 1px solid var(--border); border-radius: var(--radius); padding: .65rem; cursor: pointer; }
.criterion-form__groups label.selected { border-color: var(--accent); background: var(--accent-subtle); }
input { accent-color: var(--accent); }
@media (max-width: 520px) {
  .criterion-form__groups { flex-direction: column; }
}
</style>
