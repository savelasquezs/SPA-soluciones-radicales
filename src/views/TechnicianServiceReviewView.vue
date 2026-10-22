<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Mail } from 'lucide-vue-next'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianPaymentDialog from '@/components/domain/services/TechnicianPaymentDialog.vue'
import SendReportDialog from '@/components/domain/services/SendReportDialog.vue'
import TechnicianSignaturePad from '@/components/domain/services/TechnicianSignaturePad.vue'
import TechnicianServiceNavigation from '@/components/domain/services/TechnicianServiceNavigation.vue'
import { orderedTechnicianAreas, technicianAreaResolved, technicianAreaIssues } from '@/helpers/technicianServices'
import { vehicleChecklistResolved } from '@/helpers/technicianVehicles'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { useTechnicianReportEmailStore } from '@/stores/technicianReportEmails'
import type { TechnicianMutation } from '@/types/technicianServices'

const route = useRoute()
const router = useRouter()
const services = useTechnicianServicesStore()
const emails = useTechnicianReportEmailStore()
const { online } = useNetworkStatus()
const serviceId = computed(() => String(route.params.id ?? ''))
const loading = ref(true)
const error = ref('')
const packageValue = computed(() => services.currentPackage)
const areas = computed(() => orderedTechnicianAreas(packageValue.value?.areas ?? []))
const pending = computed(() => areas.value.filter(area => !technicianAreaResolved(area, serviceId.value)))
const signatureRole = ref<'TECHNICIAN' | 'CLIENT' | null>(null)
const clientName = ref('')
const saving = ref(false)
const actionError = ref('')
const actionMessage = ref('')
const reportModalOpen = ref(false)
const paymentOpen = ref(false)
const emailInfo = ref('')
const signatures = computed(() => packageValue.value?.signatures)
const technicianSigned = computed(() => Boolean(signatures.value?.technicianStoragePath || signatures.value?.technicianLocalId))
const clientSigned = computed(() => Boolean(signatures.value?.clientStoragePath || signatures.value?.clientLocalId))
const finalization = computed(() => services.currentMutations.find(item => item.kind === 'SERVICE_FINALIZE'))
const finalized = computed(() => packageValue.value?.service.estado === 'FINALIZADO')
const residential = computed(() => packageValue.value?.service.tipoSede === 'RESIDENCIAL')
const reinforcement = computed(() => packageValue.value?.service.tipoServicio === 'REFUERZO')
const simplified = computed(() => residential.value || reinforcement.value)
const obsoleteVehiclePackage = computed(() => Boolean(packageValue.value
  && packageValue.value.service.tipoServicio === 'PRINCIPAL'
  && packageValue.value.service.tipoSede !== 'RESIDENCIAL'
  && typeof packageValue.value.vehiclesEnabled !== 'boolean'))
const vehiclesDone = computed(() => !packageValue.value || vehicleChecklistResolved(
  packageValue.value.vehiclesEnabled, packageValue.value.attendedVehicleIds, packageValue.value.vehicleDraftIds))
const vehicleChangesPending = computed(() => services.currentMutations.some(item =>
  item.kind === 'VEHICLE_CREATE' || item.kind === 'VEHICLE_SELECTION'))
const canFinalize = computed(() => !pending.value.length && !obsoleteVehiclePackage.value && vehiclesDone.value
  && !services.currentMutations.some(item => item.status === 'CONFLICT')
  && technicianSigned.value && clientSigned.value && Boolean(clientName.value.trim()))
const canOfferReport = computed(() => finalized.value
  || (finalization.value && finalization.value.status !== 'CONFLICT'))
const pendingEmailItems = computed(() => emails.forService(serviceId.value))
const operationLabels: Record<TechnicianMutation['kind'], string> = {
  AREA_CREATE: 'Nueva Área de Sede',
  AREA_ORDER: 'Orden de Áreas',
  CRITERION_EVALUATION: 'Evaluación MIP',
  AREA_ACCESS: 'Acceso al Área',
  DEVICE_CREATE: 'Nuevo puesto',
  DEVICE_REVIEW: 'Revisión de puesto',
  FINDING_CREATE: 'Nuevo Hallazgo',
  FINDING_STATUS: 'Seguimiento de Hallazgo',
  VEHICLE_CREATE: 'Registro de vehículo',
  VEHICLE_SELECTION: 'Selección de vehículos',
  SERVICE_FINALIZE: 'Cierre del servicio',
}
const syncProblem = computed(() => services.currentMutations.find(item =>
  item.kind !== 'SERVICE_FINALIZE' && item.status === 'CONFLICT')
  ?? services.currentMutations.find(item => item.kind !== 'SERVICE_FINALIZE' && Boolean(item.error)))
