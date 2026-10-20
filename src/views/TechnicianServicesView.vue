<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CloudOff, RefreshCw } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import TechnicianServiceCard from '@/components/domain/services/TechnicianServiceCard.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useNotificationsStore } from '@/stores/notifications'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { fetchTechnicianHistory } from '@/services/servicesService'
import { isDateOnly, toBogotaInput } from '@/helpers/adminServices'
import { sortTechnicianServices, technicianServicesToAutoPrepare } from '@/helpers/technicianServices'
import type { TechnicianHistoryPage, TechnicianServiceSummary } from '@/types/technicianServices'

const router=useRouter(),route=useRoute()
const services=useTechnicianServicesStore(),notifications=useNotificationsStore()
const {online}=useNetworkStatus()
const {records,caches,loading,refreshing,listError,usingCachedServices}=storeToRefs(services)
const preparingIds=ref<string[]>([]),prepareErrors=ref<string[]>([])
const hasContent=computed(()=>records.value.length>0)
const pending=computed(()=>records.value.filter(record=>record.estado==='PROGRAMADO'||record.estado==='EN_PROCESO'))
const query=(key:string)=>typeof route.query[key]==='string' ? route.query[key] as string : ''
const tab=computed(()=>query('tab')==='history'?'history':'pending')
const page=computed(()=>{
  const value=Number(query('page')||'1')
  return Number.isSafeInteger(value)&&value>0?Math.min(9999,value):1
})
const search=ref(query('q'))
const range=ref({from:query('from'),to:query('to')})
const rangeError=computed(()=>{
  if(!range.value.from&&!range.value.to)return ''
  if(!isDateOnly(range.value.from)||!isDateOnly(range.value.to)||range.value.from>range.value.to)
    return 'Selecciona ambas fechas en orden.'
  if((Date.parse(range.value.to)-Date.parse(range.value.from))/86_400_000>=3660)
    return 'El rango no puede superar diez años.'
  return ''
})
const history=ref<TechnicianHistoryPage|null>(null)
const historyLoading=ref(false),historyError=ref('')
let controller:AbortController|null=null,historyRequest=0
let searchTimer:ReturnType<typeof setTimeout>|null=null

function open(record:TechnicianServiceSummary):void{
  void router.push({name:'technician-service-work',params:{id:record.id}})
}
function changeTab(value:'pending'|'history'):void{
  void router.push({name:'services',query:value==='history'?{tab:'history'}:{}})
}
function changePage(value:number):void{
  void router.push({name:'services',query:{...route.query,tab:'history',page:value>1?String(value):undefined}})
}
function onRangeChange(value:{from:string;to:string}):void{range.value=value}
function syncFilters():void{
  void router.replace({name:'services',query:{tab:'history',q:search.value.trim()||undefined,
    from:range.value.from||undefined,to:range.value.to||undefined}})
}
watch([search,range],()=>{
  if(tab.value!=='history')return
  if(searchTimer!==null)clearTimeout(searchTimer)
  searchTimer=setTimeout(()=>{searchTimer=null;syncFilters()},300)
})
async function loadHistory():Promise<void>{
  controller?.abort()
  const current=++historyRequest
  if(tab.value!=='history'||!online.value||usingCachedServices.value||rangeError.value){
    historyLoading.value=false
    if(rangeError.value)historyError.value=rangeError.value
    return
  }
  const next=new AbortController()
  controller=next
  historyLoading.value=true
  historyError.value=''
  try {
    const result=await fetchTechnicianHistory({page:page.value,q:query('q'),
      from:query('from'),to:query('to')},next.signal)
    if(current===historyRequest)history.value=result
  }catch(e){
    if(!next.signal.aborted&&current===historyRequest)
      historyError.value=e instanceof Error?e.message:'No fue posible cargar el historial.'
  }finally{
    if(current===historyRequest){historyLoading.value=false;controller=null}
  }
}
const localHistory=computed(()=>{
  const byId=new Map<string,TechnicianServiceSummary>()
  for(const record of records.value)if(record.estado==='FINALIZADO')byId.set(record.id,record)
  for(const cache of Object.values(caches.value)){
    const record=cache.package.service
    if(record.estado==='FINALIZADO')byId.set(record.id,record)
  }
  return sortTechnicianServices([...byId.values()])
})
const offlineHistory=computed(()=>{
  const q=search.value.toLocaleLowerCase('es-CO').trim()
  return localHistory.value.filter(record=>{
    const searchable=[record.solicitud,record.clienteNombre,record.sedeNombre].join(' ').toLocaleLowerCase('es-CO')
    if(q&&!searchable.includes(q))return false
    const day=toBogotaInput(record.finReal??record.inicioProgramado).slice(0,10)
    return (!range.value.from||day>=range.value.from)&&(!range.value.to||day<=range.value.to)
  })
})
const localMode=computed(()=>!online.value||usingCachedServices.value)
const historyItems=computed(()=>localMode.value?offlineHistory.value:history.value?.items??[])
watch([tab,page,()=>route.query.q,()=>route.query.from,()=>route.query.to,online,usingCachedServices],
  ()=>{void loadHistory()})

