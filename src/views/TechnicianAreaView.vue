<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ArrowLeft, ArrowRight, CheckCheck, CheckCircle2, ListChecks, ListOrdered, Plus, Wrench } from 'lucide-vue-next'
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
import TechnicianSiteAreaDialog from '@/components/domain/services/TechnicianSiteAreaDialog.vue'
import TechnicianServiceNavigation from '@/components/domain/services/TechnicianServiceNavigation.vue'
import '@/components/domain/services/services.css'
import { nextTechnicianRouteStep, orderedTechnicianAreas, technicianAreaIssues, technicianAreaResolved, type TechnicianAreaIssue } from '@/helpers/technicianServices'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { clearAreaAccessDraft, loadAreaAccessDraft, loadCriterionNotes, loadCriterionPhotos, saveAreaAccessDraft, saveCriterionNote, loadFindingWorkDraft, type AreaAccessDraft } from '@/services/technicianWorkDraftService'
import type { MipEvaluation, TechnicianArea, TechnicianAreaAccessMutation, TechnicianCriterionEvaluationMutation, TechnicianDeviceCreationInput, TechnicianDeviceCreationMutation, TechnicianDeviceReviewInput, TechnicianDeviceReviewMutation, TechnicianFindingCreateInput, TechnicianFindingCreateMutation, TechnicianFindingStatusInput, TechnicianFindingStatusMutation } from '@/types/technicianServices'

type AreaTab = 'CRITERIA' | 'POINTS'

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
const newAreaOpen = ref(false)
const newDeviceSaving = ref(false)
const openDeviceId = ref('')
const newFindingOpen = ref('')
const findingSavingId = ref('')
const drafts = ref<Record<string, { evaluation: MipEvaluation | null; observation: string; files: File[] }>>({})
const deviceDrafts = ref<Record<string, { input: TechnicianDeviceReviewInput; photo: File | null }>>({})
const accessDraft = ref<{ areaId: string; withoutAccess: boolean; description: string; photos: File[] } | null>(null)
const restoredAccessDraft = ref<AreaAccessDraft | null>(null)
const unratedPhotos = ref<Record<string, File[]>>({})
const unratedDrafts = ref<Record<string, string>>({})
const validationTarget = ref('')
const bulkSaving = ref(false)
const bulkMessage = ref('')
const saveQueue = new Map<string, Promise<boolean>>()
const deviceSaveQueue = new Map<string, Promise<boolean>>()
const localDraftQueue = new Map<string, Promise<void>>()
let accessSaveQueue: Promise<boolean> | null = null

const canEditRoute = computed(() => packageValue.value?.service.estado === 'EN_PROCESO' && Boolean(currentCache.value?.lock))
const findings = computed(() => currentArea.value?.hallazgos ?? [])
const activeTab = computed<AreaTab>(() => {
  const value = String(route.query.tab ?? '').toUpperCase()
  return value === 'POINTS' ? value : 'CRITERIA'
})
async function openFinding(criterionId: string): Promise<void> {
  if (await flushDrafts()) newFindingOpen.value = criterionId
}
const pendingCriteria = computed(() => currentArea.value?.criterios.filter(item => !item.evaluacion).length ?? 0)
const pendingPoints = computed(() => currentArea.value?.dispositivos.filter(item => !item.revisado).length ?? 0)
const generalFindings = computed(() => findings.value.filter(item => !currentArea.value?.criterios.some(criterion => criterion.criterioId === item.criterioId)))
const protectedPhotoPaths = computed(() => [...findings.value.flatMap(item => [...item.evidenciasAperturaStoragePaths, ...(item.evidenciasSeguimientoStoragePaths ?? [])]),
  ...currentMutations.value.flatMap(item => item.kind === 'FINDING_CREATE' || item.kind === 'FINDING_STATUS'
    ? [...(item.sharedEvidenceStoragePaths ?? []), ...item.evidences.flatMap(photo => photo.storagePath ? [photo.storagePath] : [])] : [])])
const areaIssues = computed(() => currentArea.value ? technicianAreaIssues(currentArea.value, serviceId.value) : [])
const pendingFindings = computed(() => areaIssues.value.filter(issue => issue.tab === 'criteria' && findings.value.some(item => item.id === issue.id)).length)
const activeIssue = computed(() => areaIssues.value.find(issue => issue.id === validationTarget.value) ?? null)
const stepAfterArea = computed(() => nextTechnicianRouteStep(orderedAreas.value, routeAreaId.value))
const creationConflict = computed(() => currentMutations.value.find((item): item is TechnicianDeviceCreationMutation => item.kind === 'DEVICE_CREATE'
  && item.areaId === currentArea.value?.id && item.status === 'CONFLICT') ?? null)

