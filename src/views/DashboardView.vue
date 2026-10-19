<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Clock3,
  FileWarning, MapPin, RefreshCw, TrendingUp, Wallet, WifiOff } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { fetchDashboard } from '@/services/dashboardService'
import { addDateDays, PAYMENT_LABELS, SERVICE_STATE_LABELS, todayBogota } from '@/helpers/adminServices'
import type { DashboardPeriod, DashboardSnapshot } from '@/types/dashboard'
import './dashboard.css'

const DashboardChart=defineAsyncComponent(()=>import('@/components/domain/dashboard/DashboardChart.vue'))
const session=useAuthStore()
const period=ref<DashboardPeriod>('30d')
const clientId=ref('')
const siteId=ref('')
const snapshot=ref<DashboardSnapshot|null>(null)
const loading=ref(false)
const error=ref('')
let request:AbortController|null=null
let counter=0
const today=todayBogota()
const currency=(value:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value)
const datetime=(value:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'2-digit',
  month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))
const date=(value:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'short'}).format(new Date(value))
const age=(value:string)=>Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86_400_000))
const sites=computed(()=>snapshot.value?.filters.sites.filter(x=>!clientId.value||x.clientId===clientId.value)??[])
const chartLabel=computed(()=>({ '7d':'Últimos 7 días','30d':'Últimos 30 días','90d':'Últimos 90 días','12m':'Últimos 12 meses' })[period.value])
const historyLink='/servicios?tab=history'
const agendaLink='/servicios?tab=agenda&view=table&from='+today+'&to='+today
const delayedLink='/servicios?tab=agenda&view=table&estado=PROGRAMADO&from='+addDateDays(today,-365)+'&to='+today
const upcomingLink='/servicios?tab=upcoming'
async function load():Promise<void>{
  if(!session.isAdmin)return
  request?.abort()
  const id=++counter
  const controller=new AbortController()
  request=controller;loading.value=true;error.value=''
  try{
    const response=await fetchDashboard(period.value,clientId.value,siteId.value,controller.signal)
    if(id===counter)snapshot.value=response
  }catch(reason){
    if(!controller.signal.aborted&&id===counter)error.value=reason instanceof Error?reason.message:'No fue posible consultar el resumen.'
  }finally{
    if(id===counter){loading.value=false;request=null}
  }
}
function setPeriod(event:Event):void{period.value=(event.target as HTMLSelectElement).value as DashboardPeriod}
function setClient(event:Event):void{clientId.value=(event.target as HTMLSelectElement).value;siteId.value=''}
function setSite(event:Event):void{siteId.value=(event.target as HTMLSelectElement).value}
const kpis=computed(()=>{
  const k=snapshot.value?.kpis
  if(!k)return []
  const total=k.today.scheduled+k.today.ongoing+k.today.completed
  return [
    {title:'Servicios de hoy',value:String(total),extra:k.today.ongoing+' en proceso · '+k.today.completed+' finalizados',
      icon:CalendarDays,kind:'blue',to:agendaLink},
    {title:'Servicios retrasados',value:String(k.delayed),extra:'Sin iniciar, más de 15 min',icon:Clock3,kind:'red',to:delayedLink},
    {title:'Próximos por confirmar',value:String(k.upcoming),extra:k.upcomingOverdue+' vencidos · próximos 7 días',
      icon:CalendarClock,kind:'yellow',to:upcomingLink},
    {title:'Valor de servicios realizados',value:currency(k.performedValue),
      extra:k.performedDelta===null?'Sin período comparable':(k.performedDelta>0?'+':'')+k.performedDelta+' % vs. período anterior',
      icon:TrendingUp,kind:'green',to:historyLink},
    {title:'Cobros pendientes',value:currency(k.outstandingValue),extra:k.outstandingPayments+' servicios finalizados',
      icon:Wallet,kind:'violet',to:historyLink},
    {title:'Hallazgos pendientes',value:String(k.findings.open+k.findings.ongoing),
      extra:k.findings.open+' abiertos · '+k.findings.ongoing+' en proceso',
      icon:ClipboardList,kind:'orange',to:'#dashboard-findings'}
  ]
})
const attention=computed(()=>{
  const k=snapshot.value?.kpis,a=snapshot.value?.alerts
  if(!k||!a)return []
  return [
    {title:'Servicios retrasados',detail:'Programados sin iniciar, más de 15 minutos',count:k.delayed,icon:Clock3,kind:'red',to:delayedLink,action:'Ver agenda'},
    {title:'Próximos por confirmar',detail:'Visitas vencidas o previstas en los próximos 7 días',count:k.upcoming,icon:CalendarDays,kind:'yellow',to:upcomingLink,action:'Gestionar'},
    {title:'Cobros pendientes',detail:'Servicios finalizados sin pago confirmado',count:k.outstandingPayments,icon:Wallet,kind:'orange',to:historyLink,action:'Ver servicios'},
    {title:'Hallazgos sin resolver',detail:'Abiertos o en proceso',count:k.findings.open+k.findings.ongoing,
      icon:CircleAlert,kind:'red',to:'#dashboard-findings',action:'Ver hallazgos'},
    {title:'Certificados próximos a vencer',detail:'Técnicos y certificados emitidos · próximos 30 días',count:a.expiringCertificates,
      icon:FileWarning,kind:'neutral',to:'/usuarios',action:'Ver usuarios'},
    {title:'Errores de Calendar',detail:'Servicios sin sincronizar',count:a.calendarErrors,
      icon:WifiOff,kind:'yellow',to:historyLink,action:'Ver servicios'}
  ].filter(x=>x.count>0)
})
watch([period,clientId,siteId],()=>void load())
onMounted(()=>void load())
onBeforeUnmount(()=>{counter++;request?.abort()})
</script>