async function load():Promise<void>{
  await services.loadServices()
  void autoPrepare()
  if(tab.value==='history')void loadHistory()
}
async function autoPrepare():Promise<void>{
  if(!online.value)return
  const eligible=technicianServicesToAutoPrepare(records.value,caches.value,preparingIds.value)
  await Promise.allSettled(eligible.map(record=>prepare(record.id,true)))
}
async function prepare(serviceId:string,silent=false):Promise<void>{
  if(preparingIds.value.includes(serviceId))return
  preparingIds.value=[...preparingIds.value,serviceId]
  prepareErrors.value=prepareErrors.value.filter(id=>id!==serviceId)
  try{
    await services.prepare(serviceId)
    if(!silent)notifications.show('Servicio descargado en este celular.','success')
  }catch(failure){
    prepareErrors.value=[...prepareErrors.value,serviceId]
    if(!silent)notifications.show(failure instanceof Error?failure.message:'No fue posible descargar el servicio.','error')
  }finally{
    preparingIds.value=preparingIds.value.filter(id=>id!==serviceId)
  }
}
onMounted(()=>void load())
watch(online,value=>{if(value){void autoPrepare();if(tab.value==='history')void loadHistory()}})
onBeforeUnmount(()=>{
  historyRequest++;controller?.abort()
  if(searchTimer!==null)clearTimeout(searchTimer)
})
</script>

