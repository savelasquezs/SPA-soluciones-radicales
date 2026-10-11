<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Plus } from 'lucide-vue-next'
import { formatServiceDate, SERVICE_STATE_LABELS, todayBogota, toBogotaInput } from '@/helpers/adminServices'
import type { AdminService } from '@/types/adminServices'

const props=withDefaults(defineProps<{ date: string; records: AdminService[]; busy?: boolean }>(),{busy:false})
const emit=defineEmits<{ open: [record: AdminService]; create: [date: string] }>()
const time=new Intl.DateTimeFormat('es-CO',{ hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Bogota' })
const readableDate=computed(()=>new Intl.DateTimeFormat('es-CO',{ weekday:'long',day:'numeric',month:'long',timeZone:'UTC' })
  .format(new Date(props.date+'T12:00:00Z')))
function interval(record: AdminService): string {
  const endDate=toBogotaInput(record.finProgramado).slice(0,10)
  return time.format(new Date(record.inicioProgramado))+'–'+time.format(new Date(record.finProgramado))
    +(endDate!==props.date ? ' · '+formatServiceDate(record.finProgramado) : '')
}
</script>

<template>
  <section class="svc-day-list" aria-label="Servicios del día">
    <header class="svc-day-list__header">
      <h2>{{ readableDate }}</h2>
      <span>{{ records.length }} {{ records.length===1 ? 'servicio' : 'servicios' }}</span>
    </header>
    <ul v-if="records.length" class="svc-day-list__items">
      <li v-for="record in records" :key="record.id" :data-service-id="record.id">
        <button type="button" class="svc-day-list__record" :disabled="busy"
          :aria-label="(record.estado==='PROGRAMADO' ? 'Reprogramar ' : 'Ver ')+record.solicitud+' · '+record.clienteNombre"
          @click="emit('open',record)">
          <span class="svc-day-list__interval">{{ interval(record) }}</span>
          <span class="svc-state" :class="'svc-state--'+record.estado">{{ SERVICE_STATE_LABELS[record.estado] }}</span>
          <strong>{{ record.clienteNombre }}</strong>
          <span class="svc-day-list__meta">{{ record.sedeNombre }} · {{ record.tipoServicio==='REFUERZO' ? 'Refuerzo' : 'Principal' }} · {{ record.responsable.nombreCompleto }}</span>
          <ChevronRight class="svc-day-list__chevron" :size="17" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <div v-else class="svc-day-list__empty">
      <p>No hay servicios programados para este día.</p>
      <button v-if="date>=todayBogota()" class="svc-day-list__create" type="button" :disabled="busy" @click="emit('create',date)">
        <Plus :size="17" aria-hidden="true" /> Programar servicio
      </button>
    </div>
  </section>
</template>

<style scoped>
.svc-day-list { display:grid; gap:0.4rem; min-width:0; }
.svc-day-list__header { display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
.svc-day-list__header h2 { margin:0; font-size:0.87rem; font-weight:600; text-transform:capitalize; }
.svc-day-list__header > span { font-size:0.75rem; color:var(--text-secondary); white-space:nowrap; }
.svc-day-list__items { display:grid; gap:0.35rem; list-style:none; padding:0; margin:0; }
.svc-day-list__record { position:relative; display:grid; width:100%; min-height:70px; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:0.18rem 0.6rem; padding:0.55rem 1.6rem 0.55rem 0.7rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); color:var(--text); font:inherit; text-align:left; cursor:pointer; }
.svc-day-list__record:hover { border-color:var(--border-strong); background:var(--hover); }
.svc-day-list__record:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.svc-day-list__interval { min-width:0; font-size:0.75rem; color:var(--text-secondary); font-variant-numeric:tabular-nums; }
.svc-day-list__record .svc-state { justify-self:end; font-size:0.69rem; white-space:nowrap; }
.svc-day-list__record > strong { grid-column:1/-1; min-width:0; margin-top:0.1rem; padding-right:0.2rem; font-size:0.875rem; line-height:1.25; overflow-wrap:anywhere; }
.svc-day-list__meta { grid-column:1/-1; color:var(--text-secondary); font-size:0.75rem; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.svc-day-list__chevron { position:absolute; right:0.35rem; bottom:0.6rem; color:var(--text-muted); }
.svc-day-list__empty { display:flex; flex-direction:column; align-items:flex-start; gap:0.65rem; padding:1.1rem 0.8rem; border:1px dashed var(--border); border-radius:var(--radius); }
.svc-day-list__empty p { margin:0; color:var(--text-secondary); font-size:0.875rem; }
.svc-day-list__create { display:flex; align-items:center; justify-content:center; gap:0.4rem; min-height:44px; padding:0.5rem 0.75rem; border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface); color:var(--text); font:inherit; font-size:0.82rem; cursor:pointer; }
.svc-day-list__create:hover { background:var(--hover); }
.svc-day-list__create:focus-visible { outline:2px solid var(--accent); }
@media(max-width:350px) {
  .svc-day-list__record { padding-inline:0.5rem 1.5rem; gap:0.15rem 0.3rem; }
  .svc-day-list__record .svc-state { font-size:0.65rem; }
}
</style>
