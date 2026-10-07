<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Check, ChevronRight, ClipboardCheck, ListOrdered, MonitorCheck } from 'lucide-vue-next'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianCriterionEditor from '@/components/domain/services/TechnicianCriterionEditor.vue'
import { nextTechnicianArea, orderedTechnicianAreas, technicianAreaResolved } from '@/helpers/technicianServices'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import type { MipEvaluation, TechnicianCriterionEvaluationMutation } from '@/types/technicianServices'

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
const drafts = ref<Record<string, { evaluation: MipEvaluation | null; observation: string }>>({})
const saveQueue = new Map<string, Promise<boolean>>()
const canEditRoute = computed(() => packageValue.value?.service.estado === 'EN_PROCESO' && Boolean(currentCache.value?.lock))
const next = computed(() => currentArea.value ? nextTechnicianArea(orderedAreas.value, currentArea.value.id) : { kind: 'PENDING' as const })
const nextLabel = computed(() => next.value.kind === 'AREA' ? `Siguiente: ${next.value.area.nombre}` : next.value.kind === 'CLOSURE' ? 'Revisar cierre' : 'Revisar pendientes')

onMounted(load)
watch(routeAreaId, value => { selectedAreaId.value = value })
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

async function saveCriterion(criterionId: string, evaluation: MipEvaluation, observation: string): Promise<boolean> {
  if (!currentArea.value) return false
  const areaId = currentArea.value.id
  const expected = { evaluation, observation: observation.trim() }
  const previous = saveQueue.get(criterionId) ?? Promise.resolve(true)
  const task = previous.then(async () => {
    saveError.value = ''
    try {
      const result = await services.applyCriterionEvaluation(serviceId.value, areaId, criterionId, expected.evaluation, expected.observation)
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

async function flushDrafts(): Promise<boolean> {
  if (saveQueue.size) await Promise.all(saveQueue.values())
  for (const [criterionId, draft] of Object.entries(drafts.value)) {
    if (!draft.evaluation) {
      saveError.value = 'Selecciona una evaluación para guardar la observación antes de salir del Área.'
      return false
    }
    if (!await saveCriterion(criterionId, draft.evaluation, draft.observation)) return false
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

function goNext(): void {
  if (next.value.kind === 'AREA') {
    void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId: next.value.area.id } })
    return
  }
  if (next.value.kind === 'CLOSURE') {
    void router.push({ name: 'technician-service-review', params: { id: serviceId.value } })
    return
  }
  void router.push({ name: 'technician-service-work', params: { id: serviceId.value } })
}
</script>

<template>
  <ServicePage :title="currentArea?.nombre ?? 'Área'" :caption="packageValue ? `${packageValue.service.solicitud} · Recorrido de Áreas` : undefined">
    <template #actions><BaseButton v-if="canEditRoute" variant="secondary" @click="orderAreas"><ListOrdered :size="17" aria-hidden="true" />Ordenar recorrido</BaseButton></template>
    <LoadingSkeleton v-if="loading" label="Cargando Área" :rows="6" />
    <StatusPanel v-else-if="error" title="No fue posible abrir el Área" :message="error" tone="danger"><BaseButton @click="load">Reintentar</BaseButton></StatusPanel>
    <StatusPanel v-else-if="!currentArea" title="Área no disponible" message="El Área no pertenece al recorrido preparado de este servicio." tone="warning"><BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton></StatusPanel>
    <template v-else>
      <section class="area-selector"><BaseSelect :model-value="selectedAreaId" name="technician-area-selector" label="Área del recorrido" @update:model-value="selectArea"><option v-for="(area, index) in orderedAreas" :key="area.id" :value="area.id">{{ index + 1 }}. {{ area.nombre }} · {{ technicianAreaResolved(area) ? 'Resuelta' : 'Pendiente' }}</option></BaseSelect><p>Mismo orden aplicado para la lista y la navegación siguiente.</p></section>
      <section class="area-panel" aria-labelledby="area-criteria-title">
        <header><div><h2 id="area-criteria-title">Condiciones del Área</h2><p>{{ currentArea.criterios.length }} criterios aplicables · guardado automático</p></div><StatusBadge :tone="technicianAreaResolved(currentArea) ? 'success' : 'neutral'"><Check v-if="technicianAreaResolved(currentArea)" :size="15" aria-hidden="true" /><MonitorCheck v-else :size="15" aria-hidden="true" />{{ technicianAreaResolved(currentArea) ? 'Resuelta' : 'Pendiente' }}</StatusBadge></header>
        <StatusPanel v-if="saveError" title="No fue posible guardar" :message="saveError" tone="danger" />
        <p v-if="currentArea.sinAcceso" class="area-no-access"><strong>Sin acceso:</strong> {{ currentArea.sinAccesoDescripcion }}</p>
        <div v-else class="criteria-list"><TechnicianCriterionEditor v-for="criterion in currentArea.criterios" :key="criterion.id" :criterion="criterion" :mutation="criterionMutation(criterion.id)" :editable="canEditRoute" :syncing="syncing" @draft="(evaluation, observation) => trackCriterionDraft(criterion.id, evaluation, observation)" @save="(evaluation, observation) => saveCriterion(criterion.id, evaluation, observation)" @use-remote="useRemoteCriterion(criterion.id)" @retry="retryCriterion(criterion.id)" /></div>
      </section>
      <section class="area-panel" aria-labelledby="area-devices-title">
        <header><div><h2 id="area-devices-title">Dispositivos</h2><p>{{ currentArea.dispositivos.length }} puntos congelados</p></div></header>
        <p v-if="!currentArea.dispositivos.length" class="area-empty">Esta Área no tiene Dispositivos asignados.</p>
        <ul v-else class="area-list"><li v-for="device in currentArea.dispositivos" :key="device.id"><span><strong>{{ device.numero }}</strong><small>{{ device.ubicacion }}</small></span><StatusBadge :tone="device.revisado ? 'success' : 'neutral'">{{ device.revisado ? 'Revisado' : 'Pendiente' }}</StatusBadge></li></ul>
      </section>
      <BaseButton class="area-next" @click="goNext"><ClipboardCheck v-if="next.kind !== 'AREA'" :size="18" aria-hidden="true" /><ChevronRight v-else :size="18" aria-hidden="true" />{{ nextLabel }}</BaseButton>
    </template>
  </ServicePage>
</template>

<style scoped>
.area-selector, .area-panel { display:grid; gap:0.85rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.area-selector > p, header p, .area-empty { margin:0; color:var(--text-secondary); font-size:0.8125rem; }
.area-panel > header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
h2, p, ul { margin:0; }
h2 { font-size:1rem; }
.area-list { display:grid; gap:0.6rem; padding:0; list-style:none; }
.criteria-list { display:grid; gap:0.75rem; }
.area-list li { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.7rem; }
.area-list li > span { display:grid; min-width:0; gap:0.15rem; overflow-wrap:anywhere; }
.area-list small { color:var(--text-secondary); }
.area-no-access { border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.area-next { width:100%; }
@media (min-width:760px) { .area-selector, .area-panel { padding:1.25rem; } .area-next { justify-self:end; width:auto; } }
</style>
