<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Camera, ChevronDown, MessageSquareText } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import TechnicianEvidencePicker from './TechnicianEvidencePicker.vue'
import { formatTechnicianDateTime } from '@/helpers/technicianServices'
import { useEvidenceGallery } from '@/composables/useEvidenceGallery'
import { getTechnicianEvidenceAccess } from '@/services/servicesService'
import type { EvidenceReference } from '@/types/siteInsights'
import type { FindingReview, TechnicianFinding, TechnicianFindingCreateMutation, TechnicianFindingStatusInput, TechnicianFindingStatusMutation, TechnicianFindingVisit } from '@/types/technicianServices'

const props = defineProps<{
  finding: TechnicianFinding
  currentServiceId: string
  mutation?: TechnicianFindingCreateMutation | TechnicianFindingStatusMutation | null
  editable: boolean
  saving: boolean
  validationError?: string
  focusPending?: boolean
}>()
const emit = defineEmits<{
  status: [input: TechnicianFindingStatusInput, files: File[]]
  useRemote: []
  retry: []
}>()

const expanded = ref(Boolean(props.focusPending))
const choice = ref<FindingReview | null>(props.finding.resultadoSeguimiento ?? null)
const note = ref(props.finding.observacionSeguimiento ?? '')
const photos = ref<File[]>([])
const notesOpen = ref(Boolean(props.finding.observacionSeguimiento))
const photosOpen = ref(false)
const validation = ref('')
const gallery = useEvidenceGallery(() => props.currentServiceId, getTechnicianEvidenceAccess)
const { open, index, state, url, current, photos: galleryPhotos } = gallery
const priorFinding = computed(() => props.finding.servicioAperturaId !== props.currentServiceId)
const canFollowUp = computed(() => props.editable && priorFinding.value
  && (props.finding.estado !== 'CERRADO' || props.finding.servicioCierreId === props.currentServiceId)
  && props.mutation?.status !== 'CONFLICT')
const savedPaths = computed(() => props.finding.evidenciasSeguimientoStoragePaths ?? [])
const localCount = computed(() => props.finding.evidenciasSeguimientoLocalIds?.length ?? 0)
const totalPhotos = computed(() => savedPaths.value.length + localCount.value + photos.value.length)
const changed = computed(() => Boolean(choice.value && (choice.value !== props.finding.resultadoSeguimiento
  || note.value.trim() !== (props.finding.observacionSeguimiento ?? '')
  || photos.value.length)))
const stateTone = computed(() => props.finding.estado === 'CERRADO' ? 'success' : props.finding.estado === 'EN_PROCESO' ? 'info' : 'warning')
const stateLabel = computed(() => props.finding.estado === 'EN_PROCESO' ? 'En proceso' : props.finding.estado === 'CERRADO' ? 'Cerrado' : 'Abierto')
const openingCount = computed(() => props.finding.evidenciasAperturaStoragePaths.length + (props.finding.evidenciasAperturaLocalIds?.length ?? 0))
const history = computed(() => props.finding.historialSeguimientos ?? [])

watch(() => props.focusPending, value => { if (value) expanded.value = true })
watch(() => props.finding.resultadoSeguimiento, value => { choice.value = value ?? null })
watch(() => props.finding.observacionSeguimiento, value => { if (!props.saving) note.value = value ?? '' })
watch(() => props.finding.version, () => { photos.value = []; validation.value = '' })
watch(() => props.finding.evidenciasSeguimientoLocalIds?.join('|'), value => {
  if (value) photos.value = []
})

function references(kind: 'OPENING' | 'CLOSURE', count: number, date: string): EvidenceReference[] {
  return Array.from({ length: count }, (_, index) => ({
    kind, recordId: props.finding.id, index, label: kind === 'OPENING' ? 'Fotos de apertura' : 'Fotos de cierre', date,
  }))
}
const opening = computed(() => references('OPENING',props.finding.evidenciasAperturaStoragePaths.length,props.finding.fechaApertura))
const closing = computed(() => references('CLOSURE',props.finding.evidenciasCierreStoragePaths.length,props.finding.fechaCierre ?? props.finding.fechaApertura))
function visitPhotos(visit: TechnicianFindingVisit): EvidenceReference[] {
  return visit.evidenciasStoragePaths.map((_, index) => ({
    kind: 'FOLLOWUP', recordId: visit.id, index, label: `Revisión · ${visit.solicitud}`, date: visit.fecha,
  }))
}
function showPhotos(collection: EvidenceReference[]): void {
  if (collection.length) gallery.show(collection)
}
function submit(): void {
  validation.value = ''
  if (!choice.value) { validation.value = 'Selecciona el resultado de la revisión.'; return }
  if (choice.value === 'CERRADO' && totalPhotos.value === 0) {
    photosOpen.value = true
    validation.value = 'Para cerrar el hallazgo debes adjuntar una fotografía.'
    return
  }
  emit('status', { estado: choice.value, observacionCierre: note.value.trim() }, photos.value)
}
function reviewLabel(value: FindingReview): string {
  return value === 'SIN_CAMBIOS' ? 'Sigue igual' : value === 'EN_PROCESO' ? 'En proceso' : 'Cerrado'
}
</script>

