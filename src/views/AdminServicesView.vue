<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw, Plus, ChevronLeft, ChevronRight, CalendarDays, ChevronDown, SlidersHorizontal } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import ServiceRecords from '@/components/domain/services/ServiceRecords.vue'
import ServiceResultsDialog from '@/components/domain/services/ServiceResultsDialog.vue'
import UpcomingRecords from '@/components/domain/services/UpcomingRecords.vue'
import ServiceWeek from '@/components/domain/services/ServiceWeek.vue'
import ServiceDayList from '@/components/domain/services/ServiceDayList.vue'
import ServiceDayStrip from '@/components/domain/services/ServiceDayStrip.vue'
import ServicePagination from '@/components/domain/services/ServicePagination.vue'
import ServiceQuickEditor from '@/components/domain/services/ServiceQuickEditor.vue'
import ServiceSaveFeedback from '@/components/domain/services/ServiceSaveFeedback.vue'
import UpcomingEditor from '@/components/domain/services/UpcomingEditor.vue'
import { useServiceMutation } from '@/composables/useServiceMutation'
import { useAdminServicesStore } from '@/stores/adminServices'
import { useNotificationsStore } from '@/stores/notifications'
import { reprogramAdminService, requestCalendarRetry } from '@/services/adminServicesService'
import { addDateDays, FOLLOW_UP_LABELS, formatServiceDate, isDateOnly, scheduleFromRecord, SERVICE_STATE_LABELS, todayBogota, toBogotaInput } from '@/helpers/adminServices'
import { preferredServiceWeekDay, serviceWeekDayCounts, serviceWeekDayRecords, serviceWeekInstantAt } from '@/helpers/serviceWeek'
import { SERVICE_DATE_SHORTCUTS, serviceDateShortcutRange, type ServiceDateShortcutId } from '@/helpers/serviceDateRanges'
import { formatDateOnly } from '@/helpers/dateTime'
import type { AdminService, FollowUpState, ServiceFilter, ServiceKind, ServiceState, UpcomingFilter, UpcomingService } from '@/types/adminServices'

const route=useRoute(), router=useRouter(), store=useAdminServicesStore(), notifications=useNotificationsStore()
const q=(key: string)=>typeof route.query[key]==='string' ? route.query[key] as string : ''
const tab=computed<'agenda' | 'upcoming' | 'history'>(()=>q('tab')==='upcoming' ? 'upcoming' : q('tab')==='history' ? 'history' : 'agenda')
const view=computed(()=>tab.value==='agenda' && (q('view')==='week' || (!q('view') && route.name==='agenda')) ? 'week' : 'table')
function monday(date: string): string { const weekday=new Date(`${date}T00:00:00Z`).getUTCDay(); return addDateDays(date,-((weekday+6)%7)) }
const from=computed(()=>q('from') || (tab.value==='history' ? addDateDays(todayBogota(),-90) : tab.value==='upcoming' ? addDateDays(todayBogota(),-30) : view.value==='week' ? monday(todayBogota()) : todayBogota()))
const to=computed(()=>view.value==='week' ? addDateDays(from.value,6) : q('to') || (tab.value==='upcoming' ? addDateDays(todayBogota(),30) : todayBogota()))
const range=computed(()=>({ from:from.value,to:to.value }))
const activeDateShortcut=computed(()=>SERVICE_DATE_SHORTCUTS.find(shortcut=>{
  const candidate=serviceDateShortcutRange(shortcut.id,todayBogota())
  return candidate.from===from.value && candidate.to===to.value
})?.id ?? null)
const rangeError=computed(()=>!isDateOnly(from.value) || !isDateOnly(to.value) || from.value>to.value || (new Date(to.value).getTime()-new Date(from.value).getTime())/86_400_000>366 ? 'Selecciona un rango válido de hasta un año.' : '')
const page=computed(()=>/^\d+$/.test(q('page')) ? Math.max(1,Math.min(100_000,Number(q('page')))) : 1)
const pageSize=computed(()=>view.value==='week' ? 100 : 25)
const serviceFilter=computed<ServiceFilter>(()=>({ from:from.value,to:to.value,tab:tab.value==='history' ? 'history' : 'agenda',
  estado:['PROGRAMADO','EN_PROCESO','FINALIZADO','CANCELADO'].includes(q('estado')) ? q('estado') as ServiceState : '',
  tipo:['PRINCIPAL','REFUERZO'].includes(q('tipo')) ? q('tipo') as ServiceKind : '',tecnicoId:q('tecnicoId'),query:q('query'),page:view.value==='week' ? 1 : page.value,pageSize:pageSize.value }))
