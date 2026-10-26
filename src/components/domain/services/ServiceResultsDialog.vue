<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ExternalLink, FileText, Images } from 'lucide-vue-next'
import BaseDialog from '@/components/base/BaseDialog.vue'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
import { reportEvidence } from '@/helpers/serviceReport'
import { useEvidenceGallery } from '@/composables/useEvidenceGallery'
import type { EvidenceReference } from '@/types/siteInsights'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import { fetchServiceResults, serviceEvidenceUrl } from '@/services/serviceResultsService'
import type { ServiceResultsResponse } from '@/types/serviceResults'

const props=defineProps<{serviceId:string;solicitud:string}>()
const emit=defineEmits<{close:[]}>()
const router=useRouter()
const current=ref<ServiceResultsResponse|null>(null)
const loading=ref(true),error=ref('')
const tab=ref<'criterios'|'hallazgos'|'puestos'|'detalles'>('criterios')
const tabs=[
  {id:'criterios',label:'Criterios'}, {id:'hallazgos',label:'Hallazgos'},
  {id:'puestos',label:'Puestos de monitoreo'}, {id:'detalles',label:'Detalles'},
] as const
const areas=computed(()=>current.value?.data.areas??[])
const findings=computed(()=>areas.value.flatMap(a=>a.hallazgos.map(h=>({...h,area:a.nombre}))).sort((a,b)=>{
  const priority=(f:{estado:string;anterior:boolean})=>f.estado==='CERRADO'?2:f.anterior?0:1
  return priority(a)-priority(b)||a.fechaApertura.localeCompare(b.fechaApertura)
}))
const points=computed(()=>areas.value.flatMap(a=>a.puntos.map(p=>({...p,area:a.nombre}))))
const evaluation:Record<string,string>={C:'Cumple',CP:'Parcial',NC:'No cumple',NA:'No aplica'}
const fmt=(date:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date))
const hour=(date:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(date))
const minutes=computed(()=>current.value?Math.max(0,Math.round((new Date(current.value.data.finReal).getTime()-new Date(current.value.data.inicioReal).getTime())/60000)):0)

async function load():Promise<void>{
  loading.value=true;error.value=''
  try{current.value=await fetchServiceResults(props.serviceId)}
  catch(e){error.value=e instanceof Error?e.message:'No fue posible cargar los resultados.'}
  finally{loading.value=false}
}
onMounted(()=>{void load()})

