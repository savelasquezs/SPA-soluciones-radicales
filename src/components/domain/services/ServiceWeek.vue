<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowUpRight, Plus } from 'lucide-vue-next'
import { addDateDays, formatServiceDate, SERVICE_STATE_LABELS, todayBogota, toBogotaInput } from '@/helpers/adminServices'
import { layoutServiceDay, serviceWeekBounds, serviceWeekHours, serviceWeekInstantAt, snapServiceWeekMinute } from '@/helpers/serviceWeek'
import type { AdminService } from '@/types/adminServices'

const props=withDefaults(defineProps<{ from: string; records: AdminService[]; busy?: boolean; singleDay?: string }>(),{ busy:false,singleDay:'' })
const emit=defineEmits<{ create: [start: string]; open: [record: AdminService]; move: [record: AdminService,start: string] }>()
const HOUR_HEIGHT=46
const dayRecords=computed(()=>props.singleDay
  ? props.records.filter(record=>toBogotaInput(record.inicioProgramado).slice(0,10)===props.singleDay) : props.records)
const bounds=computed(()=>serviceWeekBounds(dayRecords.value))
const hours=computed(()=>serviceWeekHours(bounds.value))
const bodyHeight=computed(()=>Math.max(HOUR_HEIGHT,(bounds.value.endMinute-bounds.value.startMinute)/60*HOUR_HEIGHT))
const days=computed(()=>Array.from({ length:props.singleDay ? 1 : 7 },(_,index)=>{
  const date=props.singleDay || addDateDays(props.from,index)
  return {
    date,
    label:new Intl.DateTimeFormat('es-CO',{ weekday:'short',day:'2-digit',timeZone:'America/Bogota' }).format(new Date(date+'T12:00:00-05:00')),
    events:layoutServiceDay(dayRecords.value,date),
  }
}))
const dragging=ref<AdminService | null>(null)
let activePointer: { id: number; x: number; y: number; grabMinutes: number; record: AdminService } | null=null
let ignoreClickUntil=0
const dropPreview=ref<{ date:string; minute:number } | null>(null)
const createPreview=ref<{ date:string; minute:number } | null>(null)

