<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import WhatsAppPhoneLink from '@/components/base/WhatsAppPhoneLink.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import ServiceQuickEditor from '@/components/domain/services/ServiceQuickEditor.vue'
import ServicePagination from '@/components/domain/services/ServicePagination.vue'
import { useAdminServicesStore } from '@/stores/adminServices'
import { useNotificationsStore } from '@/stores/notifications'
import { fetchServiceAudit, requestCalendarRetry, type ServiceAuditEntry } from '@/services/adminServicesService'
import { formatServiceDate, formatServiceMoney, PAYMENT_LABELS, SERVICE_STATE_LABELS } from '@/helpers/adminServices'
import { formatDateOnly } from '@/helpers/dateTime'
import type { AdminService } from '@/types/adminServices'

const route=useRoute(), router=useRouter(), store=useAdminServicesStore(), notifications=useNotificationsStore()
const id=computed(()=>String(route.params.id)), record=computed(()=>store.records[id.value] ?? null)
const loading=ref(true), loadError=ref(''), busy=ref(false)
const quick=ref<{ record: AdminService; mode: 'schedule' | 'team' | 'cancel' | 'payment' } | null>(null)
const auditOpen=ref(false), auditRows=ref<ServiceAuditEntry[]>([]), auditLoading=ref(false), auditError=ref(''), auditPage=ref(1), auditTotal=ref(0)
let generation=0
onBeforeUnmount(()=>{ generation++ })
watch(id,()=>{ auditOpen.value=false; auditRows.value=[]; quick.value=null; void load() },{ immediate:true })
async function load(force=false): Promise<void> {
  const stamp=++generation; loading.value=true; loadError.value=''
  try { await store.ensureService(id.value,force) }
  catch(failure) { if(stamp===generation) loadError.value=failure instanceof Error ? failure.message : 'No fue posible cargar el servicio.' }
  finally { if(stamp===generation) loading.value=false }
}
async function open(mode: 'schedule' | 'team' | 'cancel' | 'payment'): Promise<void> {
  if(busy.value || !record.value) return
  busy.value=true
  try { if(mode!=='cancel') await store.loadOptions(); if(record.value) quick.value={ record:record.value,mode } }
  catch(failure) { notifications.show(failure instanceof Error ? failure.message : 'No fue posible preparar la acción.','error') }
  finally { busy.value=false }
}
async function retryCalendar(): Promise<void> {
  if(busy.value || !record.value) return
  busy.value=true
  try { store.applyMutation(await requestCalendarRetry(record.value.id,crypto.randomUUID())); notifications.show('Reintento en cola. La programación interna se conserva.','success') }
  catch(failure) { notifications.show(failure instanceof Error ? failure.message : 'No fue posible reintentar Calendar.','error') }
  finally { busy.value=false }
}
async function loadAudit(page=1): Promise<void> {
  const target=id.value, stamp=generation
  auditOpen.value=true; auditLoading.value=true; auditError.value=''
  try {
    const result=await fetchServiceAudit(target,page)
    if(stamp!==generation || target!==id.value) return
    auditRows.value=result.items; auditTotal.value=result.total; auditPage.value=result.page
  } catch(failure) { if(stamp===generation) auditError.value=failure instanceof Error ? failure.message : 'No fue posible cargar la actividad.' }
  finally { if(stamp===generation) auditLoading.value=false }
}
const actionLabels: Record<string,string>={ SERVICIO_CREADO:'Servicio programado',SERVICIO_EDITADO:'Información actualizada',SERVICIO_REPROGRAMADO:'Programación actualizada',SERVICIO_CANCELADO:'Servicio cancelado',SERVICIO_PAGO_ACTUALIZADO:'Pago actualizado',SERVICIO_CALENDAR_INTENTO:'Sincronización de Calendar',SERVICIO_CALENDAR_REINTENTO_SOLICITADO:'Reintento de Calendar solicitado' }
function edit(): void { void router.push({ name:'admin-service-edit',params:{ id:id.value },query:{ returnTo:route.fullPath } }) }
function certificates(): void {
  if(!record.value) return
  void router.push({ name:'certificates',query:{ tab:'generate',clientId:record.value.clientId,siteId:record.value.sedeId,serviceId:record.value.id } })
}
</script>
<template>
  <ServicePage :title="record ? `${record.clienteNombre} · ${record.sedeNombre}` : 'Detalle del servicio'" :caption="record?.solicitud">
    <template #actions><BaseButton variant="secondary" size="compact" @click="router.push('/servicios')">Servicios</BaseButton><BaseIconButton label="Actualizar servicio" :loading="loading" :disabled="busy" @click="load(true)"><RefreshCw :size="16" /></BaseIconButton><BaseButton v-if="record?.estado==='PROGRAMADO'" size="compact" :disabled="busy" @click="edit">Editar servicio</BaseButton></template>
    <LoadingSkeleton v-if="loading" :rows="7" />
    <StatusPanel v-else-if="loadError" title="No fue posible cargar el servicio" :message="loadError" tone="danger"><BaseButton size="compact" variant="secondary" @click="load(true)">Reintentar</BaseButton></StatusPanel>
    <template v-else-if="record">
      <div class="svc-toolbar"><div class="svc-actions"><span class="svc-state" :class="`svc-state--${record.estado}`">{{ SERVICE_STATE_LABELS[record.estado] }}</span><span class="svc-muted svc-small">{{ record.tipoServicio==='REFUERZO' ? 'Refuerzo gratuito' : 'Servicio Principal' }}</span></div><div class="svc-actions"><BaseButton v-if="record.estado==='PROGRAMADO'" variant="secondary" size="compact" :disabled="busy" @click="open('schedule')">Reprogramar</BaseButton><BaseButton v-if="record.estado==='PROGRAMADO'" variant="secondary" size="compact" :disabled="busy" @click="open('team')">Cambiar equipo</BaseButton><BaseButton v-if="['PROGRAMADO','EN_PROCESO'].includes(record.estado)" variant="ghost" size="compact" :disabled="busy" @click="open('cancel')">Cancelar servicio</BaseButton></div></div>
      <div v-if="record.motivoCancelacion" class="svc-notice"><span>Cancelado: {{ record.motivoCancelacion }}</span><small v-if="record.canceladoAt" class="svc-muted">{{ formatServiceDate(record.canceladoAt) }}</small></div>
      <div class="svc-editor-layout">
        <div class="svc-form-main">
          <section class="svc-card"><h2>Visita</h2><dl class="svc-detail-dl svc-form-grid">
            <div><dt>Programación</dt><dd>{{ formatServiceDate(record.inicioProgramado) }} · {{ formatServiceDate(record.inicioProgramado,true) }} – {{ formatServiceDate(record.finProgramado,true) }}</dd></div>
            <div><dt>Sede</dt><dd><RouterLink class="svc-link" :to="{ name:'site-detail',params:{ id:record.clientId,siteId:record.sedeId } }">{{ record.sedeNombre }}</RouterLink><p class="svc-muted svc-small">{{ record.direccion }}</p></dd></div>
            <div><dt>Responsable</dt><dd>{{ record.responsable.nombreCompleto }}</dd></div>
            <div><dt>Colaboradores</dt><dd>{{ record.colaboradores.map(person=>person.nombreCompleto).join(', ') || 'Sin colaboradores' }}</dd></div>
            <div v-if="record.inicioReal"><dt>Inicio real</dt><dd>{{ formatServiceDate(record.inicioReal) }} · {{ formatServiceDate(record.inicioReal,true) }}</dd></div>
            <div v-if="record.finReal"><dt>Fin real</dt><dd>{{ formatServiceDate(record.finReal) }} · {{ formatServiceDate(record.finReal,true) }}</dd></div>
          </dl></section>
          <section v-if="record.refuerzo || record.principal" class="svc-card"><h2>{{ record.refuerzo ? 'Refuerzo asociado' : 'Servicio Principal' }}</h2><template v-for="linked in [record.refuerzo || record.principal]" :key="linked?.id"><div v-if="linked" class="svc-toolbar"><RouterLink class="svc-link" :to="{ name:'service-detail',params:{ id:linked.id } }">{{ linked.solicitud }}</RouterLink><span>{{ formatServiceDate(linked.inicioProgramado) }} · {{ formatServiceDate(linked.inicioProgramado,true) }}</span><span class="svc-state" :class="`svc-state--${linked.estado}`">{{ SERVICE_STATE_LABELS[linked.estado] }}</span></div></template></section>
          <section class="svc-card"><h2>Productos de la visita</h2><p v-if="!record.productos.length" class="svc-muted svc-small">No hay productos registrados para esta visita.</p><div v-else class="svc-table-region" style="min-height:0"><table class="svc-table"><thead><tr><th>Producto</th><th>Lote</th><th>Dosis</th><th>Método</th><th>Fabricación</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody><tr v-for="product in record.productos" :key="product.id"><td class="svc-record-name" data-label="Producto">{{ product.nombre }}</td><td data-label="Lote">{{ product.lote }}</td><td data-label="Dosis">{{ product.dosis }}</td><td data-label="Método">{{ product.metodoAplicacionNombre || product.metodoAplicacionCodigo }}</td><td data-label="Fabricación">{{ formatDateOnly(product.fechaFabricacion) || 'No indicada' }}</td><td data-label="Vencimiento">{{ formatDateOnly(product.fechaVencimiento) || 'No indicada' }}</td><td data-label="Estado">{{ product.aplicado ? 'Aplicado' : 'Previsto' }}</td></tr></tbody></table></div></section>
          <section v-if="record.observaciones" class="svc-card"><h2>Observaciones</h2><p class="svc-small" style="white-space:pre-wrap;overflow-wrap:anywhere">{{ record.observaciones }}</p></section>
          <section v-if="record.tipoServicio==='PRINCIPAL' && record.estado==='FINALIZADO'" class="svc-card"><div class="svc-card-header"><h2>Certificados</h2><BaseButton size="compact" variant="secondary" @click="certificates">Generar y consultar certificados</BaseButton></div><p class="svc-muted svc-small">Utiliza las plantillas y el envío de documentos ya configurados para esta sede.</p></section>
          <section class="svc-card"><div class="svc-card-header"><h2>Actividad</h2><BaseButton size="compact" variant="secondary" :loading="auditLoading" @click="auditOpen ? auditOpen=false : loadAudit()">{{ auditOpen ? 'Ocultar' : 'Consultar actividad' }}</BaseButton></div><template v-if="auditOpen"><LoadingSkeleton v-if="auditLoading" :rows="3" /><div v-else-if="auditError" class="svc-inline-error">{{ auditError }}<BaseButton size="compact" variant="secondary" @click="loadAudit(auditPage)">Reintentar</BaseButton></div><template v-else><ul class="svc-audit"><li v-for="entry in auditRows" :key="entry.id">{{ actionLabels[entry.accion] || entry.accion }}<small>{{ entry.usuarioNombre }} · {{ formatServiceDate(entry.fechaHora) }} · {{ formatServiceDate(entry.fechaHora,true) }}</small><small v-if="typeof entry.detalle?.motivo==='string'">{{ entry.detalle.motivo }}</small></li></ul><p v-if="!auditRows.length" class="svc-muted svc-small">Sin actividad registrada.</p><ServicePagination :page="auditPage" :page-size="20" :total="auditTotal" @page="loadAudit" /></template></template></section>
        </div>
        <aside class="svc-summary">
          <section class="svc-card"><h2>Contacto</h2><p class="svc-small">{{ record.contacto.nombre || 'Contacto de la sede' }}</p><WhatsAppPhoneLink v-if="record.contacto.celular" :phone="record.contacto.celular" /><p v-for="email in record.contacto.correos" :key="email" class="svc-small" style="overflow-wrap:anywhere"><a class="svc-link" :href="`mailto:${encodeURIComponent(email)}`">{{ email }}</a></p></section>
          <section class="svc-card"><h2>{{ record.tipoServicio==='REFUERZO' ? 'Sin cobro' : 'Pago' }}</h2><p class="svc-amount">{{ formatServiceMoney(record.valorServicio) }}</p><template v-if="record.tipoServicio==='PRINCIPAL'"><dl class="svc-detail-dl"><div><dt>Estado</dt><dd>{{ PAYMENT_LABELS[record.pago.estadoPago] }}</dd></div><div><dt>Método</dt><dd>{{ record.pago.metodoPago==='EFECTIVO' ? 'Efectivo' : record.pago.metodoPago==='TRANSFERENCIA' ? 'Transferencia' : 'Sin definir' }}</dd></div><div v-if="record.pago.recaudadoPorNombre"><dt>Efectivo recibido por</dt><dd>{{ record.pago.recaudadoPorNombre }}</dd></div><div v-if="record.pago.confirmadoPor"><dt>Confirmación administrativa</dt><dd>{{ record.pago.confirmadoPor }}<small v-if="record.pago.confirmadoAt" class="svc-muted"> · {{ formatServiceDate(record.pago.confirmadoAt) }}</small></dd></div></dl><BaseButton size="compact" variant="secondary" style="margin-top:1rem" :disabled="busy" @click="open('payment')">{{ record.pago.estadoPago==='CONFIRMADO' ? 'Revisar pago' : 'Registrar pago' }}</BaseButton></template></section>
          <section class="svc-card"><h2>Calendar</h2><p class="svc-small">{{ record.calendar.estado==='SINCRONIZADO' ? 'Sincronizado' : record.calendar.estado==='ERROR' ? 'No se pudo sincronizar' : record.calendar.estado==='PENDIENTE' ? 'Sincronización pendiente' : 'Sin evento' }}</p><p v-if="record.calendar.error" class="svc-muted svc-small">{{ record.calendar.error }}</p><BaseButton v-if="record.calendar.estado==='ERROR'" size="compact" variant="secondary" :loading="busy" @click="retryCalendar">Reintentar sincronización</BaseButton></section>
        </aside>
      </div>
      <ServiceQuickEditor v-if="quick" :key="`${quick.record.id}:${quick.mode}`" :record="quick.record" :mode="quick.mode" @close="quick=null" @saved="auditRows=[]; auditOpen=false" />
    </template>
  </ServicePage>
</template>