<template>
  <div class="page dashboard-page">
    <template v-if="!session.isAdmin">
      <header class="page-header admin-page-header">
        <div class="admin-page-heading"><h1>Hola, {{ session.profile?.nombreCompleto.split(' ')[0] }}</h1><p>— Trabajo de campo</p></div>
      </header>
      <RouterLink to="/servicios" class="card dashboard-technician-link"><ClipboardList :size="20" /> Ver mis servicios</RouterLink>
    </template>
    <template v-else>
      <header class="dashboard-heading">
        <div><h1>Resumen</h1><p>Vista general de la operación de Soluciones Radicales MIP</p></div>
        <div class="dashboard-filters">
          <label class="dashboard-filter"><span class="sr-only">Período</span>
            <select :value="period" @change="setPeriod">
              <option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option><option value="12m">Últimos 12 meses</option>
            </select>
          </label>
          <label class="dashboard-filter"><span class="sr-only">Cliente</span>
            <select aria-label="Cliente" :value="clientId" @change="setClient"><option value="">Todos los clientes</option>
              <option v-for="client in snapshot?.filters.clients ?? []" :key="client.id" :value="client.id">{{ client.name }}</option>
            </select>
          </label>
          <label class="dashboard-filter"><span class="sr-only">Sede</span>
            <select aria-label="Sede" :value="siteId" @change="setSite"><option value="">Todas las sedes</option>
              <option v-for="site in sites" :key="site.id" :value="site.id">{{ site.name }}</option>
            </select>
          </label>
          <button type="button" class="dashboard-reload" :disabled="loading" @click="load" aria-label="Actualizar resumen" title="Actualizar resumen">
            <RefreshCw :size="16" :class="{'dashboard-refreshing':loading}" />
          </button>
        </div>
      </header>

      <div v-if="error" class="dashboard-error" role="alert">
        {{ error }} <button type="button" @click="load">Reintentar</button>
      </div>
      <div v-if="!snapshot" class="dashboard-initial">
        <span v-if="loading">Consultando indicadores…</span><span v-else>Sin datos disponibles.</span>
      </div>
      <template v-else>
        <div class="dashboard-meta" aria-live="polite">
          <span>{{ chartLabel }} · Valores en COP</span>
          <span v-if="loading" class="dashboard-update">Actualizando…</span>
          <span v-else>Actualizado: {{ datetime(snapshot.generatedAt) }}</span>
        </div>
        <section class="dashboard-kpis" aria-label="Indicadores principales">
          <RouterLink v-for="card in kpis" :key="card.title" :to="card.to" class="dashboard-kpi" :class="'dashboard-kpi--'+card.kind">
            <div class="dashboard-kpi__top"><component :is="card.icon" :size="18" aria-hidden="true" /><span>{{ card.title }}</span><span class="dashboard-kpi__arrow" aria-hidden="true">↗</span></div>
            <strong>{{ card.value }}</strong><small>{{ card.extra }}</small>
          </RouterLink>
        </section>
        <section class="dashboard-charts" aria-label="Estadísticas">
          <article class="dashboard-panel">
            <header><div><h2>{{ period==='7d'?'Servicios por día':period==='12m'?'Servicios por mes':'Servicios por semana' }}</h2><p>Servicios programados según su estado</p></div><span>{{ chartLabel }}</span></header>
            <DashboardChart kind="services" :data="snapshot.charts" :period="snapshot.period" />
          </article>
          <article class="dashboard-panel">
            <header><div><h2>Valor de servicios realizados</h2><p>Según fecha de finalización · COP</p></div><span>{{ chartLabel }}</span></header>
            <DashboardChart kind="value" :data="snapshot.charts" :period="snapshot.period" />
          </article>
          <article class="dashboard-panel">
            <header><div><h2>Cumplimiento MIP</h2><p>Media de visitas evaluadas de negocio</p></div><span>{{ chartLabel }}</span></header>
            <DashboardChart kind="compliance" :data="snapshot.charts" :period="snapshot.period" />
          </article>
        </section>

        <section class="dashboard-panel dashboard-attention" aria-labelledby="dashboard-attention-title">
          <header><div><h2 id="dashboard-attention-title"><CircleAlert :size="18" aria-hidden="true" /> Requiere atención</h2>
            <p>Pendientes operativos de toda la empresa o del Cliente y Sede seleccionados</p></div></header>
          <div v-if="!attention.length" class="dashboard-attention__clear"><CheckCircle2 :size="18" /> No hay alertas pendientes.</div>
          <div v-else class="dashboard-attention__list">
            <RouterLink v-for="item in attention" :key="item.title" :to="item.to" class="dashboard-attention__item">
              <component :is="item.icon" :size="16" :class="'dashboard-tone--'+item.kind" aria-hidden="true" />
              <strong>{{ item.title }}</strong><span class="dashboard-attention__count">{{ item.count }}</span>
              <span class="dashboard-attention__detail">{{ item.detail }}</span>
              <span class="dashboard-attention__action">{{ item.action }} <span aria-hidden="true">→</span></span>
            </RouterLink>
          </div>
        </section>

        <section class="dashboard-records" aria-label="Registros recientes">
          <article class="dashboard-panel dashboard-table-panel">
            <header><div><h2><CalendarDays :size="17" /> Próximos servicios</h2><p>En curso y próximas cinco visitas</p></div>
              <RouterLink to="/agenda">Ver agenda →</RouterLink></header>
            <div class="dashboard-table-scroll">
              <table><thead><tr><th>Fecha</th><th>Cliente / Sede</th><th>Técnico</th><th>Estado</th></tr></thead>
                <tbody><tr v-for="record in snapshot.tables.upcoming" :key="record.id">
                  <td data-label="Fecha">{{ datetime(record.date) }}</td>
                  <td data-label="Cliente / Sede"><RouterLink :to="{name:'service-detail',params:{id:record.id}}">{{ record.clientName }}</RouterLink><small>{{ record.siteName }} · {{ record.reference }}</small></td>
                  <td data-label="Técnico">{{ record.technician }}</td>
                  <td data-label="Estado"><span class="dashboard-status" :class="'dashboard-status--'+record.status">{{ SERVICE_STATE_LABELS[record.status] }}</span></td>
                </tr><tr v-if="!snapshot.tables.upcoming.length"><td colspan="4" class="dashboard-no-rows">No hay servicios próximos.</td></tr></tbody>
              </table>
            </div>
          </article>
          <article class="dashboard-panel dashboard-table-panel">
            <header><div><h2><CheckCircle2 :size="17" /> Últimos servicios realizados</h2><p>Últimas cinco finalizaciones</p></div>
              <RouterLink :to="historyLink">Ver historial →</RouterLink></header>
            <div class="dashboard-table-scroll">
              <table><thead><tr><th>Fecha</th><th>Cliente / Sede</th><th>Valor</th><th>Pago</th></tr></thead>
                <tbody><tr v-for="record in snapshot.tables.latest" :key="record.id">
                  <td data-label="Fecha">{{ datetime(record.date) }}</td>
                  <td data-label="Cliente / Sede"><RouterLink :to="{name:'service-detail',params:{id:record.id}}">{{ record.clientName }}</RouterLink><small>{{ record.siteName }} · {{ record.reference }}</small></td>
                  <td data-label="Valor" class="dashboard-money">{{ currency(record.value) }}</td>
                  <td data-label="Pago"><span class="dashboard-status" :class="record.payment==='CONFIRMADO'?'dashboard-status--paid':'dashboard-status--pending'">{{ PAYMENT_LABELS[record.payment as keyof typeof PAYMENT_LABELS]??record.payment }}</span></td>
                </tr><tr v-if="!snapshot.tables.latest.length"><td colspan="4" class="dashboard-no-rows">No hay servicios finalizados.</td></tr></tbody>
              </table>
            </div>
          </article>
          <article id="dashboard-findings" class="dashboard-panel dashboard-table-panel">
            <header><div><h2><MapPin :size="17" /> Últimos hallazgos</h2><p>Últimos cinco hallazgos registrados</p></div>
              <RouterLink to="/clientes">Ver clientes →</RouterLink></header>
            <div class="dashboard-table-scroll">
              <table><thead><tr><th>Fecha</th><th>Cliente / Sede</th><th>Hallazgo</th><th>Estado</th></tr></thead>
                <tbody><tr v-for="finding in snapshot.tables.findings" :key="finding.id">
                  <td data-label="Fecha">{{ date(finding.openedAt) }}</td>
                  <td data-label="Cliente / Sede"><RouterLink :to="{name:'site-detail',params:{id:finding.clientId,siteId:finding.siteId},query:{tab:'findings'}}">{{ finding.clientName }}</RouterLink><small>{{ finding.siteName }} · {{ finding.area }}</small></td>
                  <td data-label="Hallazgo" :title="finding.description" class="dashboard-finding-text">{{ finding.description }}</td>
                  <td data-label="Estado"><span class="dashboard-status" :class="'dashboard-status--finding-'+finding.status">{{ finding.status==='ABIERTO'?'Abierto':finding.status==='CERRADO'?'Cerrado':'En proceso' }}</span>
                    <small v-if="finding.status!=='CERRADO'">{{ age(finding.openedAt) }} días abierto</small></td>
                </tr><tr v-if="!snapshot.tables.findings.length"><td colspan="4" class="dashboard-no-rows">No hay hallazgos registrados.</td></tr></tbody>
              </table>
            </div>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>
