<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Check, ChevronRight, ClipboardCheck, ListOrdered, MonitorCheck, Plus } from 'lucide-vue-next'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianAreaAccessEditor from '@/components/domain/services/TechnicianAreaAccessEditor.vue'
import TechnicianCriterionEditor from '@/components/domain/services/TechnicianCriterionEditor.vue'
import TechnicianDeviceReviewEditor from '@/components/domain/services/TechnicianDeviceReviewEditor.vue'
import TechnicianFindingCard from '@/components/domain/services/TechnicianFindingCard.vue'
import TechnicianFindingCreateEditor from '@/components/domain/services/TechnicianFindingCreateEditor.vue'
import TechnicianNewDeviceEditor from '@/components/domain/services/TechnicianNewDeviceEditor.vue'
import TechnicianProductsList from '@/components/domain/services/TechnicianProductsList.vue'
import { nextTechnicianRouteStep, orderedTechnicianAreas, technicianAreaResolved } from '@/helpers/technicianServices'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { MipEvaluation, TechnicianAreaAccessMutation, TechnicianCriterionEvaluationMutation, TechnicianDeviceCreationInput, TechnicianDeviceCreationMutation, TechnicianDeviceReviewInput, TechnicianDeviceReviewMutation, TechnicianFindingCreateInput, TechnicianFindingCreateMutation, TechnicianFindingStatusInput, TechnicianFindingStatusMutation } from '@/types/technicianServices'

const route = useRoute()
const router = useRouter()
const services = useTechnicianServicesStore()
const { currentPackage: packageValue, currentCache, currentMutations, syncing } = storeToRefs(services)
const serviceId = computed(() => String(route.params.id ?? ''))
const routeAreaId = computed(() => String(route.params.areaId ?? ''))
const orderedAreas = computed(() => orderedTechnicianAreas(packageValue.value?.areas ?? []))
const currentArea = computed(() => orderedAreas.value.find(area => area.id === routeAreaId.value) ?? null)
const selectedAreaId = ref(routeAreaId.value)
const loading = ref(true)
const error = ref('')
const saveError = ref('')
const newDeviceOpen = ref(false)
const newDeviceSaving = ref(false)
const openDeviceId = ref('')
const newFindingOpen = ref(false)
const findingSavingId = ref('')
const drafts = ref<Record<string, { evaluation: MipEvaluation | null; observation: string }>>({})
const deviceDrafts = ref<Record<string, { input: TechnicianDeviceReviewInput; photo: File | null }>>({})
const accessDraft = ref<{ areaId: string; withoutAccess: boolean; description: string; photo: File | null } | null>(null)
const saveQueue = new Map<string, Promise<boolean>>()
const deviceSaveQueue = new Map<string, Promise<boolean>>()
let accessSaveQueue: Promise<boolean> | null = null
const canEditRoute = computed(() => packageValue.value?.service.estado === 'EN_PROCESO' && Boolean(currentCache.value?.lock))
const findings = computed(() => currentArea.value?.hallazgos ?? [])
const next = computed(() => currentArea.value ? nextTechnicianRouteStep(orderedAreas.value, currentArea.value.id) : { kind: 'REVIEW' as const })
const nextLabel = computed(() => next.value.kind === 'AREA' ? `Siguiente: ${next.value.area.nombre}` : 'Revisar servicio')
const creationConflict = computed(() => currentMutations.value.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
  && item.areaId === currentArea.value?.id && item.status === 'CONFLICT') ?? null)

onMounted(load)
watch(routeAreaId, value => { selectedAreaId.value = value; newDeviceOpen.value = false; newFindingOpen.value = false; openDeviceId.value = '' })
watch(creationConflict, value => { if (value) newDeviceOpen.value = true })
onBeforeRouteLeave(() => flushDrafts())
onBeforeRouteUpdate(to => String(to.params.areaId ?? '') === routeAreaId.value || flushDrafts())

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try { await services.ensurePackage(serviceId.value) }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible cargar el Área.' }
  finally { loading.value = false }
}

function selectArea(areaId: string): void {
  void router.replace({ name: 'technician-service-area', params: { id: serviceId.value, areaId } })
}

