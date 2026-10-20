<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-vue-next'
import { fetchDashboardDetails } from '@/services/dashboardService'
import type { DashboardDetailKind, DashboardDetailPage, DashboardDetailRecord } from '@/types/dashboard'

const route=useRoute(),router=useRouter()
const kind=computed<DashboardDetailKind>(()=>
  route.query.kind==='certificates'?'certificates':route.query.kind==='recentFindings'?'recentFindings':'findings')
const titles:Record<DashboardDetailKind,string>={
  findings:'Hallazgos pendientes',recentFindings:'Historial de hallazgos',certificates:'Certificados próximos a vencer'}
const notes:Record<DashboardDetailKind,string>={
  findings:'Hallazgos abiertos o en proceso · todos los períodos',
  recentFindings:'Hallazgos de todas las fechas, ordenados del más reciente al más antiguo',
  certificates:'Certificados técnicos y documentos emitidos próximos a vencer · indicador global'}
const page=computed(()=>Math.max(1,Math.min(10000,Number(route.query.page)||1)))
const clientId=computed(()=>typeof route.query.clientId==='string'?route.query.clientId:'')
const siteId=computed(()=>typeof route.query.siteId==='string'?route.query.siteId:'')
const back=computed(()=>typeof route.query.returnTo==='string'&&route.query.returnTo.startsWith('/')&&!route.query.returnTo.startsWith('//')?route.query.returnTo:'/')
const result=ref<DashboardDetailPage|null>(null),loading=ref(false),error=ref('')
let controller:AbortController|null=null,request=0
async function load():Promise<void>{
  controller?.abort()
  const current=++request,c=new AbortController()
  controller=c;loading.value=true;error.value=''
  try{
    const response=await fetchDashboardDetails(kind.value,page.value,clientId.value,siteId.value,c.signal)
    if(request===current)result.value=response
  }catch(failure){
    if(!c.signal.aborted&&request===current)error.value=failure instanceof Error?failure.message:'No fue posible consultar los registros.'
  }finally{if(current===request)loading.value=false}
}
watch([kind,page,clientId,siteId],()=>void load(),{immediate:true})
onBeforeUnmount(()=>{request++;controller?.abort()})
function go(next:number):void{void router.push({query:{...route.query,page:String(next)}})}
function link(item:DashboardDetailRecord){
  if(item.kind==='technician')return {name:'users',query:{userId:item.id}}
  if(item.kind==='certificate'&&item.serviceId)return {name:'service-detail',params:{id:item.serviceId}}
  return {name:'site-detail',params:{id:item.clientId,siteId:item.siteId},query:{tab:'findings',findingState:item.state,findingSearch:item.title.slice(0,160)}}
}
const format=(value:string)=>new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Bogota'}).format(new Date(value.length===10?value+'T12:00:00Z':value))
</script>
<template>
  <div class="page dashboard-details-page">
    <header class="page-header admin-page-header">
      <div class="admin-page-heading"><h1>{{ titles[kind] }}</h1><p>— {{ notes[kind] }}</p></div>
      <RouterLink class="detail-back" :to="back"><ArrowLeft :size="15" /> Volver al resumen</RouterLink>
    </header>
    <section class="card detail-panel">
      <div class="detail-panel__top">
        <span v-if="kind!=='certificates' && (clientId || siteId)">Con filtro de {{ siteId?'Sede':'Cliente' }}</span>
        <span v-else-if="kind==='certificates'">Alcance: toda la empresa</span>
        <span v-else>Todos los clientes y sedes</span>
        <span v-if="result">{{ result.total }} {{ result.total===1?'registro':'registros' }}</span>
        <button type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> Actualizar</button>
      </div>
      <p v-if="error" class="detail-error" role="alert">{{ error }} <button type="button" @click="load">Reintentar</button></p>
      <p v-if="loading && !result" class="detail-empty">Consultando registros…</p>
      <div v-else-if="result" class="detail-scroll">
        <table>
          <thead><tr><th>Fecha</th><th>{{ kind==='certificates'?'Certificado / usuario':'Hallazgo' }}</th>
            <th>Cliente / Sede</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            <tr v-for="item in result.items" :key="item.kind+item.id">
              <td data-label="Fecha">{{ format(item.date) }}</td>
              <td data-label="Registro"><strong>{{ item.title }}</strong><small>{{ item.description }}</small></td>
              <td data-label="Cliente / Sede">{{ item.clientName??'Empresa' }}<small v-if="item.siteName">{{ item.siteName }}</small></td>
              <td data-label="Estado">{{ item.state==='ABIERTO'?'Abierto':item.state==='EN_PROCESO'?'En proceso':item.state }}</td>
              <td data-label="Acción"><RouterLink :to="link(item)">Ver detalle →</RouterLink></td>
            </tr>
            <tr v-if="!result.items.length"><td colspan="5" class="detail-empty">No hay registros que cumplan el filtro.</td></tr>
          </tbody>
        </table>
      </div>
      <nav v-if="result && result.total>result.pageSize" class="detail-pages" aria-label="Paginación">
        <button type="button" :disabled="loading || page===1" @click="go(page-1)"><ChevronLeft :size="16" /> Anterior</button>
        <span>Página {{ page }} de {{ Math.ceil(result.total/result.pageSize) }}</span>
        <button type="button" :disabled="loading || page*result.pageSize>=result.total" @click="go(page+1)">Siguiente <ChevronRight :size="16" /></button>
      </nav>
    </section>
  </div>
</template>
<style scoped>
.dashboard-details-page{gap:.75rem}.detail-panel{padding:.8rem}.detail-back{display:inline-flex;align-items:center;gap:.4rem;color:var(--text-secondary);text-decoration:none;font-size:.78rem}
.detail-panel__top,.detail-pages{display:flex;align-items:center;justify-content:space-between;gap:.7rem;flex-wrap:wrap;color:var(--text-secondary);font-size:.75rem;padding:.3rem .3rem .75rem}
.detail-panel button{display:inline-flex;align-items:center;gap:.25rem;cursor:pointer;border:1px solid var(--border);background:var(--surface);border-radius:var(--radius-sm);color:var(--text);padding:.35rem .6rem;font-size:.75rem}
.detail-panel button:disabled{opacity:.55;cursor:default}.detail-panel a{color:var(--text);text-decoration:none}.detail-panel a:hover{text-decoration:underline}
.detail-scroll{overflow-x:auto}.detail-panel table{width:100%;font-size:.79rem}.detail-panel th,.detail-panel td{padding:.6rem .55rem}.detail-panel th{font-size:.7rem}.detail-panel td small{display:block;color:var(--text-muted);font-size:.72rem;margin-top:.2rem}.detail-panel td strong{font-weight:600}
.detail-error{color:var(--danger);font-size:.8rem}.detail-empty{text-align:center;padding:1.5rem!important;color:var(--text-muted);font-size:.8rem}
@media(max-width:680px){.detail-panel thead{display:none}.detail-panel tbody{display:grid;gap:.5rem}.detail-panel tr{display:grid;gap:.3rem;border-bottom:1px solid var(--border);padding:.5rem 0}.detail-panel td{display:flex;gap:.7rem;justify-content:space-between;padding:.1rem .3rem;border:0;text-align:right}.detail-panel td::before{content:attr(data-label);font-size:.7rem;color:var(--text-muted);text-align:left}.detail-panel td[data-label="Registro"]{display:block;text-align:left}.detail-panel td[data-label="Registro"]::before{display:block;margin-bottom:.2rem}}
</style>
