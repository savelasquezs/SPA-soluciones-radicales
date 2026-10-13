<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReportHistoricalVisit, ReportPestClassification } from '@/types/serviceResults'
import { buildSpeciesCharts } from '@/helpers/serviceSpecies'
import ReportSpeciesFigure from '@/components/domain/services/ReportSpeciesFigure.vue'
import ReportChartDialog from '@/components/domain/services/ReportChartDialog.vue'

const props=defineProps<{visits:ReportHistoricalVisit[]}>()
const charts=computed(()=>buildSpeciesCharts(props.visits))
const expandedCategory=ref<ReportPestClassification|null>(null)
const expandedChart=computed(()=>charts.value.find(chart=>chart.classification===expandedCategory.value))
</script>

<template>
  <div class="report-species" data-testid="mip-species-charts">
    <ReportSpeciesFigure v-for="chart in charts" :key="chart.classification"
      :chart="chart" :visits="visits" @expand="expandedCategory=$event" />
    <ReportChartDialog v-if="expandedCategory!==null&&expandedChart" :open="true"
      :title="expandedChart.title" @close="expandedCategory=null">
      <ReportSpeciesFigure :chart="expandedChart" :visits="visits" expanded />
    </ReportChartDialog>
  </div>
</template>

<style scoped>
.report-species{display:grid;grid-template-columns:1fr;gap:.75rem;margin-top:.85rem}
@media print{.report-species{gap:3mm}}
</style>
