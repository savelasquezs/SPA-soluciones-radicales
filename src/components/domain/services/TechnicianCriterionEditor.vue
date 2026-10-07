<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Camera, MessageSquareText, X } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import type { MipEvaluation, TechnicianCriterion, TechnicianCriterionEvaluationMutation } from '@/types/technicianServices'

const props = defineProps<{
  criterion: TechnicianCriterion
  mutation: TechnicianCriterionEvaluationMutation | null
  editable: boolean
  syncing: boolean
}>()
const emit = defineEmits<{
  save: [evaluation: MipEvaluation, observation: string, files: File[], retainedEvidenceStoragePaths: string[]]
  draft: [evaluation: MipEvaluation | null, observation: string]
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
const draftObservation = ref(props.criterion.observacion ?? '')
const observationOpen = ref(Boolean(props.criterion.observacion))
const photosOpen = ref(false)
const photos = ref<File[]>([])
const retainedEvidenceStoragePaths = ref([...props.criterion.evidenciasStoragePaths])
const evidenceCount = computed(() => retainedEvidenceStoragePaths.value.length + (props.criterion.evidenciasLocalIds?.length ?? 0) + photos.value.length)

watch(() => props.criterion, criterion => {
  draftEvaluation.value = criterion.evaluacion
  draftObservation.value = criterion.observacion ?? ''
  retainedEvidenceStoragePaths.value = [...criterion.evidenciasStoragePaths]
  photos.value = []
})

function choose(value: MipEvaluation): void {
  if (!props.editable || props.syncing || props.mutation?.status === 'CONFLICT') return
  draftEvaluation.value = value
  emit('draft', value, draftObservation.value)
  emit('save', value, draftObservation.value, photos.value, retainedEvidenceStoragePaths.value)
  photos.value = []
}

function updateObservation(value: string): void {
  draftObservation.value = value
  emit('draft', draftEvaluation.value, value)
}

function saveObservation(): void {
  if (!props.editable || props.syncing || props.mutation?.status === 'CONFLICT' || !draftEvaluation.value) return
  if (draftObservation.value.trim() === (props.criterion.observacion ?? '')) return
  emit('save', draftEvaluation.value, draftObservation.value, photos.value, retainedEvidenceStoragePaths.value)
  photos.value = []
}

function updatePhotos(value: File[]): void {
  photos.value = value
  if (draftEvaluation.value) {
    emit('save', draftEvaluation.value, draftObservation.value, photos.value, retainedEvidenceStoragePaths.value)
    photos.value = []
  }
}

function removeStoredPhoto(index: number): void {
  retainedEvidenceStoragePaths.value = retainedEvidenceStoragePaths.value.filter((_, current) => current !== index)
  if (draftEvaluation.value) emit('save', draftEvaluation.value, draftObservation.value, [], retainedEvidenceStoragePaths.value)
}
</script>

<template>
  <article class="criterion-card">
    <header><h3>{{ criterion.nombre }}</h3><StatusBadge v-if="mutation?.status === 'CONFLICT'" tone="warning">Conflicto</StatusBadge><StatusBadge v-else-if="mutation" tone="warning">{{ mutation.status === 'SENDING' ? 'Sincronizando' : 'Guardado local' }}</StatusBadge><span v-else-if="criterion.evaluacion" class="criterion-saved" role="status" aria-label="Guardado"><Check :size="19" aria-hidden="true" /></span><StatusBadge v-else tone="neutral">Pendiente</StatusBadge></header>
    <div class="criterion-options" role="group" :aria-label="`Evaluación de ${criterion.nombre}`">
      <button v-for="option in options" :key="option.value" type="button" :aria-label="option.label" :title="option.label" :aria-pressed="draftEvaluation === option.value" :disabled="!editable || syncing || mutation?.status === 'CONFLICT'" @click="choose(option.value)"><strong>{{ option.short }}</strong></button>
    </div>
    <div class="criterion-tools">
      <BaseButton size="compact" variant="ghost" :aria-expanded="observationOpen" @click="observationOpen = !observationOpen"><MessageSquareText :size="17" aria-hidden="true" />Observación<span v-if="draftObservation.trim()"> · ✓</span></BaseButton>
      <BaseButton size="compact" variant="ghost" :aria-expanded="photosOpen" @click="photosOpen = !photosOpen"><Camera :size="17" aria-hidden="true" />Fotos · {{ evidenceCount }}/5</BaseButton>
    </div>
    <BaseTextarea v-if="observationOpen" :model-value="draftObservation" :name="`criterion-observation-${criterion.id}`" label="Observación" :rows="2" :disabled="!editable || syncing || mutation?.status === 'CONFLICT'" @update:model-value="updateObservation" @blur="saveObservation" />
    <TechnicianEvidencePicker v-if="photosOpen" :model-value="photos" :name="`criterion-evidence-${criterion.id}`" label="Fotos del criterio" :max="Math.max(0, 5 - retainedEvidenceStoragePaths.length - (criterion.evidenciasLocalIds?.length ?? 0))" :disabled="!editable || syncing || mutation?.status === 'CONFLICT'" @update:model-value="updatePhotos" />
    <ul v-if="photosOpen && retainedEvidenceStoragePaths.length" class="criterion-stored-photos">
      <li v-for="(_, index) in retainedEvidenceStoragePaths" :key="retainedEvidenceStoragePaths[index]"><span>Foto guardada {{ index + 1 }}</span><BaseIconButton label="Quitar foto guardada" size="small" :disabled="!editable || syncing" @click="removeStoredPhoto(index)"><X :size="17" /></BaseIconButton></li>
    </ul>
    <div v-if="mutation?.status === 'CONFLICT'" class="criterion-conflict">
      <p>{{ mutation.error ?? 'La respuesta cambió. Elige cuál versión conservar.' }}</p>
      <div v-if="mutation.conflict" class="criterion-actions"><BaseButton variant="secondary" :disabled="syncing" @click="emit('useRemote')">Usar respuesta sincronizada</BaseButton><BaseButton :loading="syncing" @click="emit('retry')">Reintentar mi respuesta</BaseButton></div>
    </div>
  </article>
</template>

<style scoped>
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
