<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import { getServiceWorkspace } from '@/services/servicesService'
import { formatServiceDate } from '@/helpers/adminServices'
import type { ServiceRecord } from '@/types/domain'
const records=ref<ServiceRecord[]>([]), loading=ref(true), error=ref('')
onMounted(load)
async function load(): Promise<void> {
  loading.value=true; error.value=''
  try { records.value=(await getServiceWorkspace(false)).services }
  catch(failure) { error.value=failure instanceof Error ? failure.message : 'No fue posible cargar tus servicios.' }
  finally { loading.value=false }
}
</script>
<template>
  <ServicePage title="Mis servicios"><template #actions><BaseButton size="compact" variant="secondary" :loading="loading" @click="load">Actualizar</BaseButton></template>
    <LoadingSkeleton v-if="loading" :rows="5" />
    <StatusPanel v-else-if="error" title="No fue posible cargar tus servicios" :message="error" tone="danger"><BaseButton size="compact" @click="load">Reintentar</BaseButton></StatusPanel>
    <StatusPanel v-else-if="!records.length" title="No tienes servicios asignados" />
    <div v-else class="svc-table-region"><table class="svc-table"><thead><tr><th>Servicio</th><th>Programación</th><th>Responsable</th></tr></thead><tbody><tr v-for="record in records" :key="record.id"><td class="svc-record-name" data-label="Servicio"><strong>{{ record.negocioNombre }} · {{ record.sedeNombre }}</strong><small>{{ record.solicitud }}</small></td><td data-label="Programación">{{ formatServiceDate(record.inicioProgramado) }}<small>{{ formatServiceDate(record.inicioProgramado,true) }} – {{ formatServiceDate(record.finProgramado,true) }}</small></td><td data-label="Responsable">{{ record.tecnicoNombre }}</td></tr></tbody></table></div>
  </ServicePage>
</template>
