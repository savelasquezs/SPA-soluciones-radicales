<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseSpinner from '@/components/base/BaseSpinner.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ErrorState from '@/components/base/ErrorState.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import InsightFilters from './InsightFilters.vue'
import InsightPagination from './InsightPagination.vue'
import MonitoringPointDetail from './MonitoringPointDetail.vue'
import { useInsightList } from '@/composables/useInsightList'
import { listMonitoringPoints } from '@/services/siteInsightsService'
import { conditionLabel, conditionTone, insightDate } from '@/helpers/siteInsights'
import type { MonitoringPoint } from '@/types/siteInsights'
import './site-insights.css'

const props = defineProps<{ siteId: string; active: boolean }>()
const selected = shallowRef<MonitoringPoint | null>(null)
const { data, items, page, filters, loading, error, load, changeFilters, resetFilters } = useInsightList<MonitoringPoint>(
  () => props.siteId, () => props.active, (query, signal) => listMonitoringPoints(props.siteId,query,signal),
)
watch(() => [props.siteId,props.active], () => { selected.value = null })
</script>

<template>
  <section class="site-insights" aria-label="Puestos de monitoreo">
    <header class="insight-heading"><div><h2>Puestos de monitoreo</h2><span v-if="data" class="insight-count">{{ data.total }} {{ data.total === 1 ? 'puesto' : 'puestos' }}</span><BaseSpinner v-if="loading && data" size="small" label="Actualizando puestos" /></div><BaseIconButton label="Actualizar puestos de monitoreo" size="small" :disabled="loading" @click="load"><RefreshCw :size="17" /></BaseIconButton></header>
    <InsightFilters mode="points" :model-value="filters" :areas="data?.areas" :traps="data?.traps" @update:model-value="changeFilters" @reset="resetFilters" />
    <LoadingSkeleton v-if="loading && !data" label="Cargando puestos de monitoreo" :lines="6" />
    <ErrorState v-else-if="error && !data" title="No pudimos cargar los puestos" :message="error"><BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></ErrorState>
    <template v-else>
      <div v-if="error" class="insight-feedback" role="alert">{{ error }}<BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></div>
      <EmptyState v-if="!items.length" title="No hay puestos para mostrar" message="Los puestos registrados por el técnico aparecerán aquí. Revisa los filtros." />
      <ResponsiveTable v-else :aria-busy="loading">
        <template #table><div class="insight-scroll"><table class="insight-table"><thead><tr><th scope="col" style="width:18%">Puesto</th><th scope="col" style="width:30%">Área y ubicación</th><th scope="col" style="width:22%">Condición</th><th scope="col" style="width:30%">Última revisión finalizada</th></tr></thead><tbody><tr v-for="point in items" :key="point.id"><td><button class="insight-link" :aria-label="`Ver puesto ${point.number}`" @click="selected = point">{{ point.number }}</button><small>{{ point.trapName }}</small></td><td>{{ point.areaName }}<small>{{ point.location }}</small><small v-if="!point.areaActive">Área inactiva</small></td><td><div class="insight-tags"><StatusBadge :tone="conditionTone(point.condition)">{{ conditionLabel(point.condition) }}</StatusBadge><StatusBadge v-if="!point.enabled" tone="neutral">No habilitado</StatusBadge></div></td><td><template v-if="point.lastReview"><RouterLink class="insight-link" :to="`/servicios/${point.lastReview.id}`">{{ point.lastReview.number }}</RouterLink><small>{{ insightDate(point.lastReview.date) }}</small></template><span v-else class="insight-muted">Sin revisiones finalizadas</span><small v-if="point.inProgress" class="insight-provisional">Revisión en curso</small></td></tr></tbody></table></div></template>
        <template #cards><article v-for="point in items" :key="point.id" class="insight-mobile-card"><header><button class="insight-link" @click="selected = point">Puesto {{ point.number }}</button><StatusBadge :tone="conditionTone(point.condition)">{{ conditionLabel(point.condition) }}</StatusBadge></header><p>{{ point.trapName }} · {{ point.areaName }}</p><p class="insight-muted">{{ point.location }}</p><div class="insight-tags"><StatusBadge v-if="!point.enabled" tone="neutral">No habilitado</StatusBadge><span v-if="point.inProgress" class="insight-provisional">Revisión en curso</span></div><p class="insight-muted">Última finalizada: {{ point.lastReview ? insightDate(point.lastReview.date) : 'Sin revisiones' }}</p></article></template>
      </ResponsiveTable>
      <InsightPagination :page="page" :page-size="data?.pageSize ?? 20" :total="data?.total ?? 0" :loading="loading" @change="page = $event" />
    </template>
    <MonitoringPointDetail v-if="selected && active" :key="selected.id" :site-id="siteId" :point="selected" @close="selected = null" />
  </section>
</template>
