<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReportHistoricalVisit } from '@/types/serviceResults'
import ReportTrendFigure from '@/components/domain/services/ReportTrendFigure.vue'
import ReportChartDialog from '@/components/domain/services/ReportChartDialog.vue'
import { buildReportTrends } from '@/helpers/serviceTrends'
import { reportCategoryTotals, reportDelta } from '@/helpers/reportCharts'

type Metric='compliance'|'captures'
const props=defineProps<{visits:ReportHistoricalVisit[]}>()
const trends=computed(()=>buildReportTrends(props.visits))
const expandedMetric=ref<Metric|null>(null)
const expandedTitle=computed(()=>expandedMetric.value==='compliance'?
  'Cumplimiento de las medidas de prevención':'Capturas registradas en las trampas')
const expandedDescription=computed(()=>expandedMetric.value==='compliance'?
  'Un porcentaje más alto indica mayor cumplimiento de las medidas revisadas.':
  'Azul: voladores. Naranja: rastreros. Selecciona una fecha para comparar las capturas.')
const summary=computed(()=>{
  const visits=trends.value.visits
  if(visits.length<2)return 'Con una sola visita todavía no se pueden comparar resultados.'
  const current=visits[visits.length-1]!,previous=visits[visits.length-2]!
  const sentences:string[]=[]
  if(current.complianceDelta!==null){
    const difference=Math.abs(current.complianceDelta).toLocaleString('es-CO',{maximumFractionDigits:1})
    sentences.push(current.complianceDelta===0
      ?'El cumplimiento de las medidas se mantuvo igual que en la visita anterior.'
      :current.complianceDelta>0
        ?'El cumplimiento de las medidas subió '+difference+' puntos porcentuales.'
        :'El cumplimiento de las medidas bajó '+difference+' puntos porcentuales.')
  }
  const a=reportCategoryTotals(current),b=reportCategoryTotals(previous)
  for(const kind of ['voladores','rastreros'] as const){
    const difference=reportDelta(a[kind],b[kind])
    if(difference===null)continue
    const name=kind==='voladores'?'voladoras':'rastreras'
    sentences.push(difference===0
      ?'Se registró la misma cantidad de capturas '+name+'.'
      :difference>0
        ?'Se registraron '+difference.toLocaleString('es-CO')+' capturas '+name+' más que en la visita anterior.'
        :'Se registraron '+Math.abs(difference).toLocaleString('es-CO')+' capturas '+name+' menos que en la visita anterior.')
  }
  if(sentences.length===0)return 'No hay suficientes mediciones comparables entre estas dos visitas.'
  sentences.push('Las capturas muestran lo que encontraron las trampas; por sí solas no confirman que haya más o menos plagas.')
  return sentences.join(' ')
})
</script>

<template>
  <div v-if="!trends.visits.length" class="report-document__empty">Aún no hay visitas anteriores para comparar.</div>
  <div v-else class="report-trends">
    <ReportTrendFigure metric="compliance" :visits="visits" @expand="expandedMetric=$event" />
    <ReportTrendFigure metric="captures" :visits="visits" @expand="expandedMetric=$event" />
    <p class="report-trends__summary" data-testid="mip-trend-summary">{{ summary }}</p>
    <ReportChartDialog v-if="expandedMetric!==null" :open="true"
      :title="expandedTitle" :description="expandedDescription"
      @close="expandedMetric=null">
      <ReportTrendFigure :metric="expandedMetric" :visits="visits" expanded />
    </ReportChartDialog>
  </div>
</template>

<style scoped>
.report-trends{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;align-items:start}
.report-trends__summary{grid-column:1/-1;margin:0;padding:.7rem .85rem;border-left:3px solid var(--report-accent);font-size:.77rem;line-height:1.6;color:var(--report-ink);background:var(--report-light)}
@media(max-width:720px){.report-trends{grid-template-columns:1fr;gap:.75rem}}
@media print{.report-trends{grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm}.report-trends__summary{font-size:7.5pt;break-inside:avoid}}
</style>
