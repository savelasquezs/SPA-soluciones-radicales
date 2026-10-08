<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { CircleHelp } from 'lucide-vue-next'

import BaseInput from '@/components/base/BaseInput.vue'
import {
  PEST_GROUP_LABELS,
  PRODUCT_PEST_CATEGORY_LABELS,
  validateCatalogItem,
} from '@/helpers/mipCatalogs'
import {
  PEST_GROUPS,
  type CatalogErrors,
  type MipItemInput,
  type MipItemKind,
  type PestGroup,
  type ProductPestCategory,
} from '@/types/mipCatalogs'

const props = defineProps<{ kind: MipItemKind; saving?: boolean; serverErrors?: CatalogErrors }>()
const model = defineModel<MipItemInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: []; change: [] }>()
const form = ref<HTMLFormElement | null>(null)
const touched = reactive({ nombre: false, clasificacion: false, categoriaProducto: false })
const submitted = ref(false)
const RASTER_PRODUCT_CATEGORIES = ['INSECTOS_RASTREROS', 'ROEDORES'] as const
const validation = computed(() => validateCatalogItem(props.kind, model.value))

function error(key: keyof MipItemInput): string | undefined {
  return props.serverErrors?.[key]
    ?? (touched[key] || submitted.value ? validation.value.errors[key] : undefined)
}

function update<K extends keyof MipItemInput>(key: K, value: MipItemInput[K]): void {
  model.value = { ...model.value, [key]: value }
  emit('change')
}

