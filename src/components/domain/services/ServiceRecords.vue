<script setup lang="ts">
import { Pencil, RotateCcw, X, CloudOff, Clock3, Eye } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import ServiceContactActions from './ServiceContactActions.vue'
import { formatServiceDate, formatServiceMoney, PAYMENT_LABELS, SERVICE_STATE_LABELS } from '@/helpers/adminServices'
import type { AdminService } from '@/types/adminServices'
defineProps<{ records: AdminService[]; busy?: boolean }>()
const emit=defineEmits<{ schedule: [record: AdminService]; team: [record: AdminService]; payment: [record: AdminService]; edit: [record: AdminService]; cancel: [record: AdminService]; retryCalendar: [record: AdminService]; results: [record: AdminService] }>()
</script>
<template>
  <div class="svc-table-region" role="region" aria-label="Servicios" tabindex="0">
    <table class="svc-table">
      <thead><tr><th>Fecha y hora</th><th>Servicio</th><th>Tipo</th><th>Equipo</th><th>Contacto</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        <tr v-for="record in records" :key="record.id" :data-service-id="record.id">
          <td data-label="Fecha y hora"><button class="svc-cell-button" :disabled="busy || record.estado!=='PROGRAMADO'" :aria-label="`Reprogramar ${record.solicitud}`" @click="emit('schedule',record)">{{ formatServiceDate(record.inicioProgramado) }}<small>{{ formatServiceDate(record.inicioProgramado,true) }} – {{ formatServiceDate(record.finProgramado,true) }}</small></button></td>
          <td class="svc-record-name" data-label="Servicio"><RouterLink class="svc-link" :to="{ name:'service-detail',params:{ id:record.id } }">{{ record.clienteNombre }} · {{ record.sedeNombre }}</RouterLink><small>{{ record.solicitud }}</small></td>
          <td data-label="Tipo">{{ record.tipoServicio === 'REFUERZO' ? 'Refuerzo' : 'Principal' }}<small v-if="record.principal">{{ record.principal.solicitud }}</small><small v-else-if="record.refuerzo">Con refuerzo</small></td>
          <td data-label="Equipo"><button class="svc-cell-button" :disabled="busy || record.estado!=='PROGRAMADO'" :aria-label="`Cambiar equipo de ${record.solicitud}`" @click="emit('team',record)">{{ record.responsable.nombreCompleto }}<small v-if="record.colaboradores.length">+ {{ record.colaboradores.map(person=>person.nombreCompleto).join(', ') }}</small></button></td>
          <td data-label="Contacto"><ServiceContactActions :contact="record.contacto" /></td>
          <td data-label="Pago"><span v-if="record.tipoServicio==='REFUERZO'">{{ formatServiceMoney(0) }}<small>Gratuito</small></span><button v-else class="svc-cell-button" :disabled="busy" :aria-label="`Registrar pago de ${record.solicitud}`" @click="emit('payment',record)">{{ formatServiceMoney(record.valorServicio) }}<small>{{ record.pago.metodoPago === 'EFECTIVO' ? 'Efectivo' : record.pago.metodoPago === 'TRANSFERENCIA' ? 'Transferencia' : 'Sin método' }} · {{ PAYMENT_LABELS[record.pago.estadoPago] }}</small><small v-if="record.pago.recaudadoPorNombre">Recibió {{ record.pago.recaudadoPorNombre }}</small></button></td>
          <td data-label="Estado"><span class="svc-state" :class="`svc-state--${record.estado}`">{{ SERVICE_STATE_LABELS[record.estado] }}</span><small v-if="record.calendar.estado==='PENDIENTE'"><Clock3 :size="12" aria-hidden="true" /> Calendar pendiente</small><small v-if="record.calendar.estado==='ERROR'"><CloudOff :size="12" aria-hidden="true" /> Sin sincronizar</small></td>
          <td data-label="Acciones"><span class="svc-actions">
            <BaseIconButton v-if="record.estado==='FINALIZADO' && record.tipoServicio==='PRINCIPAL'" :label="`Ver resultados de ${record.solicitud}`" size="small" :disabled="busy" @click="emit('results',record)"><Eye :size="16" /></BaseIconButton>
            <BaseIconButton v-if="record.estado==='PROGRAMADO'" :label="`Editar ${record.solicitud}`" size="small" :disabled="busy" @click="emit('edit',record)"><Pencil :size="16" /></BaseIconButton>
            <BaseIconButton v-if="record.estado==='PROGRAMADO' || record.estado==='EN_PROCESO'" :label="`Cancelar ${record.solicitud}`" size="small" :disabled="busy" @click="emit('cancel',record)"><X :size="16" /></BaseIconButton>
            <BaseIconButton v-if="record.calendar.estado==='ERROR'" :label="`Reintentar Calendar de ${record.solicitud}`" size="small" :disabled="busy" @click="emit('retryCalendar',record)"><RotateCcw :size="16" /></BaseIconButton>
          </span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
