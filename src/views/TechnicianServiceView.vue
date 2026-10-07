<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Clock3, CloudOff, MapPin, PackageCheck, RefreshCw, Wifi } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianProductsList from '@/components/domain/services/TechnicianProductsList.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { formatTechnicianDateTime, orderedTechnicianAreas, technicianAreaResolved, technicianServiceStateLabel, technicianServiceStateTone } from '@/helpers/technicianServices'
import { useNotificationsStore } from '@/stores/notifications'
import { useTechnicianServicesStore } from '@/stores/technicianServices'

const route = useRoute()
const router = useRouter()
const services = useTechnicianServicesStore()
const notifications = useNotificationsStore()
const { online } = useNetworkStatus()
const { currentPackage: packageValue, currentCache, packageLoading, packageError, currentFromCache, action, pendingSyncCount } = storeToRefs(services)
const viewError = ref('')
const serviceId = computed(() => String(route.params.id ?? ''))
const localLock = computed(() => currentCache.value?.lock ?? null)
const orderedAreas = computed(() => orderedTechnicianAreas(packageValue.value?.areas ?? []))
const startMessage = computed(() => {
  if (!packageValue.value || packageValue.value.service.estado !== 'PROGRAMADO') return ''
  if (!online.value) return 'Conéctate a internet para iniciar.'
  if (!packageValue.value.canStart) return `Disponible desde ${formatTechnicianDateTime(packageValue.value.startAvailableAt)}.`
  return 'Al iniciar se congelará la información vigente y este celular quedará como editor.'
})

onMounted(load)
watch(serviceId, load)
watch(online, async value => {
  if (!value || !currentCache.value) return
  const pending = pendingSyncCount.value
  const result = await services.syncPending(serviceId.value)
  if (pending && result === 'synced') notifications.show('Los cambios del recorrido quedaron sincronizados.', 'success')
})

async function load(): Promise<void> {
  viewError.value = ''
  try {
    await services.loadPackage(serviceId.value)
    if (packageValue.value?.service.estado === 'EN_PROCESO' && localLock.value) await enterRoute()
  }
  catch (failure) { viewError.value = failure instanceof Error ? failure.message : 'No fue posible cargar el servicio.' }
}

async function start(): Promise<void> {
  viewError.value = ''
  try {
    await services.start(serviceId.value)
    notifications.show('Servicio iniciado y preparado para continuar en este celular.', 'success')
    await enterRoute()
  } catch (failure) {
    viewError.value = failure instanceof Error ? failure.message : 'No fue posible iniciar el servicio.'
    notifications.show(viewError.value, 'error')
  }
}

async function claim(): Promise<void> {
  viewError.value = ''
  try {
    await services.claim(serviceId.value)
    notifications.show('Servicio habilitado en este celular.', 'success')
    await enterRoute()
  } catch (failure) {
    viewError.value = failure instanceof Error ? failure.message : 'No fue posible habilitar el servicio.'
    notifications.show(viewError.value, 'error')
  }
}

async function enterRoute(): Promise<void> {
  const pending = orderedAreas.value.find(area => !technicianAreaResolved(area))
  await router.replace(pending
    ? { name: 'technician-service-area', params: { id: serviceId.value, areaId: pending.id } }
    : { name: 'technician-service-review', params: { id: serviceId.value } })
}
</script>