function orderAreas(): void {
  void router.push({ name: 'technician-service-area-order', params: { id: serviceId.value }, query: { returnAreaId: currentArea.value?.id } })
}

function criterionMutation(criterionId: string): TechnicianCriterionEvaluationMutation | null {
  return currentMutations.value.find((item): item is TechnicianCriterionEvaluationMutation => item.kind === 'CRITERION_EVALUATION' && item.criterionId === criterionId) ?? null
}

function accessMutation(): TechnicianAreaAccessMutation | null {
  return currentMutations.value.find((item): item is TechnicianAreaAccessMutation => item.kind === 'AREA_ACCESS' && item.areaId === currentArea.value?.id) ?? null
}

function deviceMutation(serviceDeviceId: string): TechnicianDeviceReviewMutation | null {
  return currentMutations.value.find((item): item is TechnicianDeviceReviewMutation => item.kind === 'DEVICE_REVIEW' && item.serviceDeviceId === serviceDeviceId) ?? null
}

function creationMutation(serviceDeviceId: string): TechnicianDeviceCreationMutation | null {
  return currentMutations.value.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
    && item.serviceDeviceId === serviceDeviceId) ?? null
}

function findingMutation(findingId: string): TechnicianFindingCreateMutation | TechnicianFindingStatusMutation | null {
  return currentMutations.value.find((item): item is TechnicianFindingCreateMutation | TechnicianFindingStatusMutation =>
    (item.kind === 'FINDING_CREATE' || item.kind === 'FINDING_STATUS') && item.findingId === findingId) ?? null
}

async function saveNewDevice(input: TechnicianDeviceCreationInput): Promise<void> {
  if (!currentArea.value) return
  newDeviceSaving.value = true
  saveError.value = ''
  try {
    const result = creationConflict.value
      ? await services.retryDeviceCreationConflict(serviceId.value, creationConflict.value.serviceDeviceId, input)
      : await services.applyDeviceCreation(serviceId.value, currentArea.value.id, input)
    if (result !== 'conflict') newDeviceOpen.value = false
  } catch (failure) {
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible agregar el puesto de monitoreo.'
  } finally {
    newDeviceSaving.value = false
  }
}

async function discardNewDevice(): Promise<void> {
  if (!creationConflict.value) return
  newDeviceSaving.value = true
  saveError.value = ''
  try {
    await services.discardDeviceCreationConflict(serviceId.value, creationConflict.value.serviceDeviceId)
    newDeviceOpen.value = false
  } catch (failure) {
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible descartar el alta del puesto de monitoreo.'
  } finally {
    newDeviceSaving.value = false
  }
}

async function saveNewFinding(input: TechnicianFindingCreateInput, files: File[]): Promise<void> {
  if (!currentArea.value) return
  findingSavingId.value = 'new'
  saveError.value = ''
  try {
    await services.applyFindingCreate(serviceId.value, currentArea.value.id, input, files)
    newFindingOpen.value = false
  } catch (failure) {
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible registrar el Hallazgo.'
  } finally {
    findingSavingId.value = ''
  }
}

