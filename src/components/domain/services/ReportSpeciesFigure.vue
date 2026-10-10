<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Maximize2 } from 'lucide-vue-next'
import type { ReportHistoricalVisit } from '@/types/serviceResults'
import type { SpeciesChart } from '@/helpers/serviceSpecies'
import { SPECIES_CHART as geometry } from '@/helpers/serviceSpecies'
import { reportCapturePlaces } from '@/helpers/reportCharts'
import { bogotaDate } from '@/helpers/serviceReport'

const props=withDefaults(defineProps<{
  chart:SpeciesChart;visits:ReportHistoricalVisit[];expanded?:boolean
}>(),{expanded:false})
const emit=defineEmits<{expand:[classification:'VOLADORES'|'RASTREROS']}>()
const titleId=useId()
const countFormat=new Intl.NumberFormat('es-CO')
const selectedIndex=ref<number|null>(null)
const selectedCode=ref<string|null>(null)
const visibleIndex=computed(()=>selectedIndex.value??(props.expanded?props.chart.visits.length-1:null))
const visit=computed(()=>visibleIndex.value===null?null:props.chart.visits[visibleIndex.value]??null)
const sourceVisit=computed(()=>props.visits.find(item=>item.solicitud===visit.value?.solicitud
  && item.fecha===visit.value?.fecha))
const selectedBar=computed(()=>{
  if(!visit.value)return null
  return visit.value.bars.find(bar=>bar.code===selectedCode.value)
    ??visit.value.bars.slice().sort((a,b)=>b.count-a.count)[0]??null
})
const locations=computed(()=>sourceVisit.value
  ?reportCapturePlaces(sourceVisit.value,props.chart.classification,selectedBar.value?.code)
  :[])
const fullLocations=computed(()=>sourceVisit.value
  ?reportCapturePlaces(sourceVisit.value,props.chart.classification):[])
const showTooltip=computed(()=>visit.value!==null)
function activate(index:number,code?:string){
  selectedIndex.value=index
  const bars=props.chart.visits[index]?.bars??[]
  selectedCode.value=code??bars.slice().sort((a,b)=>b.count-a.count)[0]?.code??null
}
function nearest(event:PointerEvent){
  if(!props.chart.visits.length)return
  const svg=event.currentTarget as SVGSVGElement
  const bounds=svg.getBoundingClientRect()
  if(!bounds.width)return
  const x=(event.clientX-bounds.left)*geometry.width/bounds.width
  const centers=props.chart.visits.map(visit=>visit.center)
  let index=0
  for(let i=1;i<centers.length;i++)if(Math.abs(centers[i]!-x)<Math.abs(centers[index]!-x))index=i
  const bars=props.chart.visits[index]?.bars??[]
  const nearestBar=bars.slice().sort((a,b)=>
    Math.abs(a.x+a.width/2-x)-Math.abs(b.x+b.width/2-x))[0]
  activate(index,nearestBar?.code)
}
function clear(){selectedIndex.value=null;selectedCode.value=null}
const y=(value:number)=>geometry.bottom-value/props.chart.max*(geometry.bottom-geometry.top)
</script>

