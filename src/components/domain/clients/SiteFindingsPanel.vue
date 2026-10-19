<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Camera, RefreshCw } from 'lucide-vue-next'
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
import FindingDetail from './FindingDetail.vue'
import { useInsightList } from '@/composables/useInsightList'
import { listSiteFindings } from '@/services/siteInsightsService'
import { findingLabel, findingTone, insightDate } from '@/helpers/siteInsights'
import type { SiteFinding } from '@/types/siteInsights'
import './site-insights.css'
const props = defineProps<{ siteId: string; active: boolean }>()
const selected = shallowRef<SiteFinding | null>(null)
const route=useRoute()
const fromDashboard=route.query.tab==='findings'
const initialState=fromDashboard && ['ABIERTO','EN_PROCESO','CERRADO'].includes(String(route.query.findingState))
  ? String(route.query.findingState) : 'PENDING'
const initialSearch=fromDashboard && typeof route.query.findingSearch==='string' ? route.query.findingSearch.slice(0,160) : ''
const { data, items, page, filters, loading, error, load, changeFilters, resetFilters } = useInsightList<SiteFinding>(
  () => props.siteId, () => props.active, (query, signal) => listSiteFindings(props.siteId,query,signal), { state: initialState,search: initialSearch },
)
watch(() => [props.siteId,props.active], () => { selected.value = null })
</script>
<template>
  <section class="site-insights" aria-label="Hallazgos">
    <header class="insight-heading"><div><h2>Hallazgos</h2><span v-if="data" class="insight-count">{{ data.total }} {{ data.total === 1 ? 'hallazgo' : 'hallazgos' }}</span><BaseSpinner v-if="loading && data" size="small" label="Actualizando hallazgos" /></div><BaseIconButton label="Actualizar hallazgos" size="small" :disabled="loading" @click="load"><RefreshCw :size="17" /></BaseIconButton></header>
    <InsightFilters mode="findings" :model-value="filters" :areas="data?.areas" @update:model-value="changeFilters" @reset="resetFilters" />
    <LoadingSkeleton v-if="loading && !data" label="Cargando hallazgos" :lines="6" />
    <ErrorState v-else-if="error && !data" title="No pudimos cargar los hallazgos" :message="error"><BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></ErrorState>
    <template v-else>
      <div v-if="error" class="insight-feedback" role="alert">{{ error }}<BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></div>
      <EmptyState v-if="!items.length" :title="filters.state === 'PENDING' ? 'Sin hallazgos pendientes' : 'No hay hallazgos para mostrar'" message="Revisa los filtros o consulta todos los estados."><BaseButton size="compact" variant="secondary" @click="filters.state = ''">Ver todos los estados</BaseButton></EmptyState>
      <ResponsiveTable v-else :aria-busy="loading">
        <template #table><div class="insight-scroll"><table class="insight-table"><thead><tr><th scope="col" style="width:36%">Hallazgo</th><th scope="col" style="width:18%">Área</th><th scope="col" style="width:18%">Apertura</th><th scope="col" style="width:16%">Responsable</th><th scope="col" style="width:12%">Estado</th></tr></thead><tbody><tr v-for="finding in items" :key="finding.id"><td><button class="insight-link finding-description" @click="selected = finding">{{ finding.description }}</button><small v-if="finding.photos.length"><Camera :size="13" aria-hidden="true" /> {{ finding.photos.length }} fotos</small><small v-if="finding.openingService.state === 'EN_PROCESO'" class="insight-provisional">Servicio en curso</small></td><td>{{ finding.areaName }}</td><td>{{ insightDate(finding.openedAt) }}<small><RouterLink class="insight-link" :to="`/servicios/${finding.openingService.id}`">{{ finding.openingService.number }}</RouterLink></small></td><td>{{ finding.responsibleName }}</td><td><StatusBadge :tone="findingTone(finding.state)">{{ findingLabel(finding.state) }}</StatusBadge></td></tr></tbody></table></div></template>
        <template #cards><article v-for="finding in items" :key="finding.id" class="insight-mobile-card"><header><StatusBadge :tone="findingTone(finding.state)">{{ findingLabel(finding.state) }}</StatusBadge><span class="insight-muted">{{ insightDate(finding.openedAt) }}</span></header><button class="insight-link finding-description" @click="selected = finding">{{ finding.description }}</button><p class="insight-muted">{{ finding.areaName }} · {{ finding.responsibleName }}</p><p v-if="finding.photos.length" class="insight-muted"><Camera :size="14" aria-hidden="true" /> {{ finding.photos.length }} fotos</p><span v-if="finding.openingService.state === 'EN_PROCESO'" class="insight-provisional">Servicio en curso</span></article></template>
      </ResponsiveTable>
      <InsightPagination :page="page" :page-size="data?.pageSize ?? 20" :total="data?.total ?? 0" :loading="loading" @change="page = $event" />
    </template>
    <FindingDetail v-if="selected && active" :key="selected.id" :site-id="siteId" :finding="selected" @close="selected = null" />
  </section>
</template>
<style scoped>
.finding-description { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; line-height:1.5; }
</style>
