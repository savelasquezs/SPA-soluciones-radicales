<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { MoreHorizontal } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import ServiceContactActions from './ServiceContactActions.vue'
import { FOLLOW_UP_LABELS, MAIL_LABELS, formatServiceDate, todayBogota, toBogotaInput } from '@/helpers/adminServices'
import { formatDateOnly } from '@/helpers/dateTime'
import type { UpcomingService } from '@/types/adminServices'
defineProps<{ records: UpcomingService[]; busy?: boolean }>()
const emit=defineEmits<{ manage: [record: UpcomingService]; email: [record: UpcomingService]; schedule: [record: UpcomingService] }>()
</script>
<template>
  <div class="svc-table-region" role="region" aria-label="Próximos por confirmar" tabindex="0">
    <table class="svc-table">
      <thead><tr><th>Próxima sugerida</th><th>Cliente y sede</th><th>Último servicio</th><th>Seguimiento</th><th>Contacto</th><th>Último contacto</th><th>Acciones</th></tr></thead>
      <tbody>
        <tr v-for="record in records" :key="record.id" :data-upcoming-id="record.id">
          <td data-label="Próxima sugerida">{{ formatServiceDate(record.fechaSugerida) }}<small>{{ formatServiceDate(record.fechaSugerida,true) }} · Cada {{ record.periodicidadMeses }} {{ record.periodicidadMeses===1 ? 'mes' : 'meses' }}</small><small v-if="toBogotaInput(record.fechaSugerida).slice(0,10)<todayBogota() && record.estado!=='NO_DESEA'" class="svc-error">Fecha sugerida vencida</small></td>
          <td class="svc-record-name" data-label="Cliente y sede"><RouterLink class="svc-link" :to="{ name:'site-detail',params:{ id:record.clientId,siteId:record.sedeId } }">{{ record.clienteNombre }} · {{ record.sedeNombre }}</RouterLink><small>{{ record.contacto.nombre }}</small></td>
          <td data-label="Último servicio"><RouterLink class="svc-link" :to="{ name:'service-detail',params:{ id:record.principalAnteriorId } }">{{ record.principalAnteriorSolicitud }}</RouterLink><small>{{ formatServiceDate(record.ultimoServicioAt) }}</small></td>
          <td data-label="Seguimiento"><button class="svc-cell-button" :disabled="busy" :aria-label="`Gestionar seguimiento de ${record.clienteNombre}`" @click="emit('manage',record)"><span class="svc-state" :class="`svc-state--${record.estado}`">{{ FOLLOW_UP_LABELS[record.estado] }}</span><small v-if="record.fechaRecontacto">Contactar {{ formatDateOnly(record.fechaRecontacto) }}</small></button></td>
          <td data-label="Contacto"><ServiceContactActions :contact="record.contacto" confirmation :disabled="busy || record.correoEstado==='PENDIENTE' || record.estado==='NO_DESEA'" @email="emit('email',record)" /><small v-if="record.correoEstado!=='SIN_ENVIAR'" :title="record.correoError ?? undefined">Correo: {{ MAIL_LABELS[record.correoEstado] }}</small></td>
          <td data-label="Último contacto"><template v-if="record.ultimoContactoAt">{{ formatServiceDate(record.ultimoContactoAt) }}<small>{{ record.canalUltimoContacto === 'WHATSAPP' ? 'WhatsApp' : 'Correo' }}</small></template><span v-else class="svc-muted">Sin contacto registrado</span></td>
          <td data-label="Acciones"><div class="svc-actions"><BaseButton v-if="record.estado!=='NO_DESEA'" size="compact" :variant="record.estado==='CONFIRMADO' ? 'primary' : 'secondary'" :disabled="busy" @click="emit('schedule',record)">Agendar</BaseButton><BaseIconButton :label="`Gestionar ${record.clienteNombre}`" size="small" :disabled="busy" @click="emit('manage',record)"><MoreHorizontal :size="16" /></BaseIconButton></div></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
