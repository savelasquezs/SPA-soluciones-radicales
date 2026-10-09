<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue'
import ProductCoveragePicker from './ProductCoveragePicker.vue'
import { validateProductInput } from '@/helpers/mipCatalogs'
import type { CatalogErrors, MipOptions, MipProductInput } from '@/types/mipCatalogs'

const props = defineProps<{ options: MipOptions; saving?: boolean; serverErrors?: CatalogErrors; file: File | null }>()
const model = defineModel<MipProductInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: []; change: []; 'update:file': [file: File | null]; 'view-file': [] }>()
const form = ref<HTMLFormElement | null>(null)
const touched = reactive<Partial<Record<keyof MipProductInput, boolean>>>({})
const submitted = ref(false)
const validation = computed(() => validateProductInput(model.value))
type TextKey = Exclude<keyof MipProductInput, 'metodoIds' | 'categorias' | 'plagaIds' | 'fichaTecnicaStoragePath'>
const fields: { key: TextKey; label: string; required?: boolean; wide?: boolean }[] = [
  { key: 'nombre', label: 'Nombre comercial', required: true, wide: true },
  { key: 'principioActivo', label: 'Principio activo / composición', required: true, wide: true },
  { key: 'dosisAplicacion', label: 'Dosis de aplicación', required: true },
  { key: 'registroSanitario', label: 'Registro sanitario' },
  { key: 'gradoToxicologico', label: 'Grado toxicológico' },
  { key: 'fabricante', label: 'Laboratorio / fabricante' },
  { key: 'antidoto', label: 'Antídoto', wide: true },
]
const methods = computed(() => props.options.methods.filter(item => item.activo || model.value.metodoIds.includes(item.id)).map(item => ({ id: item.id, label: item.nombre, description: item.activo ? undefined : 'Inactivo · selección conservada' })))
function update<K extends keyof MipProductInput>(key: K, value: MipProductInput[K]): void { model.value = { ...model.value, [key]: value }; emit('change') }
function updateText(key: TextKey, value: string): void { update(key, value) }
function error(key: keyof MipProductInput): string | undefined { return props.serverErrors?.[key] ?? (touched[key] || submitted.value ? validation.value.errors[key] : undefined) }
async function submit(): Promise<void> {
  if (props.saving) return
  submitted.value = true
  if (Object.keys(validation.value.errors).length) { emit('invalid'); await nextTick(); form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return }
  emit('submit')
}
function removeFile(): void { update('fichaTecnicaStoragePath', null); emit('update:file', null) }
</script>

<template>
  <form id="mip-product-form" ref="form" class="product-form" novalidate :inert="saving || undefined" :aria-busy="Boolean(saving)" @submit.prevent="submit">
    <div class="product-form__data">
      <BaseInput v-for="field in fields" :key="field.key" :class="{ 'product-form__wide': field.wide }" :name="`product-${field.key}`" :label="field.label" :required="field.required" :model-value="model[field.key] ?? ''" :error="error(field.key)" @update:model-value="updateText(field.key, $event)" @blur="touched[field.key] = true" />
    </div>
    <div class="product-form__relations">
      <ProductCoveragePicker :categories="model.categorias" :pest-ids="model.plagaIds" :pests="options.pests" :disabled="saving" :error="error('categorias') || error('plagaIds')" @change="model = { ...model, ...$event }; emit('change')" @blur="touched.plagaIds = true; touched.categorias = true" />
      <BaseMultiSelect name="product-methods" label="Métodos de aplicación" required :model-value="model.metodoIds" :options="methods" item-label="método" items-label="métodos" placeholder="Seleccionar métodos" empty-text="No hay métodos activos." :disabled="saving" :error="error('metodoIds')" @update:model-value="update('metodoIds', $event)" @blur="touched.metodoIds = true" />
      <div v-if="model.fichaTecnicaStoragePath" class="product-form__current-file">
        <span>Ficha técnica actual</span>
        <BaseButton type="button" variant="ghost" size="compact" @click="emit('view-file')">Ver</BaseButton>
        <BaseButton type="button" variant="ghost" size="compact" @click="removeFile">Quitar</BaseButton>
      </div>
      <BaseFileUpload name="product-file" :label="model.fichaTecnicaStoragePath ? 'Reemplazar ficha técnica' : 'Ficha técnica'" size="compact" icon="file" button-label="Adjuntar archivo" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
        hint="PDF o imagen (JPG, PNG, WebP), hasta 10 MB" :model-value="file" :disabled="saving" :error="error('fichaTecnicaStoragePath')" @update:model-value="emit('update:file', $event); emit('change')" />
    </div>
  </form>
</template>

<style scoped>
.product-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: var(--space-24); }
.product-form__data { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-16); }
.product-form__wide { grid-column: 1 / -1; }
.product-form__relations { display: grid; gap: var(--space-16); min-width: 0; }
.product-form__current-file { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-8); }
.product-form__current-file > span { flex: 1; font-size: .875rem; }
@media (max-width: 760px) { .product-form, .product-form__data { grid-template-columns: minmax(0, 1fr); } }
</style>
