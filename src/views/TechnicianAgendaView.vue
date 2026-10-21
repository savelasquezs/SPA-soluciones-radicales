<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ChevronLeft, ChevronRight, CloudOff, RefreshCw } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import ServiceDayStrip from '@/components/domain/services/ServiceDayStrip.vue'
import TechnicianServiceCard from '@/components/domain/services/TechnicianServiceCard.vue'
import { addDateDays, isDateOnly, todayBogota, toBogotaInput } from '@/helpers/adminServices'
import { fetchTechnicianAgenda } from '@/services/servicesService'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import type { TechnicianServiceSummary } from '@/types/technicianServices'

const route=useRoute(),router=useRouter(),store=useTechnicianServicesStore()
const {caches}=storeToRefs(store)
const {online}=useNetworkStatus()
const today=todayBogota()
function query(key:string):string{return typeof route.query[key]==='string'?route.query[key] as string:''}
function monday(day:string):string{
  const weekday=new Date(day+'T12:00:00Z').getUTCDay()
  return addDateDays(day,-((weekday+6)%7))
}
const from=computed(()=>monday(isDateOnly(query('week'))?query('week'):today))
const until=computed(()=>addDateDays(from.value,6))
const selected=computed(()=>{
  const q=query('day')
  if(isDateOnly(q)&&q>=from.value&&q<=until.value)return q
  return today>=from.value&&today<=until.value?today:from.value
})
const days=computed(()=>Array.from({length:7},(_,index)=>addDateDays(from.value,index)))
const remote=ref<TechnicianServiceSummary[]>([])
const loading=ref(false),error=ref('')
let controller:AbortController|null=null,requestId=0
const localDay=(record:TechnicianServiceSummary)=>toBogotaInput(record.inicioProgramado).slice(0,10)
const items=computed(()=>{
  const byId=new Map<string,TechnicianServiceSummary>()
  for(const record of remote.value)if(localDay(record)>=from.value&&localDay(record)<=until.value)byId.set(record.id,record)
  if(!online.value){
    for(const cache of Object.values(caches.value)){
      const record=cache.package.service
      if(localDay(record)>=from.value&&localDay(record)<=until.value)
        byId.set(record.id,record)
    }
  }
  return [...byId.values()].sort((a,b)=>new Date(a.inicioProgramado).getTime()-new Date(b.inicioProgramado).getTime()||a.id.localeCompare(b.id))
})
const counts=computed(()=>Object.fromEntries(days.value.map(date=>[date,items.value.filter(record=>localDay(record)===date).length])))
const dayRecords=(day:string)=>items.value.filter(record=>localDay(record)===day)
const readableDate=(day:string)=>new Intl.DateTimeFormat('es-CO',{
  weekday:'short',day:'numeric',month:'short',timeZone:'UTC',
}).format(new Date(day+'T12:00:00Z'))
const weekTitle=computed(()=>new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',timeZone:'UTC'})
  .format(new Date(from.value+'T12:00:00Z'))+' – '+
  new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
  .format(new Date(until.value+'T12:00:00Z')))
function choose(day:string):void{
  void router.replace({name:'agenda',query:{week:from.value,day}})
}
function move(weeks:number):void{
  const next=addDateDays(from.value,weeks*7)
  void router.replace({name:'agenda',query:{week:next,day:next}})
}
function goToday():void{
  void router.replace({name:'agenda',query:{week:monday(today),day:today}})
}
function open(record:TechnicianServiceSummary):void{
  void router.push({name:'technician-service-work',params:{id:record.id}})
}
async function loadWeek():Promise<void>{
  controller?.abort()
  const sequence=++requestId
  if(!online.value){loading.value=false;error.value='';return}
  const next=new AbortController()
  controller=next
  loading.value=true;error.value=''
  try {
    const response=await fetchTechnicianAgenda(from.value,until.value,next.signal)
    if(sequence===requestId)remote.value=response
  }catch(failure) {
    if(!next.signal.aborted&&sequence===requestId)
      error.value=failure instanceof Error?failure.message:'No fue posible consultar la agenda.'
  }finally {
    if(sequence===requestId){loading.value=false;controller=null}
  }
}
onMounted(()=>{void store.hydrateCaches();void loadWeek()})
watch(from,()=>void loadWeek())
watch(online,()=>void loadWeek())
onBeforeUnmount(()=>{requestId++;controller?.abort()})
</script>