<template>
  <ServicePage title="Mis servicios">
    <template #actions>
      <BaseIconButton label="Actualizar servicios" :disabled="!online||refreshing||historyLoading" @click="load">
        <RefreshCw :size="19" :class="{spinning:refreshing||historyLoading}" aria-hidden="true" />
      </BaseIconButton>
    </template>
    <div class="svc-tabs technician-tabs" role="tablist" aria-label="Vistas de mis servicios">
      <button role="tab" type="button" class="svc-tab" :aria-selected="tab==='pending'"
        @click="changeTab('pending')">Pendientes <span v-if="pending.length" class="svc-count">{{ pending.length }}</span></button>
      <button role="tab" type="button" class="svc-tab" :aria-selected="tab==='history'"
        @click="changeTab('history')">Historial</button>
    </div>
    <div v-if="!online" class="technician-network" role="status" aria-live="polite">
      <CloudOff :size="16" aria-hidden="true" /> Sin conexión
    </div>
    <template v-if="tab==='pending'">
      <LoadingSkeleton v-if="loading" label="Cargando servicios" :rows="5" />
      <StatusPanel v-else-if="listError&&!hasContent" title="No fue posible cargar tus servicios" :message="listError" tone="danger">
        <BaseButton :disabled="!online" @click="load">Reintentar</BaseButton>
      </StatusPanel>
      <template v-else>
        <StatusPanel v-if="listError" title="Copia local activa" :message="listError" tone="warning">
          <BaseButton :disabled="!online" @click="load">Intentar actualizar</BaseButton>
        </StatusPanel>
        <p v-if="usingCachedServices" class="technician-cache-note">Servicios disponibles en este celular.</p>
        <StatusPanel v-if="!pending.length" :title="online?'No tienes servicios pendientes':'No hay servicios preparados pendientes'"
          :message="online?'Tus próximas visitas aparecerán aquí.':'Conéctate para consultar tu asignación.'"/>
        <div v-else class="technician-service-list">
          <TechnicianServiceCard v-for="record in pending" :key="record.id" :record="record"
            :cache="caches[record.id]" :preparing="preparingIds.includes(record.id)"
            :prepare-error="prepareErrors.includes(record.id)" :online="online"
            @open="open(record)" @retry="prepare(record.id)"/>
        </div>
      </template>
    </template>
    <template v-else>
      <div class="technician-history-filters">
        <BaseInput v-model="search" name="technician-history-search" label="Buscar servicio"
          type="search" maxlength="100" placeholder="Cliente, sede o solicitud"/>
        <BaseDateRangePicker class="technician-history-range" name="technician-history-dates"
          label="Fecha de finalización" :model-value="range" :error="rangeError||undefined"
          clearable @update:model-value="onRangeChange"/>
      </div>
      <p v-if="localMode" class="technician-cache-note">
        Historial local parcial: solo servicios guardados en este celular.
      </p>
      <div v-if="historyError&&!rangeError&&!localMode" class="technician-history-error" role="alert">
        {{ historyError }}
        <BaseButton size="compact" variant="secondary" @click="loadHistory">Reintentar</BaseButton>
      </div>
      <LoadingSkeleton v-if="historyLoading&&!history" label="Consultando historial" :rows="5"/>
      <StatusPanel v-else-if="!historyItems.length&&!rangeError"
        title="Sin servicios finalizados" message="No hay servicios para los filtros seleccionados."/>
      <div v-if="!rangeError&&historyItems.length" class="technician-service-list">
        <TechnicianServiceCard v-for="record in historyItems" :key="record.id"
          :record="record" :cache="caches[record.id]" :online="online"
          @open="open(record)"/>
      </div>
      <div v-if="!localMode&&history&&history.total>history.pageSize" class="technician-history-pagination">
        <BaseButton size="compact" variant="secondary" :disabled="page<=1||historyLoading" @click="changePage(page-1)">Anterior</BaseButton>
        <span>Página {{ page }} de {{ Math.ceil(history.total/history.pageSize) }}</span>
        <BaseButton size="compact" variant="secondary"
          :disabled="page*history.pageSize>=history.total||historyLoading" @click="changePage(page+1)">Siguiente</BaseButton>
      </div>
    </template>
  </ServicePage>
</template>

<style scoped>
.technician-network{display:flex;align-items:center;gap:.35rem;color:var(--warning);font-size:.74rem}
.technician-cache-note{margin:0;color:var(--text-secondary);font-size:.73rem}
.technician-service-list{display:grid;gap:.36rem}
.technician-tabs{margin-bottom:.15rem}
.technician-history-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,1fr);gap:.5rem;align-items:start}
.technician-history-range{min-width:0}
.technician-history-error{display:flex;align-items:center;justify-content:space-between;gap:.5rem;
  padding:.5rem;color:var(--danger);font-size:.75rem;border:1px solid var(--danger);border-radius:var(--radius)}
.technician-history-pagination{display:flex;gap:.6rem;justify-content:center;align-items:center;padding:.6rem 0}
.technician-history-pagination span{font-size:.75rem;color:var(--text-secondary)}
.spinning{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(min-width:760px){.technician-service-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1360px){.technician-service-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:680px){.technician-history-filters{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.spinning{animation:none}}
</style>
