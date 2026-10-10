<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, FileDown, RefreshCw, Send, ExternalLink } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
import ReportEvidence from '@/components/domain/services/ReportEvidence.vue'
import SendReportDialog from '@/components/domain/services/SendReportDialog.vue'
import ServiceTrendCharts from '@/components/domain/services/ServiceTrendCharts.vue'
import {
  areaCompliance, bogotaDate, bogotaTime, elapsedMinutes,
  reportEvidence, reportMetrics, scoreText, type ReportEvidenceState,
} from '@/helpers/serviceReport'
import { fetchServiceResults, serviceEvidenceUrl, adminProductSheetUrl } from '@/services/serviceResultsService'
import { getReportShareOptions, resolvePublicServiceReport, publicReportPhotoUrl, publicProductSheetUrl } from '@/services/reportSharingService'
import { openProtectedDocument } from '@/helpers/openProtectedDocument'
import type { ServiceReportShareOptions } from '@/types/reportSharing'
import { useNotificationsStore } from '@/stores/notifications'
import type { ServiceResultsData } from '@/types/serviceResults'
import '@/components/domain/services/service-report.css'

const route = useRoute()
const notifications = useNotificationsStore()
const publicView = computed(() => route.name === 'public-service-report')
const publicToken = computed(() => String(route.params.token ?? ''))
const serviceId = computed(() => String(route.params.id ?? ''))
const report = ref<ServiceResultsData | null>(null)
const loading = ref(true)
const error = ref('')
const mediaBusy = ref(false)
const printBusy = ref(false)
const activeSheet = ref<number | null>(null)
const states = reactive<Record<string, ReportEvidenceState>>({})
const urls = reactive<Record<string, string>>({})
const selectedIndex = ref<number | null>(null)
const sendOpen = ref(false)
const shareOptions = ref<ServiceReportShareOptions | null>(null)
let version = 0
onBeforeUnmount(() => { version++ })

const images = computed(() => report.value ? reportEvidence(report.value) : [])
const metrics = computed(() => report.value ? reportMetrics(report.value) : null)
const findings = computed(() => (report.value?.areas.flatMap(area =>
  area.hallazgos.map(finding => ({ ...finding, area: area.nombre }))) ?? []).sort((a, b) => {
  const priority = (finding: {estado:string;anterior:boolean}) =>
    finding.estado === 'CERRADO' ? 2 : finding.anterior ? 0 : 1
  return priority(a) - priority(b) || a.fechaApertura.localeCompare(b.fechaApertura)
}))
const unresolvedFindings = computed(() => findings.value.filter(finding => finding.estado !== 'CERRADO').length)
const findingReviewLabel: Record<string,string> = {
  SIN_CAMBIOS: 'Sigue pendiente', EN_PROCESO: 'En proceso', CERRADO: 'Solucionado',
}
const missingImages = computed(() => images.value.filter(item => ['MISSING','ERROR'].includes(states[item.path] ?? 'IDLE')).length)
const availableSignatures = computed(() => report.value !== null
  && states[report.value.firmaTecnico] === 'AVAILABLE'
  && states[report.value.firmaCliente] === 'AVAILABLE')
const activeImage = computed(() => selectedIndex.value === null ? null : images.value[selectedIndex.value] ?? null)
const activeImageState = computed((): ReportEvidenceState => activeImage.value ? states[activeImage.value.path] ?? 'IDLE' : 'IDLE')

async function loadReport(): Promise<void> {
  const stamp = ++version
  loading.value = true
  mediaBusy.value = false
  error.value = ''
  selectedIndex.value = null
  report.value = null
  for (const key of Object.keys(states)) delete states[key]
  for (const key of Object.keys(urls)) delete urls[key]
  try {
    const response = publicView.value ? await resolvePublicServiceReport(publicToken.value) : await fetchServiceResults(serviceId.value)
    if (stamp !== version) return
    report.value = response.data
    if (!publicView.value) void loadShareSummary(stamp)
  } catch (failure) {
    if (stamp === version) error.value = failure instanceof Error ? failure.message : 'No fue posible cargar el informe.'
  } finally {
    if (stamp === version) {
      loading.value = false
      if (report.value) void loadAllImages(false, stamp)
    }
  }
}

