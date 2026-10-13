<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReportHistoricalVisit } from '@/types/serviceResults'
import ReportTrendFigure from '@/components/domain/services/ReportTrendFigure.vue'
import ReportChartDialog from '@/components/domain/services/ReportChartDialog.vue'
import { buildReportTrends } from '@/helpers/serviceTrends'

type Metric='compliance'|'captures'
const props=defineProps<{visits:ReportHistoricalVisit[]}>()
const trends=computed(()=>buildReportTrends(props.visits))
const expandedMetric=ref<Metric|null>(null)
const expandedTitle=computed(()=>expandedMetric.value==='compliance'?
  'Cumplimiento de las medidas de prevención':'Capturas registradas en las trampas')
</script>

<template>
  <div v-if="!trends.visits.length" class="report-document__empty">Aún no hay visitas anteriores para comparar.</div>
  <div v-else class="report-trends">
    <ReportTrendFigure metric="compliance" :visits="visits" @expand="expandedMetric=$event" />
    <ReportTrendFigure metric="captures" :visits="visits" @expand="expandedMetric=$event" />
    <ReportChartDialog v-if="expandedMetric!==null" :open="true"
      :title="expandedTitle"
      @close="expandedMetric=null">
      <ReportTrendFigure :metric="expandedMetric" :visits="visits" expanded />
    </ReportChartDialog>
  </div>
</template>

<style scoped>
.report-trends{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;align-items:start}
@media(max-width:720px){.report-trends{grid-template-columns:1fr;gap:.75rem}}
@media print{.report-trends{grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm}}
</style>
