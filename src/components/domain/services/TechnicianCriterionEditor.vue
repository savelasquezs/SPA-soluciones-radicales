<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Camera, MessageSquareText, X } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
import { useTechnicianEvidenceGallery } from '@/composables/useTechnicianEvidenceGallery'
import type { EvidenceReference } from '@/types/siteInsights'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import type { MipEvaluation, TechnicianCriterion, TechnicianCriterionEvaluationMutation } from '@/types/technicianServices'

const props = defineProps<{
  actorId?: string
  draftFiles?: File[]
  serviceId?: string
  protectedPaths?: string[]
  criterion: TechnicianCriterion
  mutation: TechnicianCriterionEvaluationMutation | null
  editable: boolean
  syncing: boolean
  draftText?: string
  validationError?: string
}>()
const emit = defineEmits<{
  save: [evaluation: MipEvaluation, observation: string, files: File[], retainedEvidenceStoragePaths: string[], done: (saved: boolean) => void]
  draft: [evaluation: MipEvaluation | null, observation: string, files: File[]]
  retry: []
  useRemote: []
}>()
const options: Array<{ value: MipEvaluation; short: string; label: string }> = [
  { value: 'C', short: 'C', label: 'Cumple' },
  { value: 'CP', short: 'CP', label: 'Cumple parcialmente' },
  { value: 'NC', short: 'NC', label: 'No cumple' },
  { value: 'NA', short: 'NA', label: 'No aplica' },
]
const draftEvaluation = ref<MipEvaluation | null>(props.criterion.evaluacion)
const draftObservation = ref(props.draftText ?? props.criterion.observacion ?? '')
const observationOpen = ref(Boolean(props.criterion.observacion || props.draftText))
const photosOpen = ref(false)
const photos = ref<File[]>(props.draftFiles ?? [])
const pendingSave = ref(false)
const busy = computed(() => props.syncing || pendingSave.value)
const retainedEvidenceStoragePaths = ref([...props.criterion.evidenciasStoragePaths])
const evidenceCount = computed(() => retainedEvidenceStoragePaths.value.length + (props.criterion.evidenciasLocalIds?.length ?? 0) + photos.value.length)

watch(() => props.criterion, (criterion, previous) => {
  draftEvaluation.value = criterion.evaluacion
  if (criterion.id !== previous.id || draftObservation.value === (previous.observacion ?? '') || draftObservation.value === (criterion.observacion ?? '')) {
    draftObservation.value = props.draftText ?? criterion.observacion ?? ''
  }
  retainedEvidenceStoragePaths.value = [...criterion.evidenciasStoragePaths]
  if (criterion.id !== previous.id || (pendingSave.value && criterion.evidenciasLocalIds?.some(id => !previous.evidenciasLocalIds?.includes(id)))) photos.value = []
})

function save(evaluation: MipEvaluation, observation: string, files: File[], paths: string[]): void {
  if (busy.value) return
  pendingSave.value = true
  emit('save', evaluation, observation, files, paths, saved => {
    pendingSave.value = false
    if (saved) photos.value = photos.value.filter(file => !files.includes(file))
  })
}

watch(() => props.draftText, text => {
  if (text !== undefined && !draftEvaluation.value) {
    draftObservation.value = text
    if (text.trim()) observationOpen.value = true
  }
})

function choose(value: MipEvaluation): void {
  if (!props.editable || busy.value || props.mutation?.status === 'CONFLICT' || value === draftEvaluation.value) return
  draftEvaluation.value = value
  if (value === 'CP' || value === 'NC') observationOpen.value = true
  emit('draft', value, draftObservation.value, photos.value)
  save(value, draftObservation.value, photos.value, retainedEvidenceStoragePaths.value)
}

function updateObservation(value: string): void {
  draftObservation.value = value
  emit('draft', draftEvaluation.value, value, photos.value)
}

function saveObservation(): void {
  if (!props.editable || busy.value || props.mutation?.status === 'CONFLICT' || !draftEvaluation.value) return
  if (draftObservation.value.trim() === (props.criterion.observacion ?? '') && !photos.value.length) return
  save(draftEvaluation.value, draftObservation.value, photos.value, retainedEvidenceStoragePaths.value)
}