const syncProblemArea = computed(() => {
  const problem = syncProblem.value
  return problem?.kind === 'AREA_CREATE'
    ? areas.value.find(area => area.id === problem.serviceAreaId) ?? null
    : problem && 'areaId' in problem ? areas.value.find(area => area.id === problem.areaId) ?? null : null
})
const needsVersionResolution = computed(() => {
  const problem = syncProblem.value
  return Boolean(problem && 'conflict' in problem && problem.conflict)
})
const syncProblemMessage = computed(() => {
  const problem = syncProblem.value
  if (!problem) return ''
  const location = syncProblemArea.value ? ` · ${syncProblemArea.value.nombre}` : ''
  const reason = problem.error || 'Este cambio requiere revisión antes del cierre.'
  return `${operationLabels[problem.kind]}${location}: ${reason}`
})
const cachedContactEmails = computed(() => {
  const service = packageValue.value?.service
  const available = [...(service?.contactEmails ?? []),service?.contactoPrincipalCorreo]
  return [...new Set(available.filter((email): email is string => typeof email === 'string' && !!email.trim()))]
})
function onReportQueued(outcome: 'sent' | 'pending' | 'needs_review'): void {
  emailInfo.value = outcome === 'sent'
    ? 'Informe enviado al cliente.'
    : outcome === 'needs_review'
      ? 'Este correo necesita revisión antes de volver a intentarlo.'
      : 'El informe quedó guardado y se enviará cuando el cierre esté confirmado y haya conexión.'
  void emails.refresh()
}
watch(pendingEmailItems, (current, previous) => {
  if (current.some(mail => mail.status === 'NEEDS_REVIEW')) {
    emailInfo.value = 'Un correo necesita revisión. No se reenviará automáticamente.'
  } else if (previous.length && !current.length) {
    emailInfo.value = 'Informe enviado al cliente.'
  }
})

onMounted(async () => {
  try {
    const loaded = await services.ensurePackage(serviceId.value)
    clientName.value = loaded.signatures?.clientName ?? loaded.service.contactoPrincipalNombre ?? ''
    await emails.hydrate().catch(() => undefined)
  }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible revisar el servicio.' }
  finally { loading.value = false }
})

function reviewSyncProblem(): void {
  const problem = syncProblem.value
  if (!problem) return
  if (problem.kind === 'VEHICLE_CREATE' || problem.kind === 'VEHICLE_SELECTION') {
    void router.push({ name: 'technician-service-vehicles', params: { id: serviceId.value } })
    return
  }
  if (problem.kind === 'AREA_CREATE') {
    void router.push({ name: 'technician-service-area',
      params: { id: serviceId.value, areaId: problem.serviceAreaId }, query: { editArea: '1' } })
    return
  }
  if (!('areaId' in problem)) {
    void router.push({ name: problem.kind === 'AREA_ORDER' ? 'technician-service-area-order' : 'technician-service-work',
      params: { id: serviceId.value } })
    return
  }
  const tab = problem.kind === 'CRITERION_EVALUATION' ? 'criteria'
    : problem.kind === 'DEVICE_CREATE' || problem.kind === 'DEVICE_REVIEW' ? 'points'
      : problem.kind === 'FINDING_CREATE' || problem.kind === 'FINDING_STATUS' ? 'findings' : ''
  const focus = problem.kind === 'CRITERION_EVALUATION' ? problem.criterionId
    : problem.kind === 'DEVICE_REVIEW' ? problem.serviceDeviceId
      : problem.kind === 'FINDING_CREATE' || problem.kind === 'FINDING_STATUS' ? problem.findingId : ''
  void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId: problem.areaId },
    query: { ...(tab ? { tab } : {}), ...(focus ? { focus } : {}) } })
}

