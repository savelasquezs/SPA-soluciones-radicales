<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import { useTechnicianFindingDraft } from '@/composables/useTechnicianFindingDraft'
import type { TechnicianCriterion, TechnicianFindingCreateInput } from '@/types/technicianServices'

const props = defineProps<{ saving: boolean; criterion?: TechnicianCriterion | null; actorId?: string; serviceId?: string; areaId?: string; draftId?: string }>()
const emit = defineEmits<{ save: [input: TechnicianFindingCreateInput, files: File[], done: (saved: boolean) => Promise<void>]; cancel: [] }>()
const { draft, ready, failure, clear } = useTechnicianFindingDraft(() => ({ actorId: props.actorId,
  serviceId: props.serviceId, areaId: props.areaId, itemId: props.draftId ?? props.criterion?.id ?? props.areaId ?? '' }),
  { description: props.criterion?.observacion ?? '' })
const descripcion = computed({ get: () => draft.value.description, set: value => { draft.value.description = value } })
const recomendacionAccion = computed({ get: () => draft.value.recommendation, set: value => { draft.value.recommendation = value } })
const evidences = computed({ get: () => draft.value.photos, set: value => { draft.value.photos = value } })
const sharedCount = computed(() => props.criterion ? props.criterion.evidenciasStoragePaths.length + (props.criterion.evidenciasLocalIds?.length ?? 0) : 0)
watch(() => props.criterion?.observacion, note => { if (!descripcion.value) descripcion.value = note ?? '' })
const submitting = ref(false)
const errors = ref<Partial<Record<keyof TechnicianFindingCreateInput, string>>>({})

function submit(): void {
  if (props.saving || submitting.value || !ready.value) return
  const input = {
    ...(props.criterion ? { criterionId: props.criterion.id, useCriterionEvidence: draft.value.useEvidence } : {}),
    descripcion: descripcion.value.trim(),
    recomendacionAccion: recomendacionAccion.value.trim(),
  }
  errors.value = {
    ...(!input.descripcion ? { descripcion: 'Describe el Hallazgo.' } : {}),
    ...(!input.recomendacionAccion ? { recomendacionAccion: 'Indica la recomendación o acción correctiva.' } : {}),
  }
  if (Object.keys(errors.value).length) return
  submitting.value = true
  emit('save', input, evidences.value, async saved => { try { if (saved) await clear() } finally { submitting.value = false } })
}
</script>

<template>
  <form class="finding-create" :aria-busy="saving || submitting || !ready" @submit.prevent="submit">
    <div><h3>Nuevo hallazgo</h3><p>{{ criterion ? criterion.nombre : 'Seguimiento del Área' }}</p></div>
    <BaseTextarea v-model="descripcion" :name="`finding-description-${criterion?.id ?? areaId}`" label="Descripción" required :rows="2" maxlength="2000" :disabled="saving || submitting || !ready" :error="errors.descripcion" />
    <BaseTextarea v-model="recomendacionAccion" :name="`finding-action-${criterion?.id ?? areaId}`" label="Recomendación o acción correctiva" required :rows="2" maxlength="2000" :disabled="saving || submitting || !ready" :error="errors.recomendacionAccion" />
    <label v-if="sharedCount" class="finding-create__shared"><input v-model="draft.useEvidence" type="checkbox" :disabled="saving || submitting || !ready" />Usar las fotos de este criterio ({{ sharedCount }})</label>
    <details><summary>{{ sharedCount ? 'Agregar otras fotografías' : 'Agregar fotografías' }}</summary>
      <TechnicianEvidencePicker v-model="evidences" :name="`finding-opening-evidence-${criterion?.id ?? areaId}`" label="Fotos del hallazgo" :max="10 - (draft.useEvidence ? sharedCount : 0)" :disabled="saving || submitting || !ready" />
    </details>
    <p v-if="failure" role="alert">{{ failure }}</p>
    <div class="finding-create__actions">
      <BaseButton type="submit" :loading="saving || submitting" :disabled="!ready || Boolean(failure)">Registrar hallazgo</BaseButton>
      <BaseButton variant="secondary" :disabled="saving || submitting || !ready" @click="clear().then(() => emit('cancel'))">Cancelar</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.finding-create { display:grid; gap:0.85rem; border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface-raised); padding:0.85rem; }
.finding-create h3, .finding-create p { margin:0; }
.finding-create h3 { font-size:0.95rem; }
.finding-create > div:first-child p { margin-top:0.2rem; color:var(--text-secondary); font-size:0.8125rem; }
.finding-create__shared { display:flex; align-items:center; gap:.5rem; min-height:44px; font-size:.82rem; }
.finding-create__shared input { width:18px; height:18px; accent-color:var(--accent); }
.finding-create summary { min-height:44px; align-content:center; cursor:pointer; font-size:.82rem; }
.finding-create__actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (max-width:520px) { .finding-create__actions { display:grid; grid-template-columns:1fr; } }
</style>
