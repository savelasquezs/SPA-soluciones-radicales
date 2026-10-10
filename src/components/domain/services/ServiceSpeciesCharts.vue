<script setup lang="ts">
import { computed, useId } from 'vue'
import type { ReportHistoricalVisit } from '@/types/serviceResults'
import { SPECIES_CHART as geometry, buildSpeciesCharts } from '@/helpers/serviceSpecies'
import { bogotaDate } from '@/helpers/serviceReport'

const props=defineProps<{visits:ReportHistoricalVisit[]}>()
const charts=computed(()=>buildSpeciesCharts(props.visits))
const titleIds=[useId(),useId()]
const format=new Intl.NumberFormat('es-CO')
const y=(value:number,max:number)=>geometry.bottom-value/max*(geometry.bottom-geometry.top)
</script>

<template>
  <div class="report-species" data-testid="mip-species-charts">
    <figure v-for="(chart,index) in charts" :key="chart.classification" class="report-species__figure"
      :data-testid="'mip-species-' + chart.classification.toLowerCase()">
      <h3>{{ chart.title }}</h3>
      <p class="report-species__hint">Individuos registrados por especie en todos los puestos de cada visita.</p>
      <p v-if="!chart.hasHistory" class="report-species__empty">Aún no hay visitas para comparar.</p>
      <p v-else-if="!chart.hasMonitoring" class="report-species__empty">Sin monitoreo registrado de esta categoría en las visitas consultadas.</p>
      <template v-else>
        <p v-if="!chart.species.length" class="report-species__empty">No se registraron capturas de esta categoría en las visitas monitoreadas.</p>
        <svg v-else :viewBox="'0 0 ' + geometry.width + ' ' + geometry.height" class="report-species__svg"
          :aria-labelledby="titleIds[index]" role="img">
          <title :id="titleIds[index]">{{ chart.title }}. Capturas por especie de las últimas visitas.</title>
          <g v-for="tick in [0, Math.round(chart.max/2), chart.max]" :key="tick">
            <line :x1="geometry.left" :x2="geometry.right" :y1="y(tick,chart.max)"
              :y2="y(tick,chart.max)" stroke="#dce5e9" stroke-width="1" />
            <text :x="geometry.left-8" :y="y(tick,chart.max)+3" text-anchor="end" class="report-species__axis">{{ format.format(tick) }}</text>
          </g>
          <g v-for="visit in chart.visits" :key="visit.solicitud">
            <template v-if="visit.hasMonitoring">
              <rect v-for="bar in visit.bars.filter(item=>item.count>0)" :key="bar.code"
                :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height"
                :fill="bar.color" rx="1" tabindex="0"
                :aria-label="bar.name + ': ' + format.format(bar.count) + ' capturas el ' + bogotaDate(visit.fecha)">
                <title>{{ bogotaDate(visit.fecha) }} · {{ bar.name }}: {{ format.format(bar.count) }}</title>
              </rect>
              <text v-if="visit.total===0" :x="visit.center" :y="geometry.bottom-7"
                text-anchor="middle" class="report-species__axis">0</text>
            </template>
            <text v-else :x="visit.center" :y="geometry.bottom-7"
              text-anchor="middle" class="report-species__missing">S/M</text>
            <text :x="visit.center" :y="geometry.bottom+20"
              text-anchor="middle" class="report-species__date">{{ visit.label }}</text>
          </g>
        </svg>
        <div v-if="chart.species.length" class="report-species__legend" aria-label="Especies registradas">
          <span v-for="item in chart.species" :key="item.code">
            <i aria-hidden="true" :style="{background:item.color}" />{{ item.name }}
          </span>
        </div>
        <p class="report-species__footnote">S/M = sin puestos revisados de esta categoría. Un 0 representa monitoreo sin capturas.</p>
      </template>
    </figure>
  </div>
</template>

<style scoped>
.report-species{display:grid;grid-template-columns:1fr;gap:.65rem;margin-top:1rem}
.report-species__figure{min-width:0;margin:0;padding:.75rem .85rem;border:1px solid var(--report-border);border-radius:7px;background:#fff;break-inside:avoid;page-break-inside:avoid}
.report-species__figure h3{font-size:.82rem;font-weight:650}
.report-species__hint,.report-species__footnote{font-size:.67rem;color:var(--report-muted);line-height:1.4}
.report-species__hint{margin:.15rem 0 .25rem!important}
.report-species__footnote{margin:.35rem 0 0!important}
.report-species__empty{font-size:.76rem;color:var(--report-muted);padding:.45rem 0}
.report-species__svg{width:100%;max-height:190px;display:block;overflow:visible}
.report-species__axis,.report-species__missing{font-size:10px;fill:var(--report-muted)}
.report-species__date{font-size:11px;fill:var(--report-ink)}
.report-species__legend{display:flex;gap:.35rem .85rem;flex-wrap:wrap;font-size:.72rem}
.report-species__legend span{display:inline-flex;align-items:center;gap:.3rem}
.report-species__legend i{display:inline-block;width:9px;height:9px;border-radius:2px;flex-shrink:0}
.report-species__svg rect:focus-visible{stroke:var(--report-ink);stroke-width:2;outline:none}
@media print{
  .report-species__figure{border-color:#dce5e9;padding:2mm 3mm;break-inside:avoid;page-break-inside:avoid}
  .report-species__svg{max-height:175px}
  .report-species__axis,.report-species__missing{fill:#607482!important}
  .report-species__date{fill:#1d3445!important}
  .report-species__svg rect{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .report-species__legend i{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
</style>
