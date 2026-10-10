<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, Images } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import { formatTechnicianDateTime } from '@/helpers/technicianServices'
import type { TechnicianFinding, TechnicianFindingCreateMutation, TechnicianFindingStatusInput, TechnicianFindingStatusMutation } from '@/types/technicianServices'

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
watch(() => props.focusPending, value => { if (value) expanded.value = true })
const closureOpen = ref(false)
const observation = ref('')
const evidences = ref<File[]>([])
const evidenceError = ref('')
const priorFinding = computed(() => props.finding.servicioAperturaId !== props.currentServiceId)
const canFollowUp = computed(() => props.editable && priorFinding.value && props.finding.estado !== 'CERRADO' && !props.finding.resultadoSeguimiento && !props.mutation)
const stateTone = computed(() => props.finding.estado === 'CERRADO' ? 'success' : props.finding.estado === 'EN_PROCESO' ? 'info' : 'warning')
const stateLabel = computed(() => props.finding.estado === 'EN_PROCESO' ? 'En proceso' : props.finding.estado === 'CERRADO' ? 'Cerrado' : 'Abierto')
const openingEvidenceCount = computed(() => props.finding.evidenciasAperturaStoragePaths.length + (props.finding.evidenciasAperturaLocalIds?.length ?? 0))
const closureEvidenceCount = computed(() => props.finding.evidenciasCierreStoragePaths.length + (props.finding.evidenciasCierreLocalIds?.length ?? 0))

watch(() => props.finding.estado, () => { closureOpen.value = false; observation.value = ''; evidences.value = []; evidenceError.value = '' })

function closeFinding(): void {
  evidenceError.value = evidences.value.length ? '' : 'Adjunta al menos una evidencia de cierre.'
  if (evidenceError.value) return
  emit('status', { estado: 'CERRADO', observacionCierre: observation.value.trim() }, evidences.value)
}
</script>

<template>
  <article class="finding-card" :class="{ 'finding-card--invalid': validationError }">
    <button class="finding-card__summary" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <span><strong>{{ finding.descripcion }}</strong><small>{{ priorFinding ? `Abierto ${formatTechnicianDateTime(finding.fechaApertura)}` : 'Abierto en este servicio' }}</small></span>
      <StatusBadge :tone="stateTone">{{ stateLabel }}</StatusBadge>
      <ChevronDown :size="19" aria-hidden="true" :class="{ 'finding-card__chevron--open': expanded }" />
    </button>
    <div v-if="expanded" class="finding-card__detail">
      <dl>
        <div><dt>Recomendación o acción</dt><dd>{{ finding.recomendacionAccion }}</dd></div>
        <div><dt>Responsable</dt><dd>{{ finding.responsableNombre }}<small v-if="finding.responsableCorreo">{{ finding.responsableCorreo }}</small></dd></div>
      </dl>
      <p class="finding-card__evidence"><Images :size="17" aria-hidden="true" />{{ openingEvidenceCount ? `${openingEvidenceCount} evidencias de apertura` : 'Sin evidencia de apertura' }}</p>
      <template v-if="finding.estado === 'CERRADO'">
        <p class="finding-card__closed">Cerrado {{ finding.fechaCierre ? formatTechnicianDateTime(finding.fechaCierre) : '' }} · {{ closureEvidenceCount }} evidencias</p>
        <p v-if="finding.observacionCierre">{{ finding.observacionCierre }}</p>
      </template>
      <p v-if="mutation && mutation.status !== 'CONFLICT'" class="finding-card__pending">{{ mutation.status === 'SENDING' ? 'Sincronizando Hallazgo…' : 'Guardado en este dispositivo · pendiente de sincronizar' }}</p>
      <div v-if="mutation?.status === 'CONFLICT'" class="finding-card__conflict" role="alert">
        <p>{{ mutation.error ?? 'El Hallazgo cambió. Elige cuál versión conservar.' }}</p>
        <div><BaseButton variant="secondary" :disabled="saving" @click="emit('useRemote')">{{ mutation.kind === 'FINDING_CREATE' ? 'Descartar Hallazgo local' : 'Usar versión sincronizada' }}</BaseButton><BaseButton :loading="saving" @click="emit('retry')">Reintentar mi cambio</BaseButton></div>
      </div>
      <p v-if="finding.resultadoSeguimiento" class="finding-card__reviewed">Revisado en esta visita · {{ finding.resultadoSeguimiento === 'SIN_CAMBIOS' ? 'Sigue igual' : finding.resultadoSeguimiento === 'EN_PROCESO' ? 'En proceso' : 'Cerrado' }}</p>
      <p v-if="validationError" class="finding-card__validation" role="alert">{{ validationError }}</p>
      <div v-if="canFollowUp" class="finding-card__actions">
        <BaseButton variant="secondary" :disabled="saving" @click="emit('status', { estado: 'SIN_CAMBIOS', observacionCierre: '' }, [])">Sigue igual</BaseButton>
        <BaseButton variant="secondary" :disabled="saving" @click="emit('status', { estado: 'EN_PROCESO', observacionCierre: '' }, [])">En proceso</BaseButton>
        <BaseButton :disabled="saving" @click="closureOpen = true">Cerrar Hallazgo</BaseButton>
      </div>
      <form v-if="closureOpen" class="finding-card__closure" @submit.prevent="closeFinding">
        <BaseTextarea v-model="observation" :name="`finding-close-observation-${finding.id}`" label="Observación de cierre" :rows="3" maxlength="2000" :disabled="saving" />
        <TechnicianEvidencePicker v-model="evidences" :name="`finding-close-evidence-${finding.id}`" label="Evidencias de cierre" required :disabled="saving" :error="evidenceError || undefined" />
        <div><BaseButton type="submit" :loading="saving">Confirmar cierre</BaseButton><BaseButton variant="secondary" :disabled="saving" @click="closureOpen = false">Cancelar</BaseButton></div>
      </form>
    </div>
  </article>
