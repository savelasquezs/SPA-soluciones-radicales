<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
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

onMounted(async () => {
  try { await services.ensurePackage(serviceId.value) }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible revisar el servicio.' }
  finally { loading.value = false }
})

function openArea(areaId: string): void {
  void router.push({ name: 'technician-service-area', params: { id: serviceId.value, areaId } })
}
</script>

<template>
  <ServicePage title="Revisión del recorrido" :caption="packageValue?.service.solicitud">
    <LoadingSkeleton v-if="loading" label="Revisando pendientes" :rows="5" />
    <StatusPanel v-else-if="error" title="No fue posible revisar el servicio" :message="error" tone="danger" />
    <template v-else-if="packageValue">
      <StatusPanel v-if="pending.length" title="Aún hay Áreas pendientes" :message="`${pending.length} de ${areas.length} Áreas requieren información antes del cierre.`" tone="warning" />
      <StatusPanel v-else title="Recorrido completo" message="Las Áreas están resueltas. Las firmas y la finalización se validarán en la etapa de cierre." tone="success" />
      <section class="review-list" aria-labelledby="review-areas-title"><h2 id="review-areas-title">Estado por Área</h2><button v-for="area in areas" :key="area.id" type="button" @click="openArea(area.id)"><span>{{ area.nombre }}</span><StatusBadge :tone="technicianAreaResolved(area) ? 'success' : 'neutral'">{{ technicianAreaResolved(area) ? 'Resuelta' : 'Pendiente' }}</StatusBadge></button></section>
      <BaseButton variant="secondary" @click="router.push({ name: 'technician-service-work', params: { id: serviceId } })">Volver al servicio</BaseButton>
    </template>
  </ServicePage>
</template>

<style scoped>
.review-list { display:grid; gap:0.7rem; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); padding:1rem; }
h2 { margin:0; font-size:1rem; }
.review-list button { display:flex; min-height:52px; align-items:center; justify-content:space-between; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:0.75rem; color:var(--text); text-align:left; cursor:pointer; }
.review-list button:hover, .review-list button:focus-visible { border-color:var(--border-strong); background:var(--hover); }
</style>
