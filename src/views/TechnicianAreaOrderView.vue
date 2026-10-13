<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ArrowDown, ArrowUp, CloudOff, CloudUpload, RotateCcw } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import { moveTechnicianArea, orderedTechnicianAreas, technicianAreaResolved } from '@/helpers/technicianServices'
import { useNotificationsStore } from '@/stores/notifications'
import { useTechnicianServicesStore } from '@/stores/technicianServices'

const route = useRoute()
const router = useRouter()
const services = useTechnicianServicesStore()
const notifications = useNotificationsStore()
const { currentPackage: packageValue, currentCache, currentConflict, pendingSyncCount, syncing } = storeToRefs(services)
const serviceId = computed(() => String(route.params.id ?? ''))
const loading = ref(true)
const error = ref('')
const draft = ref<string[]>([])
const appliedIds = computed(() => orderedTechnicianAreas(packageValue.value?.areas ?? []).map(area => area.id))
const initialIds = computed(() => [...(packageValue.value?.areas ?? [])].sort((left, right) => left.posicionInicial - right.posicionInicial || left.id.localeCompare(right.id)).map(area => area.id))
const areasById = computed(() => new Map((packageValue.value?.areas ?? []).map(area => [area.id, area])))
const editable = computed(() => packageValue.value?.service.estado === 'EN_PROCESO' && Boolean(currentCache.value?.lock))
const changed = computed(() => draft.value.some((id, index) => id !== appliedIds.value[index]))
const canRetryLocalOrder = computed(() => !currentConflict.value?.conflict || (
  currentConflict.value.conflict.areaIds.length === draft.value.length
  && currentConflict.value.conflict.areaIds.every(id => draft.value.includes(id))
))

onMounted(load)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await services.ensurePackage(serviceId.value)
    draft.value = [...appliedIds.value]
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No fue posible cargar el recorrido.'
  } finally {
    loading.value = false
  }
}

function move(index: number, direction: -1 | 1): void {
  draft.value = moveTechnicianArea(draft.value, index, direction)
}

function resolved(areaId: string): boolean {
  const area = areasById.value.get(areaId)
  return area ? technicianAreaResolved(area) : false
}

async function apply(): Promise<void> {
  error.value = ''
  try {
    const result = await services.applyAreaOrder(serviceId.value, draft.value)
    if (result === 'conflict') return
    notifications.show(result === 'synced' ? 'Orden aplicado.' : 'Orden guardado en este dispositivo.', result === 'synced' ? 'success' : 'warning')
    await returnToSource()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No fue posible guardar el recorrido.'
  }
}

async function retryConflict(): Promise<void> {
  error.value = ''
  try {
    const result = await services.retryAreaOrderConflict(serviceId.value)
    if (result === 'synced') {
      notifications.show('Tu orden quedó sincronizado.', 'success')
      await returnToSource()
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No fue posible reintentar el recorrido.'
  }
}

async function useRemote(): Promise<void> {
  error.value = ''
  try {
    await services.discardAreaOrderConflict(serviceId.value)
    draft.value = [...appliedIds.value]
    notifications.show('Se conservó el orden sincronizado.', 'info')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No fue posible recuperar el orden sincronizado.'
  }
}

async function returnToSource(): Promise<void> {
  const areaId = typeof route.query.returnAreaId === 'string' ? route.query.returnAreaId : ''
  if (areaId && areasById.value.has(areaId)) {
    await router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId } })
    return
  }
  await router.push({ name: 'technician-service-work', params: { id: serviceId.value } })
}

function cancel(): void {
  void returnToSource()
}
</script>