function updateClassification(group: PestGroup): void {
  const currentProductCategory = model.value.categoriaProducto
  const categoriaProducto: ProductPestCategory | null = props.kind !== 'pests'
    ? null
    : group === 'VOLADORES'
      ? 'INSECTOS_VOLADORES'
      : currentProductCategory === 'INSECTOS_RASTREROS' || currentProductCategory === 'ROEDORES'
        ? currentProductCategory
        : null

  model.value = { ...model.value, clasificacion: group, categoriaProducto }
  touched.clasificacion = true
  touched.categoriaProducto = true
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

watch(
  [() => props.kind, () => model.value.clasificacion],
  ([kind, group]) => {
    if (kind === 'methods' && (model.value.clasificacion || model.value.categoriaProducto)) {
      model.value = { ...model.value, clasificacion: null, categoriaProducto: null }
      emit('change')
    } else if (kind === 'traps' && model.value.categoriaProducto) {
      model.value = { ...model.value, categoriaProducto: null }
      emit('change')
    } else if (
      kind === 'pests'
      && group === 'VOLADORES'
      && model.value.categoriaProducto !== 'INSECTOS_VOLADORES'
    ) {
      model.value = { ...model.value, categoriaProducto: 'INSECTOS_VOLADORES' }
      emit('change')
    } else if (
      kind === 'pests'
      && group === 'RASTREROS'
      && model.value.categoriaProducto === 'INSECTOS_VOLADORES'
    ) {
      model.value = { ...model.value, categoriaProducto: null }
      emit('change')
    }
  },
  { immediate: true },
)
</script>

<template>
  <form
    id="mip-item-form"
    ref="form"
    class="item-form"
    novalidate
    :inert="saving || undefined"
    :aria-busy="Boolean(saving)"
    @submit.prevent="submit"
  >
    <BaseInput
      name="mip-item-name"
      label="Nombre"
      required
      :model-value="model.nombre"
      :error="error('nombre')"
      @update:model-value="update('nombre', $event)"
      @blur="touched.nombre = true"
    />

    <fieldset v-if="kind !== 'methods'">
      <legend>
        {{ kind === 'pests' ? 'Monitoreo con trampas' : 'Monitoreo' }}
        <span class="item-form__required" aria-hidden="true">*</span>
      </legend>
      <div class="item-form__groups">
        <label
          v-for="group in PEST_GROUPS"
          :key="group"
          :class="{ selected: model.clasificacion === group }"
        >
          <input
            type="radio"
            name="mip-classification"
            :value="group"
            :checked="model.clasificacion === group"
            required
            :aria-invalid="Boolean(error('clasificacion'))"
            :aria-describedby="error('clasificacion') ? 'classification-error' : undefined"
            @change="updateClassification(group)"
            @blur="touched.clasificacion = true"
          />
          {{ PEST_GROUP_LABELS[group] }}
        </label>
      </div>
      <p v-if="kind === 'pests'" class="item-form__hint">
        Define si esta plaga se monitorea con trampas para rastreros o para voladores.
      </p>
      <p v-if="error('clasificacion')" id="classification-error" role="alert">
        {{ error('clasificacion') }}
      </p>
    </fieldset>

    <fieldset v-if="kind === 'pests'">
      <legend class="item-form__legend-with-help">
        <span>
          Categoría para productos
          <span class="item-form__required" aria-hidden="true">*</span>
        </span>
        <span class="item-form__help">
          <button
            type="button"
            class="item-form__help-button"
            aria-describedby="product-category-help"
            aria-label="Ayuda sobre la categoría para productos"
          >
            <CircleHelp :size="16" aria-hidden="true" />
          </button>
          <span id="product-category-help" class="item-form__tooltip" role="tooltip">
            Define qué tipo de producto se usa para controlar esta plaga. Los voladores se agrupan como insectos voladores; en rastreros se diferencian insectos rastreros y roedores.
          </span>
        </span>
      </legend>

      <div v-if="model.clasificacion === 'VOLADORES'" class="item-form__fixed-category">
        {{ PRODUCT_PEST_CATEGORY_LABELS.INSECTOS_VOLADORES }}
        <small>Se asigna automáticamente a las plagas voladoras.</small>
      </div>

      <div v-else-if="model.clasificacion === 'RASTREROS'" class="item-form__groups">
        <label
          v-for="category in RASTER_PRODUCT_CATEGORIES"
          :key="category"
          :class="{ selected: model.categoriaProducto === category }"
        >
          <input
            type="radio"
            name="mip-product-category"
            :value="category"
            :checked="model.categoriaProducto === category"
            required
            :aria-invalid="Boolean(error('categoriaProducto'))"
            :aria-describedby="error('categoriaProducto') ? 'product-category-error' : undefined"
            @change="update('categoriaProducto', category); touched.categoriaProducto = true"
            @blur="touched.categoriaProducto = true"
          />
          {{ PRODUCT_PEST_CATEGORY_LABELS[category] }}
        </label>
      </div>

      <p v-else class="item-form__hint">Selecciona primero el tipo de monitoreo.</p>
      <p v-if="error('categoriaProducto')" id="product-category-error" role="alert">
        {{ error('categoriaProducto') }}
      </p>
    </fieldset>
  </form>
</template>

<style scoped>
.item-form { display: grid; gap: var(--space-16); }
fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
legend { padding: 0; margin-bottom: var(--space-8); font-size: .875rem; }
.item-form__required, fieldset p[role='alert'] { color: var(--danger); }
fieldset p { margin: .5rem 0 0; font-size: .8125rem; }
.item-form__groups { display: flex; gap: var(--space-8); }
.item-form__groups label { display: flex; min-height: 44px; flex: 1; gap: var(--space-8); align-items: center; border: 1px solid var(--border); border-radius: var(--radius); padding: .65rem; cursor: pointer; }
.item-form__groups label.selected { border-color: var(--accent); background: var(--accent-subtle); }
.item-form__legend-with-help { display: flex; align-items: center; gap: var(--space-4); }
.item-form__help { position: relative; display: inline-flex; }
.item-form__help-button { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--text-secondary); cursor: help; }
.item-form__help-button:hover, .item-form__help-button:focus-visible { background: var(--surface-raised); color: var(--text); outline: 0; }
.item-form__help-button:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
.item-form__tooltip { position: absolute; z-index: 30; top: calc(100% + .4rem); left: 50%; width: min(19rem, calc(100vw - 3rem)); padding: .65rem .75rem; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface-raised); box-shadow: var(--shadow-dialog); color: var(--text); font-size: .8125rem; font-weight: 400; line-height: 1.4; opacity: 0; pointer-events: none; transform: translate(-50%, -.25rem); transition: opacity 120ms ease, transform 120ms ease; }
.item-form__help:hover .item-form__tooltip, .item-form__help:focus-within .item-form__tooltip { opacity: 1; transform: translate(-50%, 0); }
.item-form__fixed-category { display: grid; gap: var(--space-4); min-height: 44px; padding: .65rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); }
.item-form__fixed-category small, .item-form__hint { color: var(--text-secondary); }
input { accent-color: var(--accent); }
@media (max-width: 520px) {
  .item-form__groups { flex-direction: column; }
}
</style>
