<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import BaseInput from '@/components/base/BaseInput.vue'
import { PEST_GROUP_LABELS, validateCatalogItem } from '@/helpers/mipCatalogs'
import { PEST_GROUPS, type CatalogErrors, type MipItemInput, type MipItemKind } from '@/types/mipCatalogs'

const props = defineProps<{ kind: MipItemKind; saving?: boolean; serverErrors?: CatalogErrors }>()
const model = defineModel<MipItemInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: []; change: [] }>()
const form = ref<HTMLFormElement | null>(null)
const touched = reactive({ nombre: false, clasificacion: false })
const submitted = ref(false)
const validation = computed(() => validateCatalogItem(props.kind, model.value))
function error(key: keyof MipItemInput): string | undefined { return props.serverErrors?.[key] ?? (touched[key] || submitted.value ? validation.value.errors[key] : undefined) }
function update<K extends keyof MipItemInput>(key: K, value: MipItemInput[K]): void { model.value = { ...model.value, [key]: value }; emit('change') }
async function submit(): Promise<void> {
  if (props.saving) return
  submitted.value = true
  if (Object.keys(validation.value.errors).length) { emit('invalid'); await nextTick(); form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return }
  emit('submit')
}
</script>

<template>
  <form id="mip-item-form" ref="form" class="item-form" novalidate :inert="saving || undefined" :aria-busy="Boolean(saving)" @submit.prevent="submit">
    <BaseInput name="mip-item-name" label="Nombre" required :model-value="model.nombre" :error="error('nombre')" @update:model-value="update('nombre', $event)" @blur="touched.nombre = true" />
    <fieldset v-if="kind !== 'methods'">
      <legend>Clasificación <span aria-hidden="true">*</span></legend>
      <div class="item-form__groups">
        <label v-for="group in PEST_GROUPS" :key="group" :class="{ selected: model.clasificacion === group }">
          <input type="radio" name="mip-classification" :value="group" :checked="model.clasificacion === group" required :aria-invalid="Boolean(error('clasificacion'))" :aria-describedby="error('clasificacion') ? 'classification-error' : undefined" @change="update('clasificacion', group); touched.clasificacion = true" @blur="touched.clasificacion = true" />
          {{ PEST_GROUP_LABELS[group] }}
        </label>
      </div>
      <p v-if="error('clasificacion')" id="classification-error" role="alert">{{ error('clasificacion') }}</p>
    </fieldset>
  </form>
</template>

<style scoped>
.item-form { display: grid; gap: var(--space-16); }
fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
legend { padding: 0; margin-bottom: var(--space-8); font-size: .875rem; }
legend span, fieldset p { color: var(--danger); }
fieldset p { margin: .5rem 0 0; font-size: .8125rem; }
.item-form__groups { display: flex; gap: var(--space-8); }
.item-form__groups label { display: flex; min-height: 44px; flex: 1; gap: var(--space-8); align-items: center; border: 1px solid var(--border); border-radius: var(--radius); padding: .65rem; cursor: pointer; }
.item-form__groups label.selected { border-color: var(--accent); background: var(--accent-subtle); }
input { accent-color: var(--accent); }
</style>
