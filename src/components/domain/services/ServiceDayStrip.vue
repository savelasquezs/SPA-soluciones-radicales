<script setup lang="ts">
import { computed } from 'vue'
import { addDateDays, todayBogota } from '@/helpers/adminServices'

const props=defineProps<{ from: string; selectedDate: string; counts: Record<string,number> }>()
const emit=defineEmits<{ select: [date: string] }>()
const today=todayBogota()
const weekday=new Intl.DateTimeFormat('es-CO',{ weekday:'short',timeZone:'UTC' })
const days=computed(()=>Array.from({length:7},(_,index)=>{
  const date=addDateDays(props.from,index)
  const label=weekday.format(new Date(date+'T12:00:00Z')).replace('.','')
  return { date,label,count:props.counts[date] ?? 0,number:Number(date.slice(8,10)) }
}))
</script>

<template>
  <nav class="svc-day-strip" aria-label="Días de la semana">
    <button v-for="day in days" :key="day.date" type="button"
      class="svc-day-strip__day" :class="{ 'is-active':day.date===selectedDate,'is-today':day.date===today }"
      :aria-pressed="day.date===selectedDate"
      :aria-label="day.label+' '+day.number+' · '+day.count+' '+(day.count===1?'servicio':'servicios')"
      @click="emit('select',day.date)">
      <span class="svc-day-strip__weekday">{{ day.label }}</span>
      <strong>{{ day.number }}</strong>
      <span class="svc-day-strip__dot" :class="{ 'is-visible':day.count>0 }" aria-hidden="true"></span>
    </button>
  </nav>
</template>

<style scoped>
.svc-day-strip { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(44px,1fr); gap:0.15rem; min-width:0; overflow-x:auto; scrollbar-width:none; scroll-snap-type:x proximity; padding:0.15rem 0; }
.svc-day-strip::-webkit-scrollbar { display:none; }
.svc-day-strip__day { min-width:44px; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.05rem; padding:0.2rem 0.1rem; border:1px solid transparent; border-radius:var(--radius); background:transparent; color:var(--text-secondary); cursor:pointer; scroll-snap-align:center; }
.svc-day-strip__day strong { color:var(--text); font-weight:600; font-size:0.88rem; line-height:1.25; }
.svc-day-strip__weekday { font-size:0.69rem; text-transform:capitalize; line-height:1.1; }
.svc-day-strip__day.is-active { background:var(--accent-subtle); border-color:var(--accent); color:var(--text); }
.svc-day-strip__day.is-today:not(.is-active) strong { color:var(--accent); }
.svc-day-strip__dot { width:4px; height:4px; flex:none; border-radius:50%; background:transparent; }
.svc-day-strip__dot.is-visible { background:var(--accent); }
.svc-day-strip__day:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
@media(max-width:360px) { .svc-day-strip { grid-auto-columns:44px; } }
</style>
