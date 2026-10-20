<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import { useAppStore } from '@/stores/app'
import type { DashboardSnapshot } from '@/types/dashboard'

use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer])
type Kind = 'services' | 'value' | 'compliance'
const props=defineProps<{ kind:Kind; data:DashboardSnapshot['charts']; period:DashboardSnapshot['period'] }>()
const app=useAppStore()
const money=(amount:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(amount)
const short=(amount:number)=>Math.abs(amount)>=1_000_000?'$'+(amount/1_000_000).toLocaleString('es-CO',{maximumFractionDigits:1})+' M':
  Math.abs(amount)>=1_000?'$'+Math.round(amount/1_000).toLocaleString('es-CO')+' mil': '$'+amount.toLocaleString('es-CO')

function dateLabel(value:string):string {
  const date=new Date(value+'T12:00:00Z')
  const days=Math.round((Date.parse(props.period.to+'T00:00:00Z')-Date.parse(props.period.from+'T00:00:00Z'))/86_400_000)+1
  return new Intl.DateTimeFormat('es-CO',{
    month:'short',day:days<=120?'numeric':undefined,year:days>365?'2-digit':undefined,timeZone:'UTC'
  }).format(date)
}
const palette=computed(()=>{
  // resolvedTheme changes when Windows / Android changes appearance in System mode.
  const resolved=app.resolvedTheme
  const css=getComputedStyle(document.documentElement)
  const token=(name:string)=>css.getPropertyValue(name).trim()
  return {text:token('--text-secondary'),border:token('--border'),surface:token('--surface-raised'),
    completed:token('--success'),ongoing:token('--info'),scheduled:token('--warning'),
    cancelled:token('--danger'),money:resolved==='dark'?'#579DFF':'#0969DA',
    compliance:resolved==='dark'?'#A49AFF':'#6756C8'}
})
const items=computed(()=>props.data[props.kind])
const hasValues=computed(()=>{
  if(props.kind==='services')return props.data.services.some(p=>p.scheduled+p.ongoing+p.completed+p.cancelled>0)
  if(props.kind==='value')return props.data.value.some(p=>p.value>0)
  return props.data.compliance.some(p=>p.percentage!==null)
})
const option=computed<EChartsOption>(()=>{
  const p=palette.value
  const common={
    animation:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    color:[p.completed,p.ongoing,p.scheduled,p.cancelled],
    backgroundColor:'transparent',
    grid:{top:18,right:14,bottom:props.kind==='services'?54:24,left:8,containLabel:true},
    textStyle:{fontFamily:'Inter, sans-serif'},
    tooltip:{trigger:'axis' as const,backgroundColor:p.surface,borderColor:p.border,borderWidth:1,
      textStyle:{color:p.text,fontSize:12}},
    xAxis:{type:'category' as const,boundaryGap:props.kind==='services',
      data:items.value.map(x=>dateLabel(x.date)),axisLine:{lineStyle:{color:p.border}},
      axisTick:{show:false},axisLabel:{color:p.text,fontSize:11,hideOverlap:true}},
    yAxis:{type:'value' as const,min:0,
      max:props.kind==='compliance'?100:undefined,
      axisLabel:{color:p.text,fontSize:11,formatter:(v:number)=>props.kind==='value'?short(v):props.kind==='compliance'?v+'%':String(v)},
      axisLine:{show:false},axisTick:{show:false},splitLine:{lineStyle:{color:p.border,type:'dashed' as const,opacity:.55}}}
  }
  if(props.kind==='services')return {
    ...common,legend:{show:true,bottom:0,itemWidth:10,itemHeight:10,textStyle:{color:p.text,fontSize:11}},
    tooltip:{...common.tooltip,axisPointer:{type:'shadow' as const}},
    series:[
      {name:'Finalizados',type:'bar',stack:'total',barMaxWidth:42,data:props.data.services.map(x=>x.completed),itemStyle:{color:p.completed}},
      {name:'En proceso',type:'bar',stack:'total',barMaxWidth:42,data:props.data.services.map(x=>x.ongoing),itemStyle:{color:p.ongoing}},
      {name:'Programados',type:'bar',stack:'total',barMaxWidth:42,data:props.data.services.map(x=>x.scheduled),itemStyle:{color:p.scheduled}},
      {name:'Cancelados',type:'bar',stack:'total',barMaxWidth:42,data:props.data.services.map(x=>x.cancelled),itemStyle:{color:p.cancelled}}
    ]
  } as EChartsOption
  if(props.kind==='value')return {
    ...common,color:[p.money],
    tooltip:{...common.tooltip,valueFormatter:(value:unknown)=>money(Number(value))},
    xAxis:{...common.xAxis,boundaryGap:false},
    series:[{name:'Valor realizado',type:'line',smooth:.25,symbol:'circle',symbolSize:7,
      lineStyle:{width:3,color:p.money},itemStyle:{color:p.money},
      areaStyle:{opacity:.12,color:p.money},data:props.data.value.map(x=>x.value)}]
  } as EChartsOption
  return {
    ...common,color:[p.compliance],
    tooltip:{...common.tooltip,valueFormatter:(value:unknown)=>value==null?'Sin evaluación':Number(value).toLocaleString('es-CO')+' %'},
    xAxis:{...common.xAxis,boundaryGap:false},
    yAxis:{...common.yAxis,axisLabel:{color:p.text,fontSize:11,formatter:(v:number)=>v+'%'}},
    series:[{name:'Cumplimiento',type:'line',smooth:.2,connectNulls:false,symbol:'circle',symbolSize:7,
      lineStyle:{width:3,color:p.compliance},itemStyle:{color:p.compliance},areaStyle:{opacity:.1,color:p.compliance},
      data:props.data.compliance.map(x=>x.percentage)}]
  } as EChartsOption
})
</script>

<template>
  <div class="dashboard-chart-box">
    <VChart v-if="hasValues" :option="option" autoresize renderer="svg" class="dashboard-chart" />
    <div v-else class="dashboard-chart-empty">No hay registros en este período.</div>
  </div>
</template>

<style scoped>
.dashboard-chart-box{width:100%;height:245px;min-width:0;position:relative}
.dashboard-chart{width:100%;height:100%}
.dashboard-chart-empty{height:100%;display:grid;place-items:center;text-align:center;color:var(--text-secondary);font-size:.8rem}
@media(max-width:680px){.dashboard-chart-box{height:218px}}
</style>