<template>
  <article class="finding-card" :class="{ 'finding-card--invalid': validationError }">
    <button class="finding-card__summary" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span><strong>{{ finding.descripcion }}</strong><small>{{ priorFinding ? `Abierto ${formatTechnicianDateTime(finding.fechaApertura)}` : 'Abierto en este servicio' }}</small></span>
      <StatusBadge :tone="stateTone">{{ stateLabel }}</StatusBadge>
      <ChevronDown :size="18" aria-hidden="true" :class="{ 'finding-card__chevron--open': expanded }" />
    </button>
    <div v-if="expanded" class="finding-card__detail">
      <dl>
        <div><dt>Recomendación o acción</dt><dd>{{ finding.recomendacionAccion }}</dd></div>
        <div><dt>Responsable</dt><dd>{{ finding.responsableNombre }}<small v-if="finding.responsableCorreo">{{ finding.responsableCorreo }}</small></dd></div>
      </dl>
      <div class="finding-card__media">
        <BaseButton v-if="finding.evidenciasAperturaStoragePaths.length" size="compact" variant="ghost" @click="showPhotos(opening)"><Camera :size="16" />Apertura · {{ openingCount }} fotos</BaseButton>
        <span v-else>{{ openingCount ? `${openingCount} fotos de apertura pendientes de sincronizar` : 'Sin fotos disponibles' }}</span>
        <BaseButton v-if="finding.estado === 'CERRADO' && finding.evidenciasCierreStoragePaths.length" size="compact" variant="ghost" @click="showPhotos(closing)">Fotos del cierre</BaseButton>
      </div>

      <p v-if="mutation && mutation.status !== 'CONFLICT'" class="finding-card__pending">{{ mutation.status === 'SENDING' ? 'Sincronizando revisión…' : 'Revisión guardada en este celular' }}</p>
      <div v-if="mutation?.status === 'CONFLICT'" class="finding-card__conflict" role="alert">
        <p>{{ mutation.error ?? 'Este hallazgo cambió. Elige cuál versión conservar.' }}</p>
        <div><BaseButton size="compact" variant="secondary" :disabled="saving" @click="emit('useRemote')">Usar versión sincronizada</BaseButton><BaseButton size="compact" :loading="saving" @click="emit('retry')">Reintentar</BaseButton></div>
      </div>
      <p v-if="validationError" class="finding-card__validation" role="alert">{{ validationError }}</p>

      <p v-if="finding.resultadoSeguimiento && canFollowUp" class="finding-card__reviewed">Revisado en esta visita · {{ reviewLabel(finding.resultadoSeguimiento) }}</p>
      <section v-if="canFollowUp" class="finding-review" aria-label="Evaluación de esta visita">
        <div class="finding-review__title"><strong>Evaluación de esta visita</strong><small v-if="finding.resultadoSeguimiento">Guardada · puedes modificarla</small></div>
        <div class="finding-review__choices" role="group" aria-label="Resultado del hallazgo">
          <button v-for="option in ([['SIN_CAMBIOS','Sigue igual'],['EN_PROCESO','En proceso'],['CERRADO','Cerrado']] as const)"
            :key="option[0]" type="button" :aria-pressed="choice === option[0]" :disabled="saving"
            @click="choice = option[0]; validation = ''">{{ option[1] }}</button>
        </div>
        <p v-if="choice && !note.trim() && totalPhotos === 0" class="finding-review__hint"><AlertTriangle :size="16" aria-hidden="true" />{{ choice === 'CERRADO' ? 'Para cerrar debes adjuntar una foto.' : 'Recomendado: añade foto u observación (opcional).' }}</p>
        <div class="finding-review__extras">
          <BaseButton size="compact" variant="ghost" @click="notesOpen = !notesOpen"><MessageSquareText :size="16" />Observación<span v-if="note.trim()"> ✓</span></BaseButton>
          <BaseButton size="compact" variant="ghost" @click="photosOpen = !photosOpen"><Camera :size="16" />Fotos · {{ totalPhotos }}/10</BaseButton>
        </div>
        <BaseTextarea v-if="notesOpen" v-model="note" :name="`finding-review-note-${finding.id}`" label="Observación de la visita" :rows="2" maxlength="2000" :disabled="saving" />
        <TechnicianEvidencePicker v-if="photosOpen" v-model="photos" :name="`finding-review-photos-${finding.id}`" label="Agregar fotografías de la visita" :max="Math.max(0,10 - savedPaths.length - localCount)" :disabled="saving" />
        <p v-if="validation" class="finding-card__validation" role="alert">{{ validation }}</p>
        <BaseButton size="compact" :disabled="!changed || saving" :loading="saving" @click="submit">{{ finding.resultadoSeguimiento ? 'Actualizar revisión' : 'Guardar revisión' }}</BaseButton>
      </section>
      <p v-else-if="finding.resultadoSeguimiento" class="finding-card__reviewed">Revisado en esta visita · {{ reviewLabel(finding.resultadoSeguimiento) }}</p>
      <details v-if="history.length" class="finding-history">
        <summary>Historial de revisiones ({{ history.length }})</summary>
        <div v-for="visit in history" :key="visit.id" class="finding-history__row">
          <div><strong>{{ reviewLabel(visit.resultado) }}</strong><small>{{ visit.solicitud }} · {{ formatTechnicianDateTime(visit.fecha) }}</small></div>
          <p v-if="visit.observacion">{{ visit.observacion }}</p>
          <BaseButton v-if="visit.evidenciasStoragePaths.length" variant="ghost" size="compact" @click="showPhotos(visitPhotos(visit))"><Camera :size="16" />Ver fotos ({{ visit.evidenciasStoragePaths.length }})</BaseButton>
          <small v-else>Sin fotos disponibles</small>
        </div>
      </details>
    </div>
    <EvidenceLightbox unavailable-message="Sin fotos disponibles" :open="open" :index="index" :total="galleryPhotos.length"
      :state="state" :url="url" :title="current?.label ?? 'Fotos del hallazgo'"
      :caption="current ? formatTechnicianDateTime(current.date) : ''"
      @close="gallery.close" @select="gallery.select" @retry="gallery.retry" @image-error="gallery.imageFailed" />
  </article>
