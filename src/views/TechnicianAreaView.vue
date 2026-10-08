<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CheckCircle2, ClipboardCheck, FileText, ListChecks, ListOrdered, Map as MapIcon, Plus, Search, Wrench } from 'lucide-vue-next'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import TechnicianAreaAccessEditor from '@/components/domain/services/TechnicianAreaAccessEditor.vue'
import TechnicianCriterionEditor from '@/components/domain/services/TechnicianCriterionEditor.vue'
import TechnicianDeviceReviewEditor from '@/components/domain/services/TechnicianDeviceReviewEditor.vue'
import TechnicianFindingCard from '@/components/domain/services/TechnicianFindingCard.vue'
import TechnicianFindingCreateEditor from '@/components/domain/services/TechnicianFindingCreateEditor.vue'
import TechnicianNewDeviceEditor from '@/components/domain/services/TechnicianNewDeviceEditor.vue'
import '@/components/domain/services/services.css'
import { orderedTechnicianAreas, technicianAreaResolved } from '@/helpers/technicianServices'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { MipEvaluation, TechnicianArea, TechnicianAreaAccessMutation, TechnicianCriterionEvaluationMutation, TechnicianDeviceCreationInput, TechnicianDeviceCreationMutation, TechnicianDeviceReviewInput, TechnicianDeviceReviewMutation, TechnicianFindingCreateInput, TechnicianFindingCreateMutation, TechnicianFindingStatusInput, TechnicianFindingStatusMutation } from '@/types/technicianServices'

type AreaTab = 'CRITERIA' | 'POINTS' | 'FINDINGS'

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
const accessDraft = ref<{ areaId: string; withoutAccess: boolean; description: string; photos: File[] } | null>(null)
const saveQueue = new Map<string, Promise<boolean>>()
const deviceSaveQueue = new Map<string, Promise<boolean>>()
let accessSaveQueue: Promise<boolean> | null = null

const canEditRoute = computed(() => packageValue.value?.service.estado === 'EN_PROCESO' && Boolean(currentCache.value?.lock))
const findings = computed(() => currentArea.value?.hallazgos ?? [])
const activeTab = computed<AreaTab>(() => {
  const value = String(route.query.tab ?? '').toUpperCase()
  return value === 'POINTS' || value === 'FINDINGS' ? value : 'CRITERIA'
})
const pendingCriteria = computed(() => currentArea.value?.criterios.filter(item => !item.evaluacion).length ?? 0)
const pendingPoints = computed(() => currentArea.value?.dispositivos.filter(item => !item.revisado).length ?? 0)
const openFindings = computed(() => findings.value.filter(item => item.estado !== 'CERRADO').length)
const creationConflict = computed(() => currentMutations.value.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
  && item.areaId === currentArea.value?.id && item.status === 'CONFLICT') ?? null)

onMounted(load)
watch(routeAreaId, value => {
  selectedAreaId.value = value
  newDeviceOpen.value = false
  newFindingOpen.value = false
  openDeviceId.value = ''
})
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

function pendingForArea(area: TechnicianArea): number {
  if (area.sinAcceso) return 0
  return area.criterios.filter(item => !item.evaluacion).length + area.dispositivos.filter(item => !item.revisado).length
}

function areaOption(area: TechnicianArea, index: number): string {
  if (area.sinAcceso) return `⛔ ${index + 1}. ${area.nombre} · Sin acceso`
  if (technicianAreaResolved(area)) return `✓ ${index + 1}. ${area.nombre} · Completa`
  const pending = pendingForArea(area)
  return `○ ${index + 1}. ${area.nombre} · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`
}

function selectArea(areaId: string): void {
  void router.replace({ name: 'technician-service-area', params: { id: serviceId.value, areaId }, query: { tab: activeTab.value.toLowerCase() } })
}

function selectTab(tab: AreaTab): void {
  void router.replace({ query: { ...route.query, tab: tab.toLowerCase() } })
}

function orderAreas(): void {
  void router.push({ name: 'technician-service-area-order', params: { id: serviceId.value }, query: { returnAreaId: currentArea.value?.id } })
}

function openServiceOverview(): void {
  void router.push({ name: 'technician-service-work', params: { id: serviceId.value }, query: { overview: '1' } })
}

function openReview(): void {
  void router.push({ name: 'technician-service-review', params: { id: serviceId.value } })
}

