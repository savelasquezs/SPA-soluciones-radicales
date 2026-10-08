<script setup lang="ts">
import { computed, useId } from 'vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { InsightFilters, InsightOption } from '@/types/siteInsights'

const props = defineProps<{ modelValue: InsightFilters; mode: 'points' | 'findings' | 'reviews'; areas?: InsightOption[]; traps?: InsightOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: InsightFilters]; reset: [] }>()
const uid = useId()
const range = computed(() => ({ from: props.modelValue.from, to: props.modelValue.to }))
function update(key: keyof InsightFilters, value: string): void { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
</script>

<template>
  <div class="insight-filters" :class="`insight-filters--${mode}`">
    <BaseInput v-if="mode !== 'reviews'" class="insight-filters__search" :name="`${uid}-search`" label="Buscar" type="search" :maxlength="200" :model-value="modelValue.search" :placeholder="mode === 'points' ? 'Número, ubicación o trampa' : 'Descripción o responsable'" @update:model-value="update('search', $event)" />
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
</template>

<style scoped>
.insight-filters { display:flex; align-items:end; flex-wrap:wrap; gap:0.65rem; }
.insight-filters > :not(button) { flex:1 1 8.5rem; min-width:0; }
.insight-filters .insight-filters__search { flex:2 1 12rem; }
.insight-filters .insight-filters__dates { flex:2 1 18rem; }
.insight-filters__reset { align-self:end; }
@media (min-width:761px) { .insight-filters :deep(input), .insight-filters :deep(select) { min-height:36px; padding:0.4rem 0.6rem; font-size:0.8125rem; } .insight-filters :deep(label) { font-size:0.75rem; } }
@media (max-width:760px) { .insight-filters .insight-filters__search, .insight-filters .insight-filters__dates { flex-basis:100%; } .insight-filters :deep(input), .insight-filters :deep(select) { font-size:1rem; } }
</style>