const gallery = useEvidenceGallery(() => props.serviceId, async (_service, reference) => ({
  status: 'AVAILABLE' as const, url: await serviceEvidenceUrl(props.serviceId, reference.recordId),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
}))
const { open, index, state, url, current: currentPhoto, photos: galleryPhotos } = gallery
function openEvidence(path: string): void {
  if (!current.value) return
  const collection: EvidenceReference[] = reportEvidence(current.value.data).map(item => ({
    kind: 'CRITERION', recordId: item.path, index: 0, label: item.caption, date: '',
  }))
  gallery.show(collection, collection.findIndex(item => item.recordId === path))
}
function certificates():void{
  emit('close')
  void router.push({name:'certificates',query:{tab:'generate',serviceId:props.serviceId}})
}
</script>
<template>
  <BaseDialog size="wide" :model-value="true" :title="'Resultados · '+solicitud" description="Consulta histórica de solo lectura" @update:model-value="!$event&&emit('close')">
    <div class="results-tabs" role="tablist" aria-label="Secciones de resultados">
      <button v-for="item in tabs" :key="item.id" type="button" role="tab" :aria-selected="tab===item.id" :class="{selected:tab===item.id}" @click="tab=item.id">{{ item.label }}</button>
    </div>
    <LoadingSkeleton v-if="loading" :rows="5"/>
    <StatusPanel v-else-if="error" title="No se pudieron cargar los resultados" :message="error" tone="danger"><BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton></StatusPanel>
    <template v-else-if="current">
      <div v-if="tab==='criterios'" class="results-content">
        <template v-for="area in areas" :key="area.id">
          <section class="result-section">
            <div class="section-title"><h3>{{ area.nombre }}</h3><small v-if="area.sinAcceso">Sin acceso</small></div>
            <template v-if="area.sinAcceso">
              <p class="muted">No fue posible acceder. {{ area.motivo }}</p>
              <div class="photos"><button v-for="(path,index) in area.fotos" :key="path" @click="openEvidence(path)">Ver evidencia {{ index+1 }}</button></div>
            </template>
            <table v-else class="results-table">
              <thead><tr><th>Criterio</th><th>Evaluación</th><th>Observaciones / Evidencias</th></tr></thead>
              <tbody><tr v-for="(criterion,index) in area.criterios" :key="index">
                <td data-label="Criterio">{{ criterion.nombre }}<small v-if="area.hallazgos.some(finding => finding.criterioId === criterion.criterioId)">Con hallazgos relacionados</small></td><td data-label="Evaluación">{{ evaluation[criterion.evaluacion??'']??'—' }}</td>
                <td data-label="Observación y evidencias"><span>{{ criterion.observacion||'—' }}</span><div v-if="criterion.fotos.length" class="photos"><button v-for="(path,i) in criterion.fotos" :key="path" @click="openEvidence(path)">Foto {{ i+1 }}</button></div></td>
              </tr></tbody>
            </table>
          </section>
        </template>
      </div>
      <div v-else-if="tab==='hallazgos'" class="results-content">
        <p v-if="!findings.length" class="muted">No había hallazgos pendientes ni se registraron nuevos o cierres.</p>
        <section v-for="(finding,index) in findings" :key="index" class="result-section">
          <div class="section-title"><h3>{{ finding.area }}</h3><small>{{ finding.estado === 'CERRADO' ? 'Solucionado' : finding.anterior ? 'Pendiente anterior' : 'Nuevo · Pendiente' }}</small></div>
          <p v-if="finding.criterioNombre" class="muted">{{ finding.criterioNombre }}</p><p>{{ finding.descripcion }}</p>
          <p class="muted">Acción correctiva: {{ finding.recomendacion }}</p>
          <p class="muted">Responsable: {{ finding.responsable }}</p>
          <p class="muted">Apertura: {{ fmt(finding.fechaApertura) }} · {{ finding.solicitudApertura }}<span v-if="finding.anterior"> · {{ finding.visitasDesdeApertura }} visitas</span></p>
          <div class="photos"><button v-for="(path,i) in finding.fotos" :key="path" @click="openEvidence(path)">Foto inicial {{ i+1 }}</button></div>
          <div v-if="finding.seguimientos.length" class="result-section">
            <strong>Historial</strong>
            <div v-for="(review,i) in finding.seguimientos" :key="i">
              <p class="muted">{{ fmt(review.fecha) }} · {{ review.solicitud }} · {{ review.resultado === 'SIN_CAMBIOS' ? 'Sigue pendiente' : review.resultado === 'CERRADO' ? 'Solucionado' : 'En proceso' }}</p>
              <p v-if="review.observacion">{{ review.observacion }}</p>
              <div class="photos"><button v-for="(path,j) in review.fotos" :key="path" @click="openEvidence(path)">Foto seguimiento {{ j+1 }}</button></div>
            </div>
          </div>
        </section>
      </div>
      <div v-else-if="tab==='puestos'" class="results-content">
        <p v-if="!points.length" class="muted">No se registraron puestos en este servicio.</p>
        <table v-else class="results-table">
          <thead><tr><th>Área / Puesto</th><th>Estado</th><th>Capturas</th><th>Evidencia</th></tr></thead>
          <tbody><tr v-for="(point,index) in points" :key="index">
            <td><strong>{{ point.numero }} · {{ point.tipo }}</strong><small>{{ point.area }} · {{ point.ubicacion }}</small></td>
            <td>{{ point.estado||'—' }}</td>
            <td>{{ point.capturas.length?point.capturas.map(c=>c.plagaNombreSnapshot+': '+c.cantidad).join(', '):'Sin capturas' }}<small v-if="point.observaciones">{{ point.observaciones }}</small></td>
            <td><button v-if="point.foto" class="photo-action" @click="openEvidence(point.foto)">Ver foto</button><span v-else class="muted">—</span></td>
          </tr></tbody>
        </table>
      </div>
      <div v-else class="results-content">
        <section class="result-section">
          <h3>Ejecución</h3>
          <div class="details-grid">
            <div><small>Fecha programada</small><strong>{{ fmt(current.data.inicioProgramado) }}</strong></div>
            <div><small>Inicio real</small><strong>{{ hour(current.data.inicioReal) }}</strong></div>
            <div><small>Fin real</small><strong>{{ hour(current.data.finReal) }}</strong></div>
            <div><small>Duración real</small><strong>{{ minutes }} minutos</strong></div>
          </div>
        </section>
        <section class="result-section">
          <h3>Firmas</h3>
          <div class="document-row"><span>Técnico · {{ current.data.tecnico }}</span><button @click="openEvidence(current.data.firmaTecnico)">Ver firma <Images :size="13"/></button></div>
          <div class="document-row"><span>Cliente · {{ current.data.firmanteCliente }}</span><button @click="openEvidence(current.data.firmaCliente)">Ver firma <Images :size="13"/></button></div>
        </section>
        <section class="result-section">
          <h3>Documentos</h3>
          <div class="document-row"><span class="document-title"><FileText :size="16"/> Certificados</span><BaseButton variant="ghost" size="compact" @click="certificates">Consultar <ExternalLink :size="14"/></BaseButton></div>
        </section>
      </div>
    </template>
  </BaseDialog>
  <EvidenceLightbox :open="open" :index="index" :total="galleryPhotos.length" :state="state" :url="url" :title="currentPhoto?.label ?? 'Evidencia'" caption="Evidencia de la visita" @close="gallery.close" @select="gallery.select" @retry="gallery.retry" @image-error="gallery.imageFailed" />
