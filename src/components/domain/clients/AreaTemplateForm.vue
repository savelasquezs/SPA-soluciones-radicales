<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import type { AreaTemplateInput } from '@/types/domain'

defineProps<{ clients: { id: string; nombre: string }[]; saving?: boolean }>()
const model = defineModel<AreaTemplateInput>({ required: true })
const emit = defineEmits<{ submit: []; invalid: [] }>()
const submitted = ref(false)
const nameKeys = computed(() => model.value.areas.map(area => area.nombre.trim().normalize('NFC').toLocaleLowerCase('es-CO')))
const duplicateKeys = computed(() => nameKeys.value.filter((key, index) => key && nameKeys.value.indexOf(key) !== index))
const invalidAreas = computed(() => model.value.areas.length < 1 || model.value.areas.length > 100 ||
  model.value.areas.some(area => !area.nombre.trim() || area.nombre.trim().length > 120) || duplicateKeys.value.length > 0)

function patch(patch: Partial<AreaTemplateInput>): void { model.value = { ...model.value, ...patch } }
function changeScope(value: string): void {
  patch({ alcance: value === 'PRIVADA' ? 'PRIVADA' : 'GLOBAL', clientId: null })
}
function changeName(index: number, nombre: string): void {
  patch({ areas: model.value.areas.map((area, position) => position === index ? { ...area, nombre } : area) })
}
function changeType(index: number, esExterna: boolean): void {
  patch({ areas: model.value.areas.map((area, position) => position === index ? { ...area, esExterna } : area) })
}
function addArea(): void {
  if (model.value.areas.length < 100) patch({ areas: [...model.value.areas, { nombre: '', esExterna: false }] })
}
function removeArea(index: number): void {
  if (model.value.areas.length > 1) patch({ areas: model.value.areas.filter((_, position) => position !== index) })
}
function submit(): void {
  submitted.value = true
  if (!model.value.nombre.trim() || model.value.nombre.trim().length > 120 ||
      (model.value.alcance === 'PRIVADA' && !model.value.clientId) || invalidAreas.value) {
    emit('invalid')
    return
  }
  emit('submit')
}
</script>

<template>
  <form id="area-template-form" class="template-form" novalidate :inert="saving || undefined" @submit.prevent="submit">
    <div class="template-form__meta">
      <BaseInput :model-value="modelValue.nombre" name="template-name" label="Nombre de la plantilla" maxlength="120" required
        :error="submitted && !modelValue.nombre.trim() ? 'Ingresa un nombre.' : undefined"
        @update:model-value="patch({ nombre: $event })" />
      <BaseSelect :model-value="modelValue.alcance" name="template-scope" label="Disponibilidad" @update:model-value="changeScope">
        <option value="GLOBAL">Global · todos los clientes</option>
        <option value="PRIVADA">Privada · un cliente</option>
      </BaseSelect>
      <BaseSelect v-if="modelValue.alcance === 'PRIVADA'" :model-value="modelValue.clientId ?? ''"
        name="template-client" label="Cliente" required :error="submitted && !modelValue.clientId ? 'Selecciona un cliente.' : undefined"
        @update:model-value="patch({ clientId: $event || null })">
        <option value="">Selecciona un cliente</option>
        <option v-for="client in clients" :key="client.id" :value="client.id">{{ client.nombre }}</option>
      </BaseSelect>
    </div>
    <section class="template-form__areas">
      <header>
        <div><strong>Áreas</strong><small>{{ modelValue.areas.length }} / 100</small></div>
        <BaseButton type="button" size="compact" variant="secondary" :disabled="modelValue.areas.length >= 100" @click="addArea">
          <Plus :size="15" />Agregar
        </BaseButton>
      </header>
      <div class="template-form__rows">
        <div v-for="(area, index) in modelValue.areas" :key="index" class="template-form__row">
          <BaseInput :model-value="area.nombre" :name="'template-area-' + index" :label="'Área ' + (index + 1)"
            maxlength="120" required :error="submitted && !area.nombre.trim() ? 'Nombre obligatorio.' : undefined"
            @update:model-value="changeName(index, $event)" />
          <BaseCheckbox :model-value="area.esExterna" :name="'template-external-' + index"
            label="Exterior" @update:model-value="changeType(index, $event)" />
          <BaseIconButton size="small" :label="'Quitar área ' + (index + 1)" :disabled="modelValue.areas.length === 1"
            @click="removeArea(index)"><Trash2 :size="16" /></BaseIconButton>
        </div>
      </div>
      <p v-if="submitted && invalidAreas" class="template-form__error" role="alert">Revisa los nombres: deben ser únicos y no estar vacíos (máximo 100 áreas).</p>
      <p class="template-form__help">Cada área se creará como interior o exterior. Podrás editarla después en cada sede sin cambiar la plantilla.</p>
    </section>
  </form>
</template>

<style scoped>
.template-form { display:grid; gap:0.9rem; }
.template-form__meta { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:0.55rem; }
.template-form__meta > :first-child, .template-form__meta > :last-child:nth-child(3) { grid-column:1/-1; }
.template-form__areas { display:grid; gap:0.5rem; padding-top:0.65rem; border-top:1px solid var(--border); }
.template-form__areas header, .template-form__areas header > div { display:flex; align-items:center; justify-content:space-between; gap:0.6rem; }
.template-form__areas header strong { font-size:0.9rem; }
.template-form__areas header small, .template-form__help { font-size:0.76rem; color:var(--text-secondary); }
.template-form__rows { display:grid; gap:0.4rem; }
.template-form__row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:end; gap:0.45rem; min-width:0; }
.template-form__row > :nth-child(2) { padding-bottom:0.05rem; }
.template-form__row > :last-child { margin-bottom:0.08rem; }
.template-form__help, .template-form__error { margin:0; }
.template-form__error { color:var(--danger); font-size:0.8rem; }
.template-form :deep(input:not([type='checkbox'])), .template-form :deep(select) { min-height:36px; padding:0.4rem 0.6rem; }
.template-form__row :deep(label) { min-height:34px; font-size:0.79rem; }
@media (max-width:540px) {
  .template-form__meta { grid-template-columns:1fr; }
  .template-form__row { grid-template-columns:minmax(0,1fr) auto; }
  .template-form__row > :nth-child(2) { grid-column:1; grid-row:2; }
  .template-form__row > :last-child { grid-column:2; grid-row:1; }
}
</style>