</template>

<style scoped>
 .finding-card--invalid { border-color:var(--danger); }
.finding-card__validation { color:var(--danger); font-size:.78rem; }
.finding-card__reviewed { color:var(--success); font-size:.78rem; }
.finding-card { overflow:hidden; border:1px solid var(--border); border-radius:var(--radius); }
.finding-card__summary { display:grid; min-height:58px; width:100%; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:0.65rem; border:0; background:var(--surface); padding:0.75rem; color:var(--text); text-align:left; cursor:pointer; }
.finding-card__summary > span { display:grid; min-width:0; gap:0.2rem; overflow-wrap:anywhere; }
.finding-card__summary strong { font-size:0.875rem; }
.finding-card__summary small, dt, dd small { color:var(--text-secondary); font-size:0.75rem; }
.finding-card__chevron--open { transform:rotate(180deg); }
.finding-card__detail { display:grid; gap:0.8rem; border-top:1px solid var(--border); background:var(--surface-raised); padding:0.85rem; }
dl { display:grid; gap:0.7rem; margin:0; }
dt { margin-bottom:0.2rem; }
dd { display:grid; gap:0.15rem; margin:0; overflow-wrap:anywhere; font-size:0.875rem; }
.finding-card__evidence, .finding-card__closed, .finding-card__pending, .finding-card__detail > p { margin:0; font-size:0.8125rem; }
.finding-card__evidence { display:flex; align-items:center; gap:0.45rem; color:var(--text-secondary); }
.finding-card__closed { color:var(--success); }
.finding-card__pending { border-radius:var(--radius-sm); background:var(--info-subtle); padding:0.65rem; color:var(--info); }
.finding-card__conflict { display:grid; gap:0.65rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.finding-card__conflict p { margin:0; font-size:0.8125rem; }
.finding-card__conflict > div, .finding-card__actions, .finding-card__closure > div:last-child { display:flex; flex-wrap:wrap; gap:0.55rem; }
.finding-card__closure { display:grid; gap:0.8rem; border-top:1px solid var(--border); padding-top:0.8rem; }
@media (max-width:520px) { .finding-card__summary { grid-template-columns:minmax(0,1fr) auto; } .finding-card__summary :deep(.status-badge) { grid-column:1; justify-self:start; } .finding-card__summary > svg { grid-column:2; grid-row:1; } .finding-card__conflict > div, .finding-card__actions, .finding-card__closure > div:last-child { display:grid; grid-template-columns:1fr; } }
</style>
