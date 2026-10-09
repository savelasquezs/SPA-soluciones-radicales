<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Mail } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import SendReportDialog from '@/components/domain/services/SendReportDialog.vue'
import TechnicianSignaturePad from '@/components/domain/services/TechnicianSignaturePad.vue'
import { orderedTechnicianAreas, technicianAreaResolved } from '@/helpers/technicianServices'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { useTechnicianReportEmailStore } from '@/stores/technicianReportEmails'

const route = useRoute()
const router = useRouter()
const services = useTechnicianServicesStore()
const emails = useTechnicianReportEmailStore()
const serviceId = computed(() => String(route.params.id ?? ''))
const loading = ref(true)
const error = ref('')
const packageValue = computed(() => services.currentPackage)
const areas = computed(() => orderedTechnicianAreas(packageValue.value?.areas ?? []))
const pending = computed(() => areas.value.filter(area => !technicianAreaResolved(area)))
const signatureRole = ref<'TECHNICIAN' | 'CLIENT' | null>(null)
const clientName = ref('')
const saving = ref(false)
const actionError = ref('')
const actionMessage = ref('')
const reportModalOpen = ref(false)
const emailInfo = ref('')
const signatures = computed(() => packageValue.value?.signatures)
const technicianSigned = computed(() => Boolean(signatures.value?.technicianStoragePath || signatures.value?.technicianLocalId))
const clientSigned = computed(() => Boolean(signatures.value?.clientStoragePath || signatures.value?.clientLocalId))
const finalization = computed(() => services.currentMutations.find(item => item.kind === 'SERVICE_FINALIZE'))
const finalized = computed(() => packageValue.value?.service.estado === 'FINALIZADO')
const canFinalize = computed(() => !pending.value.length && technicianSigned.value && clientSigned.value && Boolean(clientName.value.trim()))
const canOfferReport = computed(() => finalized.value
  || (finalization.value && finalization.value.status !== 'CONFLICT'))
const pendingEmailItems = computed(() => emails.forService(serviceId.value))
const cachedContactEmails = computed(() => {
  const service = packageValue.value?.service
  const available = [...(service?.contactEmails ?? []),service?.contactoPrincipalCorreo]
  return [...new Set(available.filter((email): email is string => typeof email === 'string' && !!email.trim()))]
})
function onReportQueued(): void {
  emailInfo.value = 'El informe quedó guardado para enviarse. Se procesará cuando el cierre esté confirmado y haya conexión.'
  void emails.refresh()
}

onMounted(async () => {
  try {
    const loaded = await services.ensurePackage(serviceId.value)
    clientName.value = loaded.signatures?.clientName ?? ''
    await emails.hydrate()
  }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible revisar el servicio.' }
  finally { loading.value = false }
})

