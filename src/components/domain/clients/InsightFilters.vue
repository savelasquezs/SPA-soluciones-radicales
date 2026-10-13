<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { InsightFilters, InsightOption } from '@/types/siteInsights'

const props = defineProps<{ modelValue: InsightFilters; mode: 'points' | 'findings' | 'reviews'; areas?: InsightOption[]; traps?: InsightOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: InsightFilters]; reset: [] }>()
const uid = useId()
const expanded = ref(false)
const range = computed(() => ({ from: props.modelValue.from, to: props.modelValue.to }))
const filterCount = computed(() => [props.modelValue.area,props.modelValue.state,props.modelValue.active,props.modelValue.trap,props.modelValue.from || props.modelValue.to].filter(Boolean).length)
function update(key: keyof InsightFilters, value: string): void { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
</script>

<template>
  <div class="insight-filters" :class="`insight-filters--${mode}`">
    <BaseInput v-if="mode !== 'reviews'" class="insight-filters__search" :name="`${uid}-search`" label="Buscar" type="search" :maxlength="200" :model-value="modelValue.search" :placeholder="mode === 'points' ? 'Número, ubicación o trampa' : 'Descripción o responsable'" @update:model-value="update('search', $event)" />
    <BaseButton v-if="mode !== 'reviews'" class="insight-filters__toggle" size="compact" variant="secondary" :aria-expanded="expanded" :aria-controls="`${uid}-filters`" @click="expanded = !expanded"><SlidersHorizontal :size="16" />Filtros{{ filterCount ? ` (${filterCount})` : '' }}</BaseButton>
    <div :id="`${uid}-filters`" class="insight-filters__advanced" :class="{ 'insight-filters__advanced--expanded': expanded || mode === 'reviews' }">
      <BaseSelect v-if="mode !== 'reviews'" :name="`${uid}-area`" label="Área" :model-value="modelValue.area" @update:model-value="update('area', $event)"><option value="">Todas las áreas</option><option v-for="area in areas" :key="area.value" :value="area.value">{{ area.label }}</option></BaseSelect>
      <BaseSelect v-if="mode === 'points'" :name="`${uid}-trap`" label="Trampa" :model-value="modelValue.trap" @update:model-value="update('trap', $event)"><option value="">Todas las trampas</option><option v-for="trap in traps" :key="trap.value" :value="trap.value">{{ trap.label }}</option></BaseSelect>
      <BaseSelect :name="`${uid}-state`" :label="mode === 'points' ? 'Condición' : 'Estado'" :model-value="modelValue.state" @update:model-value="update('state', $event)">
        <option value="">Todos</option>
        <template v-if="mode === 'points'"><option value="ACTIVO">Operativo</option><option value="DANADO">Dañado</option><option value="FUERA_DE_USO">Fuera de uso</option></template>
        <template v-else-if="mode === 'findings'"><option value="PENDING">Pendientes</option><option value="ABIERTO">Abierto</option><option value="EN_PROCESO">En proceso</option><option value="CERRADO">Cerrado</option></template>
        <template v-else><option value="FINALIZADO">Finalizado</option><option value="EN_PROCESO">En curso</option></template>
      </BaseSelect>
      <BaseSelect v-if="mode === 'points'" :name="`${uid}-active`" label="Habilitación" :model-value="modelValue.active" @update:model-value="update('active', $event)"><option value="">Todos</option><option value="true">Habilitados</option><option value="false">No habilitados</option></BaseSelect>
      <BaseDateRangePicker v-else class="insight-filters__dates" :name="`${uid}-dates`" :label="mode === 'findings' ? 'Fecha de apertura' : 'Fecha del servicio'" :model-value="range" clearable @update:model-value="emit('update:modelValue', { ...modelValue, ...$event })" />
      <BaseButton class="insight-filters__reset" size="compact" variant="ghost" @click="emit('reset')">Limpiar</BaseButton>
    </div>
  </div>
</template>

<style scoped>
.insight-filters { display:flex; align-items:end; flex-wrap:wrap; gap:0.65rem; }
.insight-filters__search { flex:1.5 1 12rem; min-width:0; }
.insight-filters__toggle { display:none; }
.insight-filters__advanced { display:flex; flex:4 1 36rem; align-items:end; flex-wrap:wrap; gap:0.65rem; min-width:0; }
.insight-filters__advanced > :not(button) { flex:1 1 7rem; min-width:0; }
.insight-filters__advanced .insight-filters__dates { flex:2 1 18rem; }
.insight-filters__reset { align-self:end; }
.insight-filters--reviews .insight-filters__advanced { flex-basis:100%; }
@media (min-width:761px) { .insight-filters :deep(input), .insight-filters :deep(select) { min-height:36px; padding:0.4rem 0.6rem; font-size:0.8125rem; } .insight-filters :deep(label) { font-size:0.75rem; } }
@media (max-width:760px) {
  .insight-filters { display:grid; grid-template-columns:minmax(0,1fr) auto; }
  .insight-filters__toggle { display:inline-flex; }
  .insight-filters__advanced { display:none; grid-column:1/-1; }
  .insight-filters__advanced--expanded { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
  .insight-filters__advanced .insight-filters__dates { grid-column:1/-1; }
  .insight-filters__reset { justify-self:start; }
  .insight-filters :deep(input), .insight-filters :deep(select) { font-size:1rem; }
}
</style>
