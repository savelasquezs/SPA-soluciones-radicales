import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { compareServices, matchesServiceFilter } from '@/helpers/adminServices'
import { fetchAdminService, fetchAdminServices, fetchPendingCount, fetchServiceWorkspace, fetchUpcomingService, fetchUpcomingServices } from '@/services/adminServicesService'
import { useAuthStore } from '@/stores/auth'
import type { AdminService, ServiceFilter, ServiceMutation, ServiceWorkspace, UpcomingFilter, UpcomingService } from '@/types/adminServices'

/** Shared only because list, detail and editor routes reuse the same snapshots. */
export const useAdminServicesStore = defineStore('admin-services',()=>{
  const auth=useAuthStore()
  const records=ref<Record<string,AdminService>>({}), upcomingRecords=ref<Record<string,UpcomingService>>({})
  const serviceIds=ref<string[]>([]), upcomingIds=ref<string[]>([])
  const options=ref<ServiceWorkspace | null>(null)
  const total=ref(0), upcomingTotal=ref(0), pendingCount=ref(0)
  const loading=ref(false), upcomingLoading=ref(false), optionsLoading=ref(false)
  const error=ref(''), upcomingError=ref(''), optionsError=ref('')
  const lastFilter=ref<ServiceFilter | null>(null), lastUpcomingFilter=ref<UpcomingFilter | null>(null)
  let listKey='', upcomingKey='', listAt=0, upcomingAt=0, optionsAt=0
  let serviceController: AbortController | null=null, upcomingController: AbortController | null=null
  let optionsRequest: Promise<ServiceWorkspace> | null=null, generation=0
  const rows=computed(()=>serviceIds.value.map(id=>records.value[id]).filter((row): row is AdminService=>Boolean(row)))
  const upcomingRows=computed(()=>upcomingIds.value.map(id=>upcomingRecords.value[id]).filter((row): row is UpcomingService=>Boolean(row)))
  const session=()=>`${auth.profile?.id ?? ''}:${auth.activeRole ?? ''}`

  function reset(): void {
    generation++; serviceController?.abort(); upcomingController?.abort(); optionsRequest=null
    records.value={}; upcomingRecords.value={}; serviceIds.value=[]; upcomingIds.value=[]; options.value=null
    total.value=0; upcomingTotal.value=0; pendingCount.value=0; listKey=''; upcomingKey=''; optionsAt=0
    loading.value=false; upcomingLoading.value=false; optionsLoading.value=false
    error.value=''; upcomingError.value=''; optionsError.value=''; lastFilter.value=null; lastUpcomingFilter.value=null
  }
  watch(session,reset)
  function upsert(record: AdminService): void {
    if (!records.value[record.id] || records.value[record.id]!.version <= record.version) records.value[record.id]=record
  }
  function upsertUpcoming(record: UpcomingService): void {
    if (!upcomingRecords.value[record.id] || upcomingRecords.value[record.id]!.version <= record.version) upcomingRecords.value[record.id]=record
  }
  async function loadOptions(force = false): Promise<ServiceWorkspace> {
    if (!auth.isAdmin) throw new Error('No tienes acceso a la programación administrativa.')
    if (!force && options.value && Date.now()-optionsAt < 60_000) return options.value
    if (optionsRequest) return optionsRequest
    const stamp=generation
    optionsLoading.value=true; optionsError.value=''
    optionsRequest=fetchServiceWorkspace().then(result=>{
      if (stamp!==generation) throw new Error('La sesión cambió.')
      options.value=result; optionsAt=Date.now(); return result
    }).catch(failure=>{
      if (stamp===generation) optionsError.value=failure instanceof Error ? failure.message : 'No fue posible cargar las opciones.'
      throw failure
    }).finally(()=>{ if(stamp===generation) { optionsLoading.value=false; optionsRequest=null } })
    return optionsRequest
  }
  async function loadServices(filter: ServiceFilter, force = false): Promise<void> {
    if (!auth.isAdmin) return
    const key=JSON.stringify(filter)
    if (!force && key===listKey && Date.now()-listAt<30_000) return
    serviceController?.abort(); const controller=new AbortController(); serviceController=controller
    const stamp=generation
    loading.value=true; error.value=''; lastFilter.value={ ...filter }
    try {
      const result=await fetchAdminServices(filter,controller.signal)
      if (controller.signal.aborted || stamp!==generation) return
      result.items.forEach(upsert); serviceIds.value=result.items.map(row=>row.id); total.value=result.total; pendingCount.value=result.pendingCount
      listKey=key; listAt=Date.now()
    } catch (failure) {
      if (!controller.signal.aborted && stamp===generation) { error.value=failure instanceof Error ? failure.message : 'No fue posible cargar los servicios.'; listKey='' }
    } finally { if(serviceController===controller && stamp===generation) loading.value=false }
  }
  async function loadUpcoming(filter: UpcomingFilter, force = false): Promise<void> {
    if (!auth.isAdmin) return
    const key=JSON.stringify(filter)
    if (!force && key===upcomingKey && Date.now()-upcomingAt<30_000) return
    upcomingController?.abort(); const controller=new AbortController(); upcomingController=controller
    const stamp=generation
    upcomingLoading.value=true; upcomingError.value=''; lastUpcomingFilter.value={ ...filter }
    try {
      const result=await fetchUpcomingServices(filter,controller.signal)
      if (controller.signal.aborted || stamp!==generation) return
      result.items.forEach(upsertUpcoming); upcomingIds.value=result.items.map(row=>row.id); upcomingTotal.value=result.total; pendingCount.value=result.pendingCount
      upcomingKey=key; upcomingAt=Date.now()
    } catch (failure) {
      if (!controller.signal.aborted && stamp===generation) { upcomingError.value=failure instanceof Error ? failure.message : 'No fue posible cargar las próximas visitas.'; upcomingKey='' }
    } finally { if(upcomingController===controller && stamp===generation) upcomingLoading.value=false }
  }
  async function ensureService(id: string, force = false): Promise<AdminService> {
    if (!auth.isAdmin) throw new Error('No tienes acceso a este servicio.')
    if (!force && records.value[id]) return records.value[id]!
    const stamp=generation, record=await fetchAdminService(id)
    if (stamp!==generation) throw new Error('La sesión cambió.')
    upsert(record); return record
  }
  async function ensureUpcoming(id: string, force = false): Promise<UpcomingService> {
    if (!auth.isAdmin) throw new Error('No tienes acceso a esta próxima visita.')
    if (!force && upcomingRecords.value[id]) return upcomingRecords.value[id]!
    const stamp=generation, record=await fetchUpcomingService(id)
    if (stamp!==generation) throw new Error('La sesión cambió.')
    upsertUpcoming(record); return record
  }
  function applyUpcoming(result: { upcoming: UpcomingService; pendingCount: number }): void {
    upsertUpcoming(result.upcoming); pendingCount.value=result.pendingCount
    const row=upcomingRecords.value[result.upcoming.id]!
    const filter=lastUpcomingFilter.value
    const excluded=Boolean(row.servicioAgendadoId) || (filter?.estado ? row.estado!==filter.estado : row.estado==='NO_DESEA')
    if (excluded && upcomingIds.value.includes(row.id)) { upcomingIds.value=upcomingIds.value.filter(id=>id!==row.id); upcomingTotal.value=Math.max(0,upcomingTotal.value-1) }
    upcomingAt=Date.now()
  }
  function applyMutation(result: ServiceMutation, created = false): void {
    const filter=lastFilter.value
    for (const row of result.services) {
      const prior=records.value[row.id], visible=serviceIds.value.includes(row.id)
      upsert(row)
      if (!filter) continue
      const matches=matchesServiceFilter(records.value[row.id]!,filter)
      if (visible && !matches) { serviceIds.value=serviceIds.value.filter(id=>id!==row.id); total.value=Math.max(0,total.value-1) }
      else if (created && !prior && matches) {
        total.value++
        if (filter.page===1) serviceIds.value.push(row.id)
      }
    }
    serviceIds.value=[...new Set(serviceIds.value)].sort((a,b)=>compareServices(records.value[a]!,records.value[b]!)).slice(0,filter?.pageSize ?? 100)
    pendingCount.value=result.pendingCount; listAt=Date.now()
    if (result.upcoming) applyUpcoming({ upcoming:result.upcoming,pendingCount:result.pendingCount })
  }
  async function refreshPendingCount(): Promise<void> {
    const stamp=generation
    const result=await fetchPendingCount()
    if (stamp===generation && auth.isAdmin) pendingCount.value=result.count
  }
  return { records,upcomingRecords,rows,upcomingRows,options,total,upcomingTotal,pendingCount,loading,upcomingLoading,optionsLoading,error,upcomingError,optionsError,
    lastFilter,lastUpcomingFilter,loadOptions,loadServices,loadUpcoming,ensureService,ensureUpcoming,upsert,upsertUpcoming,applyMutation,applyUpcoming,refreshPendingCount,reset }
})