const upcomingFilter=computed<UpcomingFilter>(()=>({ from:from.value,to:to.value,estado:Object.keys(FOLLOW_UP_LABELS).includes(q('estado')) ? q('estado') as FollowUpState : '',query:q('query'),page:page.value,pageSize:25 }))
const loading=computed(()=>tab.value==='upcoming' ? store.upcomingLoading : store.loading)
const loadError=computed(()=>tab.value==='upcoming' ? store.upcomingError : store.error)
const total=computed(()=>tab.value==='upcoming' ? store.upcomingTotal : store.total)
const search=ref(q('query')), pendingAction=ref(false)
const compact=ref(typeof window!=='undefined' && window.matchMedia('(max-width: 680px)').matches)
const mobileFiltersOpen=ref(false), mobileDatesOpen=ref(false)
const mobileWeek=computed(()=>compact.value && tab.value==='agenda' && view.value==='week')
const mobileWeekDisplay=computed<'list'|'hours'>(()=>q('mobileView')==='hours' ? 'hours' : 'list')
const dayCounts=computed(()=>serviceWeekDayCounts(store.rows,from.value))
const selectedWeekDay=computed(()=>{
  const day=q('day')
  return isDateOnly(day) && day>=from.value && day<=to.value
    ? day : preferredServiceWeekDay(store.rows,from.value)
})
const selectedDayRecords=computed(()=>serviceWeekDayRecords(store.rows,selectedWeekDay.value))
const mobileWeekTitle=computed(()=>{
  const label=new Intl.DateTimeFormat('es-CO',{ month:'long',year:'numeric',timeZone:'UTC' })
    .format(new Date(selectedWeekDay.value+'T12:00:00Z'))
  return label.charAt(0).toUpperCase()+label.slice(1)
})
const activeFilterCount=computed(()=>tab.value==='upcoming'
  ? Number(Boolean(upcomingFilter.value.estado))
  : [serviceFilter.value.estado,serviceFilter.value.tipo,serviceFilter.value.tecnicoId].filter(Boolean).length)
const mobileRangeLabel=computed(()=>{
  const short=(value:string)=>formatDateOnly(value).replace(/ \d{4}$/,'')
  return from.value===to.value ? formatDateOnly(from.value) : short(from.value)+' – '+short(to.value)
})
let compactMedia: MediaQueryList | null=null
function handleCompactChange(event: MediaQueryListEvent):void {
  compact.value=event.matches
  mobileDatesOpen.value=false
  mobileFiltersOpen.value=false
}
function moveRange(days:number):void {
  setQuery({from:addDateDays(from.value,days),to:addDateDays(to.value,days),page:'1'})
}
function changeDateRange(next:{from:string;to:string}):void {
  setQuery({...next,page:'1'})
  if(next.from && next.to) mobileDatesOpen.value=false
}
function clearAdvancedFilters():void {
  setQuery({estado:undefined,tipo:undefined,tecnicoId:undefined,page:'1'})
  mobileFiltersOpen.value=false
}
const quick=ref<{ record: AdminService; mode: 'schedule' | 'team' | 'cancel' | 'payment' } | null>(null)
const results=ref<AdminService|null>(null)
const upcomingEditor=ref<{ record: UpcomingService; mode: 'manage' | 'email' } | null>(null)
const pendingMove=ref<{ record: AdminService; start: string } | null>(null)
const moveReviewOpen=ref(false)
const { saving:moving, errorMessage:moveError, conflict:moveConflict, overlapOpen:moveOverlapOpen, overlaps:moveOverlaps,
  run:runMove, reset:resetMove, acceptOverlap:acceptMoveOverlap, cancelOverlap:cancelMoveOverlap }=useServiceMutation()