<template>
  <ServicePage title="Ordenar recorrido" :caption="packageValue ? `${packageValue.service.solicitud} · Solo este servicio` : 'Solo este servicio'">
    <LoadingSkeleton v-if="loading" label="Cargando recorrido" :rows="5" />
    <StatusPanel v-else-if="error && !packageValue" title="No fue posible abrir el recorrido" :message="error" tone="danger"><BaseButton @click="load">Reintentar</BaseButton></StatusPanel>
    <template v-else-if="packageValue">
      <StatusPanel v-if="!editable" title="Recorrido de solo lectura" message="Inicia o recupera el servicio en este celular antes de cambiar el orden." tone="warning" />
      <StatusPanel v-if="currentConflict" title="El recorrido cambió en otro contexto" :message="currentConflict.error ?? 'Elige cuál orden conservar.'" tone="warning">
        <div v-if="currentConflict.conflict" class="route-actions"><BaseButton variant="secondary" :loading="syncing" @click="useRemote">Usar orden sincronizado</BaseButton><BaseButton v-if="canRetryLocalOrder" :loading="syncing" @click="retryConflict">Reintentar mi orden</BaseButton></div>
      </StatusPanel>
      <StatusPanel v-if="error && packageValue" title="No fue posible guardar" :message="error" tone="danger" />
      <section class="route-editor" aria-labelledby="route-editor-title">
        <header><div><h2 id="route-editor-title">Recorrido completo</h2><p>Sube o baja cada Área. Los datos técnicos permanecen asociados a su Área.</p></div><StatusBadge v-if="pendingSyncCount" tone="warning"><CloudOff :size="15" aria-hidden="true" />Pendiente</StatusBadge><StatusBadge v-else tone="success"><CloudUpload :size="15" aria-hidden="true" />Sincronizado</StatusBadge></header>
        <p v-if="!draft.length" class="route-empty">Este servicio no tiene Áreas para ordenar.</p>
        <ol v-else>
          <li v-for="(areaId, index) in draft" :key="areaId">
            <span class="route-position">{{ index + 1 }}</span>
            <span class="route-name"><strong>{{ areasById.get(areaId)?.nombre }}</strong><small>{{ resolved(areaId) ? 'Resuelta' : 'Pendiente' }}</small></span>
            <span class="route-controls"><BaseIconButton :label="`Subir ${areasById.get(areaId)?.nombre}`" :disabled="!editable || index === 0 || syncing" @click="move(index, -1)"><ArrowUp :size="20" aria-hidden="true" /></BaseIconButton><BaseIconButton :label="`Bajar ${areasById.get(areaId)?.nombre}`" :disabled="!editable || index === draft.length - 1 || syncing" @click="move(index, 1)"><ArrowDown :size="20" aria-hidden="true" /></BaseIconButton></span>
          </li>
        </ol>
        <BaseButton v-if="draft.length" variant="ghost" :disabled="!editable || syncing || draft.every((id, index) => id === initialIds[index])" @click="draft = [...initialIds]"><RotateCcw :size="17" aria-hidden="true" />Restablecer orden inicial</BaseButton>
      </section>
      <div class="route-actions"><BaseButton variant="secondary" :disabled="syncing" @click="cancel">Cancelar</BaseButton><BaseButton :loading="syncing" :disabled="!editable || !changed || Boolean(currentConflict)" @click="apply">Aplicar orden</BaseButton></div>
    </template>
  </ServicePage>
</template>

<style scoped>
.route-editor { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
.route-editor > header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
h2, p, ol { margin:0; }
h2 { font-size:1rem; }
header p, .route-empty { margin-top:0.2rem; color:var(--text-secondary); font-size:0.875rem; }
ol { display:grid; gap:0.6rem; padding:0; list-style:none; }
li { display:grid; min-width:0; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:0.65rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.45rem; }
.route-position { display:grid; width:34px; height:34px; place-items:center; border-radius:50%; background:var(--hover); color:var(--text-secondary); font-weight:700; }
.route-name { display:grid; min-width:0; gap:0.15rem; }
.route-name strong { overflow-wrap:anywhere; }
.route-name small { color:var(--text-secondary); }
.route-controls { display:flex; }
.route-actions { display:flex; justify-content:flex-end; gap:0.75rem; }
@media (max-width:520px) { .route-actions { display:grid; grid-template-columns:1fr; } .route-actions :deep(.base-button) { width:100%; } }
</style>
