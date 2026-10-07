<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianSignaturePad from '@/components/domain/services/TechnicianSignaturePad.vue'
import { orderedTechnicianAreas, technicianAreaResolved } from '@/helpers/technicianServices'
import { useTechnicianServicesStore } from '@/stores/technicianServices'

const route = useRoute()
const router = useRouter()
const services = useTechnicianServicesStore()
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
const signatures = computed(() => packageValue.value?.signatures)
const technicianSigned = computed(() => Boolean(signatures.value?.technicianStoragePath || signatures.value?.technicianLocalId))
const clientSigned = computed(() => Boolean(signatures.value?.clientStoragePath || signatures.value?.clientLocalId))
const finalization = computed(() => services.currentMutations.find(item => item.kind === 'SERVICE_FINALIZE'))
const finalized = computed(() => packageValue.value?.service.estado === 'FINALIZADO')
const canFinalize = computed(() => !pending.value.length && technicianSigned.value && clientSigned.value && Boolean(clientName.value.trim()))

onMounted(async () => {
  try {
    const loaded = await services.ensurePackage(serviceId.value)
    clientName.value = loaded.signatures?.clientName ?? ''
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
  } catch (failure) {
    actionError.value = failure instanceof Error ? failure.message : 'No fue posible finalizar el servicio.'
  } finally { saving.value = false }
}
</script>

<template>
  <ServicePage title="Revisión del recorrido" :caption="packageValue?.service.solicitud">
    <LoadingSkeleton v-if="loading" label="Revisando pendientes" :rows="5" />
    <StatusPanel v-else-if="error" title="No fue posible revisar el servicio" :message="error" tone="danger" />
    <template v-else-if="packageValue">
      <StatusPanel v-if="finalized" title="Servicio finalizado" message="Las firmas y el cierre fueron confirmados por el servidor." tone="success" />
      <StatusPanel v-else-if="pending.length" title="Aún hay Áreas pendientes" :message="`${pending.length} de ${areas.length} Áreas requieren información antes del cierre.`" tone="warning" />
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
      <BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton>
    </template>
  </ServicePage>
  <TechnicianSignaturePad v-if="signatureRole" :title="signatureRole === 'TECHNICIAN' ? 'Firma del Técnico' : 'Firma del responsable del cliente'" @cancel="signatureRole = null" @accept="acceptSignature" />
</template>

<style scoped>
.review-list { display:grid; gap:0.7rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
h2 { margin:0; font-size:1rem; }
.review-list button { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:0.75rem; color:var(--text); text-align:left; cursor:pointer; }
.review-list button:hover, .review-list button:focus-visible { border-color:var(--border-strong); background:var(--hover); }
.signature-section { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.signature-section h2, .signature-section p { margin:0; }
.signature-section p, .signature-section article span { color:var(--text-muted); }
.signature-section article { display:flex; min-height:60px; align-items:center; justify-content:space-between; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:.75rem; }
.signature-section article div { display:grid; gap:.2rem; }
@media (max-width:480px) { .signature-section article { align-items:stretch; flex-direction:column; } .signature-section article button { width:100%; } }
</style>
