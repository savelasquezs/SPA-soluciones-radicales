<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import type { MipEvaluation, TechnicianCriterion, TechnicianCriterionEvaluationMutation } from '@/types/technicianServices'

const props = defineProps<{
  criterion: TechnicianCriterion
  mutation: TechnicianCriterionEvaluationMutation | null
  editable: boolean
  syncing: boolean
}>()
const emit = defineEmits<{
  save: [evaluation: MipEvaluation, observation: string]
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

watch(() => props.criterion, criterion => {
  draftEvaluation.value = criterion.evaluacion
  draftObservation.value = criterion.observacion ?? ''
})

function choose(value: MipEvaluation): void {
  if (!props.editable || props.syncing || props.mutation?.status === 'CONFLICT') return
  draftEvaluation.value = value
  emit('draft', value, draftObservation.value)
  emit('save', value, draftObservation.value)
}

function updateObservation(value: string): void {
  draftObservation.value = value
  emit('draft', draftEvaluation.value, value)
}

function saveObservation(): void {
  if (!props.editable || props.syncing || props.mutation?.status === 'CONFLICT' || !draftEvaluation.value) return
  if (draftObservation.value.trim() === (props.criterion.observacion ?? '')) return
  emit('save', draftEvaluation.value, draftObservation.value)
}
</script>

<template>
  <article class="criterion-card">
    <header><h3>{{ criterion.nombre }}</h3><StatusBadge v-if="mutation?.status === 'CONFLICT'" tone="warning">Conflicto</StatusBadge><StatusBadge v-else-if="mutation" tone="warning">{{ mutation.status === 'SENDING' ? 'Sincronizando' : 'Guardado local' }}</StatusBadge><StatusBadge v-else :tone="criterion.evaluacion ? 'success' : 'neutral'">{{ criterion.evaluacion ? 'Guardado' : 'Pendiente' }}</StatusBadge></header>
    <div class="criterion-options" role="group" :aria-label="`Evaluación de ${criterion.nombre}`">
      <button v-for="option in options" :key="option.value" type="button" :aria-pressed="draftEvaluation === option.value" :disabled="!editable || syncing || mutation?.status === 'CONFLICT'" @click="choose(option.value)"><strong>{{ option.short }}</strong><span>{{ option.label }}</span></button>
    </div>
    <BaseTextarea :model-value="draftObservation" :name="`criterion-observation-${criterion.id}`" :label="`Observación · ${criterion.nombre}`" :rows="2" :disabled="!editable || syncing || mutation?.status === 'CONFLICT'" hint="Opcional. Se guarda al salir del campo." @update:model-value="updateObservation" @blur="saveObservation" />
    <div v-if="mutation?.status === 'CONFLICT'" class="criterion-conflict">
      <p>{{ mutation.error ?? 'La respuesta cambió. Elige cuál versión conservar.' }}</p>
      <div v-if="mutation.conflict" class="criterion-actions"><BaseButton variant="secondary" :disabled="syncing" @click="emit('useRemote')">Usar respuesta sincronizada</BaseButton><BaseButton :loading="syncing" @click="emit('retry')">Reintentar mi respuesta</BaseButton></div>
    </div>
  </article>
</template>

<style scoped>
.criterion-card { display:grid; gap:0.85rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.85rem; }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
h3, p { margin:0; }
h3 { font-size:0.95rem; overflow-wrap:anywhere; }
.criterion-options { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0.4rem; }
.criterion-options button { display:grid; min-height:52px; place-content:center; gap:0.1rem; border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface); color:var(--text); cursor:pointer; }
.criterion-options button[aria-pressed='true'] { border-color:var(--accent); background:var(--accent-subtle); }
.criterion-options button:disabled { cursor:not-allowed; opacity:0.65; }
.criterion-options span { font-size:0.7rem; color:var(--text-secondary); line-height:1.15; }
.criterion-conflict { display:grid; gap:0.65rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.criterion-actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (max-width:520px) { .criterion-options { grid-template-columns:repeat(2,minmax(0,1fr)); } .criterion-actions { display:grid; grid-template-columns:1fr; } }
</style>