function openArea(areaId: string): void {
  void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId } })
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
    const result = finalization.value?.status === 'CONFLICT'
      ? await services.retryFinalize(serviceId.value)
      : await services.finalizeService(serviceId.value, clientName.value)
    actionMessage.value = result === 'synced' ? 'Servicio finalizado.' : result === 'conflict'
      ? 'Revisa la información pendiente antes de volver a intentar.' : 'Cierre guardado. Se finalizará al recuperar conexión.'
    if (result === 'synced') void emails.flushAll()
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
      <StatusPanel v-if="finalized" title="Servicio finalizado" message="Las firmas y el cierre fueron confirmados por el servidor." tone="success" />
      <StatusPanel v-else-if="pending.length" title="Aún hay Áreas pendientes" :message="`${pending.length} de ${areas.length} Áreas requieren información. Puedes revisar el cierre, pero no finalizar hasta completarlas.`" tone="warning" />
      <StatusPanel v-else title="Recorrido completo" message="Las Áreas están resueltas. Registra ambas firmas para finalizar." tone="success" />
      <section class="review-list" aria-labelledby="review-areas-title"><h2 id="review-areas-title">Estado por Área</h2><button v-for="area in areas" :key="area.id" type="button" @click="openArea(area.id)"><span>{{ area.nombre }}</span><StatusBadge :tone="technicianAreaResolved(area) ? 'success' : 'neutral'">{{ technicianAreaResolved(area) ? 'Resuelta' : 'Pendiente' }}</StatusBadge></button></section>
      <section v-if="!finalized" class="signature-section" aria-labelledby="signatures-title">
        <div><h2 id="signatures-title">Firmas</h2><p>Ambas son obligatorias para cada servicio.</p></div>
        <article><div><strong>Técnico</strong><span>{{ technicianSigned ? 'Firma guardada' : 'Pendiente' }}</span></div><BaseButton variant="secondary" :disabled="saving || Boolean(finalization)" @click="signatureRole = 'TECHNICIAN'">{{ technicianSigned ? 'Firmar de nuevo' : 'Firmar' }}</BaseButton></article>
        <article><div><strong>Responsable del cliente</strong><span>{{ clientSigned ? 'Firma guardada' : 'Pendiente' }}</span></div><BaseButton variant="secondary" :disabled="saving || Boolean(finalization)" @click="signatureRole = 'CLIENT'">{{ clientSigned ? 'Firmar de nuevo' : 'Firmar' }}</BaseButton></article>
        <BaseInput v-model="clientName" name="client-signer-name" label="Nombre de quien firma por el cliente" maxlength="200" required :disabled="saving || Boolean(finalization)" />
        <StatusPanel v-if="actionError" title="No fue posible cerrar el servicio" :message="actionError" tone="danger" />
        <StatusPanel v-else-if="actionMessage" title="Estado del cierre" :message="actionMessage" :tone="actionMessage === 'Servicio finalizado.' ? 'success' : 'warning'" />
        <BaseButton :loading="saving" :disabled="!canFinalize || (Boolean(finalization) && finalization?.status !== 'CONFLICT')" @click="finish">{{ finalization?.status === 'CONFLICT' ? 'Reintentar cierre' : finalization ? 'Cierre pendiente' : 'Finalizar servicio' }}</BaseButton>
      </section>
      <section v-if="canOfferReport" class="review-email" aria-labelledby="review-email-title">
        <div><h2 id="review-email-title">Enviar informe al cliente</h2>
          <p>Opcional · Puedes seleccionar los correos registrados, añadir otros y personalizar el mensaje.</p>
        </div>
        <StatusPanel v-if="pendingEmailItems.some(item => item.status === 'NEEDS_REVIEW')"
          title="Un correo necesita revisión" tone="danger"
          message="No se pudo confirmar o completar el envío. Revisa Gmail y solicita apoyo al administrador antes de generar otro intento." />
        <StatusPanel v-else-if="pendingEmailItems.length"
          title="Envío pendiente" tone="warning"
          :message="pendingEmailItems[0]?.error || 'Guardado en este dispositivo. Se enviará después de confirmar el cierre y recuperar internet.'" />
        <p v-if="emailInfo" class="review-email__notice" role="status">{{ emailInfo }}</p>
        <BaseButton variant="secondary" size="compact" :disabled="Boolean(pendingEmailItems.length)" @click="reportModalOpen=true">
          <Mail :size="16" aria-hidden="true" /> Enviar informe
        </BaseButton>
      </section>
      <BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton>
    </template>
  </ServicePage>
  <SendReportDialog v-if="reportModalOpen && packageValue" :service-id="serviceId"
    :solicitud="packageValue.service.solicitud" :cliente="packageValue.service.clienteNombre"
    :sede="packageValue.service.sedeNombre" mode="TECNICO"
    :cached-emails="cachedContactEmails" :completion-confirmed="finalized"
    @close="reportModalOpen=false" @queued="onReportQueued" />
  <TechnicianSignaturePad v-if="signatureRole" :title="signatureRole === 'TECHNICIAN' ? 'Firma del Técnico' : 'Firma del responsable del cliente'" @cancel="signatureRole = null" @accept="acceptSignature" />
</template>

<style scoped>
.review-list { display:grid; gap:0.7rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
h2 { margin:0; font-size:1rem; }
.review-list button { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:0.75rem; color:var(--text); text-align:left; cursor:pointer; }
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