function openArea(areaId: string): void {
  const area = areas.value.find(item => item.id === areaId)
  const issue = area ? technicianAreaIssues(area, serviceId.value)[0] : null
  void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId },
    query: issue ? { tab: issue.tab, focus: issue.id } : undefined })
}

async function acceptSignature(file: File): Promise<void> {
  if (!signatureRole.value) return
  saving.value = true
  actionError.value = ''
  try {
    await services.saveSignature(serviceId.value, signatureRole.value, file)
    signatureRole.value = null
    actionMessage.value = 'Firma guardada en este celular.'
  } catch (failure) {
    actionError.value = failure instanceof Error ? failure.message : 'No fue posible guardar la firma.'
  } finally { saving.value = false }
}

async function finish(): Promise<void> {
  saving.value = true
  actionError.value = ''
  actionMessage.value = ''
  try {
    // Reuse the persisted requestId (and signatures) on every retry; never queue a second closure.
    const result = finalization.value
      ? await services.retryFinalize(serviceId.value)
      : await services.finalizeService(serviceId.value, clientName.value)
    actionMessage.value = result === 'synced' ? 'Servicio finalizado.' : result === 'conflict'
      ? 'Hay un cambio pendiente que impide finalizar. Revisa el detalle antes de continuar.'
      : finalization.value?.error ? 'El cierre sigue guardado. Revisa el error y vuelve a intentar la sincronización.'
        : online.value ? 'El cierre está pendiente de sincronización.'
          : 'Cierre guardado. Se finalizará al recuperar conexión.'
    if (result === 'synced') {
      if (!simplified.value) {
        // An earlier offline email is already queued and will be delivered after closure.
        if (!pendingEmailItems.value.length) reportModalOpen.value = true
        void emails.flushAll()
      }
    }
  } catch (failure) {
    actionError.value = failure instanceof Error ? failure.message : 'No fue posible finalizar el servicio.'
  } finally { saving.value = false }
}
</script>

