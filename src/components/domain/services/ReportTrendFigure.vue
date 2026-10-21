<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Maximize2 } from 'lucide-vue-next'
import type { ReportHistoricalVisit } from '@/types/serviceResults'
import { REPORT_TREND_GEOMETRY as geometry, buildReportTrends, chartY, signedTrend } from '@/helpers/serviceTrends'
import { reportCategoryTotals, reportVisitAxisLabels, readableCaptureDelta, reportDelta } from '@/helpers/reportCharts'
import { bogotaDate, scoreText } from '@/helpers/serviceReport'

type Metric='compliance'|'captures'
const props=withDefaults(defineProps<{visits:ReportHistoricalVisit[];metric:Metric;expanded?:boolean}>(),
  {expanded:false})
const emit=defineEmits<{expand:[metric:Metric]}>()
const titleId=useId()
const trends=computed(()=>buildReportTrends(props.visits))
const plotted=computed(()=>trends.value.visits.map((visit,index)=>({
  ...visit,index,categories:reportCategoryTotals(visit),
  label:reportVisitAxisLabels(trends.value.visits)[index]??'—',
})))
const countFormat=new Intl.NumberFormat('es-CO')
const kinds=['voladores','rastreros'] as const
const maxCaptures=computed(()=>{
  const values=plotted.value.flatMap(v=>[v.categories.voladores,v.categories.rastreros])
    .filter((value):value is number=>value!==null)
  return Math.max(5,Math.ceil(Math.max(0,...values)/5)*5)
})
const selectedIndex=ref<number|null>(null)
const currentIndex=computed(()=>selectedIndex.value ?? (props.expanded?plotted.value.length-1:null))
const selected=computed(()=>currentIndex.value===null?null:plotted.value[currentIndex.value]??null)
const selectedPrevious=computed(()=>currentIndex.value===null||currentIndex.value<1?null:plotted.value[currentIndex.value-1]??null)
const heading=computed(()=>props.metric==='compliance'?'Cumplimiento de las medidas de prevención':'Capturas registradas en las trampas')
const change=computed(()=>props.metric==='compliance'
  ?signedTrend(trends.value.complianceChange,'pp')
  :signedTrend(trends.value.captureChange,'capturas'))
const maxY=computed(()=>props.metric==='compliance'?100:maxCaptures.value)
const crossX=computed(()=>selected.value?.x??null)
function select(index:number){selectedIndex.value=index}
function nearest(event:PointerEvent){
  if(!plotted.value.length)return
  const svg=event.currentTarget as SVGSVGElement
  const box=svg.getBoundingClientRect()
  if(!box.width)return
  const x=(event.clientX-box.left)*geometry.width/box.width
  let closest=0,delta=Infinity
  plotted.value.forEach((item,index)=>{
    const next=Math.abs(item.x-x)
    if(next<delta){delta=next;closest=index}
  })
  select(closest)
}
function clear(){selectedIndex.value=null}
function cy(value:number){return chartY(value,maxY.value)}
function categoryDelta(kind:'voladores'|'rastreros'){
  return selected.value&&selectedPrevious.value
    ?reportDelta(selected.value.categories[kind],selectedPrevious.value.categories[kind])
    :null
}
</script>

