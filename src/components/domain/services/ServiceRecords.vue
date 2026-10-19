<script setup lang="ts">
import { Pencil, RotateCcw, X, CloudOff, Clock3, Eye, FileCheck2, MoreHorizontal, CalendarClock, Users, CreditCard } from 'lucide-vue-next'
import { ref } from 'vue'
import './services.css'
import { RouterLink } from 'vue-router'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ServiceContactActions from './ServiceContactActions.vue'
import { formatServiceDate, formatServiceMoney, PAYMENT_LABELS, SERVICE_STATE_LABELS } from '@/helpers/adminServices'
import type { AdminService } from '@/types/adminServices'
defineProps<{ records: AdminService[]; busy?: boolean; history?: boolean }>()
const emit=defineEmits<{ schedule: [record: AdminService]; team: [record: AdminService]; payment: [record: AdminService]; edit: [record: AdminService]; cancel: [record: AdminService]; retryCalendar: [record: AdminService]; results: [record: AdminService] }>()
const actionRecord=ref<AdminService|null>(null)
const shortDay=new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',timeZone:'America/Bogota'})
const shortTime=new Intl.DateTimeFormat('es-CO',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Bogota'})
const dayKey=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Bogota'})
function shortSchedule(record:AdminService):string {
  const start=new Date(record.inicioProgramado), end=new Date(record.finProgramado)
  return shortDay.format(start)+' · '+shortTime.format(start)+'–'+(dayKey.format(start)===dayKey.format(end) ? '' : shortDay.format(end)+' ')+shortTime.format(end)
}
type MobileAction='schedule'|'team'|'payment'|'edit'|'cancel'|'retry-calendar'|'results'
function selectAction(action:MobileAction):void {
  const record=actionRecord.value
  if(!record) return
  actionRecord.value=null
  switch(action) {
    case 'schedule': emit('schedule',record); break
    case 'team': emit('team',record); break
    case 'payment': emit('payment',record); break
    case 'edit': emit('edit',record); break
    case 'cancel': emit('cancel',record); break
    case 'retry-calendar': emit('retryCalendar',record); break
    case 'results': emit('results',record); break
  }
}
</script>
<template>
  <div class="svc-table-region svc-table-region--services" role="region" aria-label="Servicios" tabindex="0">
    <table class="svc-table">
      <thead><tr><th>Fecha y hora</th><th>Servicio</th><th>Tipo</th><th>Equipo</th><th>Contacto</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        <tr v-for="record in records" :key="record.id" :data-service-id="record.id">
          <td class="svc-record-time" data-label="Fecha y hora"><button class="svc-cell-button" :disabled="busy || record.estado!=='PROGRAMADO'" :aria-label="`Reprogramar ${record.solicitud}`" @click="emit('schedule',record)"><span class="svc-record-date-desktop">{{ formatServiceDate(record.inicioProgramado) }}</span><span class="svc-record-date-mobile">{{ shortSchedule(record) }}</span><small class="svc-record-date-desktop">{{ formatServiceDate(record.inicioProgramado,true) }} – {{ formatServiceDate(record.finProgramado,true) }}</small></button></td>
          <td class="svc-record-name" data-label="Servicio"><RouterLink class="svc-link" :to="{ name:'service-detail',params:{ id:record.id } }">{{ record.clienteNombre }}<template v-if="record.tipoSede!=='RESIDENCIAL'"> · {{ record.sedeNombre }}</template></RouterLink><small class="svc-record-code">{{ record.solicitud }}</small><small class="svc-mobile-service-meta">{{ record.solicitud }} · {{ record.tipoServicio==='REFUERZO' ? 'Refuerzo' : 'Principal' }}<template v-if="record.principal"> · Vinculado</template><template v-else-if="record.refuerzo"> · Con refuerzo</template></small></td>
          <td class="svc-record-kind" data-label="Tipo">{{ record.tipoServicio === 'REFUERZO' ? 'Refuerzo' : 'Principal' }}<small v-if="record.principal">{{ record.principal.solicitud }}</small><small v-else-if="record.refuerzo">Con refuerzo</small></td>
          <td class="svc-record-team" data-label="Equipo"><button class="svc-cell-button" :disabled="busy || record.estado!=='PROGRAMADO'" :aria-label="`Cambiar equipo de ${record.solicitud}`" @click="emit('team',record)">{{ record.responsable.nombreCompleto }}<small v-if="record.colaboradores.length">+ {{ record.colaboradores.map(person=>person.nombreCompleto).join(', ') }}</small></button></td>
          <td class="svc-record-contact" data-label="Contacto"><ServiceContactActions :contact="record.contacto" /></td>
          <td class="svc-record-payment" data-label="Pago"><span v-if="record.tipoServicio==='REFUERZO'">{{ formatServiceMoney(0) }}<small>Gratuito</small></span><button v-else class="svc-cell-button" :disabled="busy" :aria-label="`Registrar pago de ${record.solicitud}`" @click="emit('payment',record)">{{ formatServiceMoney(record.valorServicio) }}<small>{{ record.pago.metodoPago === 'EFECTIVO' ? 'Efectivo' : record.pago.metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : 'Sin método' }} · {{ PAYMENT_LABELS[record.pago.estadoPago] }}</small><small class="svc-payment-receiver" v-if="record.pago.recaudadoPorNombre">Recibió {{ record.pago.recaudadoPorNombre }}</small></button></td>
          <td class="svc-record-state" data-label="Estado"><span class="svc-state" :class="`svc-state--${record.estado}`">{{ SERVICE_STATE_LABELS[record.estado] }}</span><small v-if="record.calendar.estado==='PENDIENTE'"><Clock3 :size="12" aria-hidden="true" /> Calendar pendiente</small><small v-if="record.calendar.estado==='ERROR'"><CloudOff :size="12" aria-hidden="true" /> Sin sincronizar</small></td>
          <td class="svc-record-actions" data-label="Acciones"><span class="svc-actions svc-record-actions__desktop">
            <RouterLink v-if="history && record.estado==='FINALIZADO' && record.tipoServicio==='PRINCIPAL' && record.tipoSede!=='RESIDENCIAL'" class="svc-report-link" :to="{ name:'admin-service-report', params:{ id:record.id } }" :aria-label="'Abrir informe de ' + record.solicitud"><FileCheck2 :size="15" aria-hidden="true" /> Informe</RouterLink>
            <BaseIconButton v-if="record.estado==='FINALIZADO' && record.tipoServicio==='PRINCIPAL' && record.tipoSede!=='RESIDENCIAL'" :label="`Ver resultados de ${record.solicitud}`" size="small" :disabled="busy" @click="emit('results',record)"><Eye :size="16" /></BaseIconButton>
            <BaseIconButton v-if="record.estado==='PROGRAMADO'" :label="`Editar ${record.solicitud}`" size="small" :disabled="busy" @click="emit('edit',record)"><Pencil :size="16" /></BaseIconButton>
            <BaseIconButton v-if="record.estado==='PROGRAMADO' || record.estado==='EN_PROCESO'" :label="`Cancelar ${record.solicitud}`" size="small" :disabled="busy" @click="emit('cancel',record)"><X :size="16" /></BaseIconButton>
            <BaseIconButton v-if="record.calendar.estado==='ERROR'" :label="`Reintentar Calendar de ${record.solicitud}`" size="small" :disabled="busy" @click="emit('retryCalendar',record)"><RotateCcw :size="16" /></BaseIconButton>
          </span><span class="svc-record-actions__mobile"><RouterLink class="svc-mobile-view" :to="{ name:'service-detail',params:{ id:record.id } }" :aria-label="'Ver detalle de '+record.solicitud" title="Ver detalle"><Eye :size="17" aria-hidden="true" /></RouterLink><BaseIconButton :label="'Acciones de '+record.solicitud" size="small" :disabled="busy" @click="actionRecord=record"><MoreHorizontal :size="19" /></BaseIconButton></span></td>
        </tr>
      </tbody>
    </table>
  </div>
  <BaseDialog v-if="actionRecord" :model-value="true" :title="'Acciones · '+actionRecord.solicitud" :description="actionRecord.clienteNombre+(actionRecord.tipoSede==='RESIDENCIAL' ? '' : ' · '+actionRecord.sedeNombre)" size="compact" @update:model-value="!$event && (actionRecord=null)">
    <div class="svc-mobile-menu">
      <BaseButton v-if="actionRecord.estado==='PROGRAMADO'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('schedule')"><CalendarClock :size="18" /> Reprogramar</BaseButton>
      <BaseButton v-if="actionRecord.estado==='PROGRAMADO'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('team')"><Users :size="18" /> Cambiar equipo</BaseButton>
      <BaseButton v-if="actionRecord.estado==='PROGRAMADO'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('edit')"><Pencil :size="18" /> Editar servicio</BaseButton>
      <BaseButton v-if="actionRecord.tipoServicio!=='REFUERZO'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('payment')"><CreditCard :size="18" /> Registrar pago</BaseButton>
      <BaseButton v-if="actionRecord.estado==='FINALIZADO' && actionRecord.tipoServicio==='PRINCIPAL'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('results')"><Eye :size="18" /> Ver resultados</BaseButton>
      <RouterLink v-if="history && actionRecord.estado==='FINALIZADO' && actionRecord.tipoServicio==='PRINCIPAL' && actionRecord.tipoSede!=='RESIDENCIAL'" class="svc-mobile-menu__link" :to="{ name:'admin-service-report',params:{ id:actionRecord.id } }" @click="actionRecord=null"><FileCheck2 :size="18" aria-hidden="true" /> Ver informe</RouterLink>
      <BaseButton v-if="actionRecord.calendar.estado==='ERROR'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('retry-calendar')"><RotateCcw :size="18" /> Reintentar Calendar</BaseButton>
      <BaseButton v-if="actionRecord.estado==='PROGRAMADO' || actionRecord.estado==='EN_PROCESO'" size="compact" variant="ghost" :disabled="busy" @click="selectAction('cancel')"><X :size="18" /> Cancelar servicio</BaseButton>
      <RouterLink class="svc-mobile-menu__link" :to="{ name:'service-detail',params:{ id:actionRecord.id } }" @click="actionRecord=null"><Eye :size="18" aria-hidden="true" /> Ver detalle completo</RouterLink>
    </div>
  </BaseDialog>
</template>

<style scoped>
.svc-record-date-mobile, .svc-mobile-service-meta, .svc-record-actions__mobile { display:none; }
.svc-mobile-menu { display:grid; gap:0.2rem; }
.svc-mobile-menu :deep(.base-button), .svc-mobile-menu__link { display:flex; width:100%; align-items:center; justify-content:flex-start; gap:0.75rem; box-sizing:border-box; padding:0.65rem 0.8rem; border-radius:var(--radius-sm); color:var(--text); font-size:0.875rem; font-weight:500; text-decoration:none; min-height:44px; }
.svc-mobile-menu__link:hover, .svc-mobile-menu__link:focus-visible { background:var(--hover); }
.svc-mobile-menu__link:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
@media(max-width:680px) {
  .svc-record-date-desktop, .svc-record-code { display:none !important; }
  .svc-record-date-mobile, .svc-mobile-service-meta, .svc-record-actions__mobile { display:flex; }
  .svc-record-actions__desktop { display:none; }
  .svc-record-actions__mobile { align-items:center; justify-content:flex-end; gap:0.2rem; }
  .svc-record-actions__mobile :deep(.icon-button), .svc-mobile-view { display:grid; place-items:center; width:44px; min-width:44px; min-height:44px; border-radius:var(--radius-sm); color:var(--text-secondary); }
  .svc-mobile-view:hover, .svc-mobile-view:focus-visible { color:var(--text); background:var(--hover); }
  .svc-mobile-view:focus-visible { outline:2px solid var(--accent); }
  .svc-mobile-service-meta { flex-wrap:wrap; font-size:0.72rem; color:var(--text-secondary); }
}

.svc-report-link{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;min-height:32px;padding:.25rem .45rem;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);text-decoration:none;font-size:.75rem;white-space:nowrap}
.svc-report-link:hover{background:var(--hover);border-color:var(--border-strong)}
.svc-report-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:680px){.svc-report-link{min-height:44px;padding:.4rem .65rem}}
</style>