function updatePhotos(value: File[]): void {
  photos.value = value
  emit('draft', draftEvaluation.value, draftObservation.value, value)
  if (draftEvaluation.value) {
    save(draftEvaluation.value, draftObservation.value, photos.value, retainedEvidenceStoragePaths.value)
  }
}

watch(() => props.draftFiles, files => { if (!draftEvaluation.value && files) photos.value = files })
const gallery = useTechnicianEvidenceGallery(() => props.serviceId ?? '', () => props.actorId)
const { open, index: photoIndex, state, url, photos: galleryPhotos } = gallery
function showStoredPhoto(index: number, local = false): void {
  const references: EvidenceReference[] = props.criterion.evidenciasStoragePaths.map((_, position) => ({
    kind: 'CRITERION', recordId: props.criterion.id, index: position, label: props.criterion.nombre, date: '',
  }))
  references.push(...(props.criterion.evidenciasLocalIds ?? []).map(id => ({ kind: 'CRITERION' as const, recordId: 'local:' + id, index: 0, label: props.criterion.nombre, date: '' })))
  gallery.show(references, local ? props.criterion.evidenciasStoragePaths.length + index : props.criterion.evidenciasStoragePaths.indexOf(retainedEvidenceStoragePaths.value[index]!))
}

function removeStoredPhoto(index: number): void {
  if (busy.value || props.protectedPaths?.includes(retainedEvidenceStoragePaths.value[index]!)) return
  retainedEvidenceStoragePaths.value = retainedEvidenceStoragePaths.value.filter((_, current) => current !== index)
  if (draftEvaluation.value) save(draftEvaluation.value, draftObservation.value, [], retainedEvidenceStoragePaths.value)
}
</script>

