<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarDays, CheckCircle2, Clock3, ClipboardCheck, MapPin, RefreshCw, TrendingUp } from 'lucide-vue-next'
import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'
import { addDateDays, todayBogota } from '@/helpers/adminServices'
import { resolveDashboardRange } from '@/helpers/dashboardRanges'
import { fetchTechnicianDashboard } from '@/services/dashboardService'
import { useAuthStore } from '@/stores/auth'
import type { DashboardPeriod } from '@/types/dashboard'
import type { TechnicianDashboardSnapshot, TechnicianDashboardService } from '@/types/technicianDashboard'

const DashboardChart = defineAsyncComponent(() => import('@/components/domain/dashboard/DashboardChart.vue'))
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const query = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : ''
const presets: DashboardPeriod[] = ['7d','30d','90d','12m','24m','5y','custom']
const period = ref<DashboardPeriod>(presets.includes(query('period') as DashboardPeriod) ? query('period') as DashboardPeriod : '30d')
const today = todayBogota()
const customRange = ref({ from: query('from') || addDateDays(today,-29), to: query('to') || today })
const rangeError = computed(() => {
  if (period.value !== 'custom') return ''
  try { resolveDashboardRange(period.value,customRange.value); return '' }
  catch { return 'Selecciona un rango válido de hasta diez años.' }
})
const snapshot = ref<TechnicianDashboardSnapshot | null>(null)
const loading = ref(false)
const error = ref('')
let controller: AbortController | null = null
let sequence = 0
const number = (value: number) => new Intl.NumberFormat('es-CO').format(value)
const datetime = (value: string) => new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',
  day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))
const duration = (minutes: number | null) => minutes === null ? '—' :
  minutes >= 60 ? Math.floor(minutes/60)+' h '+(minutes%60)+' min' : minutes+' min'
const chartLabel = computed(() => {
  const selected = snapshot.value?.period
  if (!selected) return ''
  if (selected.id === 'custom') return selected.from + ' – ' + selected.to
  return ({'7d':'Últimos 7 días','30d':'Últimos 30 días','90d':'Últimos 90 días',
    '12m':'Últimos 12 meses','24m':'Últimos 2 años','5y':'Últimos 5 años',
    'custom':'Rango personalizado'})[selected.id]
})
const chartGranularity = computed(() => {
  if (!snapshot.value) return 'día'
  const {from,to} = snapshot.value.period
  const days = Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86_400_000)+1
  return days<=14 ? 'día' : days<=120 ? 'semana' : days<=1460 ? 'mes' : 'trimestre'
})
const cards = computed(() => {
  const k = snapshot.value?.kpis
  if (!k) return []
  return [
    { title:'Finalizados', value:number(k.completed), detail:'En el período', icon:CheckCircle2, tone:'green' },
    { title:'Programados', value:number(k.scheduled), detail:k.ongoing+' en proceso · pendientes totales', icon:CalendarDays, tone:'blue' },
    { title:'Sedes atendidas', value:number(k.sites), detail:k.clients+' clientes en el período', icon:MapPin, tone:'violet' },
    { title:'Inicios puntuales', value:k.punctuality===null?'—':k.punctuality+' %',
      detail:k.started ? k.onTime+' de '+k.started+' · margen 15 min' : 'Sin inicios registrados',
      icon:Clock3, tone:'yellow' },
  ]
})
const activities = computed(() => {
  const a = snapshot.value?.activity
  if (!a) return []
  return [
    { label:'Hallazgos en mis visitas', value:a.findings },
    { label:'Seguimientos realizados', value:a.followUps },
    { label:'Cierres documentados', value:a.findingsClosed },
    { label:'Puestos revisados', value:a.reviewedDevices },
    { label:'Puestos creados', value:a.installedDevices },
    { label:'Productos aplicados', value:a.appliedProducts },
  ]
})
function serviceLink(record: TechnicianDashboardService) {
  return { name:'technician-service-work', params:{ id:record.id } }
}
function syncUrl(): void {
  void router.replace({name:'dashboard',query:{
    period:period.value,
    from:period.value==='custom'?customRange.value.from:undefined,
    to:period.value==='custom'?customRange.value.to:undefined,
  }})
}
async function load(): Promise<void> {
  controller?.abort()
  const id = ++sequence
  error.value = ''
  if (rangeError.value) { loading.value = false; return }
  const next = new AbortController()
  controller = next
  loading.value = true
  try {
    const response = await fetchTechnicianDashboard(period.value,
      period.value==='custom'?customRange.value:null,next.signal)
    if (id===sequence) snapshot.value = response
  } catch (reason) {
    if (!next.signal.aborted && id===sequence) error.value =
      reason instanceof Error ? reason.message : 'No fue posible consultar el resumen.'
  } finally {
    if (id===sequence) { loading.value = false; controller = null }
  }
}
function setPeriod(event: Event): void {
  period.value = (event.target as HTMLSelectElement).value as DashboardPeriod
}
watch([period,customRange],()=>{syncUrl();void load()})
onMounted(()=>void load())
onBeforeUnmount(()=>{sequence++;controller?.abort()})
</script>