async function loadImage(path: string, force: boolean, stamp: number): Promise<void> {
  if (stamp !== version || (!force && states[path] === 'AVAILABLE')) return
  states[path] = 'LOADING'
  try {
    const url = publicView.value ? await publicReportPhotoUrl(publicToken.value,path) : await serviceEvidenceUrl(serviceId.value, path)
    const loaded = await new Promise<boolean>(resolve => {
      const picture = new Image()
      let done = false
      const finish = (success: boolean) => {
        if (done) return
        done = true
        clearTimeout(timeout)
        picture.onload = null
        picture.onerror = null
        resolve(success)
      }
      const timeout = setTimeout(() => finish(false), 20_000)
      picture.onload = () => finish(true)
      picture.onerror = () => finish(false)
      picture.referrerPolicy = 'no-referrer'
      picture.src = url
    })
    if (stamp !== version) return
    if (loaded) {
      urls[path] = url
      states[path] = 'AVAILABLE'
    } else {
      delete urls[path]
      states[path] = 'MISSING'
    }
  } catch {
    if (stamp !== version) return
    delete urls[path]
    states[path] = 'ERROR'
  }
}

async function loadAllImages(force: boolean, stamp = version): Promise<void> {
  if (mediaBusy.value || stamp !== version) return
  const paths = images.value.map(item => item.path)
  mediaBusy.value = true
  let next = 0
  try {
    await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
      while (next < paths.length && stamp === version) {
        const path = paths[next++]!
        await loadImage(path, force, stamp)
      }
    }))
  } finally {
    if (stamp === version) mediaBusy.value = false
  }
}

async function printReport(): Promise<void> {
  if (!report.value || mediaBusy.value || printBusy.value) return
  printBusy.value = true
  const stamp = version
  try {
    // URLs from R2 expire after five minutes: renew and decode before printing.
    await loadAllImages(true, stamp)
    if (stamp !== version) return
    if (!availableSignatures.value) {
      notifications.show('Faltan imágenes de firmas. Reintenta antes de imprimir el informe.','error')
      return
    }
    await nextTick()
    await document.fonts?.ready
    window.print()
  } finally {
    printBusy.value = false
  }
}

async function loadShareSummary(stamp=version): Promise<void> {
  try {
    const value = await getReportShareOptions(serviceId.value)
    if (stamp === version) shareOptions.value = value
  } catch { if (stamp === version) shareOptions.value = null }
}
function onShared(): void {
  sendOpen.value = false
  void loadShareSummary()
}
async function openSheet(index:number):Promise<void>{
  if(activeSheet.value !== null)return
  activeSheet.value=index
  try{
    await openProtectedDocument(()=>publicView.value
      ? publicProductSheetUrl(publicToken.value,index)
      : adminProductSheetUrl(serviceId.value,index))
  }catch(error){
    notifications.show(error instanceof Error ? error.message : 'No fue posible consultar la ficha técnica.','error')
  }finally{activeSheet.value=null}
}
function photoState(path: string): ReportEvidenceState { return states[path] ?? 'IDLE' }
function openImage(path: string): void {
  const index = images.value.findIndex(item => item.path === path)
  if (index >= 0) selectedIndex.value = index
}
function imageError(path: string): void {
  delete urls[path]
  states[path] = 'MISSING'
}
function retryImage(): void {
  if (activeImage.value) void loadImage(activeImage.value.path, true, version)
}
const grade: Record<string, string> = { C: 'Cumple', CP: 'Cumple parcialmente', NC: 'No cumple', NA: 'No aplica' }
watch(() => [serviceId.value, publicToken.value], () => { void loadReport() }, { immediate: true })
</script>