const moveMessage=computed(()=>{
  const move=pendingMove.value
  if(!move) return ''
  const previous=formatServiceDate(move.record.inicioProgramado)+' · '+formatServiceDate(move.record.inicioProgramado,true)
  const next=formatServiceDate(move.start)+' · '+formatServiceDate(move.start,true)
  const reinforcement=move.record.tipoServicio==='PRINCIPAL' && move.record.refuerzo?.estado==='PROGRAMADO'
    ? ' El Refuerzo conservará su fecha y hora; para cambiar ambos utiliza Reprogramar.' : ''
  return 'Mover '+move.record.solicitud+' · '+move.record.clienteNombre+' de '+previous+' a '+next+
    '. Se conservan la duración, los técnicos y los productos.'+reinforcement+' Calendar se actualizará después de guardar.'
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
function setQuery(value: Record<string,string | undefined>): void { void router.replace({ query:{ ...route.query,...value } }) }
watch(()=>q('query'),value=>{ if(searchTimer) clearTimeout(searchTimer); search.value=value })
watch(search,value=>{
  if(searchTimer) clearTimeout(searchTimer)
  if(value===q('query')) return
  searchTimer=setTimeout(()=>setQuery({ query:value || undefined,page:'1' }),300)
})
onBeforeUnmount(()=>{
  if(searchTimer) clearTimeout(searchTimer)
  compactMedia?.removeEventListener('change',handleCompactChange)
})
watch(()=>JSON.stringify({ tab:tab.value,service:serviceFilter.value,upcoming:upcomingFilter.value }),()=>{ void load() },{ immediate:true })
onMounted(()=>{
  compactMedia=window.matchMedia('(max-width: 680px)')
  compact.value=compactMedia.matches
  compactMedia.addEventListener('change',handleCompactChange)
  void store.loadOptions().catch(()=>undefined)
})
async function load(force=false): Promise<void> {
  if(rangeError.value) return
  if(tab.value==='upcoming') await store.loadUpcoming(upcomingFilter.value,force)
  else await store.loadServices(serviceFilter.value,force,view.value==='week')
}
function changeTab(next: 'agenda' | 'upcoming' | 'history'): void {
  mobileDatesOpen.value=false
  mobileFiltersOpen.value=false
  setQuery({ tab:next,estado:undefined,tipo:undefined,tecnicoId:undefined,from:undefined,to:undefined,day:undefined,mobileView:undefined,page:'1' })
}
function changeView(next: 'table' | 'week'): void {
  mobileDatesOpen.value=false
  setQuery({view:next,from:next==='week' ? monday(from.value) : from.value,
    to:next==='week' ? undefined : addDateDays(from.value,6),day:undefined,page:'1'})
}
function selectWeekDay(day:string): void { setQuery({day,page:'1'}) }
function changeMobileWeekDisplay(next:'list'|'hours'):void { setQuery({mobileView:next==='hours'?'hours':undefined}) }
function moveWeek(days: number): void { setQuery({ from:addDateDays(from.value,days),to:undefined,day:undefined,page:'1' }) }
function applyDateShortcut(id: ServiceDateShortcutId): void {
  const next=serviceDateShortcutRange(id,todayBogota())
  setQuery({ from:next.from,to:next.to,page:'1' })
  mobileDatesOpen.value=false
}
function create(): void {
  if(mobileWeek.value) { createForDay(selectedWeekDay.value); return }
  void router.push({ name:'admin-service-new',query:{ returnTo:route.fullPath } })
}
function createForDay(day:string):void {
  if(day<todayBogota()) {
    void router.push({ name:'admin-service-new',query:{ returnTo:route.fullPath } })
    return
  }
  let minute=9*60
  if(day===todayBogota()) {
    const future=toBogotaInput(new Date(Date.now()+30*60_000).toISOString())
    const hour=Number(future.slice(11,13)), minutes=Number(future.slice(14,16))
    if(future.slice(0,10)!==day || hour*60+minutes>=24*60) {
      createAt(serviceWeekInstantAt(addDateDays(day,1),9*60))
      return
    }
    minute=Math.max(minute,Math.ceil((hour*60+minutes)/15)*15)
  }
  createAt(serviceWeekInstantAt(day,minute))
}

function createAt(start: string): void { void router.push({ name:'admin-service-new',query:{ start,returnTo:route.fullPath } }) }
function openAgenda(record: AdminService): void {
  if(pendingAction.value || moving.value || pendingMove.value) return
  if(record.estado==='PROGRAMADO') void openQuick(record,'schedule')
  else void router.push({ name:'service-detail',params:{ id:record.id },query:{returnTo:route.fullPath} })
}
function proposeMove(record: AdminService, start: string): void {
  if(pendingAction.value || moving.value || pendingMove.value || record.estado!=='PROGRAMADO') return
  if(new Date(start).getTime()===new Date(record.inicioProgramado).getTime()) return
  resetMove()
  pendingMove.value={ record,start }
  moveReviewOpen.value=true
}
function cancelMove(): void {
  if(moving.value) return
  moveReviewOpen.value=false
  pendingMove.value=null
  resetMove()
}
async function confirmMove(): Promise<void> {
  const move=pendingMove.value
  if(!move || moving.value) return
  moveReviewOpen.value=false
  try { await store.loadOptions() }
  catch(failure) {
    notifications.show(failure instanceof Error ? failure.message : 'No fue posible consultar técnicos disponibles.','error')
    return
  }
  await runMove(
    (requestId,resolution)=>reprogramAdminService(move.record,requestId,
      resolution?.schedules[0] ?? {...scheduleFromRecord(move.record),inicioProgramado:move.start},
      resolution?.reassignments ?? []),
    result=>{ store.applyMutation(result);pendingMove.value=null },
    'Servicio reprogramado. Calendar se actualizará en segundo plano.',
  )
}
async function reloadMove(): Promise<void> {
  const move=pendingMove.value
  if(!move) return
  cancelMove()
  try {
    const current=await store.ensureService(move.record.id,true)
    if(current.estado==='PROGRAMADO') await openQuick(current,'schedule')
    else notifications.show('El servicio ya no permite reprogramaciones.','warning')
  } catch(failure) {
    notifications.show(failure instanceof Error ? failure.message : 'No fue posible consultar la versión actual.','error')
  }
}
function stopMoveOverlap(): void { cancelMoveOverlap();cancelMove() }
function edit(record: AdminService): void { void router.push({ name:'admin-service-edit',params:{ id:record.id },query:{ returnTo:route.fullPath } }) }
function scheduleUpcoming(record: UpcomingService): void { void router.push({ name:'admin-service-new',query:{ upcomingId:record.id,returnTo:route.fullPath } }) }
async function openQuick(record: AdminService, mode: 'schedule' | 'team' | 'cancel' | 'payment'): Promise<void> {
  if(pendingAction.value) return
  pendingAction.value=true
  try { if(mode!=='cancel') await store.loadOptions(); quick.value={ record,mode } }
  catch(failure) { notifications.show(failure instanceof Error ? failure.message : 'No fue posible cargar el equipo.','error') }
  finally { pendingAction.value=false }
}
async function retryCalendar(record: AdminService): Promise<void> {
  if(pendingAction.value) return
  pendingAction.value=true
  try { store.applyMutation(await requestCalendarRetry(record.id,crypto.randomUUID())); notifications.show('Reintento de Calendar en cola. La programación está guardada.','success') }
  catch(failure) { notifications.show(failure instanceof Error ? failure.message : 'No fue posible solicitar el reintento.','error') }
  finally { pendingAction.value=false }
}
</script>
<template>
  <ServicePage class="svc-page--agenda" :title="mobileWeek ? 'Agenda' : 'Servicios'">
    <template #actions><BaseIconButton label="Actualizar servicios" :loading="loading" :disabled="pendingAction" @click="load(true)"><RefreshCw :size="17" /></BaseIconButton><BaseButton size="compact" :disabled="pendingAction" @click="create"><Plus :size="16" /><span>{{ mobileWeek ? 'Programar' : 'Programar servicio' }}</span></BaseButton></template>
    <div class="svc-tabs" role="tablist" aria-label="Vistas de servicios">
      <button role="tab" class="svc-tab" :aria-selected="tab==='agenda'" @click="changeTab('agenda')">Agenda</button>
      <button role="tab" class="svc-tab" :aria-selected="tab==='upcoming'" @click="changeTab('upcoming')">Próximos por confirmar <span v-if="store.pendingCount" class="svc-count" :aria-label="`${store.pendingCount} pendientes de confirmación en los próximos siete días`" title="Pendientes de confirmación · próximos 7 días">{{ store.pendingCount }}</span></button>
      <button role="tab" class="svc-tab" :aria-selected="tab==='history'" @click="changeTab('history')">Historial</button>
    </div>
    <div class="svc-controls" :class="{ 'svc-controls--week': tab==='agenda' && view==='week' }">
      <div v-if="tab==='agenda'" class="svc-agenda-bar">
      <div class="svc-segment" role="group" aria-label="Presentación de agenda">
        <button type="button" :aria-pressed="view==='table'" @click="changeView('table')">Tabla</button>
        <button type="button" :aria-pressed="view==='week'" @click="changeView('week')">Semana</button>
      </div>
      <div v-if="view==='week'" class="svc-week-navigation">
        <BaseIconButton label="Semana anterior" :disabled="Boolean(pendingMove)" @click="moveWeek(-7)"><ChevronLeft :size="16" /></BaseIconButton>
        <span class="svc-week-navigation__range">{{ mobileWeek ? mobileWeekTitle : formatDateOnly(from)+' – '+formatDateOnly(to) }}</span>
        <BaseIconButton label="Semana siguiente" :disabled="Boolean(pendingMove)" @click="moveWeek(7)"><ChevronRight :size="16" /></BaseIconButton>
        <BaseButton size="compact" variant="secondary" :disabled="Boolean(pendingMove)" @click="setQuery({ from:monday(todayBogota()),to:undefined,day:todayBogota(),page:'1' })">Hoy</BaseButton>
      </div>
      <p v-if="view==='week' && !compact" class="svc-agenda-bar__hint">Arrastra para reprogramar · pulsa un espacio libre para crear</p>
    </div>
    <div v-if="mobileWeek" class="svc-mobile-week">
      <ServiceDayStrip :from="from" :selected-date="selectedWeekDay" :counts="dayCounts" @select="selectWeekDay" />
      <div class="svc-mobile-week__modes">
        <div class="svc-segment" role="group" aria-label="Presentación del día">
          <button type="button" :aria-pressed="mobileWeekDisplay==='list'" @click="changeMobileWeekDisplay('list')">Lista</button>
          <button type="button" :aria-pressed="mobileWeekDisplay==='hours'" @click="changeMobileWeekDisplay('hours')">Horario</button>
        </div>
        <span v-if="mobileWeekDisplay==='hours'" class="svc-mobile-week__tip">Toca para consultar o programar</span>
      </div>
    </div>
    <div v-if="compact && view==='table'" class="svc-mobile-datebar" role="group" aria-label="Navegar fechas de servicios">
      <BaseIconButton label="Fechas anteriores" size="small" @click="moveRange(-1)"><ChevronLeft :size="19" /></BaseIconButton>
      <BaseButton size="compact" class="svc-mobile-datebar__range" variant="secondary" :aria-expanded="mobileDatesOpen" @click="mobileDatesOpen=!mobileDatesOpen">
        <CalendarDays :size="17" aria-hidden="true" />
        <span>{{ mobileRangeLabel }}</span>
        <ChevronDown :size="15" aria-hidden="true" />
      </BaseButton>
      <BaseIconButton label="Fechas siguientes" size="small" @click="moveRange(1)"><ChevronRight :size="19" /></BaseIconButton>
    </div>
    <div v-if="compact && view==='table' && mobileDatesOpen" class="svc-mobile-date-panel">
      <BaseDateRangePicker name="services-range-mobile" label="Seleccionar fechas" :model-value="range" :error="rangeError || undefined" @update:model-value="changeDateRange" />
      <div class="svc-date-shortcuts" role="group" aria-label="Rangos rápidos de fecha">
        <button v-for="shortcut in SERVICE_DATE_SHORTCUTS" :key="shortcut.id" type="button" class="svc-date-shortcut" :aria-pressed="activeDateShortcut===shortcut.id" @click="applyDateShortcut(shortcut.id)">{{ shortcut.label }}</button>
      </div>
    </div>
    <div class="svc-filters" :class="{ 'svc-filters--upcoming':tab==='upcoming', 'svc-filters--week':view==='week', 'svc-filters--compact':compact }">
      <div v-if="view==='table' && !compact" class="svc-date-filter">
        <BaseDateRangePicker name="services-range" label="Fechas" :model-value="range" :error="rangeError || undefined" @update:model-value="setQuery({ ...$event,page:'1' })" />
        <div class="svc-date-shortcuts" role="group" aria-label="Rangos rápidos de fecha">
          <button v-for="shortcut in SERVICE_DATE_SHORTCUTS" :key="shortcut.id" type="button" class="svc-date-shortcut" :aria-pressed="activeDateShortcut===shortcut.id" @click="applyDateShortcut(shortcut.id)">{{ shortcut.label }}</button>
        </div>
      </div>
      <BaseInput v-model="search" class="svc-filter-search" name="service-search" label="Buscar" type="search" maxlength="160" placeholder="Cliente, sede o solicitud" />
      <BaseButton v-if="compact" size="compact" variant="secondary" class="svc-filter-toggle" :aria-expanded="mobileFiltersOpen" @click="mobileFiltersOpen=!mobileFiltersOpen">
        <SlidersHorizontal :size="17" aria-hidden="true" /> Filtros{{ activeFilterCount ? ' ('+activeFilterCount+')' : '' }}
      </BaseButton>
      <BaseSelect v-if="(!compact || mobileFiltersOpen) && tab==='upcoming'" class="svc-filter-extra" :model-value="upcomingFilter.estado" name="upcoming-status-filter" label="Seguimiento" @update:model-value="setQuery({ estado:$event || undefined,page:'1' })"><option value="">Todos los pendientes</option><option v-for="(label,value) in FOLLOW_UP_LABELS" :key="value" :value="value">{{ label }}</option></BaseSelect>
      <BaseSelect v-else-if="!compact || mobileFiltersOpen" class="svc-filter-extra" :model-value="serviceFilter.estado" name="service-status-filter" label="Estado" @update:model-value="setQuery({ estado:$event || undefined,page:'1' })"><option value="">Todos</option><option v-for="(label,value) in SERVICE_STATE_LABELS" :key="value" :value="value">{{ label }}</option></BaseSelect>
      <BaseSelect v-if="tab!=='upcoming' && (!compact || mobileFiltersOpen)" class="svc-filter-extra" :model-value="serviceFilter.tipo" name="service-type-filter" label="Tipo" @update:model-value="setQuery({ tipo:$event || undefined,page:'1' })"><option value="">Todos</option><option value="PRINCIPAL">Principal</option><option value="REFUERZO">Refuerzo</option></BaseSelect>
      <BaseSelect v-if="tab!=='upcoming' && (!compact || mobileFiltersOpen)" class="svc-filter-extra svc-filter-extra--team" :model-value="serviceFilter.tecnicoId" name="service-team-filter" label="Técnico" @update:model-value="setQuery({ tecnicoId:$event || undefined,page:'1' })"><option value="">Todo el equipo</option><option v-for="person in store.options?.tecnicos ?? []" :key="person.id" :value="person.id">{{ person.nombreCompleto }}</option></BaseSelect>
      <BaseButton v-if="compact && mobileFiltersOpen" size="compact" variant="ghost" class="svc-filter-clear" @click="clearAdvancedFilters">Limpiar filtros</BaseButton>
    </div>
    </div>
    <div v-if="tab!=='agenda'" class="svc-toolbar"><span class="svc-muted svc-small">{{ tab==='upcoming' ? 'Las fechas son sugeridas. Agendar crea la visita confirmada.' : 'Servicios finalizados y cancelados' }}</span></div>
    <StatusPanel v-if="rangeError" title="Revisa el rango de fechas" :message="rangeError" tone="warning" />
    <LoadingSkeleton v-else-if="loading" :rows="6" />
    <StatusPanel v-else-if="loadError" title="No fue posible cargar la lista" :message="loadError" tone="danger"><BaseButton size="compact" variant="secondary" @click="load(true)">Reintentar</BaseButton></StatusPanel>
    <template v-else-if="tab==='upcoming'">
      <UpcomingRecords v-if="store.upcomingRows.length" :records="store.upcomingRows" :busy="pendingAction" @manage="upcomingEditor={ record:$event,mode:'manage' }" @email="upcomingEditor={ record:$event,mode:'email' }" @schedule="scheduleUpcoming" />
      <StatusPanel v-else title="Sin próximas visitas en este rango" message="Al finalizar un Principal se generará su próxima propuesta, según la periodicidad de la sede." />
    </template>
    <template v-else>
      <template v-if="view==='week'">
        <ServiceDayList v-if="mobileWeek && mobileWeekDisplay==='list'" :date="selectedWeekDay" :records="selectedDayRecords" :busy="pendingAction || moving || Boolean(pendingMove)" @open="openAgenda" @create="createForDay" />
        <ServiceWeek v-else :from="from" :single-day="mobileWeek ? selectedWeekDay : undefined" :return-to="route.fullPath" :records="store.rows" :busy="pendingAction || moving || Boolean(pendingMove)" @create="createAt" @open="openAgenda" @move="proposeMove" />
      </template>
      <ServiceRecords v-else-if="store.rows.length" :records="store.rows" :history="tab==='history'" :busy="pendingAction" @schedule="openQuick($event,'schedule')" @team="openQuick($event,'team')" @payment="openQuick($event,'payment')" @edit="edit" @cancel="openQuick($event,'cancel')" @retry-calendar="retryCalendar" @results="results=$event" />
      <StatusPanel v-else title="Sin servicios en este rango" message="Cambia las fechas o los filtros para consultar otra parte de la operación." />
    </template>
    <ServicePagination v-if="!rangeError && !loadError && view!=='week' && total>pageSize" :page="page" :page-size="pageSize" :total="total" :disabled="loading" @page="setQuery({ page:String($event) })" />
    <ServiceSaveFeedback :error="moveError" :conflict="moveConflict" :overlaps="moveOverlaps" :overlap-open="moveOverlapOpen" :saving="moving" :technicians="store.options?.tecnicos ?? []" :schedules="pendingMove ? [{...scheduleFromRecord(pendingMove.record),inicioProgramado:pendingMove.start}] : []" @reload="reloadMove" @accept="acceptMoveOverlap" @cancel="stopMoveOverlap" />
    <div v-if="pendingMove && moveError && !moveConflict && !moveOverlapOpen" class="svc-dialog-actions"><BaseButton size="compact" variant="secondary" @click="cancelMove">Descartar cambio</BaseButton><BaseButton size="compact" @click="moveReviewOpen=true">Reintentar</BaseButton></div>
    <ConfirmDialog :open="moveReviewOpen" title="Confirmar nueva fecha" :message="moveMessage" confirm-label="Mover servicio" :loading="moving" @confirm="confirmMove" @cancel="cancelMove" />
    <ServiceResultsDialog v-if="results" :key="results.id" :service-id="results.id" :solicitud="results.solicitud" @close="results=null" />
    <ServiceQuickEditor v-if="quick" :key="`${quick.record.id}:${quick.mode}`" :record="quick.record" :mode="quick.mode" @close="quick=null" />
    <UpcomingEditor v-if="upcomingEditor" :key="`${upcomingEditor.record.id}:${upcomingEditor.mode}`" :record="upcomingEditor.record" :mode="upcomingEditor.mode" @close="upcomingEditor=null" />
  </ServicePage>
</template>
