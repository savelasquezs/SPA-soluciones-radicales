<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { addDateDays, formatServiceDate, SERVICE_STATE_LABELS, toBogotaInput } from '@/helpers/adminServices'
import type { AdminService } from '@/types/adminServices'
const props=defineProps<{ from: string; records: AdminService[] }>()
const days=computed(()=>Array.from({ length:7 },(_,index)=>{
  const date=addDateDays(props.from,index)
  return { date,label:new Intl.DateTimeFormat('es-CO',{ weekday:'short',day:'2-digit',month:'short',timeZone:'America/Bogota' }).format(new Date(`${date}T12:00:00-05:00`)),records:props.records.filter(record=>toBogotaInput(record.inicioProgramado).slice(0,10)===date) }
}))
</script>
<template>
  <div class="svc-week" aria-label="Agenda semanal">
    <section v-for="day in days" :key="day.date" class="svc-week-day">
      <h2>{{ day.label }}</h2>
      <RouterLink v-for="record in day.records" :key="record.id" class="svc-week-event" :to="{ name:'service-detail',params:{ id:record.id } }">
        <span>{{ formatServiceDate(record.inicioProgramado,true) }} – {{ formatServiceDate(record.finProgramado,true) }}</span>
        <strong>{{ record.clienteNombre }}</strong><small>{{ record.sedeNombre }} · {{ record.responsable.nombreCompleto }}</small>
        <small>{{ record.tipoServicio==='REFUERZO' ? 'Refuerzo' : 'Principal' }}</small>
        <span class="svc-state" :class="`svc-state--${record.estado}`">{{ SERVICE_STATE_LABELS[record.estado] }}</span>
      </RouterLink>
      <p v-if="!day.records.length" class="svc-muted svc-small">Sin servicios</p>
    </section>
  </div>
</template>