async function saveFindingStatus(findingId: string, input: TechnicianFindingStatusInput, files: File[]): Promise<void> {
  if (!currentArea.value) return
  findingSavingId.value = findingId
  saveError.value = ''
  try { await services.applyFindingStatus(serviceId.value, currentArea.value.id, findingId, input, files) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible actualizar el Hallazgo.' }
  finally { findingSavingId.value = '' }
}

async function useRemoteFinding(findingId: string): Promise<void> {
  findingSavingId.value = findingId
  saveError.value = ''
  try { await services.discardFindingConflict(serviceId.value, findingId) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible recuperar el Hallazgo sincronizado.' }
  finally { findingSavingId.value = '' }
}

async function retryFinding(findingId: string): Promise<void> {
  findingSavingId.value = findingId
  saveError.value = ''
  try { await services.retryFindingConflict(serviceId.value, findingId) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible reintentar el Hallazgo.' }
  finally { findingSavingId.value = '' }
}

function trackAccessDraft(withoutAccess: boolean, description: string, photo: File | null): void {
  if (!currentArea.value) return
  accessDraft.value = { areaId: currentArea.value.id, withoutAccess, description, photo }
}

function clearAccessDraft(expected: { areaId: string; withoutAccess: boolean; description: string; photo: File | null }): void {
  const current = accessDraft.value
  if (!current || current.areaId !== expected.areaId || current.withoutAccess !== expected.withoutAccess
    || current.description.trim() !== expected.description || current.photo !== expected.photo) return
  accessDraft.value = null
}

async function saveAccess(withoutAccess: boolean, description: string, photo: File | null): Promise<boolean> {
  if (!currentArea.value) return false
  const expected = { areaId: currentArea.value.id, withoutAccess, description: description.trim(), photo }
  const previous = accessSaveQueue ?? Promise.resolve(true)
  const task = previous.then(async () => {
    saveError.value = ''
    if (withoutAccess && (saveQueue.size || deviceSaveQueue.size)) await Promise.all([...saveQueue.values(), ...deviceSaveQueue.values()])
    try {
      const result = await services.applyAreaAccess(serviceId.value, expected.areaId, withoutAccess, expected.description, photo)
      if (result === 'conflict') return false
      if (withoutAccess) { drafts.value = {}; deviceDrafts.value = {} }
      clearAccessDraft(expected)
      return true
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : 'No fue posible guardar el acceso al Área.'
      return false
    }
  })
  accessSaveQueue = task
  const saved = await task
  if (accessSaveQueue === task) accessSaveQueue = null
  return saved
}

function trackCriterionDraft(criterionId: string, evaluation: MipEvaluation | null, observation: string): void {
  drafts.value = { ...drafts.value, [criterionId]: { evaluation, observation } }
}

function clearCriterionDraft(criterionId: string, expected?: { evaluation: MipEvaluation; observation: string }): void {
  const current = drafts.value[criterionId]
  if (!current || (expected && (current.evaluation !== expected.evaluation || current.observation.trim() !== expected.observation))) return
  const next = { ...drafts.value }
  delete next[criterionId]
  drafts.value = next
}

async function saveCriterion(criterionId: string, evaluation: MipEvaluation, observation: string, files: File[] = [], retainedEvidenceStoragePaths?: string[]): Promise<boolean> {
  if (!currentArea.value) return false
  const areaId = currentArea.value.id
  const expected = { evaluation, observation: observation.trim() }
  const previous = saveQueue.get(criterionId) ?? Promise.resolve(true)
  const task = previous.then(async () => {
    saveError.value = ''
    try {
      const result = await services.applyCriterionEvaluation(serviceId.value, areaId, criterionId, expected.evaluation, expected.observation, files, retainedEvidenceStoragePaths)
      if (result === 'conflict') return false
      clearCriterionDraft(criterionId, expected)
      return true
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : 'No fue posible guardar la evaluación.'
      return false
    }
  })
  saveQueue.set(criterionId, task)
  const saved = await task
  if (saveQueue.get(criterionId) === task) saveQueue.delete(criterionId)
  return saved
}

function trackDeviceDraft(serviceDeviceId: string, input: TechnicianDeviceReviewInput, photo: File | null): void {
  deviceDrafts.value = { ...deviceDrafts.value, [serviceDeviceId]: { input, photo } }
}

function clearDeviceDraft(serviceDeviceId: string, expected?: { input: TechnicianDeviceReviewInput; photo: File | null }): void {
  const current = deviceDrafts.value[serviceDeviceId]
  if (!current || (expected && (JSON.stringify(current.input) !== JSON.stringify(expected.input) || current.photo !== expected.photo))) return
  const next = { ...deviceDrafts.value }
  delete next[serviceDeviceId]
  deviceDrafts.value = next
}

async function saveDevice(serviceDeviceId: string, input: TechnicianDeviceReviewInput, photo: File | null): Promise<boolean> {
  if (!currentArea.value) return false
  const areaId = currentArea.value.id
  const expected = { input, photo }
  const previous = deviceSaveQueue.get(serviceDeviceId) ?? Promise.resolve(true)
  const task = previous.then(async () => {
    saveError.value = ''
    try {
      const result = await services.applyDeviceReview(serviceId.value, areaId, serviceDeviceId, input, photo)
      if (result === 'conflict') return false
      clearDeviceDraft(serviceDeviceId, expected)
      return true
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : 'No fue posible guardar la revisión del puesto de monitoreo.'
      return false
    }
  })
  deviceSaveQueue.set(serviceDeviceId, task)
  const saved = await task
  if (deviceSaveQueue.get(serviceDeviceId) === task) deviceSaveQueue.delete(serviceDeviceId)
  return saved
}

async function flushDrafts(): Promise<boolean> {
  if (accessSaveQueue) await accessSaveQueue
  if (accessDraft.value) {
    const draft = accessDraft.value
    if (draft.withoutAccess && (!draft.description.trim() || (!draft.photo && !currentArea.value?.sinAccesoFotoStoragePath && !currentArea.value?.sinAccesoFotoLocalId))) {
      saveError.value = 'Describe la novedad y adjunta una fotografía antes de salir del Área.'
      return false
    }
    if (!await saveAccess(draft.withoutAccess, draft.description, draft.photo)) return false
  }
  if (saveQueue.size) await Promise.all(saveQueue.values())
  for (const [criterionId, draft] of Object.entries(drafts.value)) {
    if (!draft.evaluation) {
      saveError.value = 'Selecciona una evaluación para guardar la observación antes de salir del Área.'
      return false
    }
    if (!await saveCriterion(criterionId, draft.evaluation, draft.observation)) return false
  }
  if (deviceSaveQueue.size) await Promise.all(deviceSaveQueue.values())
  for (const [serviceDeviceId, draft] of Object.entries(deviceDrafts.value)) {
    if (!await saveDevice(serviceDeviceId, draft.input, draft.photo)) return false
  }
  return true
}

async function useRemoteCriterion(criterionId: string): Promise<void> {
  saveError.value = ''
  try { await services.discardCriterionEvaluationConflict(serviceId.value, criterionId); clearCriterionDraft(criterionId) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible recuperar la respuesta sincronizada.' }
}

async function retryCriterion(criterionId: string): Promise<void> {
  saveError.value = ''
  try { const result = await services.retryCriterionEvaluationConflict(serviceId.value, criterionId); if (result !== 'conflict') clearCriterionDraft(criterionId) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible reintentar la evaluación.' }
}

async function useRemoteAccess(): Promise<void> {
  if (!currentArea.value) return
  saveError.value = ''
  try { await services.discardAreaAccessConflict(serviceId.value, currentArea.value.id); accessDraft.value = null }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible recuperar el estado sincronizado.' }
}

async function retryAccess(): Promise<void> {
  if (!currentArea.value) return
  saveError.value = ''
  try { const result = await services.retryAreaAccessConflict(serviceId.value, currentArea.value.id); if (result !== 'conflict') accessDraft.value = null }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible reintentar la excepción del Área.' }
}

function toggleDevice(serviceDeviceId: string): void {
  openDeviceId.value = openDeviceId.value === serviceDeviceId ? '' : serviceDeviceId
}

async function saveDeviceAndCollapse(serviceDeviceId: string, input: TechnicianDeviceReviewInput, photo: File | null): Promise<void> {
  if (await saveDevice(serviceDeviceId, input, photo)) openDeviceId.value = ''
}

async function useRemoteDevice(serviceDeviceId: string): Promise<void> {
  saveError.value = ''
  try { await services.discardDeviceReviewConflict(serviceId.value, serviceDeviceId); clearDeviceDraft(serviceDeviceId) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible recuperar la revisión sincronizada.' }
}

async function retryDevice(serviceDeviceId: string): Promise<void> {
  saveError.value = ''
  try { const result = await services.retryDeviceReviewConflict(serviceId.value, serviceDeviceId); if (result !== 'conflict') clearDeviceDraft(serviceDeviceId) }
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible reintentar la revisión del puesto de monitoreo.' }
}

function goNext(): void {
  if (next.value.kind === 'AREA') {
    void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId: next.value.area.id } })
    return
  }
  void router.push({ name: 'technician-service-review', params: { id: serviceId.value } })
}
</script>

<template>
  <ServicePage :title="currentArea?.nombre ?? 'Área'" :caption="packageValue ? `${packageValue.service.solicitud} · Recorrido de Áreas` : undefined">
    <template #actions><BaseButton v-if="canEditRoute" variant="secondary" @click="orderAreas"><ListOrdered :size="17" aria-hidden="true" />Ordenar recorrido</BaseButton></template>
    <LoadingSkeleton v-if="loading" label="Cargando Área" :rows="6" />
    <StatusPanel v-else-if="error" title="No fue posible abrir el Área" :message="error" tone="danger"><BaseButton @click="load">Reintentar</BaseButton></StatusPanel>
    <StatusPanel v-else-if="!currentArea" title="Área no disponible" message="El Área no pertenece al recorrido preparado de este servicio." tone="warning"><BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton></StatusPanel>
    <template v-else>
      <section class="area-selector"><BaseSelect :model-value="selectedAreaId" name="technician-area-selector" label="Área" @update:model-value="selectArea"><option v-for="(area, index) in orderedAreas" :key="area.id" :value="area.id">{{ index + 1 }}. {{ area.nombre }} · {{ technicianAreaResolved(area) ? 'Resuelta' : 'Pendiente' }}</option></BaseSelect></section>
      <details class="service-summary"><summary>Datos del servicio y productos</summary><dl><div><dt>Cliente</dt><dd>{{ packageValue?.service.clienteNombre }}</dd></div><div><dt>Sede</dt><dd>{{ packageValue?.service.sedeNombre }}</dd></div><div><dt>Dirección</dt><dd>{{ packageValue?.service.direccion }}</dd></div></dl><TechnicianProductsList :products="packageValue?.products ?? []" /></details>
      <section class="area-panel" aria-labelledby="area-criteria-title">
        <header><div><h2 id="area-criteria-title">Condiciones del Área</h2><p>{{ currentArea.criterios.length }} criterios aplicables · guardado automático</p></div><StatusBadge :tone="technicianAreaResolved(currentArea) ? 'success' : 'neutral'"><Check v-if="technicianAreaResolved(currentArea)" :size="15" aria-hidden="true" /><MonitorCheck v-else :size="15" aria-hidden="true" />{{ technicianAreaResolved(currentArea) ? 'Resuelta' : 'Pendiente' }}</StatusBadge></header>
        <StatusPanel v-if="saveError" title="No fue posible guardar" :message="saveError" tone="danger" />
        <TechnicianAreaAccessEditor :area="currentArea" :mutation="accessMutation()" :editable="canEditRoute" :syncing="syncing" @draft="trackAccessDraft" @save="saveAccess" @use-remote="useRemoteAccess" @retry="retryAccess" />
        <p v-if="currentArea.sinAcceso" class="area-no-access">Los criterios, puestos de monitoreo y cambios en Hallazgos quedan exceptuados porque no fue posible acceder al Área.</p>
        <div v-else class="criteria-list"><TechnicianCriterionEditor v-for="criterion in currentArea.criterios" :key="criterion.id" :criterion="criterion" :mutation="criterionMutation(criterion.id)" :editable="canEditRoute" :syncing="syncing" @draft="(evaluation, observation) => trackCriterionDraft(criterion.id, evaluation, observation)" @save="(evaluation, observation, files, retainedPaths) => saveCriterion(criterion.id, evaluation, observation, files, retainedPaths)" @use-remote="useRemoteCriterion(criterion.id)" @retry="retryCriterion(criterion.id)" /></div>
      </section>
      <details v-if="!currentArea.sinAcceso" class="area-panel area-collapsible">
        <summary><span><strong>Puestos de monitoreo</strong><small>{{ currentArea.dispositivos.length }} puestos del servicio</small></span></summary>
        <BaseButton v-if="canEditRoute && packageValue?.deviceTypes?.length" size="compact" variant="secondary" :disabled="newDeviceSaving" @click="newDeviceOpen = true"><Plus :size="17" aria-hidden="true" />Agregar puesto</BaseButton>
        <TechnicianNewDeviceEditor v-if="newDeviceOpen" :device-types="packageValue?.deviceTypes ?? []" :conflict="creationConflict" :saving="newDeviceSaving" @save="saveNewDevice" @cancel="newDeviceOpen = false" @discard="discardNewDevice" />
        <p v-else-if="canEditRoute && !packageValue?.deviceTypes?.length" class="area-empty">No hay trampas disponibles en el paquete del servicio.</p>
        <p v-if="!currentArea.dispositivos.length" class="area-empty">Esta Área no tiene puestos de monitoreo asignados.</p>
        <div v-else class="device-list"><TechnicianDeviceReviewEditor v-for="device in currentArea.dispositivos" :key="device.id" :device="device" :expanded="openDeviceId === device.id" :creation-mutation="creationMutation(device.id)" :mutation="deviceMutation(device.id)" :editable="canEditRoute" :syncing="syncing" @toggle="toggleDevice(device.id)" @draft="(input, photo) => trackDeviceDraft(device.id, input, photo)" @save="(input, photo) => saveDeviceAndCollapse(device.id, input, photo)" @use-remote="useRemoteDevice(device.id)" @retry="retryDevice(device.id)" /></div>
      </details>
      <details class="area-panel area-collapsible">
        <summary><span><strong>Hallazgos</strong><small>{{ findings.length }} registrados · {{ findings.filter(item => item.estado !== 'CERRADO').length }} pendientes</small></span></summary>
        <BaseButton v-if="canEditRoute && !currentArea.sinAcceso" size="compact" variant="secondary" :disabled="findingSavingId === 'new'" @click="newFindingOpen = true"><Plus :size="17" aria-hidden="true" />Agregar hallazgo</BaseButton>
        <p v-if="currentArea.sinAcceso" class="area-empty">Los Hallazgos anteriores siguen visibles, pero no pueden cambiarse mientras el Área esté sin acceso.</p>
        <TechnicianFindingCreateEditor v-if="newFindingOpen" :saving="findingSavingId === 'new'" @save="saveNewFinding" @cancel="newFindingOpen = false" />
        <p v-if="!findings.length" class="area-empty">No hay Hallazgos registrados para esta Área.</p>
        <div v-else class="finding-list"><TechnicianFindingCard v-for="finding in findings" :key="finding.id" :finding="finding" :current-service-id="serviceId" :mutation="findingMutation(finding.id)" :editable="canEditRoute && !currentArea.sinAcceso" :saving="findingSavingId === finding.id" @status="(input, files) => saveFindingStatus(finding.id, input, files)" @use-remote="useRemoteFinding(finding.id)" @retry="retryFinding(finding.id)" /></div>
      </details>
      <BaseButton class="area-next" @click="goNext"><ClipboardCheck v-if="next.kind === 'REVIEW'" :size="18" aria-hidden="true" /><ChevronRight v-else :size="18" aria-hidden="true" />{{ nextLabel }}</BaseButton>
    </template>
  </ServicePage>
</template>

<style scoped>
.area-selector { padding:0; }
.area-panel, .service-summary { display:grid; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:0.8rem; }
.service-summary summary { min-height:44px; cursor:pointer; font-weight:700; }
.service-summary dl { display:grid; gap:0.5rem; margin:0; }
.service-summary dt { color:var(--text-secondary); font-size:0.75rem; }
.service-summary dd { margin:0; overflow-wrap:anywhere; }
.area-selector > p, header p, .area-empty { margin:0; color:var(--text-secondary); font-size:0.8125rem; }
.area-panel > header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
.area-collapsible summary { display:flex; min-height:44px; align-items:center; cursor:pointer; }
.area-collapsible summary span { display:grid; gap:0.1rem; }
.area-collapsible summary small { color:var(--text-secondary); font-weight:400; }
h2, p, ul { margin:0; }
h2 { font-size:1rem; }
.area-list, .device-list, .finding-list { display:grid; gap:0.6rem; padding:0; list-style:none; }
.criteria-list { display:grid; gap:0.75rem; }
.area-list li { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.7rem; }
.area-list li > span { display:grid; min-width:0; gap:0.15rem; overflow-wrap:anywhere; }
.area-list small { color:var(--text-secondary); }
.area-no-access { border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.area-next { width:100%; }
@media (min-width:760px) { .area-panel, .service-summary { padding:1rem; } .area-next { justify-self:end; width:auto; } }
</style>
