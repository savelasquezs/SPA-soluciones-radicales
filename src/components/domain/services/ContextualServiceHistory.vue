<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServiceRecords from './ServiceRecords.vue'
import ServicePagination from './ServicePagination.vue'
import ServiceQuickEditor from './ServiceQuickEditor.vue'
import ServiceResultsDialog from './ServiceResultsDialog.vue'
import { SERVICE_STATE_LABELS, todayBogota } from '@/helpers/adminServices'
import { SERVICE_DATE_SHORTCUTS, serviceDateShortcutRange } from '@/helpers/serviceDateRanges'
import { isDateOnly } from '@/helpers/dateTime'
import { fetchContextServices, requestCalendarRetry } from '@/services/adminServicesService'
import { useAdminServicesStore } from '@/stores/adminServices'
import { useNotificationsStore } from '@/stores/notifications'
import type { AdminService, ServiceFilter, ServiceKind, ServiceState } from '@/types/adminServices'

const props = defineProps<{ clientId?: string; siteId?: string }>()
const route = useRoute()
const router = useRouter()
const store = useAdminServicesStore()
const notifications = useNotificationsStore()
const pageSize = 20

const records = ref<AdminService[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const dates = ref({ from: '', to: '' })
const search = ref('')
const query = ref('')
const status = ref<ServiceState | ''>('')
const kind = ref<ServiceKind | ''>('')
const technicianId = ref('')
const quick = ref<{ record: AdminService; mode: 'schedule' | 'team' | 'cancel' | 'payment' } | null>(null)
const results = ref<AdminService | null>(null)
const fieldPrefix = computed(() => props.siteId ? 'site-services' : 'client-services')
const today = todayBogota()
let searchTimer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | null = null

const dateError = computed(() => {
  const { from, to } = dates.value
  if (!from && !to) return ''
  if (!isDateOnly(from) || !isDateOnly(to) || from > to) return 'Completa un rango de fechas válido.'
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return 'El rango no puede superar un año.'
  return ''
})
const filter = computed<ServiceFilter>(() => ({
  from: dates.value.from, to: dates.value.to, tab: 'agenda',
  estado: status.value, tipo: kind.value, tecnicoId: technicianId.value,
  query: query.value, page: page.value, pageSize,
  ...(props.siteId ? { siteId: props.siteId } : { clientId: props.clientId }),
}))
const technicians = computed(() => {
  const list = new Map((store.options?.tecnicos ?? []).map(item => [item.id, item.nombreCompleto]))
  for (const record of records.value) {
    list.set(record.responsable.id, record.responsable.nombreCompleto)
    for (const person of record.colaboradores) list.set(person.id, person.nombreCompleto)
  }
  return [...list].sort((a, b) => a[1].localeCompare(b[1], 'es'))
})

watch(search, value => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { query.value = value.trim(); page.value = 1 }, 300)
})
watch(() => [props.clientId, props.siteId], () => {
  page.value = 1
  records.value = []
  total.value = 0
})
watch(filter, () => { void load() }, { immediate: true })
onMounted(() => { void store.loadOptions().catch(() => undefined) })
onBeforeUnmount(() => {
  controller?.abort()
  if (searchTimer) clearTimeout(searchTimer)
})

async function load(): Promise<void> {
  controller?.abort()
  if (dateError.value) { loading.value = false; return }
  const next = new AbortController()
  controller = next
  loading.value = true
  error.value = ''
  try {
    const result = await fetchContextServices(filter.value, next.signal)
    if (controller !== next || next.signal.aborted) return
    // Never display records from a different client/site even if an API deploy is stale.
    if (result.items.some(record => props.siteId ? record.sedeId !== props.siteId : record.clientId !== props.clientId))
      throw new Error('La consulta devolvió servicios de otro cliente o sede.')
    records.value = result.items
    total.value = result.total
    result.items.forEach(store.upsert)
    if (page.value > 1 && !result.items.length && result.total) page.value = 1
  } catch (failure) {
    if (!next.signal.aborted && controller === next) {
      error.value = failure instanceof Error ? failure.message : 'No fue posible cargar los servicios.'
      records.value = []
      total.value = 0
    }
  } finally {
    if (controller === next) loading.value = false
  }
}
function refresh(): void { void load() }
function setDates(value: { from: string; to: string }): void { dates.value = value; page.value = 1 }
function setStatus(value: string): void { status.value = value as ServiceState | ''; page.value = 1 }
function setKind(value: string): void { kind.value = value as ServiceKind | ''; page.value = 1 }
function setTechnician(value: string): void { technicianId.value = value; page.value = 1 }
function edit(record: AdminService): void {
  void router.push({ name: 'admin-service-edit', params: { id: record.id }, query: { returnTo: route.fullPath } })
}
async function openQuick(record: AdminService, mode: 'schedule' | 'team' | 'cancel' | 'payment'): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    if (mode !== 'cancel') await store.loadOptions()
    quick.value = { record, mode }
  } catch (failure) {
    notifications.show(failure instanceof Error ? failure.message : 'No fue posible preparar la acción.', 'error')
  } finally { busy.value = false }
}
async function retryCalendar(record: AdminService): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    store.applyMutation(await requestCalendarRetry(record.id, crypto.randomUUID()))
    notifications.show('Reintento de Calendar solicitado.', 'success')
    await load()
  } catch (failure) {
    notifications.show(failure instanceof Error ? failure.message : 'No fue posible reintentar Calendar.', 'error')
  } finally { busy.value = false }
}
</script>