<template>
  <ServicePage title="Mi agenda" caption="Servicios asignados · Solo lectura">
    <template #actions>
      <BaseIconButton label="Actualizar agenda" :disabled="!online||loading" @click="loadWeek">
        <RefreshCw :size="18" :class="{spinning:loading}" aria-hidden="true"/>
      </BaseIconButton>
    </template>
    <div class="technician-agenda__navigation">
      <BaseIconButton label="Semana anterior" @click="move(-1)"><ChevronLeft :size="18"/></BaseIconButton>
      <strong>{{ weekTitle }}</strong>
      <BaseIconButton label="Semana siguiente" @click="move(1)"><ChevronRight :size="18"/></BaseIconButton>
      <BaseButton size="compact" variant="secondary" @click="goToday">Hoy</BaseButton>
    </div>
    <div v-if="!online" class="technician-agenda__notice">
      <CloudOff :size="16" aria-hidden="true"/>
      Sin conexión · agenda parcial con datos consultados o guardados en este celular
    </div>
    <div v-if="error" class="technician-agenda__error" role="alert">
      {{ error }}
      <BaseButton size="compact" variant="secondary" @click="loadWeek">Reintentar</BaseButton>
    </div>
    <LoadingSkeleton v-if="loading&&!items.length" label="Consultando agenda" :rows="3"/>
    <template v-else>
      <div class="technician-agenda__mobile">
        <ServiceDayStrip :from="from" :selected-date="selected" :counts="counts" @select="choose"/>
        <div class="technician-agenda__day-heading">
          <strong>{{ readableDate(selected) }}</strong>
          <span>{{ counts[selected]??0 }} servicios</span>
        </div>
        <div v-if="dayRecords(selected).length" class="technician-agenda__list">
          <TechnicianServiceCard v-for="record in dayRecords(selected)" :key="record.id"
            :record="record"
            :cache="caches[record.id]" :online="online" @open="open(record)"/>
        </div>
        <div v-else class="technician-agenda__empty">No tienes servicios agendados para este día.</div>
      </div>
      <div class="technician-agenda__desktop">
        <div class="technician-agenda__week">
          <section v-for="day in days" :key="day" class="technician-agenda__column">
            <div class="technician-agenda__day-heading">
              <strong>{{ readableDate(day) }}</strong>
              <span>{{ counts[day]??0 }}</span>
            </div>
            <div class="technician-agenda__list">
              <TechnicianServiceCard v-for="record in dayRecords(day)" :key="record.id"
                :record="record"
                :cache="caches[record.id]" :online="online" @open="open(record)"/>
              <span v-if="!dayRecords(day).length" class="technician-agenda__empty">Sin servicios</span>
            </div>
          </section>
        </div>
      </div>
    </template>
  </ServicePage>
</template>

<style scoped>
.technician-agenda__navigation{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
.technician-agenda__navigation strong{font-size:.83rem;font-weight:650;margin-right:auto;line-height:1.35}
.technician-agenda__notice{display:flex;align-items:center;gap:.4rem;font-size:.76rem;color:var(--warning)}
.technician-agenda__error{display:flex;align-items:center;justify-content:space-between;gap:.5rem;
  color:var(--danger);border:1px solid var(--danger);border-radius:var(--radius);padding:.6rem;font-size:.75rem}
.technician-agenda__mobile{display:grid;gap:.55rem}
.technician-agenda__list{display:grid;gap:.4rem;min-width:0}
.technician-agenda__day-heading{display:flex;justify-content:space-between;align-items:center;gap:.5rem;
  color:var(--text-secondary);font-size:.74rem;padding:.3rem .1rem}
.technician-agenda__day-heading strong{color:var(--text);font-weight:650;text-transform:capitalize}
.technician-agenda__empty{font-size:.74rem;color:var(--text-secondary);padding:.75rem .2rem}
.technician-agenda__desktop{display:none;max-width:100%;overflow-x:auto}
.technician-agenda__week{display:grid;grid-template-columns:repeat(7,minmax(166px,1fr));gap:.45rem;min-width:1200px}
.technician-agenda__column{display:flex;flex-direction:column;gap:.3rem;min-width:0;border:1px solid var(--border);
  border-radius:var(--radius-lg);padding:.4rem;background:var(--surface)}
.technician-agenda__column :deep(.technician-service-card__open){padding:.4rem;min-height:89px}
.technician-agenda__column :deep(.technician-service-card__meta){flex-wrap:wrap;gap:.14rem .35rem}
.technician-agenda__column :deep(.technician-service-card__meta time){margin-right:0}
.technician-agenda__column :deep(.status-badge){margin-left:auto}
.spinning{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(min-width:1000px){.technician-agenda__mobile{display:none}.technician-agenda__desktop{display:block}}
@media(prefers-reduced-motion:reduce){.spinning{animation:none}}
</style>