<template>
  <ServicePage title="Revisión y cierre" :caption="packageValue?.service.solicitud">
    <LoadingSkeleton v-if="loading" label="Revisando pendientes" :rows="5" />
    <StatusPanel v-else-if="error" title="No fue posible revisar el servicio" :message="error" tone="danger" />
    <template v-else-if="packageValue">
      <TechnicianServiceNavigation :service-id="serviceId" active="review"
        :vehicles-enabled="packageValue.vehiclesEnabled" :first-area-id="areas[0]?.id" />
      <StatusPanel v-if="simplified && !finalized" compact :title="reinforcement ? 'Servicio de refuerzo' : 'Servicio residencial'" message="No requiere recorrido por Áreas. Registra ambas firmas para finalizar." tone="neutral" />
      <StatusPanel v-else-if="finalized" compact title="Servicio finalizado" message="Las firmas y el cierre fueron confirmados por el servidor." tone="success" />
      <StatusPanel v-else-if="pending.length && !vehiclesDone" compact title="Áreas y vehículos pendientes"
        :message="`${pending.length} de ${areas.length} Áreas requieren información y los vehículos aún no se han confirmado.`"
        tone="warning" />
      <StatusPanel v-else-if="pending.length" compact title="Aún hay Áreas pendientes" :message="`${pending.length} de ${areas.length} Áreas requieren información. Puedes revisar el cierre, pero no finalizar hasta completarlas.`" tone="warning" />
      <StatusPanel v-else-if="obsoleteVehiclePackage" compact title="Actualiza el servicio"
        message="Necesitas conexión para cargar la configuración vehicular de este servicio antes de finalizar." tone="warning" />
      <StatusPanel v-else-if="!vehiclesDone" compact title="Vehículos sin confirmar"
        message="Revisa la sección Vehículos y confirma los atendidos antes de finalizar." tone="warning" />
      <StatusPanel v-else compact title="Recorrido completo" message="Las Áreas y la atención vehicular están resueltas. Registra ambas firmas para finalizar." tone="success" />
      <section v-if="!simplified" class="review-list" aria-labelledby="review-areas-title"><h2 id="review-areas-title">Estado por Área</h2>
        <button v-for="area in areas" :key="area.id" type="button" @click="openArea(area.id)">
          <span class="review-list__name"><strong>{{ area.nombre }}</strong><small v-if="technicianAreaIssues(area, serviceId).length">{{ technicianAreaIssues(area, serviceId).filter(issue => issue.tab === 'criteria').length }} criterios · {{ technicianAreaIssues(area, serviceId).filter(issue => issue.tab === 'points').length }} puestos · {{ technicianAreaIssues(area, serviceId).filter(issue => issue.tab === 'findings').length }} hallazgos pendientes</small></span>
          <StatusBadge :tone="technicianAreaResolved(area, serviceId) ? 'success' : 'neutral'">{{ technicianAreaResolved(area, serviceId) ? 'Resuelta' : 'Pendiente' }}</StatusBadge>
        </button>
      </section>
      <section v-if="packageValue.vehiclesEnabled" class="review-list" aria-labelledby="review-vehicles-title">
        <h2 id="review-vehicles-title">Vehículos atendidos</h2>
        <button type="button" @click="router.push({ name: 'technician-service-vehicles', params: { id: serviceId } })">
          <span class="review-list__name"><strong>{{ packageValue.attendedVehicleIds == null && finalized ? 'Sin registro histórico' :
  vehiclesDone ? (packageValue.attendedVehicleIds?.length ?? 0) + ' atendidos' : 'Sin confirmar' }}</strong>
            <small>{{ finalized && packageValue.attendedVehicleIds == null ? 'Este servicio finalizado no conserva datos vehiculares.' :
  vehiclesDone ? vehicleChangesPending ? 'Guardado en este celular · falta sincronizar.' : 'Selección registrada para esta visita.' : 'Revisa y confirma esta sección antes de finalizar.' }}</small></span>
          <StatusBadge :tone="!vehiclesDone ? 'warning' : vehicleChangesPending ? 'neutral' : 'success'">
            {{ finalized && packageValue.attendedVehicleIds == null ? 'Histórico' :
  !vehiclesDone ? 'Pendiente' : vehicleChangesPending ? 'Local' : 'Confirmado' }}
          </StatusBadge>
        </button>
      </section>
      <section v-if="!finalized" class="signature-section" aria-labelledby="signatures-title">
        <div><h2 id="signatures-title">Firmas</h2><p>Ambas son obligatorias para cada servicio.</p></div>
        <article><div><strong>Técnico</strong><span>{{ technicianSigned ? 'Firma guardada' : 'Pendiente' }}</span></div><BaseButton variant="secondary" :disabled="saving || Boolean(finalization)" @click="signatureRole = 'TECHNICIAN'">{{ technicianSigned ? 'Firmar de nuevo' : 'Firmar' }}</BaseButton></article>
        <article><div><strong>Responsable del cliente</strong><span>{{ clientSigned ? 'Firma guardada' : 'Pendiente' }}</span></div><BaseButton variant="secondary" :disabled="saving || Boolean(finalization)" @click="signatureRole = 'CLIENT'">{{ clientSigned ? 'Firmar de nuevo' : 'Firmar' }}</BaseButton></article>
        <BaseInput v-model="clientName" name="client-signer-name" label="Nombre de quien firma por el cliente" maxlength="200" required :disabled="saving || Boolean(finalization)" />
        <StatusPanel v-if="syncProblem || actionError || finalization?.error" compact title="Sincronización detenida"
          :message="syncProblem ? syncProblemMessage : actionError || finalization?.error || ''" tone="danger" />
        <StatusPanel v-else-if="actionMessage" compact title="Estado del cierre" :message="actionMessage" :tone="actionMessage === 'Servicio finalizado.' ? 'success' : 'warning'" />
        <BaseButton v-if="syncProblem" variant="secondary" size="compact" :disabled="saving" @click="reviewSyncProblem">
          {{ syncProblemArea ? 'Revisar Área' : syncProblem?.kind === 'VEHICLE_CREATE' || syncProblem?.kind === 'VEHICLE_SELECTION' ? 'Revisar vehículos' : 'Revisar recorrido' }}
        </BaseButton>
        <BaseButton :loading="saving" :disabled="!canFinalize || needsVersionResolution || (Boolean(finalization) && (!online || services.syncing))" @click="finish">{{ finalization?.status === 'CONFLICT' ? 'Reintentar cierre' : finalization ? (online ? 'Reintentar sincronización' : 'Cierre pendiente') : 'Finalizar servicio' }}</BaseButton>
      </section>
      <section v-if="canOfferReport && !simplified" class="review-email" aria-labelledby="review-email-title">
        <div><h2 id="review-email-title">Enviar informe al cliente</h2>
          <p>Opcional · Puedes seleccionar los correos registrados, añadir otros y personalizar el mensaje.</p>
        </div>
        <StatusPanel v-if="pendingEmailItems.some(item => item.status === 'NEEDS_REVIEW')" compact
          title="Un correo necesita revisión" tone="danger"
          message="No se pudo confirmar o completar el envío. Revisa Gmail y solicita apoyo al administrador antes de generar otro intento." />
        <StatusPanel v-else-if="pendingEmailItems.length" compact
          title="Envío pendiente" tone="warning"
          :message="pendingEmailItems[0]?.error || (syncProblem || finalization?.error ? 'El informe está guardado, pero hay cambios del servicio sin sincronizar. Primero debe confirmarse el cierre.' : 'Guardado en este dispositivo. Se enviará después de confirmar el cierre y recuperar internet.')" />
        <p v-if="emailInfo" class="review-email__notice" role="status">{{ emailInfo }}</p>
        <BaseButton variant="secondary" size="compact" :disabled="Boolean(pendingEmailItems.length)" @click="reportModalOpen=true">
          <Mail :size="16" aria-hidden="true" /> Enviar informe
        </BaseButton>
      </section>
      <BaseButton v-if="packageValue.service.tipoServicio==='PRINCIPAL' && ['EN_PROCESO','FINALIZADO'].includes(packageValue.service.estado)" variant="secondary" size="compact" :disabled="!online" @click="paymentOpen=true">Reportar cobro</BaseButton>
      <BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton>
    </template>
  </ServicePage>
  <TechnicianPaymentDialog :open="paymentOpen" :service-id="serviceId" @close="paymentOpen=false" />
  <SendReportDialog v-if="reportModalOpen && packageValue && !simplified" :service-id="serviceId"
    :solicitud="packageValue.service.solicitud" :cliente="packageValue.service.clienteNombre"
    :sede="packageValue.service.sedeNombre" mode="TECNICO"
    :cached-emails="cachedContactEmails" :completion-confirmed="finalized"
    @close="reportModalOpen=false" @queued="onReportQueued" />
  <TechnicianSignaturePad v-if="signatureRole" :title="signatureRole === 'TECHNICIAN' ? 'Firma del Técnico' : 'Firma del responsable del cliente'" @cancel="signatureRole = null" @accept="acceptSignature" />