const nextUnresolvedArea = computed(() => {
  const index = orderedAreas.value.findIndex(area => area.id === currentArea.value?.id)
  const others = [...orderedAreas.value.slice(index + 1), ...orderedAreas.value.slice(0, index)]
  return others.find(area => !technicianAreaResolved(area)) ?? null
})
const continueLabel = computed(() => nextUnresolvedArea.value ? `Ir a ${nextUnresolvedArea.value.nombre}` : 'Ir al cierre')
function continueAfterException(): void {
  if (nextUnresolvedArea.value) selectArea(nextUnresolvedArea.value.id)
  else openReview()
}
function handleAccessSave(withoutAccess: boolean, description: string, photos: File[], done: (saved: boolean) => void): void {
  void saveAccess(withoutAccess, description, photos).then(done).catch(() => done(false))
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

function trackAccessDraft(withoutAccess: boolean, description: string, photos: File[]): void {
  if (!currentArea.value) return
  accessDraft.value = { areaId: currentArea.value.id, withoutAccess, description, photos }
}

function clearAccessDraft(expected: { areaId: string; withoutAccess: boolean; description: string; photos: File[] }): void {
  const current = accessDraft.value
  if (!current || current.areaId !== expected.areaId || current.withoutAccess !== expected.withoutAccess
    || current.description.trim() !== expected.description || current.photos !== expected.photos) return
  accessDraft.value = null
}

async function saveAccess(withoutAccess: boolean, description: string, photos: File[]): Promise<boolean> {
  if (!currentArea.value) return false
  const expected = { areaId: currentArea.value.id, withoutAccess, description: description.trim(), photos }
  const previous = accessSaveQueue ?? Promise.resolve(true)
  const task = previous.then(async () => {
    saveError.value = ''
    if (withoutAccess && (saveQueue.size || deviceSaveQueue.size)) await Promise.all([...saveQueue.values(), ...deviceSaveQueue.values()])
    try {
      const result = await services.applyAreaAccess(serviceId.value, expected.areaId, withoutAccess, expected.description, photos)
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
      saveError.value = failure instanceof Error ? failure.message : 'No fue posible guardar el puesto de monitoreo.'
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
    if (draft.withoutAccess && (!draft.description.trim() || (!draft.photos.length && !currentArea.value?.sinAccesoEvidenciasStoragePaths?.length && !currentArea.value?.sinAccesoEvidenciasLocalIds?.length && !currentArea.value?.sinAccesoFotoStoragePath && !currentArea.value?.sinAccesoFotoLocalId))) {
      saveError.value = 'Describe la novedad y adjunta una fotografía antes de salir del Área.'
      return false
    }
    if (!await saveAccess(draft.withoutAccess, draft.description, draft.photos)) return false
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
  catch (failure) { saveError.value = failure instanceof Error ? failure.message : 'No fue posible reintentar el puesto de monitoreo.' }
}
</script>

<template>
  <div class="page svc-page area-workspace">
    <LoadingSkeleton v-if="loading" label="Cargando Área" :rows="6" />
    <StatusPanel v-else-if="error" title="No fue posible abrir el Área" :message="error" tone="danger"><BaseButton @click="load">Reintentar</BaseButton></StatusPanel>
    <StatusPanel v-else-if="!currentArea" title="Área no disponible" message="El Área no pertenece al recorrido preparado de este servicio." tone="warning"><BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton></StatusPanel>
    <template v-else>
      <section class="area-workspace__sticky" aria-label="Navegación del trabajo de campo">
        <div class="area-picker">
          <label for="technician-area-selector">Área</label>
          <select id="technician-area-selector" :value="selectedAreaId" @change="selectArea(($event.target as HTMLSelectElement).value)">
            <option v-for="(area, index) in orderedAreas" :key="area.id" :value="area.id">{{ areaOption(area, index) }}</option>
          </select>
          <BaseButton size="compact" variant="ghost" aria-label="Ordenar Áreas" @click="orderAreas"><ListOrdered :size="18" aria-hidden="true" />Orden</BaseButton>
        </div>

        <nav class="service-navigation" aria-label="Secciones del servicio">
          <button type="button" @click="openServiceOverview"><FileText :size="17" aria-hidden="true" />Servicio</button>
          <button type="button" class="service-navigation__active" aria-current="page"><MapIcon :size="17" aria-hidden="true" />Áreas</button>
          <button type="button" @click="openReview"><ClipboardCheck :size="17" aria-hidden="true" />Cierre</button>
        </nav>

        <nav v-if="!currentArea.sinAcceso" class="area-tabs" aria-label="Contenido del Área">
          <button type="button" :class="{ 'area-tabs__active': activeTab === 'CRITERIA' }" :aria-current="activeTab === 'CRITERIA' ? 'page' : undefined" @click="selectTab('CRITERIA')">
            <ListChecks :size="18" aria-hidden="true" /><span>Criterios</span><strong v-if="pendingCriteria">{{ pendingCriteria }}</strong><CheckCircle2 v-else :size="16" aria-label="Completo" />
          </button>
          <button type="button" :class="{ 'area-tabs__active': activeTab === 'POINTS' }" :aria-current="activeTab === 'POINTS' ? 'page' : undefined" @click="selectTab('POINTS')">
            <Wrench :size="18" aria-hidden="true" /><span>Puestos</span><strong v-if="pendingPoints">{{ pendingPoints }}</strong><CheckCircle2 v-else :size="16" aria-label="Completo" />
          </button>
          <button type="button" :class="{ 'area-tabs__active': activeTab === 'FINDINGS' }" :aria-current="activeTab === 'FINDINGS' ? 'page' : undefined" @click="selectTab('FINDINGS')">
            <Search :size="18" aria-hidden="true" /><span>Hallazgos</span><strong v-if="openFindings" class="area-tabs__neutral">{{ openFindings }}</strong>
          </button>
        </nav>
      </section>

      <StatusPanel v-if="saveError" title="No fue posible guardar" :message="saveError" tone="danger" />

      <TechnicianAreaAccessEditor
        :area="currentArea"
        :mutation="accessMutation()"
        :editable="canEditRoute"
        :syncing="syncing"
        :continue-label="continueLabel"
        @continue="continueAfterException"
        @draft="trackAccessDraft"
        @save="handleAccessSave"
        @use-remote="useRemoteAccess"
        @retry="retryAccess"
      />

      <section v-show="!currentArea.sinAcceso && activeTab === 'CRITERIA'" class="workspace-panel" aria-labelledby="criteria-title">
        <header><div><h2 id="criteria-title">Criterios del Área</h2><p>{{ currentArea.criterios.length - pendingCriteria }} de {{ currentArea.criterios.length }} completados</p></div></header>
        <div class="criteria-list"><TechnicianCriterionEditor v-for="criterion in currentArea.criterios" :key="criterion.id" :criterion="criterion" :mutation="criterionMutation(criterion.id)" :editable="canEditRoute" :syncing="syncing" @draft="(evaluation, observation) => trackCriterionDraft(criterion.id, evaluation, observation)" @save="(evaluation, observation, files, retainedPaths) => saveCriterion(criterion.id, evaluation, observation, files, retainedPaths)" @use-remote="useRemoteCriterion(criterion.id)" @retry="retryCriterion(criterion.id)" /></div>
      </section>

      <section v-show="!currentArea.sinAcceso && activeTab === 'POINTS'" class="workspace-panel" aria-labelledby="points-title">
        <header class="workspace-panel__actions"><div><h2 id="points-title">Puestos de monitoreo</h2><p>{{ currentArea.dispositivos.length - pendingPoints }} de {{ currentArea.dispositivos.length }} revisados</p></div><BaseButton v-if="canEditRoute && packageValue?.deviceTypes?.length" size="compact" variant="secondary" :disabled="newDeviceSaving" @click="newDeviceOpen = true"><Plus :size="17" aria-hidden="true" />Agregar puesto</BaseButton></header>
        <TechnicianNewDeviceEditor v-if="newDeviceOpen" :device-types="packageValue?.deviceTypes ?? []" :conflict="creationConflict" :saving="newDeviceSaving" @save="saveNewDevice" @cancel="newDeviceOpen = false" @discard="discardNewDevice" />
        <p v-else-if="canEditRoute && !packageValue?.deviceTypes?.length" class="area-empty">No hay trampas disponibles en el paquete del servicio.</p>
        <p v-if="!currentArea.dispositivos.length" class="area-empty">Esta Área no tiene puestos de monitoreo asignados.</p>
        <div v-else class="device-list"><TechnicianDeviceReviewEditor v-for="device in currentArea.dispositivos" :key="device.id" :device="device" :expanded="openDeviceId === device.id" :creation-mutation="creationMutation(device.id)" :mutation="deviceMutation(device.id)" :editable="canEditRoute" :syncing="syncing" @toggle="toggleDevice(device.id)" @draft="(input, photo) => trackDeviceDraft(device.id, input, photo)" @save="(input, photo) => saveDeviceAndCollapse(device.id, input, photo)" @use-remote="useRemoteDevice(device.id)" @retry="retryDevice(device.id)" /></div>
      </section>

      <section v-show="!currentArea.sinAcceso && activeTab === 'FINDINGS'" class="workspace-panel" aria-labelledby="findings-title">
        <header class="workspace-panel__actions"><div><h2 id="findings-title">Hallazgos</h2><p>{{ findings.length }} registrados · {{ openFindings }} abiertos</p></div><BaseButton v-if="canEditRoute" size="compact" variant="secondary" :disabled="findingSavingId === 'new'" @click="newFindingOpen = true"><Plus :size="17" aria-hidden="true" />Agregar hallazgo</BaseButton></header>
        <TechnicianFindingCreateEditor v-if="newFindingOpen" :saving="findingSavingId === 'new'" @save="saveNewFinding" @cancel="newFindingOpen = false" />
        <p v-if="!findings.length" class="area-empty">No hay Hallazgos registrados para esta Área.</p>
        <div v-else class="finding-list"><TechnicianFindingCard v-for="finding in findings" :key="finding.id" :finding="finding" :current-service-id="serviceId" :mutation="findingMutation(finding.id)" :editable="canEditRoute" :saving="findingSavingId === finding.id" @status="(input, files) => saveFindingStatus(finding.id, input, files)" @use-remote="useRemoteFinding(finding.id)" @retry="retryFinding(finding.id)" /></div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.area-workspace { gap:0.75rem; padding-top:0.5rem; }
.area-workspace__sticky { position:sticky; top:0; z-index:5; display:grid; gap:0.55rem; margin-inline:-0.25rem; border-bottom:1px solid var(--border); background:color-mix(in srgb,var(--page) 96%,transparent); padding:0.35rem 0.25rem 0.65rem; backdrop-filter:blur(12px); }
.area-picker { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:0.55rem; }
.area-picker label { font-size:0.8125rem; font-weight:700; }
.area-picker select { min-width:0; min-height:44px; border:1px solid var(--control-border); border-radius:var(--radius); background:var(--control-bg); padding:0 2.25rem 0 0.75rem; color:var(--text); font:inherit; font-weight:650; }
.service-navigation, .area-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.35rem; }
.service-navigation button, .area-tabs button { display:flex; min-width:0; min-height:44px; align-items:center; justify-content:center; gap:0.35rem; border:1px solid transparent; border-radius:var(--radius); background:transparent; color:var(--text-secondary); font:inherit; font-size:0.8125rem; font-weight:650; cursor:pointer; }
.service-navigation button:hover, .area-tabs button:hover { background:var(--hover); color:var(--text); }
.service-navigation__active { background:var(--surface-raised) !important; color:var(--text) !important; }
.area-tabs { border-radius:var(--radius); background:var(--surface); padding:0.25rem; }
.area-tabs button { position:relative; }
.area-tabs__active { background:var(--accent-subtle) !important; color:var(--accent) !important; }
.area-tabs strong { display:grid; min-width:1.35rem; height:1.35rem; place-items:center; border-radius:999px; background:var(--warning-subtle); color:var(--warning); font-size:0.7rem; }
.area-tabs__neutral { background:var(--surface-raised) !important; color:var(--text-secondary) !important; }
.workspace-panel { display:grid; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:0.8rem; }
.workspace-panel > header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
.workspace-panel h2, .area-without-access h2, .workspace-panel p, .area-without-access p { margin:0; }
.workspace-panel h2, .area-without-access h2 { font-size:1rem; }
.workspace-panel header p, .area-empty, .area-without-access p { color:var(--text-secondary); font-size:0.8125rem; }
.workspace-panel__actions { align-items:center !important; }
.criteria-list, .device-list, .finding-list { display:grid; gap:0.65rem; }
.area-without-access { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:0.75rem; border:1px solid var(--warning); border-radius:var(--radius-lg); background:var(--warning-subtle); padding:1rem; color:var(--warning); }
@media (min-width:760px) { .area-workspace__sticky { grid-template-columns:minmax(20rem,1fr) auto; align-items:end; } .area-tabs { grid-column:1/-1; } .workspace-panel { padding:1rem; } }
@media (max-width:420px) { .area-picker { grid-template-columns:auto minmax(0,1fr); } .area-picker > :last-child { grid-column:1/-1; justify-self:end; } .service-navigation button, .area-tabs button { font-size:0.75rem; } }
</style>
