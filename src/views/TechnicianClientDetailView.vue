<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Clock3, MapPin, RefreshCw } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianClientContact from '@/components/domain/services/TechnicianClientContact.vue'
import { formatTechnicianDateTime, technicianServiceStateLabel, technicianServiceStateTone } from '@/helpers/technicianServices'
import { fetchTechnicianServiceContact } from '@/services/servicesService'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import type { TechnicianServiceSummary } from '@/types/technicianServices'

const route=useRoute()
const technician=useTechnicianServicesStore()
const {online}=useNetworkStatus()
const id=computed(()=>String(route.params.id??''))
const record=ref<TechnicianServiceSummary|null>(null)
const loading=ref(false),error=ref('')
let sequence=0
async function load():Promise<void>{
  const current=++sequence
  error.value=''
  try {
    await technician.hydrateCaches()
    if(current!==sequence)return
    const cached=technician.caches[id.value]?.package.service??technician.records.find(s=>s.id===id.value)
    if(cached)record.value=cached
    if(!online.value){
      if(!record.value)error.value='Conéctate para consultar los datos del cliente.'
      return
    }
    loading.value=true
    const loaded=await fetchTechnicianServiceContact(id.value)
    if(current===sequence)record.value=loaded
  }catch(failure) {
    if(current===sequence)error.value=failure instanceof Error?failure.message:'No fue posible cargar el contacto.'
  }finally {
    if(current===sequence)loading.value=false
  }
}
onMounted(()=>void load())
watch(id,()=>{record.value=null;void load()})
watch(online,value=>{if(value)void load()})
</script>

<template>
  <ServicePage title="Datos del cliente" :caption="record?.solicitud">
    <template #actions><BaseButton variant="secondary" size="compact" @click="load">
      <RefreshCw :size="16" aria-hidden="true"/> Actualizar
    </BaseButton></template>
    <LoadingSkeleton v-if="loading&&!record" label="Cargando datos del cliente" :rows="3"/>
    <StatusPanel v-if="error" title="Contacto no actualizado" :message="error" tone="warning"/>
    <section v-if="record" class="technician-client-detail">
      <header>
        <div><h2>{{ record.clienteNombre }}</h2><p>{{ record.sedeNombre }}</p></div>
        <StatusBadge :tone="technicianServiceStateTone(record.estado)">{{ technicianServiceStateLabel(record.estado) }}</StatusBadge>
      </header>
      <p v-if="record.tipoServicio==='REFUERZO'" class="technician-client-detail__notice">
        Refuerzo · información de solo consulta. La ejecución y la reprogramación no están disponibles.
      </p>
      <dl>
        <div><dt><Clock3 :size="16" aria-hidden="true"/> Programación</dt>
          <dd>{{ formatTechnicianDateTime(record.inicioProgramado) }}</dd></div>
        <div><dt><MapPin :size="16" aria-hidden="true"/> Dirección</dt>
          <dd>{{ record.direccion }}</dd></div>
      </dl>
      <TechnicianClientContact :service="record"/>
    </section>
    <div v-else-if="!loading&&!error" class="technician-client-detail__empty">Sin datos disponibles.</div>
  </ServicePage>
</template>

<style scoped>
.technician-client-detail{display:grid;gap:.8rem;border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:1rem;background:var(--surface);min-width:0}
.technician-client-detail>header{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem}
.technician-client-detail h2{margin:0;font-size:1.1rem;line-height:1.35}
.technician-client-detail header p{margin:.1rem 0 0;color:var(--text-secondary);font-size:.8rem}
.technician-client-detail dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:0}
.technician-client-detail dt{display:flex;align-items:center;gap:.35rem;font-size:.72rem;color:var(--text-secondary)}
.technician-client-detail dd{margin:.2rem 0 0;font-size:.87rem;overflow-wrap:anywhere}
.technician-client-detail__notice{font-size:.78rem;color:var(--text-secondary);margin:0}
.technician-client-detail__empty{color:var(--text-secondary)}
@media(max-width:650px){.technician-client-detail dl{grid-template-columns:1fr}}
</style>
