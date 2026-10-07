<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CloudOff, RefreshCw } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianServiceCard from '@/components/domain/services/TechnicianServiceCard.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useNotificationsStore } from '@/stores/notifications'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { technicianServicesToAutoPrepare } from '@/helpers/technicianServices'

const router = useRouter()
const services = useTechnicianServicesStore()
const notifications = useNotificationsStore()
const { online } = useNetworkStatus()
const { records, caches, loading, refreshing, listError, usingCachedServices } = storeToRefs(services)
const preparingIds = ref<string[]>([])
const prepareErrors = ref<string[]>([])
const hasContent = computed(() => records.value.length > 0)

onMounted(load)
watch(online, value => { if (value) void autoPrepare() })

async function load(): Promise<void> {
  await services.loadServices()
  void autoPrepare()
}

async function autoPrepare(): Promise<void> {
  if (!online.value) return
  const eligible = technicianServicesToAutoPrepare(records.value, caches.value, preparingIds.value)
  await Promise.allSettled(eligible.map(record => prepare(record.id, true)))
}

async function prepare(serviceId: string, silent = false): Promise<void> {
  if (preparingIds.value.includes(serviceId)) return
  preparingIds.value = [...preparingIds.value, serviceId]
  prepareErrors.value = prepareErrors.value.filter(id => id !== serviceId)
  try {
    await services.prepare(serviceId)
    if (!silent) notifications.show('Servicio descargado en este celular.', 'success')
  } catch (failure) {
    prepareErrors.value = [...prepareErrors.value, serviceId]
    if (!silent) notifications.show(failure instanceof Error ? failure.message : 'No fue posible descargar el servicio.', 'error')
  } finally {
    preparingIds.value = preparingIds.value.filter(id => id !== serviceId)
  }
}
</script>

<template>
  <ServicePage title="Mis servicios">
    <template #actions><BaseIconButton label="Actualizar servicios" :disabled="!online || refreshing" @click="load"><RefreshCw :size="19" :class="{ spinning: refreshing }" aria-hidden="true" /></BaseIconButton></template>
    <div v-if="!online" class="technician-network" role="status" aria-live="polite"><CloudOff :size="18" aria-hidden="true" /><span>Sin conexión</span></div>
    <LoadingSkeleton v-if="loading" label="Cargando servicios" :rows="5" />
    <StatusPanel v-else-if="listError && !hasContent" title="No fue posible cargar tus servicios" :message="listError" tone="danger"><BaseButton :disabled="!online" @click="services.loadServices">Reintentar</BaseButton></StatusPanel>
    <template v-else>
      <StatusPanel v-if="listError" title="Copia local activa" :message="listError" tone="warning"><BaseButton :disabled="!online" @click="services.loadServices">Intentar actualizar</BaseButton></StatusPanel>
      <p v-if="usingCachedServices" class="technician-cache-note">Mostrando información guardada en este celular.</p>
      <StatusPanel v-if="!records.length" :title="online ? 'No tienes servicios asignados' : 'No hay servicios preparados'" :message="online ? 'Cuando te asignen un Servicio Principal aparecerá aquí.' : 'Conéctate y prepara el servicio antes de salir a campo.'" />
      <div v-else class="technician-service-list">
        <TechnicianServiceCard v-for="record in records" :key="record.id" :record="record" :cache="caches[record.id]" :preparing="preparingIds.includes(record.id)" :prepare-error="prepareErrors.includes(record.id)" :online="online" @open="router.push(`/servicios/${record.id}/trabajo`)" @retry="prepare(record.id)" />
      </div>
    </template>
  </ServicePage>
</template>

<style scoped>
.technician-network { display:flex; min-height:44px; align-items:center; gap:0.5rem; width:fit-content; color:var(--warning); font-size:0.8125rem; font-weight:650; }
.technician-service-list { display:grid; gap:0.65rem; }
.technician-cache-note { margin:0; color:var(--text-secondary); font-size:0.8125rem; }
.spinning { animation:spin 0.9s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (min-width:760px) { .technician-service-list { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