<template>
  <figure class="report-trend-figure" :class="{'report-trend-figure--expanded':expanded}"
    :data-testid="metric==='compliance'?'mip-trend-figure':'mip-captures-figure'">
    <div v-if="!expanded" class="report-trend-figure__head">
      <div class="report-trend-figure__head-text">
        <h3>{{ heading }}</h3>
      </div>
      <button class="report-chart-expand" type="button" :aria-label="'Ampliar ' + heading"
        @click="emit('expand',metric)"><Maximize2 :size="15" aria-hidden="true" /> <span>Ampliar</span></button>
    </div>
    <div class="report-trend-figure__change" :data-testid="metric==='compliance'?'mip-compliance-delta':'mip-captures-delta'">
      {{ change }}
    </div>
    <div v-if="metric==='captures'" class="report-trend-figure__legend" aria-label="Colores de las líneas">
      <span><i class="report-trend-figure__swatch--voladores" /> Voladores</span>
      <span><i class="report-trend-figure__swatch--rastreros" /> Rastreros</span>
    </div>
    <div class="report-trend-figure__visual">
      <svg :viewBox="'0 0 '+geometry.width+' '+geometry.height" class="report-trend-figure__svg"
        role="group" :aria-labelledby="titleId"
        :data-testid="(metric==='compliance'?'mip-compliance-chart':'mip-captures-chart')+(expanded?'-expanded':'')"
        @pointermove="nearest" @pointerdown="nearest" @pointerleave="clear">
        <title :id="titleId">{{ heading }} por fecha de visita</title>
        <g v-for="tick in metric==='compliance'?[0,50,100]:[0,Math.round(maxY/2),maxY]" :key="tick">
          <line :x1="geometry.left" :x2="geometry.right"
            :y1="cy(tick)" :y2="cy(tick)" stroke="var(--report-chart-grid)" stroke-width="1"
            :stroke-dasharray="tick===0?undefined:'3 4'" />
          <text :x="geometry.left-6" :y="cy(tick)+3" text-anchor="end" class="report-trend-figure__axis">
            {{ tick }}</text>
        </g>
        <template v-if="metric==='compliance'">
          <line v-for="(segment,index) in trends.complianceSegments" :key="index"
            :x1="segment.x1" :y1="segment.y1" :x2="segment.x2" :y2="segment.y2"
            stroke="var(--report-chart-compliance)" stroke-width="2.7" stroke-linecap="round" />
        </template>
        <template v-else>
          <g v-for="(visit,index) in plotted" :key="visit.solicitud+':lines'">
            <template v-if="index>0">
              <line v-if="visit.categories.voladores!==null && plotted[index-1]!.categories.voladores!==null"
                :x1="plotted[index-1]!.x" :y1="cy(plotted[index-1]!.categories.voladores!)"
                :x2="visit.x" :y2="cy(visit.categories.voladores!)"
                stroke="var(--report-chart-voladores)" stroke-width="2.7" stroke-linecap="round" />
              <line v-if="visit.categories.rastreros!==null && plotted[index-1]!.categories.rastreros!==null"
                :x1="plotted[index-1]!.x" :y1="cy(plotted[index-1]!.categories.rastreros!)"
                :x2="visit.x" :y2="cy(visit.categories.rastreros!)"
                stroke="var(--report-chart-rastreros)" stroke-width="2.7" stroke-linecap="round" />
            </template>
          </g>
        </template>
        <line v-if="crossX!==null" class="report-trend-figure__guide"
          :x1="crossX" :x2="crossX" :y1="geometry.top-7" :y2="geometry.bottom"
          stroke="var(--report-chart-guide)" stroke-width="1.4" stroke-dasharray="4 3" />
        <g v-for="(visit,index) in plotted" :key="visit.solicitud+':point'">
          <template v-if="metric==='compliance'">
            <template v-if="visit.complianceY!==null">
              <circle :cx="visit.x" :cy="visit.complianceY" :r="currentIndex===index?5.5:3.7"
                fill="var(--report-chart-compliance)" stroke="var(--report-chart-point-outline)" stroke-width="1.5" />
              <text :x="visit.x" :y="Math.max(visit.complianceY-11,19)" text-anchor="middle"
                class="report-trend-figure__value">{{ scoreText(visit.cumplimiento) }}</text>
            </template>
            <text v-else :x="visit.x" :y="geometry.bottom-9" text-anchor="middle"
              class="report-trend-figure__value">—</text>
          </template>
          <template v-else>
            <template v-for="kind in kinds" :key="kind">
              <template v-if="visit.categories[kind]!==null">
                <circle :cx="visit.x" :cy="cy(visit.categories[kind]!)" :r="currentIndex===index?5.5:3.7"
                  :fill="kind==='voladores'?'var(--report-chart-voladores)':'var(--report-chart-rastreros)'" stroke="var(--report-chart-point-outline)" stroke-width="1.3" />
                <text :x="visit.x" :y="kind==='voladores'?Math.max(cy(visit.categories[kind]!)-10,16):cy(visit.categories[kind]!)+12"
                  text-anchor="middle" class="report-trend-figure__value">
                  {{ countFormat.format(visit.categories[kind]!) }}</text>
              </template>
            </template>
            <text v-if="visit.categories.voladores===null && visit.categories.rastreros===null"
              :x="visit.x" :y="geometry.bottom-9" class="report-trend-figure__value"
              text-anchor="middle">S/M</text>
          </template>
          <text :x="visit.x" :y="geometry.bottom+22" text-anchor="middle"
            class="report-trend-figure__date">{{ visit.label }}</text>
          <rect :x="visit.x-14" :y="geometry.top-9" width="28"
            :height="geometry.bottom-geometry.top+14" fill="transparent"
            role="button" tabindex="0" class="report-trend-figure__hit"
            :data-testid="(metric==='compliance'?'mip-compliance-visit-':'mip-captures-visit-')+index+(expanded?'-expanded':'')"
            :aria-label="bogotaDate(visit.fecha)+(metric==='compliance'?': '+scoreText(visit.cumplimiento):': '+visit.captures+' capturas')"
            @pointerenter="select(index)" @focus="select(index)"
            @blur="clear" @click="select(index)" @keydown.enter.prevent="select(index)"
            @keydown.space.prevent="select(index)" />
        </g>
      </svg>
      <div v-if="selected" class="report-trend-figure__tooltip"
        :data-testid="metric==='compliance'?'mip-compliance-tooltip':'mip-captures-tooltip'"
        role="status">
        <strong>{{ bogotaDate(selected.fecha) }}</strong>
        <template v-if="metric==='compliance'">
          <span>{{ selected.cumplimiento===null?'Sin evaluación registrada':'Cumplimiento: '+scoreText(selected.cumplimiento) }}</span>
          <small>{{ selected.complianceDelta===null?'Sin visita anterior comparable':signedTrend(selected.complianceDelta,'pp')+' frente a la anterior' }}</small>
        </template>
        <template v-else>
          <span>Total: {{ countFormat.format(selected.captures) }} capturas</span>
          <span>Voladores: {{ selected.categories.voladores===null?'Sin monitoreo':countFormat.format(selected.categories.voladores) }}</span>
          <small>{{ readableCaptureDelta(categoryDelta('voladores')) }}</small>
          <span>Rastreros: {{ selected.categories.rastreros===null?'Sin monitoreo':countFormat.format(selected.categories.rastreros) }}</span>
          <small>{{ readableCaptureDelta(categoryDelta('rastreros')) }}</small>
        </template>
      </div>
    </div>
    <figcaption v-if="metric==='captures'">S/M: sin monitoreo.</figcaption>
  </figure>