</template>

<style scoped>
.finding-card { overflow:hidden; border:1px solid var(--border); border-radius:var(--radius); }
.finding-card--invalid { border-color:var(--danger); }
.finding-card__summary { display:grid; width:100%; min-height:52px; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:.5rem; border:0; background:var(--surface); padding:.65rem .75rem; text-align:left; color:var(--text); cursor:pointer; }
.finding-card__summary span { display:grid; min-width:0; gap:.15rem; overflow-wrap:anywhere; }
.finding-card__summary strong { font-size:.87rem; }
.finding-card__summary small, dl small { color:var(--text-secondary); font-size:.74rem; }
.finding-card__chevron--open { transform:rotate(180deg); }
.finding-card__detail { display:grid; gap:.65rem; border-top:1px solid var(--border); background:var(--surface-raised); padding:.7rem; }
dl { display:grid; gap:.55rem; margin:0; }
dt { margin-bottom:.15rem; color:var(--text-secondary); font-size:.76rem; }
dd { display:grid; gap:.15rem; margin:0; font-size:.84rem; overflow-wrap:anywhere; }
.finding-card__media,.finding-review__extras { display:flex; align-items:center; flex-wrap:wrap; gap:.25rem; }
.finding-card__media>span { color:var(--text-secondary); font-size:.76rem; }
.finding-card__validation { margin:0; color:var(--danger); font-size:.77rem; }
.finding-card__reviewed { margin:0; font-size:.78rem; color:var(--success); }
.finding-card__pending { margin:0; font-size:.76rem; color:var(--info); }
.finding-card__conflict { display:grid; gap:.5rem; padding:.65rem; border-radius:var(--radius); background:var(--warning-subtle); color:var(--warning); }
.finding-card__conflict p { margin:0; font-size:.78rem; }
.finding-card__conflict>div { display:flex; flex-wrap:wrap; gap:.35rem; }
.finding-review { display:grid; gap:.5rem; border-top:1px solid var(--border); padding-top:.6rem; }
.finding-review__title { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.3rem; }
.finding-review__title strong { font-size:.84rem; }
.finding-review__title small { color:var(--text-secondary); font-size:.72rem; }
.finding-review__choices { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.35rem; }
.finding-review__choices button { min-width:0; min-height:44px; border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface); padding:.35rem .2rem; color:var(--text); font-size:.78rem; font-weight:600; cursor:pointer; }
.finding-review__choices button[aria-pressed='true'] { border-color:var(--accent); background:var(--accent-subtle); color:var(--accent); }
.finding-review__hint { display:flex; align-items:center; gap:.45rem; margin:0; border-radius:var(--radius-sm); background:var(--warning-subtle); padding:.42rem .55rem; color:var(--warning); font-size:.75rem; line-height:1.3; }
.finding-review__hint svg { flex-shrink:0; }
.finding-history { border-top:1px solid var(--border); padding-top:.5rem; font-size:.8rem; }
.finding-history summary { padding:.25rem 0; color:var(--text-secondary); cursor:pointer; }
.finding-history__row { display:grid; gap:.28rem; border-top:1px solid var(--border); padding:.6rem 0; }
.finding-history__row>div { display:flex; flex-wrap:wrap; align-items:center; gap:.35rem; }
.finding-history__row small { color:var(--text-secondary); font-size:.73rem; }
.finding-history__row p { margin:0; font-size:.77rem; }
.finding-history__row>.base-button { justify-self:start; }
@media(max-width:520px) {
  .finding-card__summary { grid-template-columns:minmax(0,1fr) auto; }
  .finding-card__summary :deep(.status-badge) { grid-column:1; justify-self:start; }
  .finding-card__summary > svg { grid-column:2; grid-row:1; }
}
</style>