<template>
  <div class="technician-dashboard">
    <header class="dashboard-heading">
      <div>
        <h1>Mi resumen</h1>
        <p>Servicios y actividad de campo de {{ auth.profile?.nombreCompleto.split(' ')[0] }}</p>
      </div>
      <div class="dashboard-filters technician-dashboard__filters">
        <label class="dashboard-filter"><span class="sr-only">Período</span>
          <select :value="period" aria-label="Período" @change="setPeriod">
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="24m">Últimos 2 años</option>
            <option value="5y">Últimos 5 años</option>
            <option value="custom">Rango personalizado</option>
          </select>
        </label>
        <BaseDateRangePicker v-if="period==='custom'" class="dashboard-custom-picker"
          name="technician-dashboard-range" label="Rango personalizado" :model-value="customRange"
          :error="rangeError || undefined" @update:model-value="customRange=$event" />
        <button class="dashboard-reload" type="button" aria-label="Actualizar resumen" title="Actualizar resumen"
          :disabled="loading" @click="load">
          <RefreshCw :size="16" :class="{'dashboard-refreshing':loading}" />
        </button>
      </div>
    </header>

    <div v-if="error || rangeError" class="dashboard-error" role="alert">
      {{ rangeError || error }}
      <button v-if="!rangeError" type="button" @click="load">Reintentar</button>
    </div>
    <div v-if="!snapshot" class="dashboard-initial" role="status">
      {{ loading ? 'Consultando mis estadísticas…' : 'Sin datos disponibles.' }}
    </div>
    <template v-else-if="!rangeError">
      <div class="dashboard-meta" aria-live="polite">
        <span>{{ chartLabel }}</span>
        <span v-if="loading" class="dashboard-update">Actualizando…</span>
        <span v-else>Actualizado: {{ datetime(snapshot.generatedAt) }}</span>
      </div>

      <section class="dashboard-kpis technician-dashboard__kpis" aria-label="Mis indicadores">
        <div v-for="card in cards" :key="card.title" class="dashboard-kpi" :class="'dashboard-kpi--'+card.tone">
          <div class="dashboard-kpi__top"><component :is="card.icon" :size="18" aria-hidden="true" /><span>{{ card.title }}</span></div>
          <strong>{{ card.value }}</strong><small>{{ card.detail }}</small>
        </div>
      </section>

      <RouterLink v-if="snapshot.kpis.overdue" to="/servicios" class="technician-dashboard__notice">
        <Clock3 :size="16" aria-hidden="true" />
        {{ snapshot.kpis.overdue }} {{ snapshot.kpis.overdue===1 ? 'servicio programado lleva' : 'servicios programados llevan' }} más de 15 minutos de retraso.
        <span>Ver mis servicios →</span>
      </RouterLink>

      <section class="technician-dashboard__main" aria-label="Actividad y evolución">
        <article class="dashboard-panel technician-dashboard__history">
          <header>
            <div><h2><TrendingUp :size="18" aria-hidden="true" /> Servicios realizados por {{ chartGranularity }}</h2>
              <p>Histórico por fecha real de finalización</p></div>
            <span>{{ chartLabel }}</span>
          </header>
          <DashboardChart kind="completed" :data="snapshot.charts" :period="snapshot.period" />
        </article>

        <article class="dashboard-panel technician-dashboard__activity">
          <header><div><h2><ClipboardCheck :size="18" aria-hidden="true" /> Actividad técnica</h2>
            <p>Registros del período seleccionado</p></div></header>
          <div class="technician-dashboard__activity-grid">
            <div v-for="item in activities" :key="item.label" class="technician-dashboard__stat">
              <strong>{{ number(item.value) }}</strong><span>{{ item.label }}</span>
            </div>
          </div>
          <div class="technician-dashboard__insights">
            <div><span>Cumplimiento MIP observado en sedes</span>
              <strong>{{ snapshot.activity.mipCompliance===null ? 'Sin evaluación' : snapshot.activity.mipCompliance.toLocaleString('es-CO')+' %' }}</strong>
            </div>
            <div><span>Duración transcurrida promedio por visita</span>
              <strong>{{ duration(snapshot.kpis.avgMinutes) }}</strong>
            </div>
          </div>
          <p class="technician-dashboard__note">La actividad compartida corresponde a visitas donde participaste. El cumplimiento describe la sede, no tu desempeño.</p>
        </article>
      </section>

      <section class="technician-dashboard__records" aria-label="Mis servicios">
        <article class="dashboard-panel dashboard-table-panel">
          <header><div><h2><CalendarDays :size="17" aria-hidden="true" /> Próximos servicios</h2>
            <p>En proceso y próximos cinco pendientes</p></div>
            <RouterLink to="/servicios">Ver todos →</RouterLink></header>
          <div class="dashboard-table-scroll">
            <table><thead><tr><th>Fecha</th><th>Cliente / Sede</th><th>Participación</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="record in snapshot.tables.upcoming" :key="record.id">
                  <td data-label="Fecha">{{ datetime(record.scheduledAt) }}</td>
                  <td data-label="Cliente / Sede"><RouterLink :to="serviceLink(record)">{{ record.clientName }}</RouterLink>
                    <small>{{ record.siteName }} · {{ record.reference }}</small></td>
                  <td data-label="Participación">{{ record.role==='RESPONSABLE'?'Responsable':'Colaborador' }}</td>
                  <td data-label="Estado"><span class="dashboard-status" :class="'dashboard-status--'+record.status">{{ record.status==='EN_PROCESO'?'En proceso':'Programado' }}</span></td>
                </tr>
                <tr v-if="!snapshot.tables.upcoming.length"><td colspan="4" class="dashboard-no-rows">No tienes servicios pendientes.</td></tr>
              </tbody>
            </table>
          </div>
        </article>
        <article class="dashboard-panel dashboard-table-panel">
          <header><div><h2><CheckCircle2 :size="17" aria-hidden="true" /> Últimos servicios finalizados</h2>
            <p>Los cinco más recientes del período</p></div>
            <RouterLink to="/servicios?tab=history">Ver historial →</RouterLink></header>
          <div class="dashboard-table-scroll">
            <table><thead><tr><th>Finalizado</th><th>Cliente / Sede</th><th>Participación</th></tr></thead>
              <tbody>
                <tr v-for="record in snapshot.tables.recent" :key="record.id">
                  <td data-label="Finalizado">{{ datetime(record.completedAt || record.scheduledAt) }}</td>
                  <td data-label="Cliente / Sede"><RouterLink :to="serviceLink(record)">{{ record.clientName }}</RouterLink>
                    <small>{{ record.siteName }} · {{ record.reference }}</small></td>
                  <td data-label="Participación">{{ record.role==='RESPONSABLE'?'Responsable':'Colaborador' }}</td>
                </tr>
                <tr v-if="!snapshot.tables.recent.length"><td colspan="3" class="dashboard-no-rows">Sin visitas finalizadas en este período.</td></tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.technician-dashboard{display:grid;gap:.75rem;min-width:0}
