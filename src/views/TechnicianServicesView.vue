<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { CloudOff, RefreshCw, Wifi } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianServiceCard from '@/components/domain/services/TechnicianServiceCard.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useNotificationsStore } from '@/stores/notifications'
import { useTechnicianServicesStore } from '@/stores/technicianServices'

const router = useRouter()
const services = useTechnicianServicesStore()
const notifications = useNotificationsStore()
const { online } = useNetworkStatus()
const { records, caches, loading, refreshing, listError, usingCachedServices } = storeToRefs(services)
const preparingId = ref('')
const hasContent = computed(() => records.value.length > 0)

onMounted(() => services.loadServices())

async function prepare(serviceId: string): Promise<void> {
  preparingId.value = serviceId
  try {
    await services.prepare(serviceId)
    notifications.show('Servicio preparado en este celular.', 'success')
  } catch (failure) {
    notifications.show(failure instanceof Error ? failure.message : 'No fue posible preparar el servicio.', 'error')
  } finally {
    preparingId.value = ''
  }
}
</script>

<template>
  <ServicePage title="Mis servicios" caption="Consulta y prepara tus visitas antes de iniciar el trabajo de campo.">
    <template #actions><BaseButton variant="secondary" :loading="refreshing" :disabled="!online" @click="services.loadServices"><RefreshCw :size="17" aria-hidden="true" />Actualizar</BaseButton></template>
    <div class="technician-network" :class="{ 'technician-network--offline': !online }" role="status" aria-live="polite">
      <Wifi v-if="online" :size="18" aria-hidden="true" /><CloudOff v-else :size="18" aria-hidden="true" />
      <div><strong>{{ online ? 'En línea' : 'Sin conexión' }}</strong><span>{{ online ? 'Puedes preparar e iniciar servicios.' : 'Solo están disponibles los servicios preparados en este celular.' }}</span></div>
    </div>
    <LoadingSkeleton v-if="loading" label="Cargando servicios" :rows="5" />
    <StatusPanel v-else-if="listError && !hasContent" title="No fue posible cargar tus servicios" :message="listError" tone="danger"><BaseButton :disabled="!online" @click="services.loadServices">Reintentar</BaseButton></StatusPanel>
    <template v-else>
      <StatusPanel v-if="listError" title="Copia local activa" :message="listError" tone="warning"><BaseButton :disabled="!online" @click="services.loadServices">Intentar actualizar</BaseButton></StatusPanel>
      <p v-if="usingCachedServices" class="technician-cache-note">Mostrando información guardada en este celular.</p>
      <StatusPanel v-if="!records.length" :title="online ? 'No tienes servicios asignados' : 'No hay servicios preparados'" :message="online ? 'Cuando te asignen un Servicio Principal aparecerá aquí.' : 'Conéctate y prepara el servicio antes de salir a campo.'" />
      <div v-else class="technician-service-list">
        <TechnicianServiceCard v-for="record in records" :key="record.id" :record="record" :cache="caches[record.id]" :preparing="preparingId === record.id" :online="online" @open="router.push(`/servicios/${record.id}/trabajo`)" @prepare="prepare(record.id)" />
      </div>
    </template>
  </ServicePage>
</template>

<style scoped>
.technician-network { display:flex; align-items:center; gap:0.75rem; border:1px solid var(--success); border-radius:var(--radius); background:var(--success-subtle); padding:0.75rem 0.9rem; color:var(--success); }
.technician-network--offline { border-color:var(--warning); background:var(--warning-subtle); color:var(--warning); }
.technician-network div { display:grid; }
.technician-network strong { font-size:0.875rem; }
.technician-network span { font-size:0.75rem; }
.technician-service-list { display:grid; gap:0.9rem; }
.technician-cache-note { margin:0; color:var(--text-secondary); font-size:0.8125rem; }
@media (min-width:760px) { .technician-service-list { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
