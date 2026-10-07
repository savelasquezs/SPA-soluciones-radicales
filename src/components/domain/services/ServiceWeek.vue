<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { addDateDays, formatServiceDate, SERVICE_STATE_LABELS, todayBogota } from '@/helpers/adminServices'
import { layoutServiceDay, serviceWeekBounds, serviceWeekHours } from '@/helpers/serviceWeek'
import type { AdminService } from '@/types/adminServices'

const props=defineProps<{ from: string; records: AdminService[] }>()
const HOUR_HEIGHT=52
const bounds=computed(()=>serviceWeekBounds(props.records))
const hours=computed(()=>serviceWeekHours(bounds.value))
const bodyHeight=computed(()=>Math.max(HOUR_HEIGHT,(bounds.value.endMinute-bounds.value.startMinute)/60*HOUR_HEIGHT))
const days=computed(()=>Array.from({ length:7 },(_,index)=>{
  const date=addDateDays(props.from,index)
  return {
    date,
    label:new Intl.DateTimeFormat('es-CO',{ weekday:'short',day:'2-digit',month:'short',timeZone:'America/Bogota' }).format(new Date(`${date}T12:00:00-05:00`)),
    events:layoutServiceDay(props.records,date),
  }
}))
function offset(minute: number): number { return (minute-bounds.value.startMinute)/60*HOUR_HEIGHT }
function eventStyle(startMinute: number,endMinute: number,lane: number,laneCount: number) {
  const gap=4
  return {
    top:`${offset(startMinute)}px`,
    height:`${Math.max(24,(endMinute-startMinute)/60*HOUR_HEIGHT)}px`,
    left:`calc(${lane/laneCount*100}% + ${gap/2}px)`,
    width:`calc(${100/laneCount}% - ${gap}px)`,
  }
}
function hourLabel(minute: number): string {
  const hour=Math.floor(minute/60)
  return new Intl.DateTimeFormat('es-CO',{ hour:'numeric',minute:'2-digit',hour12:true,timeZone:'UTC' }).format(new Date(Date.UTC(2026,0,1,hour,minute%60)))
}
</script>
<template>
  <div class="svc-week-calendar" role="region" aria-label="Agenda semanal por horas" tabindex="0">
    <div class="svc-week-calendar__inner">
      <header class="svc-week-calendar__header">
        <div class="svc-week-calendar__gutter" aria-hidden="true"></div>
        <div v-for="day in days" :key="day.date" class="svc-week-calendar__day-heading" :class="{ 'is-today':day.date===todayBogota() }">{{ day.label }}</div>
      </header>
      <div class="svc-week-calendar__body" :style="{ height:`${bodyHeight}px` }">
        <div class="svc-week-calendar__time-axis" aria-hidden="true">
          <span v-for="minute in hours" :key="minute" class="svc-week-calendar__hour-label" :style="{ top:`${offset(minute)}px` }">{{ hourLabel(minute) }}</span>
        </div>
        <section v-for="(day,index) in days" :key="day.date" class="svc-week-calendar__day" :aria-label="day.label">
          <span v-for="minute in hours" :key="minute" class="svc-week-calendar__hour-line" :style="{ top:`${offset(minute)}px` }" aria-hidden="true"></span>
          <RouterLink
            v-for="event in day.events"
            :key="event.record.id"
            class="svc-week-calendar__event"
            :class="{ 'popover-left':index>=5 }"
            :style="eventStyle(event.startMinute,event.endMinute,event.lane,event.laneCount)"
            :to="{ name:'service-detail',params:{ id:event.record.id } }"
            :aria-label="`${event.record.clienteNombre}, ${event.record.sedeNombre}, ${formatServiceDate(event.record.inicioProgramado,true)} a ${formatServiceDate(event.record.finProgramado,true)}`"
          >
            <strong>{{ event.record.clienteNombre }}</strong>
            <small v-if="event.record.sedeNombre">{{ event.record.sedeNombre }}</small>
            <span class="svc-week-calendar__popover" role="tooltip">
              <strong>{{ event.record.clienteNombre }} · {{ event.record.sedeNombre }}</strong>
              <span>{{ formatServiceDate(event.record.inicioProgramado,true) }} – {{ formatServiceDate(event.record.finProgramado,true) }}</span>
              <span>{{ event.record.direccion }}</span>
              <span>Técnico: {{ event.record.responsable.nombreCompleto }}</span>
              <span>{{ SERVICE_STATE_LABELS[event.record.estado] }} · {{ event.record.tipoServicio==='REFUERZO' ? 'Refuerzo' : 'Principal' }}</span>
            </span>
          </RouterLink>
        </section>
      </div>
    </div>
  </div>
</template>