</template>

<style scoped>
.report-trend-figure{margin:0;min-width:0;padding:.85rem;border:1px solid var(--report-border);border-radius:8px;background:var(--report-surface);break-inside:avoid}
.report-trend-figure__head{display:flex;align-items:flex-start;gap:.7rem;justify-content:space-between}
.report-trend-figure__head-text{min-width:0}
.report-trend-figure h3{font-size:.86rem;font-weight:670;line-height:1.35}
.report-chart-expand{flex-shrink:0;display:inline-flex;gap:.3rem;align-items:center;border:1px solid var(--report-border);color:var(--report-accent);background:var(--report-surface);padding:.35rem .42rem;border-radius:6px;font-size:.7rem;cursor:pointer}
.report-chart-expand:hover,.report-chart-expand:focus-visible{border-color:var(--report-accent);outline-offset:2px}
.report-trend-figure__change{font-size:.7rem;color:var(--report-accent);margin:.35rem 0 .15rem;font-weight:600}
.report-trend-figure__legend{display:flex;gap:1rem;align-items:center;margin:.35rem 0;font-size:.73rem;flex-wrap:wrap}
.report-trend-figure__legend span{display:inline-flex;gap:.35rem;align-items:center}
.report-trend-figure__legend i{display:inline-block;width:10px;height:10px;border-radius:50%;flex-shrink:0}
.report-trend-figure__swatch--voladores{background:var(--report-chart-voladores)}
.report-trend-figure__swatch--rastreros{background:var(--report-chart-rastreros)}
.report-trend-figure__visual{position:relative;min-width:0}
.report-trend-figure__svg{width:100%;max-height:205px;display:block;overflow:visible;touch-action:pan-y}
.report-trend-figure__axis,.report-trend-figure__date{font-size:9px;fill:var(--report-muted)}
.report-trend-figure__value{font-size:9px;font-weight:650;fill:var(--report-ink)}
.report-trend-figure__hit{cursor:crosshair;outline:none}
.report-trend-figure__hit:focus-visible{stroke:var(--report-accent);stroke-dasharray:3 3}
.report-trend-figure__tooltip{position:absolute;right:3px;top:3px;display:grid;gap:.18rem;max-width:195px;z-index:2;padding:.55rem .65rem;background:var(--report-tooltip);color:var(--report-ink);border:1px solid var(--report-border);border-radius:7px;box-shadow:0 5px 16px rgba(18,46,62,.12);font-size:.73rem;line-height:1.45;pointer-events:none}
.report-trend-figure__tooltip small{color:var(--report-muted);font-size:.7rem}
.report-trend-figure figcaption{font-size:.67rem;color:var(--report-muted);line-height:1.4;margin-top:.3rem}
.report-trend-figure--expanded{border:0;padding:0;color:var(--report-ink)}
.report-trend-figure--expanded .report-trend-figure__change{font-size:.81rem;margin:.05rem 0 .35rem}
.report-trend-figure--expanded .report-trend-figure__visual{display:grid;gap:.55rem}
.report-trend-figure--expanded .report-trend-figure__svg{
  width:100%;
  max-width:750px;
  min-height:0;
  max-height:none;
  height:auto;
  margin:0 auto;
}
.report-trend-figure--expanded .report-trend-figure__legend{color:var(--report-ink);margin:.2rem 0 .3rem}
.report-trend-figure--expanded .report-trend-figure__tooltip{
  position:static;
  width:100%;
  max-width:none;
  box-shadow:none;
  margin:0;
  padding:.6rem .7rem;
  font-size:.78rem;
  color:var(--report-ink);
  background:var(--report-light);
}
.report-trend-figure--expanded figcaption{font-size:.72rem;line-height:1.5;color:var(--report-muted);margin-top:.5rem}
@media(max-width:600px){
 .report-trend-figure--expanded .report-trend-figure__svg{max-width:100%;min-height:0;max-height:none}
 .report-trend-figure--expanded .report-trend-figure__axis,
 .report-trend-figure--expanded .report-trend-figure__date{fill:var(--report-muted)}
 .report-trend-figure--expanded .report-trend-figure__value{fill:var(--report-ink)}
}
@media print{
.report-chart-expand,.report-trend-figure__tooltip{display:none!important}
.report-trend-figure{padding:2mm 1.5mm;box-shadow:none;break-inside:avoid}
.report-trend-figure__svg{max-height:195px}
.report-trend-figure__date,.report-trend-figure__axis{fill:#617786!important}
.report-trend-figure__value{fill:#253744!important}
.report-trend-figure__change{color:#287FA8!important}
.report-trend-figure__legend i{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
</style>