<template>
  <div class="svc-contextual-history">
    <div class="svc-contextual-history__filters">
      <div class="svc-contextual-history__dates">
        <BaseDateRangePicker
          :name="fieldPrefix + '-dates'" label="Fechas" clearable
          :model-value="dates" :error="dateError || undefined" @update:model-value="setDates"
        />
        <div class="svc-date-shortcuts" aria-label="Rangos rápidos">
          <button type="button" :aria-pressed="!dates.from && !dates.to" @click="setDates({ from: '', to: '' })">Todas</button>
          <button
            v-for="shortcut in SERVICE_DATE_SHORTCUTS" :key="shortcut.id" type="button"
            :aria-pressed="JSON.stringify(dates) === JSON.stringify(serviceDateShortcutRange(shortcut.id, today))"
            @click="setDates(serviceDateShortcutRange(shortcut.id, today))"
          >{{ shortcut.label }}</button>
        </div>
      </div>
      <BaseInput v-model="search" :name="fieldPrefix + '-search'" label="Buscar" type="search" maxlength="160" placeholder="Solicitud, cliente o sede" />
      <BaseSelect :model-value="status" :name="fieldPrefix + '-status'" label="Estado" @update:model-value="setStatus">
        <option value="">Todos</option>
        <option v-for="(label, value) in SERVICE_STATE_LABELS" :key="value" :value="value">{{ label }}</option>
      </BaseSelect>
      <BaseSelect :model-value="kind" :name="fieldPrefix + '-type'" label="Tipo" @update:model-value="setKind">
        <option value="">Todos</option>
        <option value="PRINCIPAL">Principal</option>
        <option value="REFUERZO">Refuerzo</option>
      </BaseSelect>
      <BaseSelect :model-value="technicianId" :name="fieldPrefix + '-technician'" label="Técnico" @update:model-value="setTechnician">
        <option value="">Todo el equipo</option>
        <option v-for="[id, name] in technicians" :key="id" :value="id">{{ name }}</option>
      </BaseSelect>
      <BaseIconButton label="Actualizar historial" :loading="loading" :disabled="busy" @click="refresh"><RefreshCw :size="17" /></BaseIconButton>
    </div>
    <p class="svc-muted svc-small">Se muestran todas las fechas y los estados, salvo que apliques un filtro.</p>
    <StatusPanel v-if="dateError" title="Rango no válido" :message="dateError" tone="warning" compact />
    <StatusPanel v-else-if="error" title="No fue posible consultar el historial" :message="error" tone="danger" compact>
      <BaseButton size="compact" variant="secondary" @click="refresh">Reintentar</BaseButton>
    </StatusPanel>
    <LoadingSkeleton v-else-if="loading && !records.length" label="Cargando servicios" :lines="4" />
    <template v-else>
      <ServiceRecords
        v-if="records.length" :records="records" history :busy="busy"
        @schedule="openQuick($event, 'schedule')" @team="openQuick($event, 'team')"
        @payment="openQuick($event, 'payment')" @edit="edit" @cancel="openQuick($event, 'cancel')"
        @retry-calendar="retryCalendar" @results="results=$event"
      />
      <EmptyState v-else title="Sin servicios" message="No hay servicios para los filtros seleccionados." />
      <ServicePagination v-if="total > pageSize" :page="page" :page-size="pageSize" :total="total" :disabled="loading" @page="page=$event" />
    </template>
    <ServiceQuickEditor
      v-if="quick" :key="quick.record.id + ':' + quick.mode" :record="quick.record" :mode="quick.mode"
      @close="quick=null" @saved="refresh"
    />
    <ServiceResultsDialog v-if="results" :key="results.id" :service-id="results.id" :solicitud="results.solicitud" @close="results=null" />
  </div>
</template>

<style scoped>
.svc-contextual-history { display:grid; gap:0.55rem; min-width:0; }
.svc-contextual-history__filters { display:grid; grid-template-columns:minmax(18rem,1.8fr) minmax(10rem,1.25fr) minmax(8rem,.7fr) minmax(7rem,.7fr) minmax(9rem,1fr) auto; align-items:start; gap:0.5rem; }
.svc-contextual-history__dates { display:grid; gap:0.25rem; min-width:0; }
.svc-contextual-history__filters :deep(.base-field) { min-width:0; }
.svc-contextual-history__filters > :last-child { margin-top:1.15rem; }
.svc-contextual-history__filters .svc-date-shortcuts { display:flex; flex-wrap:wrap; gap:0.2rem; }
.svc-contextual-history__filters .svc-date-shortcuts button { padding:0.2rem 0.35rem; font-size:0.7rem; min-height:28px; border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-secondary); background:var(--surface); cursor:pointer; }
.svc-contextual-history__filters .svc-date-shortcuts button[aria-pressed='true'] { color:var(--text); border-color:var(--accent); }
@media(max-width:1200px){ .svc-contextual-history__filters { grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr)); } .svc-contextual-history__dates { grid-column:span 2; } }
@media(max-width:700px){ .svc-contextual-history__filters { grid-template-columns:repeat(2,minmax(0,1fr)); gap:0.4rem; } .svc-contextual-history__dates { grid-column:1/-1; } .svc-contextual-history__filters > :last-child { margin-top:1rem; } }
</style>