<template>
  <div class="report-workspace" :class="{ 'report-workspace--public': publicView }">
    <div v-if="!publicView" class="report-toolbar">
      <RouterLink class="report-toolbar__back" to="/servicios?tab=history"><ArrowLeft :size="15" /> Volver a Historial</RouterLink>
      <span class="report-toolbar__hint">{{ shareOptions?.activeLinks ? 'Compartido · ' + shareOptions.activeLinks + ' enlace(s) vigente(s)' : 'Vista administrativa · Sin compartir' }}</span>
      <div class="report-toolbar__actions">
        <BaseButton size="compact" variant="secondary" :disabled="loading || mediaBusy || printBusy" @click="loadReport"><RefreshCw :size="15" /> Actualizar</BaseButton>
        <BaseButton size="compact" variant="secondary" :disabled="loading || !report" @click="sendOpen=true"><Send :size="15" /> Enviar informe</BaseButton>
        <BaseButton size="compact" :disabled="loading || mediaBusy || !report" :loading="printBusy" @click="printReport"><FileDown :size="15" /> Imprimir / Guardar PDF</BaseButton>
      </div>
    </div>
    <div v-else class="report-public-head">
      <span>Soluciones Radicales · Informe técnico de servicio</span>
      <BaseButton size="compact" variant="secondary" :disabled="loading || mediaBusy || !report" :loading="printBusy" @click="printReport"><FileDown :size="15" /> Guardar PDF</BaseButton>
    </div>
    <LoadingSkeleton v-if="loading" :rows="8" />
    <StatusPanel v-else-if="error" title="No se pudo preparar el informe" :message="error" tone="danger">
      <BaseButton variant="secondary" size="compact" @click="loadReport">Reintentar</BaseButton>
    </StatusPanel>
    <template v-else-if="report && metrics">
      <div v-if="mediaBusy" class="report-workspace__state" role="status">Preparando fotografías y firmas para impresión…</div>
      <div v-else-if="!availableSignatures" class="report-workspace__alert report-workspace__alert--error" role="alert">
        No se pudieron cargar las dos firmas. Vuelve a intentar desde «Actualizar» antes de imprimir.
      </div>
      <div v-else-if="missingImages" class="report-workspace__alert" role="status">
        {{ missingImages }} evidencia(s) no disponible(s). El historial escrito se conserva y esas imágenes se indicarán como ausentes.
      </div>
      <article class="report-document" :aria-label="'Informe técnico de ' + report.solicitud">
        <header class="report-document__header">
          <div class="report-document__brand">
            <img src="/favicon.png" alt="" class="report-document__logo" aria-hidden="true" />
            <div><strong>Soluciones Radicales</strong><small>MANEJO INTEGRADO DE PLAGAS</small></div>
          </div>
          <p class="report-document__eyebrow">Registro técnico · Servicio finalizado</p>
          <h1>Informe técnico de servicio</h1>
          <p class="report-document__subtitle">Evaluación, monitoreo y evidencias documentadas de la visita.</p>
          <dl class="report-document__meta">
            <div><dt>Solicitud</dt><dd>{{ report.solicitud }}</dd></div>
            <div><dt>Cliente</dt><dd>{{ report.cliente }}</dd></div>
            <div><dt>NIT</dt><dd>{{ report.nit || '—' }}</dd></div>
            <div><dt>Sede</dt><dd>{{ report.sede }}</dd></div>
            <div><dt>Fecha de ejecución</dt><dd>{{ bogotaDate(report.finReal) }}</dd></div>
            <div><dt>Técnico responsable</dt><dd>{{ report.tecnico }}</dd></div>
          </dl>
          <div class="report-metrics" aria-label="Resumen de resultados">
            <div class="report-metric"><strong>{{ scoreText(metrics.compliance) }}</strong><span>Cumplimiento</span></div>
            <div class="report-metric"><strong>{{ metrics.areasReviewed }} / {{ report.areas.length }}</strong><span>Áreas evaluadas</span></div>
            <div class="report-metric"><strong>{{ metrics.monitoringPoints }}</strong><span>Puestos de monitoreo</span></div>
            <div class="report-metric"><strong>{{ unresolvedFindings }}</strong><span>Hallazgos pendientes</span></div>
          </div>
        </header>

        <section class="report-document__section" aria-labelledby="report-general-title">
          <header class="report-document__heading"><span class="report-document__number">01</span><h2 id="report-general-title">Datos de ejecución</h2></header>
          <dl class="report-document__facts">
            <div><dt>Dirección</dt><dd>{{ report.direccion }}</dd></div>
            <div><dt>Programación</dt><dd>{{ bogotaDate(report.inicioProgramado) }} · {{ bogotaTime(report.inicioProgramado) }}</dd></div>
            <div><dt>Inicio real</dt><dd>{{ bogotaTime(report.inicioReal) }}</dd></div>
            <div><dt>Finalización</dt><dd>{{ bogotaTime(report.finReal) }}</dd></div>
            <div><dt>Duración</dt><dd>{{ elapsedMinutes(report.inicioReal, report.finReal) }} minutos</dd></div>
            <div><dt>Criterios evaluados</dt><dd>{{ metrics.criteriaReviewed }}</dd></div>
          </dl>
          <p v-if="metrics.areasWithoutAccess" class="report-document__section-intro">{{ metrics.areasWithoutAccess }} área(s) sin acceso, excluida(s) del porcentaje de cumplimiento.</p>
        </section>

        <section class="report-document__section" aria-labelledby="report-products-title">
          <header class="report-document__heading"><span class="report-document__number">02</span><h2 id="report-products-title">Productos aplicados</h2></header>
          <p v-if="!report.productos.length" class="report-document__empty">No se registraron productos aplicados durante esta visita.</p>
          <table v-else class="report-document__table">
            <thead><tr><th style="width:20%">Producto</th><th style="width:21%">Principio activo</th><th style="width:16%">Registro sanitario</th><th style="width:12%">Lote</th><th style="width:13%">Dosis</th><th style="width:18%">Método(s)</th></tr></thead>
            <tbody><tr v-for="(product,index) in report.productos" :key="index">
              <td><strong>{{ product.nombre }}</strong><button v-if="product.fichaTecnicaDisponible" type="button"
                  class="report-sheet-link" :disabled="activeSheet!==null" :aria-label="'Ver ficha técnica de '+product.nombre"
                  @click="openSheet(index)">Ficha técnica <ExternalLink :size="12" aria-hidden="true" /></button></td>
              <td>{{ product.principio || '—' }}</td><td>{{ product.registro || '—' }}</td>
              <td>{{ product.lote || '—' }}</td><td>{{ product.dosis || '—' }}</td><td>{{ product.metodos || '—' }}</td>
            </tr></tbody>
          </table>
        </section>

        <section class="report-document__section" aria-labelledby="report-criteria-title">
          <header class="report-document__heading"><span class="report-document__number">03</span><h2 id="report-criteria-title">Evaluación de criterios por área</h2></header>
          <p class="report-document__section-intro">C = 100 %, CP = 50 %, NC = 0 %. «No aplica» y las áreas sin acceso no intervienen en el cálculo.</p>
          <p v-if="!report.areas.length" class="report-document__empty">No se registraron áreas de evaluación.</p>
          <div v-for="area in report.areas" :key="area.id" class="report-area">
            <div class="report-area__head"><h3>{{ area.nombre }}</h3><span>{{ area.sinAcceso ? 'Sin acceso · No evaluada' : scoreText(areaCompliance(area)) }}</span></div>
            <div class="report-area__body">
              <template v-if="area.sinAcceso">
                <p class="report-document__section-intro">{{ area.motivo || 'No fue posible acceder al área.' }}</p>
                <div v-if="area.fotos.length" class="report-photo-row report-photo-row--wide">
                  <ReportEvidence v-for="(path,index) in area.fotos" :key="path" :path="path" :caption="'Área sin acceso · Foto ' + (index+1)" :state="photoState(path)" :url="urls[path]" @open="openImage" @failed="imageError" />
                </div>
              </template>
              <p v-else-if="!area.criterios.length" class="report-document__empty">Sin criterios evaluados en esta área.</p>
              <div v-for="(criterion,index) in area.sinAcceso ? [] : area.criterios" :key="index" class="report-criterion">
                <div class="report-criterion__text"><strong>{{ criterion.nombre }}</strong><p v-if="criterion.observacion">{{ criterion.observacion }}</p></div>
                <span class="report-evaluation" :class="'report-evaluation--' + (criterion.evaluacion || 'NA')">{{ grade[criterion.evaluacion ?? ''] || 'Sin evaluar' }}</span>
                <div v-if="criterion.fotos.length" class="report-photo-row">
                  <ReportEvidence v-for="(path,i) in criterion.fotos" :key="path" :path="path" :caption="'Evidencia · ' + criterion.nombre + ' · Foto ' + (i+1)" :state="photoState(path)" :url="urls[path]" @open="openImage" @failed="imageError" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="report-document__section" aria-labelledby="report-points-title">
          <header class="report-document__heading"><span class="report-document__number">04</span><h2 id="report-points-title">Puestos de monitoreo y capturas</h2></header>
          <p v-if="!metrics.monitoringPoints" class="report-document__empty">No se registraron puestos de monitoreo en este servicio.</p>
          <template v-for="area in report.areas" :key="area.id">
            <div v-if="area.puntos.length" class="report-area">
              <div class="report-area__head"><h3>{{ area.nombre }}</h3><span>{{ area.puntos.length }} puesto(s)</span></div>
              <div v-for="(point,index) in area.puntos" :key="index" class="report-point">
                <div class="report-point__head"><h3>Puesto {{ point.numero }}</h3><span>Estado: {{ point.estado || 'Sin revisión' }}</span></div>
                <div class="report-point__details">
                  <span><b>Trampa:</b> {{ point.tipo }}</span><span><b>Ubicación:</b> {{ point.ubicacion || '—' }}</span>
                  <span><b>Capturas:</b> {{ point.capturas.length ? point.capturas.map(c => c.plagaNombreSnapshot + ': ' + c.cantidad).join(', ') : 'Sin capturas' }}</span>
                </div>
                <p v-if="point.observaciones" class="report-point__notes">{{ point.observaciones }}</p>
                <div v-if="point.foto" class="report-photo-row report-photo-row--wide">
                  <ReportEvidence :path="point.foto" :caption="'Revisión · Puesto ' + point.numero" :state="photoState(point.foto)" :url="urls[point.foto]" @open="openImage" @failed="imageError" />
                </div>
              </div>
            </div>
          </template>
        </section>

        <section class="report-document__section" aria-labelledby="report-findings-title">
          <header class="report-document__heading"><span class="report-document__number">05</span><h2 id="report-findings-title">Hallazgos y acciones correctivas</h2></header>
          <p v-if="!findings.length" class="report-document__empty">No había hallazgos pendientes ni se registraron hallazgos nuevos o cierres en esta visita.</p>
          <template v-else>
            <p class="report-document__section-intro">{{ unresolvedFindings }} hallazgo(s) pendiente(s) al finalizar esta visita. Se incluyen los identificados en servicios anteriores aunque no hayan tenido cambios.</p>
            <article v-for="(finding,index) in findings" :key="finding.solicitudApertura + ':' + finding.area + ':' + index" class="report-finding">
              <div class="report-finding__head">
                <h3>{{ finding.area }} · Hallazgo {{ index+1 }}</h3>
                <span class="report-finding__badge" :class="{'report-finding__badge--pending': finding.anterior && finding.estado !== 'CERRADO', 'report-finding__badge--closed':finding.estado === 'CERRADO'}">
                  {{ finding.estado === 'CERRADO' ? 'Solucionado en esta visita' : finding.anterior ? 'Pendiente anterior' : 'Nuevo · Pendiente' }}
                </span>
              </div>
              <p>{{ finding.descripcion }}</p>
              <p><strong>Acción recomendada:</strong> {{ finding.recomendacion || '—' }}</p>
              <p class="report-finding__meta">Detectado el {{ bogotaDate(finding.fechaApertura) }} · {{ finding.solicitudApertura }}
                <span v-if="finding.anterior && finding.estado !== 'CERRADO'"> · Presente en {{ finding.visitasDesdeApertura }} visita(s)</span>
              </p>
              <p class="report-finding__meta">Responsable: {{ finding.responsable || 'No indicado' }}</p>
              <div v-if="finding.fotos.length" class="report-finding__evidence">
                <h4>Evidencia inicial</h4>
                <div class="report-photo-row">
                  <ReportEvidence v-for="(path,i) in finding.fotos" :key="path" :path="path" :caption="'Apertura · ' + finding.solicitudApertura + ' · Foto ' + (i+1)" :state="photoState(path)" :url="urls[path]" @open="openImage" @failed="imageError" />
                </div>
              </div>
              <div v-if="finding.seguimientos.length" class="report-finding__timeline">
                <h4>Historial de seguimiento</h4>
                <div v-for="(review,i) in finding.seguimientos" :key="review.solicitud + ':' + i" class="report-finding__review">
                  <div class="report-finding__review-head"><strong>{{ bogotaDate(review.fecha) }} · {{ review.solicitud }}</strong><span>{{ findingReviewLabel[review.resultado] }}</span></div>
                  <p v-if="review.observacion">{{ review.observacion }}</p>
                  <div v-if="review.fotos.length" class="report-photo-row">
                    <ReportEvidence v-for="(path,j) in review.fotos" :key="path" :path="path" :caption="'Seguimiento · ' + review.solicitud + ' · Foto ' + (j+1)" :state="photoState(path)" :url="urls[path]" @open="openImage" @failed="imageError" />
                  </div>
                </div>
              </div>
            </article>
          </template>
        </section>

        <section class="report-document__section" aria-labelledby="report-history-title">
          <header class="report-document__heading"><span class="report-document__number">06</span><h2 id="report-history-title">Evolución histórica de la sede</h2></header>
          <p class="report-document__section-intro">Hasta seis visitas finalizadas de esta sede, ordenadas por fecha. Pasa el mouse o toca cada punto o barra para consultar sus valores y la variación frente a la visita anterior.</p>
          <ServiceTrendCharts :visits="report.historico" />
        </section>

        <section class="report-document__section" aria-labelledby="report-signatures-title">
          <header class="report-document__heading"><span class="report-document__number">07</span><h2 id="report-signatures-title">Firmas de conformidad</h2></header>
          <p class="report-document__section-intro">Firmas originales registradas al finalizar el servicio. Se incluyen también en la impresión A4.</p>
          <div class="report-signatures">
            <div class="report-signature"><h3>Firma del técnico</h3>
              <ReportEvidence :path="report.firmaTecnico" caption="Firma del técnico" signature :state="photoState(report.firmaTecnico)" :url="urls[report.firmaTecnico]" @open="openImage" @failed="imageError" />
              <p>{{ report.tecnico }}</p><small>Técnico responsable</small>
            </div>
            <div class="report-signature"><h3>Firma del cliente</h3>
              <ReportEvidence :path="report.firmaCliente" caption="Firma de conformidad del cliente" signature :state="photoState(report.firmaCliente)" :url="urls[report.firmaCliente]" @open="openImage" @failed="imageError" />
              <p>{{ report.firmanteCliente || 'Firmante del cliente' }}</p><small>Responsable que recibió el servicio</small>
            </div>
          </div>
        </section>
        <footer class="report-document__footer">
          <span>Soluciones Radicales · Informe técnico MIP</span>
          <span>{{ report.solicitud }} · Finalizado el {{ bogotaDate(report.finReal) }} a las {{ bogotaTime(report.finReal) }}</span>
        </footer>
      </article>
    </template>
    <SendReportDialog v-if="sendOpen && !publicView && report" :service-id="report.id" :solicitud="report.solicitud" :cliente="report.cliente" :sede="report.sede" @close="sendOpen=false" @sent="onShared" />
    <EvidenceLightbox v-if="activeImage && selectedIndex !== null" :open="true" :index="selectedIndex" :total="images.length"
      :title="activeImage.caption" :caption="activeImage.caption" :url="urls[activeImage.path] || null"
      :state="activeImageState" @close="selectedIndex=null" @select="selectedIndex=$event"
      @retry="retryImage" @image-error="activeImage && imageError(activeImage.path)" />
  </div>
</template>