onMounted(async () => { await load(); await revealRequested(); if (route.query.editArea === '1') newAreaOpen.value = true })
watch(routeAreaId, value => {
  drafts.value = {}
  deviceDrafts.value = {}
  accessDraft.value = null
  validationTarget.value = ''
  bulkMessage.value = ''
  void restoreDrafts(value).then(() => revealRequested())
  selectedAreaId.value = value
  newDeviceOpen.value = false
  newFindingOpen.value = ''
  openDeviceId.value = ''
})
watch(creationConflict, value => { if (value) newDeviceOpen.value = true })
onBeforeRouteLeave(() => flushDrafts())
onBeforeRouteUpdate(to => String(to.params.areaId ?? '') === routeAreaId.value || flushDrafts())
watch(() => route.query.focus, () => { void revealRequested() })

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try { await services.ensurePackage(serviceId.value); await restoreDrafts(routeAreaId.value) }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible cargar el Área.' }
  finally { loading.value = false }
}


async function restoreDrafts(areaId: string): Promise<void> {
  const area = orderedAreas.value.find(item => item.id === areaId)
  const actorId = currentCache.value?.actorId
  if (!area || !actorId) return
  const [notes, access, findingDrafts, photos] = await Promise.all([
    loadCriterionNotes(actorId, serviceId.value, areaId, area.criterios.map(item => item.id)),
    loadAreaAccessDraft(actorId, serviceId.value, areaId),
    Promise.all([area.id, ...area.criterios.map(item => item.id)].map(async id => ({ id, draft: await loadFindingWorkDraft(actorId, serviceId.value, areaId, id) }))),
    loadCriterionPhotos(actorId, serviceId.value, areaId, area.criterios.map(item => item.id)),
  ])
  if (areaId !== routeAreaId.value) return
  unratedDrafts.value = Object.fromEntries(Object.entries(notes).filter(([id]) => !area.criterios.find(item => item.id === id)?.evaluacion))
  unratedPhotos.value = photos
  restoredAccessDraft.value = access
  const unfinished = findingDrafts.find(item => item.draft && (item.draft.description || item.draft.recommendation || item.draft.photos?.length))
  if (unfinished) newFindingOpen.value = unfinished.id === area.id ? 'general' : unfinished.id
}

async function revealRequested(): Promise<void> {
  const id = String(route.query.focus ?? '')
  if (!id || !currentArea.value || ![...currentArea.value.criterios, ...currentArea.value.dispositivos, ...findings.value].some(item => item.id === id)) return
  validationTarget.value = id
  const issue = areaIssues.value.find(item => item.id === id)
  if (issue?.tab === 'points') openDeviceId.value = id
  await nextTick()
  document.getElementById(`area-item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function showIssue(issue: TechnicianAreaIssue): Promise<void> {
  validationTarget.value = issue.id
  if (issue.tab === 'points') openDeviceId.value = issue.id
  await router.replace({ query: { ...route.query, tab: issue.tab, focus: issue.id } })
  await nextTick()
  document.getElementById(`area-item-${issue.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function goNext(section: 'criteria' | 'points'): Promise<void> {
  if (!await flushDrafts()) return
  const issues = section === 'points'
    ? [...areaIssues.value.filter(issue => issue.tab === 'points'), ...areaIssues.value.filter(issue => issue.tab !== 'points')]
    : areaIssues.value.filter(issue => issue.tab === section)
  if (issues[0]) { await showIssue(issues[0]); return }
  validationTarget.value = ''
  if (section === 'criteria') { selectTab('POINTS'); return }
  if (stepAfterArea.value.kind === 'AREA') selectArea(stepAfterArea.value.area.id)
  else openReview()
}

function goPrevious(section: 'criteria' | 'points'): void {
  validationTarget.value = ''
  if (section === 'points') { selectTab('CRITERIA'); return }
  const index = orderedAreas.value.findIndex(area => area.id === routeAreaId.value)
  const previous = orderedAreas.value[index - 1]
  if (previous) void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId: previous.id }, query: { tab: 'points' } })
  else openServiceOverview()
}