<template>
  <figure class="report-species-figure" :class="{'report-species-figure--expanded':expanded}"
    :data-testid="'mip-species-'+chart.classification.toLowerCase()+(expanded?'-expanded':'')">
    <div v-if="!expanded" class="report-species-figure__head">
      <div class="report-species-figure__head-text">
        <h3>{{ chart.title }}</h3>
      </div>
      <button class="report-chart-expand" type="button"
        :aria-label="'Ampliar ' + chart.title"
        @click="emit('expand',chart.classification)">
        <Maximize2 :size="15" aria-hidden="true" /> <span>Ampliar</span>
      </button>
    </div>
    <p v-if="!chart.hasHistory" class="report-species-figure__empty">Todavía no hay visitas para comparar.</p>
    <p v-else-if="!chart.hasMonitoring" class="report-species-figure__empty">
      No hubo puestos revisados de esta categoría en las visitas consultadas.</p>
    <template v-else>
      <p v-if="!chart.species.length" class="report-species-figure__empty">
        Se revisaron puestos, pero no se registraron capturas de esta categoría.</p>
      <div v-else class="report-species-figure__visual">
        <svg :viewBox="'0 0 '+geometry.width+' '+geometry.height"
          :aria-labelledby="titleId" role="group" class="report-species-figure__svg"
          :data-testid="'mip-species-chart-'+chart.classification.toLowerCase()+(expanded?'-expanded':'')"
          @pointermove="nearest" @pointerdown="nearest" @pointerleave="clear">
          <title :id="titleId">{{ chart.title }} por fecha de visita</title>
          <g v-for="tick in [...new Set([0,Math.round(chart.max/2),chart.max])]" :key="tick">
            <line :x1="geometry.left" :x2="geometry.right" :y1="y(tick)" :y2="y(tick)"
              stroke="var(--report-chart-grid)" stroke-width="1" :stroke-dasharray="tick===0?undefined:'3 4'"/>
            <text :x="geometry.left-8" :y="y(tick)+3" text-anchor="end"
              class="report-species-figure__axis">{{ countFormat.format(tick) }}</text>
          </g>
          <g v-for="(date,index) in chart.visits" :key="date.solicitud+':bars'">
            <line v-if="visibleIndex===index" class="report-species-figure__guide"
              :x1="date.center" :x2="date.center" :y1="geometry.top-6"
              :y2="geometry.bottom" stroke="var(--report-chart-guide)" stroke-width="1.6" stroke-dasharray="4 3" />
            <template v-if="date.hasMonitoring">
              <rect v-for="bar in date.bars.filter(item=>item.count>0)" :key="bar.code"
                :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height"
                :fill="bar.color" class="report-species-figure__bar" :opacity="visibleIndex===null||visibleIndex!==index||selectedBar?.code===bar.code?1:.62"
                rx="2" :aria-label="bar.name+': '+countFormat.format(bar.count)+' capturas el '+bogotaDate(date.fecha)">
                <title>{{ bogotaDate(date.fecha) }} · {{ bar.name }}: {{ countFormat.format(bar.count) }}</title>
              </rect>
              <text v-for="bar in chart.species.length<=4?date.bars.filter(item=>item.count>0&&item.width>=9):[]"
                :key="'value:'+bar.code" :x="bar.x+bar.width/2" :y="Math.max(bar.y-5,11)"
                text-anchor="middle" class="report-species-figure__value">{{ bar.count }}</text>
              <text v-if="date.total===0" :x="date.center" :y="geometry.bottom-8"
                text-anchor="middle" class="report-species-figure__axis">0</text>
            </template>
            <text v-else :x="date.center" :y="geometry.bottom-7"
              text-anchor="middle" class="report-species-figure__axis">S/M</text>
            <text :x="date.center" :y="geometry.bottom+20" text-anchor="middle"
              class="report-species-figure__date">{{ date.label }}</text>
            <rect :x="date.center-(geometry.right-geometry.left)/chart.visits.length/2"
              :y="geometry.top-9" :width="(geometry.right-geometry.left)/chart.visits.length"
              :height="geometry.bottom-geometry.top+15" fill="transparent"
              class="report-species-figure__hit" tabindex="0" role="button"
              :data-testid="'mip-species-visit-'+chart.classification.toLowerCase()+'-'+index+(expanded?'-expanded':'')"
              :aria-label="bogotaDate(date.fecha)+', '+date.total+' capturas registradas'"
              @focus="activate(index)" @blur="clear"
              @click="activate(index)" @keydown.enter.prevent="activate(index)"
              @keydown.space.prevent="activate(index)"/>
          </g>
        </svg>
        <div v-if="showTooltip&&visit" class="report-species-figure__tooltip" role="status"
          :data-testid="'mip-species-tooltip-'+chart.classification.toLowerCase()">
          <strong>{{ bogotaDate(visit.fecha) }}</strong>
          <span v-if="!visit.hasMonitoring">No se revisaron puestos de esta categoría.</span>
          <template v-else-if="selectedBar&&selectedBar.count>0">
            <span>{{ selectedBar.name }}: <strong>{{ countFormat.format(selectedBar.count) }}</strong> capturas</span>
            <div v-for="(place,index) in locations.slice(0,3)" :key="index" class="report-species-figure__place">
              {{ place.area }} · Puesto {{ place.puesto }} · {{ place.ubicacion }}: {{ place.cantidad }}
            </div>
            <small v-if="locations.length>3">Hay {{ locations.length-3 }} puesto(s) más. Amplía la gráfica para verlos.</small>
            <small v-if="!locations.length">El desglose por ubicación no está disponible en esta versión del informe.</small>
          </template>
          <span v-else>No se registraron capturas en esa visita.</span>
        </div>
      </div>
      <div class="report-species-figure__legend" aria-label="Colores de las especies">
        <span v-for="item in chart.species" :key="item.code">
          <i :style="{backgroundColor:item.color}" aria-hidden="true"/>{{ item.name }}
        </span>
      </div>
      <p class="report-species-figure__note">S/M: sin monitoreo · 0: sin capturas.</p>
      <section v-if="expanded&&visit&&visit.hasMonitoring" class="report-species-figure__detail">
        <h4>¿Dónde se encontraron en esta visita?</h4>
        <p v-if="!fullLocations.length" class="report-species-figure__empty">No hubo capturas registradas.</p>
        <p v-else-if="!sourceVisit?.detallesCapturas" class="report-species-figure__empty">
          No hay desglose histórico por ubicación para esta visita.</p>
        <table v-else>
          <thead><tr><th>Área y ubicación</th><th>Especie</th><th>Cantidad</th></tr></thead>
          <tbody>
            <tr v-for="(entry,index) in fullLocations" :key="index">
              <td><strong>{{ entry.area }}</strong><small>Puesto {{ entry.puesto }} · {{ entry.ubicacion }}</small></td>
              <td>{{ entry.plagaNombreSnapshot }}</td><td class="report-species-figure__numeric">{{ countFormat.format(entry.cantidad) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </figure>
</template>

<style scoped>
.report-species-figure{margin:0;min-width:0;padding:.85rem;border:1px solid var(--report-border);border-radius:8px;background:var(--report-surface);break-inside:avoid}
.report-species-figure__head{display:flex;align-items:flex-start;justify-content:space-between;gap:.7rem}
.report-species-figure__head-text{min-width:0}
.report-species-figure h3{font-size:.86rem;font-weight:670;line-height:1.35}
.report-chart-expand{flex-shrink:0;display:inline-flex;gap:.3rem;align-items:center;border:1px solid var(--report-border);color:var(--report-accent);background:var(--report-surface);padding:.35rem .42rem;border-radius:6px;font-size:.7rem;cursor:pointer}
.report-chart-expand:hover,.report-chart-expand:focus-visible{border-color:var(--report-accent);outline-offset:2px}
.report-species-figure__empty{font-size:.74rem;color:var(--report-muted);padding:.5rem 0}
.report-species-figure__visual{position:relative;min-width:0}
.report-species-figure__svg{display:block;width:100%;max-height:190px;overflow:visible;touch-action:pan-y}
.report-species-figure__axis,.report-species-figure__date{font-size:10px;fill:var(--report-muted)}
.report-species-figure__value{font-size:9px;font-weight:650;fill:var(--report-ink)}
.report-species-figure__hit{cursor:crosshair;outline:none}
.report-species-figure__hit:focus-visible{stroke:var(--report-accent);stroke-width:1.5;stroke-dasharray:3 4}
.report-species-figure__tooltip{position:absolute;right:4px;top:3px;display:grid;gap:.22rem;max-width:min(75%,260px);padding:.55rem .65rem;border:1px solid var(--report-border);border-radius:7px;background:var(--report-tooltip);box-shadow:0 6px 16px rgba(22,48,70,.12);font-size:.73rem;z-index:2;pointer-events:none}
.report-species-figure__tooltip small{font-size:.66rem;color:var(--report-muted)}
.report-species-figure__place{font-size:.68rem;line-height:1.3;color:var(--report-muted)}
.report-species-figure__legend{display:flex;flex-wrap:wrap;gap:.3rem .8rem;font-size:.72rem;margin:.25rem 0}
.report-species-figure__legend span{display:inline-flex;align-items:center;gap:.32rem}
.report-species-figure__legend i{height:10px;width:10px;border-radius:3px;flex-shrink:0}
.report-species-figure__note{font-size:.67rem;color:var(--report-muted);line-height:1.45;margin:.4rem 0 0!important}
.report-species-figure--expanded{border:0;padding:0}
.report-species-figure--expanded .report-species-figure__svg{max-height:400px;min-height:230px}
.report-species-figure--expanded .report-species-figure__tooltip{position:static;max-width:none;margin:.4rem 0;box-shadow:none}
.report-species-figure__detail{margin:.75rem 0 0}
.report-species-figure__detail h4{font-size:.8rem;font-weight:650;margin:0 0 .45rem}
.report-species-figure__detail table{width:100%;border-collapse:collapse;font-size:.72rem}
.report-species-figure__detail th,.report-species-figure__detail td{padding:.45rem .4rem;border-bottom:1px solid var(--report-border);vertical-align:top;text-align:left;overflow-wrap:anywhere}
.report-species-figure__detail th{font-size:.67rem;color:var(--report-muted);background:var(--report-light)}
.report-species-figure__detail td small{display:block;color:var(--report-muted)}
.report-species-figure__numeric{text-align:right!important;font-variant-numeric:tabular-nums}
@media print{
.report-chart-expand,.report-species-figure__tooltip,.report-species-figure__detail{display:none!important}
.report-species-figure{padding:2mm 3mm;break-inside:avoid}
.report-species-figure__svg{max-height:175px}
.report-species-figure__axis,.report-species-figure__date{fill:#617786!important}
.report-species-figure__value{fill:#253744!important}
.report-species-figure__legend i,.report-species-figure__svg rect{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
</style>