<template>
  <article class="criterion-card" :class="{ 'criterion-card--invalid': validationError }">
    <header><h3>{{ criterion.nombre }}</h3><StatusBadge v-if="mutation?.status === 'CONFLICT'" tone="warning">Conflicto</StatusBadge><StatusBadge v-else-if="mutation" tone="warning">{{ mutation.status === 'SENDING' ? 'Sincronizando' : 'Guardado local' }}</StatusBadge><span v-else-if="criterion.evaluacion" class="criterion-saved" role="status" aria-label="Guardado"><Check :size="19" aria-hidden="true" /></span><StatusBadge v-else tone="neutral">Pendiente</StatusBadge></header>
    <div class="criterion-options" role="group" :aria-label="`Evaluación de ${criterion.nombre}`">
      <button v-for="option in options" :key="option.value" type="button" :aria-label="option.label" :title="option.label" :aria-pressed="draftEvaluation === option.value" :disabled="!editable || busy || mutation?.status === 'CONFLICT'" @click="choose(option.value)"><strong>{{ option.short }}</strong></button>
    </div>
    <p v-if="(draftEvaluation === 'CP' || draftEvaluation === 'NC') && !draftObservation.trim() && !evidenceCount" class="criterion-hint">Se recomienda agregar una observación o foto (opcional).</p>
    <p v-if="validationError" class="criterion-validation" role="alert">{{ validationError }}</p>
    <div class="criterion-tools">
      <BaseButton size="compact" variant="ghost" :aria-expanded="observationOpen" @click="observationOpen = !observationOpen"><MessageSquareText :size="17" aria-hidden="true" />Observación<span v-if="draftObservation.trim()"> · ✓</span></BaseButton>
      <BaseButton size="compact" variant="ghost" :aria-expanded="photosOpen" @click="photosOpen = !photosOpen"><Camera :size="17" aria-hidden="true" />Fotos · {{ evidenceCount }}/5</BaseButton>
    </div>
    <BaseTextarea v-if="observationOpen" :model-value="draftObservation" :name="`criterion-observation-${criterion.id}`" label="Observación" :rows="2" maxlength="2000" :disabled="!editable || busy || mutation?.status === 'CONFLICT'" @update:model-value="updateObservation" @blur="saveObservation" />
    <TechnicianEvidencePicker v-if="photosOpen" :model-value="photos" :name="`criterion-evidence-${criterion.id}`" label="Fotos del criterio" :max="Math.max(0, 5 - retainedEvidenceStoragePaths.length - (criterion.evidenciasLocalIds?.length ?? 0))" :disabled="!editable || busy || mutation?.status === 'CONFLICT'" @update:model-value="updatePhotos" />
    <BaseButton v-if="photos.length && draftEvaluation && !busy" size="compact" variant="secondary" :disabled="!editable || mutation?.status === 'CONFLICT'" @click="saveObservation">Guardar fotos pendientes</BaseButton>
    <ul v-if="photosOpen && retainedEvidenceStoragePaths.length" class="criterion-stored-photos">
      <li v-for="(_, index) in retainedEvidenceStoragePaths" :key="retainedEvidenceStoragePaths[index]"><BaseButton size="compact" variant="ghost" @click="showStoredPhoto(index)">Ver foto {{ index + 1 }}</BaseButton><small v-if="protectedPaths?.includes(retainedEvidenceStoragePaths[index]!)">En un hallazgo</small><BaseIconButton label="Quitar foto guardada" size="small" :disabled="!editable || syncing || protectedPaths?.includes(retainedEvidenceStoragePaths[index]!)" @click="removeStoredPhoto(index)"><X :size="17" /></BaseIconButton></li>
    </ul>
    <div v-if="photosOpen && criterion.evidenciasLocalIds?.length" class="criterion-tools"><BaseButton v-for="(id, position) in criterion.evidenciasLocalIds" :key="id" size="compact" variant="ghost" @click="showStoredPhoto(position, true)">Ver foto local {{ position + 1 }}</BaseButton></div>
    <slot />
    <EvidenceLightbox :open="open" :index="photoIndex" :total="galleryPhotos.length" :state="state" :url="url" :title="criterion.nombre" caption="Evidencia del criterio" @close="gallery.close" @select="gallery.select" @retry="gallery.retry" @image-error="gallery.imageFailed" />
    <div v-if="mutation?.status === 'CONFLICT'" class="criterion-conflict">
      <p>{{ mutation.error ?? 'La respuesta cambió. Elige cuál versión conservar.' }}</p>
      <div v-if="mutation.conflict" class="criterion-actions"><BaseButton variant="secondary" :disabled="syncing" @click="emit('useRemote')">Usar respuesta sincronizada</BaseButton><BaseButton :loading="syncing" @click="emit('retry')">Reintentar mi respuesta</BaseButton></div>
    </div>
  </article>
</template>

<style scoped>
 .criterion-card--invalid { border-color:var(--danger); }
.criterion-validation { margin:0; color:var(--danger); font-size:0.78rem; }
.criterion-hint { margin:0; font-size:0.77rem; color:var(--text-secondary); }
.criterion-card { display:grid; gap:0.65rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.7rem; }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
h3, p { margin:0; }
h3 { font-size:0.95rem; overflow-wrap:anywhere; }
.criterion-options { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0.4rem; }
.criterion-options button { display:grid; min-height:44px; min-width:0; place-content:center; border:1px solid var(--border-strong); border-radius:var(--radius-sm); background:var(--surface); color:var(--text); cursor:pointer; }
.criterion-options button[aria-pressed='true'] { border-color:var(--accent); background:var(--accent-subtle); }
.criterion-options button:disabled { cursor:not-allowed; opacity:0.65; }
.criterion-saved { display:grid; width:28px; height:28px; place-items:center; color:var(--success); }
.criterion-tools { display:flex; flex-wrap:wrap; gap:0.35rem; }
.criterion-stored-photos { display:grid; gap:0.35rem; margin:0; padding:0; list-style:none; }
.criterion-stored-photos li { display:flex; min-height:44px; align-items:center; justify-content:space-between; gap:0.5rem; border-radius:var(--radius-sm); background:var(--surface-raised); padding:0.25rem 0.35rem 0.25rem 0.65rem; font-size:0.8125rem; }
.criterion-conflict { display:grid; gap:0.65rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.criterion-actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (max-width:520px) { .criterion-actions { display:grid; grid-template-columns:1fr; } }
</style>