function offset(minute: number): number { return (minute-bounds.value.startMinute)/60*HOUR_HEIGHT }
function eventStyle(startMinute: number,endMinute: number,lane: number,laneCount: number) {
  const gap=3
  return {
    top:offset(startMinute)+'px',
    height:Math.max(26,(endMinute-startMinute)/60*HOUR_HEIGHT)+'px',
    left:'calc('+(lane/laneCount*100)+'% + '+(gap/2)+'px)',
    width:'calc('+(100/laneCount)+'% - '+gap+'px)',
  }
}
function hourLabel(minute: number): string {
  const hour=Math.floor(minute/60)
  return new Intl.DateTimeFormat('es-CO',{ hour:'numeric',minute:'2-digit',hour12:true,timeZone:'UTC' }).format(new Date(Date.UTC(2026,0,1,hour,minute%60)))
}
function minuteAt(event: MouseEvent | PointerEvent, grab = 0): number {
  const target=event.currentTarget as HTMLElement | null
  if(!target) return bounds.value.startMinute
  const position=event.clientY-target.getBoundingClientRect().top
  return snapServiceWeekMinute(bounds.value.startMinute+position/HOUR_HEIGHT*60-grab,bounds.value)
}
function createAt(date: string, minute: number): void {
  if(props.busy || date<todayBogota()) return
  let start=serviceWeekInstantAt(date,minute)
  if(start && new Date(start).getTime()<=Date.now()) {
    // A click on an elapsed slot today should prefill a usable future hour.
    const future=toBogotaInput(new Date(Date.now()+30*60_000).toISOString())
    const [hours,minutes]=future.slice(11,16).split(':').map(Number)
    const nextMinute=Math.ceil((hours!*60+minutes!)/15)*15
    start=serviceWeekInstantAt(future.slice(0,10),Math.min(23*60+45,nextMinute))
  }
  if(start) emit('create',start)
}
function hoverSlot(event: PointerEvent, date: string): void {
  if(event.pointerType!=='mouse' || dragging.value || props.busy || date<todayBogota()) return
  createPreview.value={ date,minute:minuteAt(event) }
}
function pickDropPosition(x: number,y: number): { date:string; minute:number } | null {
  const target=document.elementFromPoint(x,y)
  const day=target?.closest<HTMLElement>('.svc-week-calendar__day')
  if(!day?.dataset.date || !activePointer) return null
  const position=y-day.getBoundingClientRect().top
  const minute=snapServiceWeekMinute(bounds.value.startMinute+position/HOUR_HEIGHT*60-activePointer.grabMinutes,bounds.value)
  return { date:day.dataset.date,minute }
}
function pointerMove(event: PointerEvent): void {
  const point=activePointer
  if(!point || event.pointerId!==point.id || props.busy) return
  if(!dragging.value && Math.hypot(event.clientX-point.x,event.clientY-point.y)<7) return
  if(!dragging.value) {
    dragging.value=point.record
    createPreview.value=null
  }
  dropPreview.value=pickDropPosition(event.clientX,event.clientY)
  if(event.cancelable) event.preventDefault()
}
function stopPointer(): void {
  activePointer=null
  dragging.value=null
  dropPreview.value=null
  window.removeEventListener('pointermove',pointerMove)
  window.removeEventListener('pointerup',pointerUp)
  window.removeEventListener('pointercancel',stopPointer)
}
function pointerUp(event: PointerEvent): void {
  const point=activePointer
  if(!point || event.pointerId!==point.id) return
  const position=dragging.value ? pickDropPosition(event.clientX,event.clientY) : null
  if(dragging.value) ignoreClickUntil=Date.now()+500
  stopPointer()
  if(!position || props.busy) return
  const start=serviceWeekInstantAt(position.date,position.minute)
  if(start && new Date(start).getTime()!==new Date(point.record.inicioProgramado).getTime()) emit('move',point.record,start)
}
function pointerDown(event: PointerEvent, record: AdminService): void {
  if(props.busy || record.estado!=='PROGRAMADO' || event.pointerType!=='mouse' || event.button!==0) return
  stopPointer()
  const target=event.currentTarget as HTMLElement
  activePointer={ id:event.pointerId,x:event.clientX,y:event.clientY,
    grabMinutes:Math.max(0,(event.clientY-target.getBoundingClientRect().top)/HOUR_HEIGHT*60),record }
  window.addEventListener('pointermove',pointerMove,{ passive:false })
  window.addEventListener('pointerup',pointerUp)
  window.addEventListener('pointercancel',stopPointer)
}
function clickRecord(event: MouseEvent, record: AdminService): void {
  if(Date.now()<ignoreClickUntil) { event.preventDefault();return }
  emit('open',record)
}
onBeforeUnmount(stopPointer)
function dropStyle(minute: number, duration: number) {
  return { top:offset(minute)+'px',height:Math.max(HOUR_HEIGHT*0.5,duration/60*HOUR_HEIGHT)+'px' }
}
function duration(record: AdminService): number {
  return Math.max(15,(new Date(record.finProgramado).getTime()-new Date(record.inicioProgramado).getTime())/60_000)
}
</script>
<template>
  <div class="svc-week-calendar" :class="{ 'svc-week-calendar--day':singleDay }" role="region" :aria-label="singleDay ? 'Horario del día' : 'Agenda semanal por horas'" tabindex="0">
    <div class="svc-week-calendar__inner">
      <header class="svc-week-calendar__header">
        <div class="svc-week-calendar__gutter" aria-hidden="true"></div>
        <div v-for="day in days" :key="day.date" class="svc-week-calendar__day-heading" :class="{ 'is-today':day.date===todayBogota() }">
          <span>{{ day.label }}</span>
          <button type="button" class="svc-week-calendar__day-create" :disabled="busy || day.date<todayBogota()" :aria-label="'Programar servicio el '+day.label" title="Programar servicio" @click="createAt(day.date,9*60)">
            <Plus :size="15" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div class="svc-week-calendar__body" :style="{ height:bodyHeight+'px' }">
        <div class="svc-week-calendar__time-axis" aria-hidden="true">
          <span v-for="minute in hours" :key="minute" class="svc-week-calendar__hour-label" :style="{ top:offset(minute)+'px' }">{{ hourLabel(minute) }}</span>
        </div>
        <section v-for="(day,index) in days" :key="day.date" class="svc-week-calendar__day" :data-date="day.date" :aria-label="day.label">
          <span v-for="minute in hours" :key="minute" class="svc-week-calendar__hour-line" :style="{ top:offset(minute)+'px' }" aria-hidden="true"></span>
          <button
            type="button"
            class="svc-week-calendar__slot-target"
            :class="{ 'is-past':day.date<todayBogota() }"
            :data-date="day.date"
            :aria-label="'Elegir una hora para programar servicio el '+day.label"
            :aria-disabled="busy || day.date<todayBogota()"
            @pointermove="hoverSlot($event,day.date)"
            @pointerleave="createPreview=null"
            @click="createAt(day.date,minuteAt($event))"
          ></button>
          <span
            v-if="createPreview?.date===day.date && !dragging"
            class="svc-week-calendar__slot-indicator"
            :style="{ top:offset(createPreview.minute)+'px' }"
            aria-hidden="true"
          >+ {{ hourLabel(createPreview.minute) }}</span>
          <div
            v-if="dropPreview?.date===day.date && dragging"
            class="svc-week-calendar__drop-preview"
            :style="dropStyle(dropPreview.minute,duration(dragging))"
            aria-hidden="true"
          >{{ hourLabel(dropPreview.minute) }}</div>
          <div
            v-for="event in day.events"
            :key="event.record.id"
            class="svc-week-calendar__event"
            :class="['svc-week-calendar__event--'+event.record.estado,{ 'popover-left':index>=5, 'is-dragging':dragging?.id===event.record.id }]"
            :style="eventStyle(event.startMinute,event.endMinute,event.lane,event.laneCount)"
            :data-service-id="event.record.id"
          >
            <button
              type="button"
              class="svc-week-calendar__event-main"
              :class="{ 'svc-week-calendar__event-main--brief':singleDay && event.endMinute-event.startMinute<60 }"
              :disabled="busy"
              @pointerdown="pointerDown($event,event.record)"
              :aria-label="(event.record.estado==='PROGRAMADO' ? 'Reprogramar ' : 'Ver ')+event.record.solicitud+' · '+event.record.clienteNombre"
              @click="clickRecord($event,event.record)"
            >
              <template v-if="singleDay && event.endMinute-event.startMinute<60">
                <span class="svc-week-calendar__event-brief">{{ hourLabel(event.startMinute) }} · {{ event.record.clienteNombre }}</span>
              </template>
              <template v-else>
                <span class="svc-week-calendar__event-time">{{ hourLabel(event.startMinute) }} <span v-if="event.record.tipoServicio==='REFUERZO'">· Ref.</span></span>
                <strong>{{ event.record.clienteNombre }}</strong>
                <small v-if="event.record.sedeNombre">{{ event.record.sedeNombre }}</small>
              </template>
            </button>
            <RouterLink class="svc-week-calendar__event-detail" :to="{ name:'service-detail',params:{ id:event.record.id } }" :aria-label="'Ver detalle de '+event.record.solicitud" title="Ver detalle" @click.stop>
              <ArrowUpRight :size="13" aria-hidden="true" />
            </RouterLink>
            <span class="svc-week-calendar__popover" role="tooltip">
              <strong>{{ event.record.solicitud }} · {{ event.record.clienteNombre }} · {{ event.record.sedeNombre }}</strong>
              <span>{{ formatServiceDate(event.record.inicioProgramado) }} · {{ formatServiceDate(event.record.inicioProgramado,true) }} – {{ formatServiceDate(event.record.finProgramado,true) }}</span>
              <span>{{ event.record.direccion }}</span>
              <span>Técnico: {{ event.record.responsable.nombreCompleto }}</span>
              <span>{{ SERVICE_STATE_LABELS[event.record.estado] }} · {{ event.record.tipoServicio==='REFUERZO' ? 'Refuerzo' : 'Principal' }}</span>
              <span v-if="event.record.estado==='PROGRAMADO'" class="svc-week-calendar__popover-hint">Arrastra para mover · pulsa para reprogramar</span>
            </span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