<template>
  <ServicePage :title="packageValue?.service.solicitud ?? 'Servicio'" :caption="packageValue ? `${packageValue.service.clienteNombre} · ${packageValue.service.sedeNombre}` : undefined">
    <template #actions><BaseButton variant="secondary" :loading="packageLoading" :disabled="!online || Boolean(action)" @click="load"><RefreshCw :size="17" aria-hidden="true" />Actualizar</BaseButton></template>
    <LoadingSkeleton v-if="packageLoading && !packageValue" label="Preparando servicio" :rows="6" />
    <StatusPanel v-else-if="viewError && !packageValue" title="No fue posible abrir el servicio" :message="viewError" tone="danger"><BaseButton :disabled="!online" @click="load">Reintentar</BaseButton></StatusPanel>
    <template v-else-if="packageValue">
      <div class="technician-network" :class="{ 'technician-network--offline': !online }" role="status" aria-live="polite"><Wifi v-if="online" :size="18" aria-hidden="true" /><CloudOff v-else :size="18" aria-hidden="true" /><span>{{ online ? 'En línea' : 'Sin conexión · copia local' }}</span></div>
      <StatusPanel v-if="packageError || (viewError && packageValue)" title="Revisa el estado del servicio" :message="viewError || packageError" tone="warning" />
      <section class="technician-service-hero">
        <header><div><span class="technician-service-hero__request">{{ packageValue.service.solicitud }}</span><h2>{{ packageValue.service.clienteNombre }}</h2><p>{{ packageValue.service.sedeNombre }}</p></div><StatusBadge :tone="technicianServiceStateTone(packageValue.service.estado)">{{ technicianServiceStateLabel(packageValue.service.estado) }}</StatusBadge></header>
        <dl>
          <div><dt><Clock3 :size="17" aria-hidden="true" />Programación</dt><dd>{{ formatTechnicianDateTime(packageValue.service.inicioProgramado) }}</dd></div>
          <div><dt><MapPin :size="17" aria-hidden="true" />Dirección</dt><dd>{{ packageValue.service.direccion }}</dd></div>
        </dl>
        <p class="technician-service-hero__saved"><PackageCheck :size="18" aria-hidden="true" />{{ currentFromCache ? 'Copia guardada disponible sin conexión' : `Guardado en este celular · ${formatTechnicianDateTime(currentCache?.savedAt ?? packageValue.serverNow)}` }}</p>
        <div v-if="packageValue.service.estado === 'PROGRAMADO'" class="technician-start">
          <p>{{ startMessage }}</p>
          <BaseButton :loading="action === 'START'" :disabled="!online || !packageValue.canStart" @click="start">Iniciar servicio</BaseButton>
        </div>
        <div v-else-if="packageValue.service.estado === 'EN_PROCESO'" class="technician-start">
          <p>{{ localLock ? 'Este celular conserva el acceso de edición del servicio.' : 'Activa este celular para continuar la ejecución.' }}</p>
          <BaseButton v-if="!localLock" :loading="action === 'CLAIM'" :disabled="!online" @click="claim">Activar en este celular</BaseButton>
        </div>
      </section>
      <details v-if="packageValue.service.estado === 'PROGRAMADO'" class="technician-summary"><summary>Productos previstos ({{ packageValue.products.length }})</summary><TechnicianProductsList :products="packageValue.products" /></details>
    </template>
  </ServicePage>
</template>

<style scoped>
.technician-network { display:flex; min-height:44px; align-items:center; gap:0.5rem; width:fit-content; border-radius:var(--radius); background:var(--success-subtle); padding:0.55rem 0.75rem; color:var(--success); font-size:0.8125rem; font-weight:600; }
.technician-network--offline { background:var(--warning-subtle); color:var(--warning); }
.technician-service-hero { display:grid; gap:1rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; box-shadow:var(--shadow-sm); }
.technician-service-hero header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
h2, p, dl, dd { margin:0; }
h2 { margin-top:0.15rem; font-size:1.2rem; }
header p { color:var(--text-secondary); }
.technician-service-hero__request { color:var(--text-secondary); font-size:0.75rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; }
dl { display:grid; gap:0.75rem; }
dl > div { display:grid; gap:0.2rem; }
dt { display:flex; align-items:center; gap:0.4rem; color:var(--text-secondary); font-size:0.75rem; font-weight:600; }
dd { overflow-wrap:anywhere; font-size:0.9375rem; }
.technician-service-hero__saved { display:flex; align-items:center; gap:0.5rem; border-radius:var(--radius); background:var(--success-subtle); padding:0.7rem 0.8rem; color:var(--success); font-size:0.8125rem; font-weight:600; }
.technician-start { display:grid; gap:0.75rem; border-top:1px solid var(--border); padding-top:1rem; }
.technician-start p { color:var(--text-secondary); font-size:0.875rem; }
.technician-summary { border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:0.8rem; }
.technician-summary summary { min-height:44px; cursor:pointer; font-weight:700; }
@media (min-width:760px) { .technician-service-hero { padding:1.25rem; } .technician-service-hero dl { grid-template-columns:repeat(2,minmax(0,1fr)); } .technician-start { grid-template-columns:minmax(0,1fr) auto; align-items:center; } }
</style>