async function markPendingAsCompliant(): Promise<void> {
  if (!currentArea.value || !canEditRoute.value || bulkSaving.value) return
  bulkSaving.value = true
  bulkMessage.value = ''
  saveError.value = ''
  let marked = 0
  try {
    for (const criterion of currentArea.value.criterios.filter(item => !item.evaluacion)) {
      if (criterionMutation(criterion.id)?.status === 'CONFLICT') continue
      const note = drafts.value[criterion.id]?.observation ?? unratedDrafts.value[criterion.id] ?? criterion.observacion ?? ''
      if (await saveCriterion(criterion.id, 'C', note, [], undefined, true)) marked += 1
    }
    if (marked) {
      await nextTick()
      document.querySelector<HTMLElement>('.workspace-panel[aria-labelledby="criteria-title"] .workspace-footer')
        ?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      const status = await services.syncPending(serviceId.value)
      bulkMessage.value = status === 'conflict'
        ? `${marked} marcados; revisa el conflicto de sincronización.`
        : `${marked} criterios marcados como Cumple.`
    }
  } catch (failure) {
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible marcar todos los criterios.'
  } finally {
    bulkSaving.value = false
  }
}

function pendingForArea(area: TechnicianArea): number {
  if (area.sinAcceso) return 0
  return technicianAreaIssues(area, serviceId.value).length
}

function areaOption(area: TechnicianArea, index: number): string {
  if (area.creacionPendiente) return `○ ${index + 1}. ${area.nombre} · Pendiente de sincronizar`
  if (area.sinAcceso) return `⛔ ${index + 1}. ${area.nombre} · Sin acceso`
  if (technicianAreaResolved(area, serviceId.value)) return `✓ ${index + 1}. ${area.nombre} · Completa`
  const pending = pendingForArea(area)
  return `○ ${index + 1}. ${area.nombre} · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`
}

function selectArea(areaId: string): void {
  void router.replace({ name: 'technician-service-area', params: { id: serviceId.value, areaId }, query: { tab: activeTab.value.toLowerCase() } })
}

function selectTab(tab: AreaTab): void {
  void router.replace({ query: { ...route.query, tab: tab.toLowerCase() } })
}

function openNewArea(serviceAreaId: string): void {
  void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId: serviceAreaId } })
}

function orderAreas(): void {
  void router.push({ name: 'technician-service-area-order', params: { id: serviceId.value }, query: { returnAreaId: currentArea.value?.id } })
}

function openServiceOverview(): void {
  void router.push({ name: 'technician-service-work', params: { id: serviceId.value }, query: { overview: '1' } })
}

function openReview(): void {
  void router.push({ name: packageValue.value?.vehiclesEnabled ? 'technician-service-vehicles' : 'technician-service-review',
    params: { id: serviceId.value } })
}

const nextUnresolvedArea = computed(() => {
  const index = orderedAreas.value.findIndex(area => area.id === currentArea.value?.id)
  const others = [...orderedAreas.value.slice(index + 1), ...orderedAreas.value.slice(0, index)]
  return others.find(area => !technicianAreaResolved(area, serviceId.value)) ?? null
})
const continueLabel = computed(() => nextUnresolvedArea.value ? `Ir a ${nextUnresolvedArea.value.nombre}`
  : packageValue.value?.vehiclesEnabled ? 'Ir a vehículos' : 'Ir al cierre')
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

async function saveNewFinding(input: TechnicianFindingCreateInput, files: File[], done?: (saved: boolean) => Promise<void>): Promise<void> {
  if (!currentArea.value) return
  if (!await flushDrafts()) { await done?.(false); return }
  findingSavingId.value = input.criterionId ?? 'general'
  saveError.value = ''
  try {
    await services.applyFindingCreate(serviceId.value, currentArea.value.id, input, files)
    await done?.(true)
    newFindingOpen.value = ''
  } catch (failure) {
    await done?.(false)
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible registrar el Hallazgo.'
  } finally {
    findingSavingId.value = ''
  }
}