.technician-dashboard__kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
.technician-dashboard__main{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,1fr);gap:.65rem}
.technician-dashboard__history :deep(.dashboard-chart-box){height:315px}
.technician-dashboard__activity-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}
.technician-dashboard__stat{display:flex;flex-direction:column;gap:.25rem;padding:.65rem;border:1px solid var(--border);
  border-radius:var(--radius);min-width:0}
.technician-dashboard__stat strong{font-size:1.25rem;font-weight:650;font-variant-numeric:tabular-nums}
.technician-dashboard__stat span{font-size:.7rem;color:var(--text-secondary);line-height:1.35}
.technician-dashboard__insights{display:grid;gap:.45rem;margin-top:.75rem}
.technician-dashboard__insights>div{display:flex;justify-content:space-between;gap:.7rem;align-items:baseline;font-size:.72rem}
.technician-dashboard__insights span{color:var(--text-secondary)}
.technician-dashboard__insights strong{font-variant-numeric:tabular-nums;white-space:nowrap}
.technician-dashboard__note{font-size:.68rem;color:var(--text-muted);margin:.6rem 0 0!important;line-height:1.45}
.technician-dashboard__records{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
.technician-dashboard__notice{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;padding:.6rem .8rem;
  border:1px solid var(--warning);border-radius:var(--radius);font-size:.76rem;
  color:var(--text);background:var(--warning-subtle);text-decoration:none}
.technician-dashboard__notice span{color:var(--text-secondary);text-decoration:underline}
@media(max-width:1100px){.technician-dashboard__main{grid-template-columns:1fr}}
@media(max-width:850px){.technician-dashboard__records{grid-template-columns:1fr}}
@media(max-width:680px){
  .technician-dashboard__kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .technician-dashboard__filters{display:flex;flex-wrap:wrap}
  .technician-dashboard__filters .dashboard-filter{flex:1;min-width:0}
  .technician-dashboard__filters .dashboard-custom-picker{flex-basis:100%;width:100%}
  .technician-dashboard__history :deep(.dashboard-chart-box){height:255px}
  .technician-dashboard__activity-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
</style>