</template>

<style scoped>
.review-list { display:grid; gap:.4rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:.7rem; }
h2 { margin:0; font-size:1rem; }
.review-list button { display:flex; min-height:44px; align-items:center; justify-content:space-between; gap:.55rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:.42rem .7rem; color:var(--text); text-align:left; cursor:pointer; }
.review-list__name { display:grid; min-width:0; gap:.2rem; }
.review-list__name strong { font-size:.88rem; }
.review-list__name small { font-size:.75rem; color:var(--text-secondary); }
.review-list button:hover, .review-list button:focus-visible { border-color:var(--border-strong); background:var(--hover); }
.review-email{display:grid;gap:.65rem;padding:1rem;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface)}
.review-email h2,.review-email p{margin:0}
.review-email p{font-size:.78rem;color:var(--text-secondary)}
.review-email__notice{font-size:.78rem;color:var(--text-secondary)}
.review-email .base-button{width:fit-content}
.signature-section { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.signature-section h2, .signature-section p { margin:0; }
.signature-section p, .signature-section article span { color:var(--text-muted); }
.signature-section article { display:flex; min-height:60px; align-items:center; justify-content:space-between; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:.75rem; }
.signature-section article div { display:grid; gap:.2rem; }
@media (max-width:480px) { .signature-section article { align-items:stretch; flex-direction:column; } .signature-section article button { width:100%; } }
</style>