async function saveFindingStatus(findingId: string, input: TechnicianFindingStatusInput, files: File[], done?: (saved: boolean) => Promise<void>): Promise<void> {
  if (!currentArea.value) return
  if (!await flushDrafts()) { await done?.(false); return }
  findingSavingId.value = findingId
  saveError.value = ''
  try { await services.applyFindingStatus(serviceId.value, currentArea.value.id, findingId, input, files); await done?.(true) }
  catch (failure) { await done?.(false); saveError.value = failure instanceof Error ? failure.message : 'No fue posible actualizar el Hallazgo.' }
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
  const areaId = currentArea.value.id
  accessDraft.value = { areaId, withoutAccess, description, photos }
  const actorId = currentCache.value?.actorId
  if (!actorId || !withoutAccess) return
  const previous = localDraftQueue.get('access') ?? Promise.resolve()
  const task = previous.then(() => saveAreaAccessDraft(actorId, serviceId.value, areaId, { description, photos }))
  localDraftQueue.set('access', task)
  void task.catch(() => { saveError.value = 'No fue posible guardar el borrador local del Área.' })
}

function cancelAccessDraft(): void {
  accessDraft.value = null
  restoredAccessDraft.value = null
  const actorId = currentCache.value?.actorId
  if (actorId && currentArea.value) {
    const areaId = currentArea.value.id
    const previous = localDraftQueue.get('access') ?? Promise.resolve()
    const task = previous.then(() => clearAreaAccessDraft(actorId, serviceId.value, areaId))
    localDraftQueue.set('access', task)
    void task.catch(() => { saveError.value = 'No fue posible descartar el borrador local.' })
  }
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
      if (result === 'conflict') {
        const queued = services.mutations[serviceId.value] ?? []
        const access = queued.find(item => item.kind === 'AREA_ACCESS' && item.areaId === expected.areaId)
        // A prior unrelated conflict can block the outbox, but this Area and its photos
        // were already persisted locally. Do not ask for the same photos a second time.
        if (!access || access.status === 'CONFLICT') {
          saveError.value = access?.error || queued.find(item => item.status === 'CONFLICT')?.error
            || 'Hay otra operación pendiente que debes resolver antes de sincronizar esta Área.'
          return false
        }
      }
      if (withoutAccess) { drafts.value = {}; deviceDrafts.value = {} }
      if (currentCache.value?.actorId) {
        const actorId = currentCache.value.actorId
        await (localDraftQueue.get('access') ?? Promise.resolve())
        await clearAreaAccessDraft(actorId, serviceId.value, expected.areaId)
        restoredAccessDraft.value = null
      }
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

function trackCriterionDraft(criterionId: string, evaluation: MipEvaluation | null, observation: string, files: File[] = []): void {
  drafts.value = { ...drafts.value, [criterionId]: { evaluation, observation, files } }
  unratedPhotos.value = { ...unratedPhotos.value, [criterionId]: files }
  if (evaluation) { if (validationTarget.value === criterionId) validationTarget.value = ''; return }
  unratedDrafts.value = { ...unratedDrafts.value, [criterionId]: observation }
  const actorId = currentCache.value?.actorId
  const areaId = currentArea.value?.id
  if (!actorId || !areaId) return
  const previous = localDraftQueue.get(criterionId) ?? Promise.resolve()
  const task = previous.catch(() => {}).then(() => saveCriterionNote(actorId, serviceId.value, areaId, criterionId, observation, files))
  localDraftQueue.set(criterionId, task)
  void task.catch(() => { saveError.value = 'No fue posible conservar una observación en este celular.' })
}

function clearCriterionDraft(criterionId: string, expected?: { evaluation: MipEvaluation; observation: string; files: File[] }): void {
  const current = drafts.value[criterionId]
  if (!current || (expected && (current.evaluation !== expected.evaluation || current.observation.trim() !== expected.observation
    || current.files.length !== expected.files.length || current.files.some((file, index) => file !== expected.files[index])))) return
  const next = { ...drafts.value }
  delete next[criterionId]
  drafts.value = next
}

async function saveCriterion(criterionId: string, evaluation: MipEvaluation, observation: string, files: File[] = [], retainedEvidenceStoragePaths?: string[], deferSync = false): Promise<boolean> {
  if (!currentArea.value) return false
  const areaId = currentArea.value.id
  const expected = { evaluation, observation: observation.trim(), files: [...files] }
  const previous = saveQueue.get(criterionId) ?? Promise.resolve(true)
  const task = previous.then(async () => {
    saveError.value = ''
    try {
      const result = await services.applyCriterionEvaluation(serviceId.value, areaId, criterionId, expected.evaluation, expected.observation, files, retainedEvidenceStoragePaths, deferSync)
      if (result === 'conflict') return false
      clearCriterionDraft(criterionId, expected)
      unratedPhotos.value = { ...unratedPhotos.value,
        [criterionId]: (unratedPhotos.value[criterionId] ?? []).filter(file => !expected.files.includes(file)) }
      const actorId = currentCache.value?.actorId
      if (actorId) {
        await (localDraftQueue.get(criterionId) ?? Promise.resolve())
        await saveCriterionNote(actorId, serviceId.value, areaId, criterionId, '')
      }
      if (currentArea.value?.id === areaId) {
        const updated = { ...unratedDrafts.value }
        delete updated[criterionId]
        unratedDrafts.value = updated
        if (validationTarget.value === criterionId) validationTarget.value = ''
      }
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
  try {
    if (accessSaveQueue) await accessSaveQueue
    if (localDraftQueue.size) await Promise.all(localDraftQueue.values())
    // La excepción sin terminar permanece como borrador local; no bloquea las pestañas.
    if (accessDraft.value) {
      const draft = accessDraft.value
      const hasPhoto = draft.photos.length || currentArea.value?.sinAccesoEvidenciasStoragePaths?.length
        || currentArea.value?.sinAccesoEvidenciasLocalIds?.length || currentArea.value?.sinAccesoFotoStoragePath
      if (!draft.withoutAccess || (draft.description.trim() && hasPhoto)) {
        if (!await saveAccess(draft.withoutAccess, draft.description, draft.photos)) return false
      }
    }
    if (saveQueue.size) await Promise.all(saveQueue.values())
    for (const [criterionId, draft] of Object.entries(drafts.value)) {
      if (!draft.evaluation) continue
      if (!await saveCriterion(criterionId, draft.evaluation, draft.observation, draft.files)) return false
    }
    if (deviceSaveQueue.size) await Promise.all(deviceSaveQueue.values())
    for (const [serviceDeviceId, draft] of Object.entries(deviceDrafts.value)) {
      if (!await saveDevice(serviceDeviceId, draft.input, draft.photo)) return false
    }
    return true
  } catch (failure) {
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible guardar el borrador local.'
    return false
  }
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
  try {
    const mutation = deviceMutation(serviceDeviceId)
    const result = mutation && mutation.status !== 'CONFLICT'
      ? await services.syncPending(serviceId.value)
      : await services.retryDeviceReviewConflict(serviceId.value, serviceDeviceId)
    if (result === 'synced') clearDeviceDraft(serviceDeviceId)
  } catch (failure) {
    saveError.value = failure instanceof Error ? failure.message : 'No fue posible reintentar el puesto de monitoreo.'
  }
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
          <div class="area-picker__actions">
            <BaseButton v-if="canEditRoute" size="compact" variant="secondary" @click="newAreaOpen=true"><Plus :size="18" aria-hidden="true" />Nueva Área</BaseButton>
            <BaseButton size="compact" variant="ghost" aria-label="Ordenar Áreas" @click="orderAreas"><ListOrdered :size="18" aria-hidden="true" /><span class="order-label">Orden</span></BaseButton>
          </div>
        </div>

        <TechnicianServiceNavigation :service-id="serviceId" active="areas"
          :vehicles-enabled="Boolean(packageValue?.vehiclesEnabled)" :first-area-id="orderedAreas[0]?.id" />

        <nav v-if="!currentArea.sinAcceso" class="area-tabs" aria-label="Contenido del Área">
          <button type="button" :class="{ 'area-tabs__active': activeTab === 'CRITERIA' }" :aria-current="activeTab === 'CRITERIA' ? 'page' : undefined" @click="selectTab('CRITERIA')">
            <ListChecks :size="18" aria-hidden="true" /><span>Criterios y hallazgos</span><strong v-if="pendingCriteria + pendingFindings">{{ pendingCriteria + pendingFindings }}</strong><CheckCircle2 v-else :size="16" aria-label="Completo" />
          </button>
          <button type="button" :class="{ 'area-tabs__active': activeTab === 'POINTS' }" :aria-current="activeTab === 'POINTS' ? 'page' : undefined" @click="selectTab('POINTS')">
            <Wrench :size="18" aria-hidden="true" /><span>Puestos</span><strong v-if="pendingPoints">{{ pendingPoints }}</strong><CheckCircle2 v-else :size="16" aria-label="Completo" />
          </button>

        </nav>
      </section>

      <p v-if="currentArea.creacionPendiente" class="area-sync-notice" role="status">
        Área guardada en este celular · Se registrará en la Sede al sincronizar.
      </p>
      <p v-if="saveError" class="area-save-error" role="alert">{{ saveError }}</p>

      <TechnicianAreaAccessEditor v-if="canEditRoute || currentArea.sinAcceso"
        :area="currentArea"
        :mutation="accessMutation()"
        :failure-message="saveError"
        :editable="canEditRoute"
        :syncing="syncing"
        :continue-label="continueLabel"
        :restored-draft="restoredAccessDraft"
        @continue="continueAfterException"
        @draft="trackAccessDraft"
        @cancel="cancelAccessDraft"
        @save="handleAccessSave"
        @use-remote="useRemoteAccess"
        @retry="retryAccess"
      />

      <section v-show="!currentArea.sinAcceso && activeTab === 'CRITERIA'" class="workspace-panel" aria-labelledby="criteria-title">
        <header class="workspace-panel__actions"><div><h2 id="criteria-title">Criterios y hallazgos</h2><p>{{ currentArea.criterios.length - pendingCriteria }} de {{ currentArea.criterios.length }} completados</p></div>
          <BaseButton v-if="canEditRoute && pendingCriteria" variant="secondary" size="compact" :loading="bulkSaving" :disabled="syncing" @click="markPendingAsCompliant"><CheckCheck :size="16" aria-hidden="true" />Marcar pendientes como C</BaseButton></header>
        <p v-if="bulkMessage" class="area-inline-feedback" role="status">{{ bulkMessage }}</p>
        <div class="criteria-list"><div v-for="criterion in currentArea.criterios" :id="`area-item-${criterion.id}`" :key="criterion.id">
          <TechnicianCriterionEditor :service-id="serviceId" :actor-id="currentCache?.actorId" :draft-files="unratedPhotos[criterion.id]" :protected-paths="protectedPhotoPaths" :criterion="criterion" :mutation="criterionMutation(criterion.id)" :draft-text="unratedDrafts[criterion.id]" :validation-error="activeIssue?.id === criterion.id ? activeIssue.message : ''" :editable="canEditRoute" :syncing="syncing" @draft="(evaluation, observation, files) => trackCriterionDraft(criterion.id, evaluation, observation, files)" @save="(evaluation, observation, files, retainedPaths, done) => saveCriterion(criterion.id, evaluation, observation, files, retainedPaths).then(done)" @use-remote="useRemoteCriterion(criterion.id)" @retry="retryCriterion(criterion.id)">
            <div class="criterion-findings">
              <div v-for="finding in findings.filter(item => item.criterioId === criterion.criterioId)" :id="`area-item-${finding.id}`" :key="finding.id">
                <TechnicianFindingCard :finding="finding" :criterion="criterion" :current-service-id="serviceId" :area-id="currentArea.id" :actor-id="currentCache?.actorId" :mutation="findingMutation(finding.id)" :focus-pending="validationTarget === finding.id" :validation-error="activeIssue?.id === finding.id ? activeIssue.message : ''" :editable="canEditRoute" :saving="findingSavingId === finding.id" @status="(input, files, done) => saveFindingStatus(finding.id, input, files, done)" @use-remote="useRemoteFinding(finding.id)" @retry="retryFinding(finding.id)" />
              </div>
              <BaseButton v-if="canEditRoute && newFindingOpen !== criterion.id" size="compact" variant="ghost" :disabled="Boolean(findingSavingId)" @click="openFinding(criterion.id)"><Plus :size="16" />Registrar hallazgo</BaseButton>
              <TechnicianFindingCreateEditor v-if="newFindingOpen === criterion.id" :criterion="{ ...criterion, observacion: drafts[criterion.id]?.observation ?? unratedDrafts[criterion.id] ?? criterion.observacion }" :actor-id="currentCache?.actorId" :service-id="serviceId" :area-id="currentArea.id" :saving="findingSavingId === criterion.id" @save="saveNewFinding" @cancel="newFindingOpen = ''" />
            </div>
          </TechnicianCriterionEditor>
        </div></div>
        <section v-if="generalFindings.length || canEditRoute" class="general-findings" aria-labelledby="general-findings-title">
          <header class="workspace-panel__actions"><h3 id="general-findings-title">Otros hallazgos del Área</h3><BaseButton v-if="canEditRoute && newFindingOpen !== 'general'" size="compact" variant="ghost" @click="openFinding('general')"><Plus :size="16" />Agregar</BaseButton></header>
          <p v-if="generalFindings.length" class="area-empty">Históricos o sin un criterio relacionado.</p>
          <TechnicianFindingCreateEditor v-if="newFindingOpen === 'general'" :actor-id="currentCache?.actorId" :service-id="serviceId" :area-id="currentArea.id" :saving="findingSavingId === 'general'" @save="saveNewFinding" @cancel="newFindingOpen = ''" />
          <div v-for="finding in generalFindings" :id="`area-item-${finding.id}`" :key="finding.id">
            <TechnicianFindingCard :finding="finding" :current-service-id="serviceId" :area-id="currentArea.id" :actor-id="currentCache?.actorId" :mutation="findingMutation(finding.id)" :focus-pending="validationTarget === finding.id" :validation-error="activeIssue?.id === finding.id ? activeIssue.message : ''" :editable="canEditRoute" :saving="findingSavingId === finding.id" @status="(input, files, done) => saveFindingStatus(finding.id, input, files, done)" @use-remote="useRemoteFinding(finding.id)" @retry="retryFinding(finding.id)" />
          </div>
        </section>
        <footer class="workspace-footer"><BaseButton variant="secondary" @click="goPrevious('criteria')"><ArrowLeft :size="17" />Anterior</BaseButton><BaseButton @click="goNext('criteria')">Siguiente: Puestos<ArrowRight :size="17" /></BaseButton></footer>
      </section>

      <section v-show="!currentArea.sinAcceso && activeTab === 'POINTS'" class="workspace-panel" aria-labelledby="points-title">
        <header class="workspace-panel__actions"><div><h2 id="points-title">Puestos de monitoreo</h2><p>{{ currentArea.dispositivos.length - pendingPoints }} de {{ currentArea.dispositivos.length }} revisados</p></div><BaseButton v-if="canEditRoute && packageValue?.deviceTypes?.length" size="compact" variant="secondary" :disabled="newDeviceSaving" @click="newDeviceOpen = true"><Plus :size="17" aria-hidden="true" />Agregar puesto</BaseButton></header>
        <TechnicianNewDeviceEditor v-if="newDeviceOpen" :device-types="packageValue?.deviceTypes ?? []" :conflict="creationConflict" :saving="newDeviceSaving" @save="saveNewDevice" @cancel="newDeviceOpen = false" @discard="discardNewDevice" />
        <p v-else-if="canEditRoute && !packageValue?.deviceTypes?.length" class="area-empty">No hay trampas disponibles en el paquete del servicio.</p>
        <p v-if="!currentArea.dispositivos.length" class="area-empty">Esta Área no tiene puestos de monitoreo asignados.</p>
        <div v-else class="device-list"><div v-for="device in currentArea.dispositivos" :id="`area-item-${device.id}`" :key="device.id" class="area-focus-item" :class="{ 'area-focus-item--invalid': activeIssue?.id === device.id }">
          <TechnicianDeviceReviewEditor :device="device" :expanded="openDeviceId === device.id" :creation-mutation="creationMutation(device.id)" :mutation="deviceMutation(device.id)" :editable="canEditRoute" :syncing="syncing" @toggle="toggleDevice(device.id)" @draft="(input, photo) => trackDeviceDraft(device.id, input, photo)" @save="(input, photo) => saveDeviceAndCollapse(device.id, input, photo)" @use-remote="useRemoteDevice(device.id)" @retry="retryDevice(device.id)" />
          <p v-if="activeIssue?.id === device.id" class="area-validation" role="alert">{{ activeIssue.message }}</p>
        </div></div>
        <footer class="workspace-footer"><BaseButton variant="secondary" @click="goPrevious('points')"><ArrowLeft :size="17" />Anterior</BaseButton><BaseButton @click="goNext('points')">{{ stepAfterArea.kind === 'AREA' ? 'Siguiente área' : packageValue?.vehiclesEnabled ? 'Ir a vehículos' : 'Ir al cierre' }}<ArrowRight :size="17" /></BaseButton></footer>
      </section>


    </template>
    <TechnicianSiteAreaDialog :open="newAreaOpen" :service-id="serviceId" @close="newAreaOpen=false" @created="openNewArea" />
  </div>
</template>

<style scoped>
.criterion-findings,.general-findings { display:grid; gap:.55rem; }
.general-findings { border-top:1px solid var(--border); padding-top:.75rem; }
.general-findings h3 { margin:0; font-size:.9rem; }
.area-workspace { gap:0.75rem; padding-top:0.5rem; }
.area-workspace__sticky { position:sticky; top:0; z-index:5; display:grid; gap:0.55rem; margin-inline:-0.25rem; border-bottom:1px solid var(--border); background:color-mix(in srgb,var(--page) 96%,transparent); padding:0.35rem 0.25rem 0.65rem; backdrop-filter:blur(12px); }
.area-picker { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:0.55rem; }
.area-picker label { font-size:0.8125rem; font-weight:700; }
.area-picker__actions { display:flex; align-items:center; gap:0.35rem; }
.area-picker select { min-width:0; min-height:44px; border:1px solid var(--control-border); border-radius:var(--radius); background:var(--control-bg); padding:0 2.25rem 0 0.75rem; color:var(--text); font:inherit; font-weight:650; }
.area-tabs { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:0.35rem; }
.area-tabs button { display:flex; min-width:0; min-height:44px; align-items:center; justify-content:center; gap:0.35rem; border:1px solid transparent; border-radius:var(--radius); background:transparent; color:var(--text-secondary); font:inherit; font-size:0.8125rem; font-weight:650; cursor:pointer; }
.area-tabs button:hover { background:var(--hover); color:var(--text); }
.area-tabs { border-radius:var(--radius); background:var(--surface); padding:0.25rem; }
.area-tabs button { position:relative; }
.area-tabs__active { background:var(--accent-subtle) !important; color:var(--accent) !important; }
.area-tabs strong { display:grid; min-width:1.35rem; height:1.35rem; place-items:center; border-radius:999px; background:var(--warning-subtle); color:var(--warning); font-size:0.7rem; }
.area-tabs__neutral { background:var(--surface-raised) !important; color:var(--text-secondary) !important; }
.workspace-panel { display:grid; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:0.8rem; }
.workspace-footer { display:flex; align-items:center; justify-content:space-between; gap:.5rem; border-top:1px solid var(--border); padding-top:.65rem; }
.workspace-footer :deep(.base-button) { min-width:0; min-height:44px; font-size:.8rem; }
.workspace-footer :deep(.base-button:last-child) { flex:1; max-width:15rem; }
.area-inline-feedback { margin:0; color:var(--success); font-size:.78rem; }
.area-sync-notice { margin:0; padding:.5rem .65rem; color:var(--text-secondary); font-size:.78rem; }
.area-validation, .area-save-error { margin:.4rem 0 0; font-size:.78rem; color:var(--danger); }
.area-save-error { padding:.55rem .75rem; border:1px solid var(--danger); border-radius:var(--radius); }
.area-focus-item { border-radius:var(--radius); }
.area-focus-item--invalid { outline:1px solid var(--danger); outline-offset:2px; }
.workspace-panel > header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
.workspace-panel h2, .area-without-access h2, .workspace-panel p, .area-without-access p { margin:0; }
.workspace-panel h2, .area-without-access h2 { font-size:1rem; }
.workspace-panel header p, .area-empty, .area-without-access p { color:var(--text-secondary); font-size:0.8125rem; }
.workspace-panel__actions { align-items:center !important; }
.criteria-list, .device-list, .finding-list { display:grid; gap:0.65rem; }
.area-without-access { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:start; gap:0.75rem; border:1px solid var(--warning); border-radius:var(--radius-lg); background:var(--warning-subtle); padding:1rem; color:var(--warning); }
@media (min-width:760px) { .area-workspace__sticky { grid-template-columns:minmax(20rem,1fr) auto; align-items:end; } .area-tabs { grid-column:1/-1; } .workspace-panel { padding:1rem; } }
@media (max-width:520px) { .workspace-panel__actions { flex-wrap:wrap; } .workspace-panel__actions > .base-button { width:auto; } .workspace-footer :deep(.base-button) { padding-inline:.5rem; } }
@media (max-width:520px) { .area-picker { grid-template-columns:auto minmax(0,1fr) auto; gap:.35rem; } .area-picker__actions { gap:0; } .area-picker__actions .order-label { display:none; } .area-picker__actions > :first-child:not(:last-child) { font-size:0; padding-inline:.5rem; } .area-tabs button { font-size:.75rem; } }
</style>