</template>
<style scoped>
.results-tabs{display:flex;gap:1.2rem;border-bottom:1px solid var(--border);overflow-x:auto;margin:-.5rem 0 1rem}
.results-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:.65rem 0;color:var(--text-secondary);font-size:.81rem;white-space:nowrap;cursor:pointer}
.results-tabs button.selected{border-bottom-color:var(--text);color:var(--text);font-weight:600}
.results-content{display:grid;gap:1.2rem}
.result-section{display:grid;gap:.5rem}
.result-section h3{margin:0;font-size:.92rem;font-weight:600}
.result-section p{margin:0;font-size:.82rem;overflow-wrap:anywhere}
.section-title{display:flex;align-items:baseline;gap:.5rem}
.section-title small,.muted,.details-grid small,.document-title small{color:var(--text-secondary);font-size:.76rem}
.results-table{width:100%;border-collapse:collapse;font-size:.81rem;text-align:left}
.results-table th{font-weight:500;color:var(--text-secondary);font-size:.73rem}
.results-table th,.results-table td{padding:.54rem .6rem;border-bottom:1px solid var(--border);vertical-align:top}
.results-table th:first-child,.results-table td:first-child{padding-left:0}
.results-table td strong{font-weight:550}.results-table td small{display:block;color:var(--text-secondary);margin-top:3px}
.photos{display:flex;gap:.5rem;flex-wrap:wrap}
.photos button,.photo-action,.document-row>button{min-height:44px;min-width:44px;border:0;background:transparent;padding:0;color:var(--text-secondary);font-size:.77rem;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.details-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;padding:.35rem 0}
.details-grid>div{display:grid;gap:.2rem}.details-grid strong{font-size:.86rem;font-weight:550}
.document-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:2.6rem;border-bottom:1px solid var(--border)}
.document-row>button{display:flex;align-items:center;gap:.3rem}
.document-title{display:flex;align-items:center;gap:.5rem;font-size:.83rem}
@media(max-width:640px){.details-grid{grid-template-columns:repeat(2,1fr)}.results-tabs{gap:.8rem}.results-table{min-width:530px}.result-section:has(.results-table){overflow-x:auto}}
@media(max-width:640px){
  .criteria-results{display:block;min-width:0}
  .criteria-results thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
  .criteria-results tbody{display:grid;gap:.6rem}
  .criteria-results tr{display:grid;grid-template-columns:minmax(0,1fr) auto;border-bottom:1px solid var(--border);padding:.45rem 0}
  .criteria-results td{border:0;padding:.2rem 0;overflow-wrap:anywhere}
  .criteria-results td:last-child{grid-column:1/-1}
  .criteria-results td:last-child::before{content:attr(data-label);display:block;color:var(--text-secondary);font-size:.7rem;margin-bottom:.2rem}
}
</style>
