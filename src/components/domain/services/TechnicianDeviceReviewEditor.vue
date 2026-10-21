<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import TechnicianEvidencePicker from './TechnicianEvidencePicker.vue'
import { technicianDevicePhotoRequired } from '@/helpers/technicianServices'
import type { DeviceState, TechnicianDevice, TechnicianDeviceCreationMutation, TechnicianDeviceReviewInput, TechnicianDeviceReviewMutation } from '@/types/technicianServices'

const props = withDefaults(defineProps<{
  device: TechnicianDevice
  creationMutation?: TechnicianDeviceCreationMutation | null
  mutation: TechnicianDeviceReviewMutation | null
  editable: boolean
  syncing: boolean
  expanded?: boolean
}>(), { expanded: false })

const emit = defineEmits<{
  toggle: []
  draft: [input: TechnicianDeviceReviewInput, photo: File | null]
  save: [input: TechnicianDeviceReviewInput, photo: File | null]
  retry: []
  useRemote: []
}>()

const state = ref<DeviceState>(props.device.revision?.estadoObservado ?? props.device.estadoAnterior)
const quantities = ref<Record<string, string>>({})
const activePestCode = ref('')
const consumption = ref('')
const chemical = ref('')
const antidote = ref('')
const observations = ref('')
const photo = ref<File | null>(null)
const captureError = ref('')
const photoError = ref('')
const disabled = computed(() => !props.editable || props.syncing || props.creationMutation?.status === 'CONFLICT' || props.mutation?.status === 'CONFLICT' || props.mutation?.status === 'SENDING')
const photoRequired = computed(() => technicianDevicePhotoRequired(props.device.estadoAnterior, state.value))
const hasStoredPhoto = computed(() => Boolean(props.device.revision?.fotoStoragePath || props.device.revision?.fotoLocalId))
const activePest = computed(() => props.device.plagas.find(pest => pest.codigo === activePestCode.value) ?? null)

watch(() => props.device.id, reset, { immediate: true })
watch(() => props.device.revision, () => { if (!props.mutation) reset() })

function reset(): void {
  const review = props.device.revision
  state.value = review?.estadoObservado ?? props.device.estadoAnterior
  quantities.value = Object.fromEntries(props.device.plagas.map(pest => [
    pest.codigo,
    review?.capturas.find(capture => capture.plagaCodigo === pest.codigo)?.cantidad.toString() ?? '',
  ]))
  activePestCode.value = review?.capturas[0]?.plagaCodigo ?? ''
  // Campos legacy: se preservan para no borrar historia, pero ya no se capturan como texto libre.
  consumption.value = review?.consumo ?? ''
  chemical.value = review?.productoQuimico ?? ''
  antidote.value = review?.antidoto ?? ''
  observations.value = review?.observaciones ?? ''
  photo.value = null
  captureError.value = ''
  photoError.value = ''
}

function captureQuantity(code: string): number {
  const quantity = Number(quantities.value[code] ?? '')
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

function input(): TechnicianDeviceReviewInput {
  return {
    estadoObservado: state.value,
    capturas: props.device.plagas.flatMap(pest => {
      const quantity = Number(quantities.value[pest.codigo] ?? '')
      return Number.isSafeInteger(quantity) && quantity > 0
        ? [{ plagaCodigo: pest.codigo, cantidad: quantity }]
        : []
    }),
    consumo: consumption.value,
    productoQuimico: chemical.value,
    antidoto: antidote.value,
    observaciones: observations.value,
  }
}

function changed(): void {
  captureError.value = ''
  photoError.value = ''
  emit('draft', input(), photo.value)
}

function changeState(value: string): void {
  state.value = value as DeviceState
  changed()
}

function selectPest(code: string): void {
  if (disabled.value) return
  activePestCode.value = code
}

function changeQuantity(code: string, value: string): void {
  quantities.value = { ...quantities.value, [code]: value }
  changed()
}

function clearPest(code: string): void {
  quantities.value = { ...quantities.value, [code]: '' }
  if (activePestCode.value === code) activePestCode.value = ''
  changed()
}

function changePhoto(value: File[]): void {
  photo.value = value[0] ?? null
  changed()
}

function validate(): boolean {
  const invalidCapture = Object.values(quantities.value).some(value => {
    if (!value.trim()) return false
    const quantity = Number(value)
    return !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1_000_000
  })
  captureError.value = invalidCapture ? 'La cantidad debe ser 0 o un número entero hasta 1.000.000.' : ''
  photoError.value = photoRequired.value && !photo.value && !hasStoredPhoto.value ? 'Adjunta una fotografía del cambio de estado.' : ''
  return !captureError.value && !photoError.value
}

function save(): void {
  if (disabled.value || !validate()) return
  emit('save', input(), photo.value)
}
</script>

<template>
  <article class="device-card">
    <button class="device-summary" type="button" :aria-expanded="expanded" :aria-controls="`device-review-${device.id}`" @click="emit('toggle')">
      <span class="device-summary__copy">
        <strong>Puesto {{ device.numero }}</strong>
        <small>{{ device.ubicacion }}<template v-if="device.tipoNombre"> · {{ device.tipoNombre }}</template></small>
      </span>
      <StatusBadge v-if="creationMutation?.status === 'CONFLICT'" tone="warning">Alta en conflicto</StatusBadge>
      <StatusBadge v-else-if="creationMutation" tone="warning">{{ creationMutation.status === 'SENDING' ? 'Creando' : 'Creación local' }}</StatusBadge>
      <StatusBadge v-else-if="mutation?.status === 'CONFLICT'" tone="warning">Conflicto</StatusBadge>
      <StatusBadge v-else-if="mutation" tone="warning">{{ mutation.status === 'SENDING' ? (syncing ? 'Sincronizando' : 'Reintento pendiente') : 'Guardado local' }}</StatusBadge>
      <StatusBadge v-else :tone="device.revisado ? 'success' : 'neutral'">{{ device.revisado ? 'Revisado' : 'Pendiente' }}</StatusBadge>
      <ChevronDown :size="18" aria-hidden="true" :class="{ 'device-summary__chevron--open': expanded }" />
    </button>
    <div v-if="expanded" :id="`device-review-${device.id}`" class="device-form">
      <p class="device-context"><span v-if="device.creadoDuranteServicio">Creado en este servicio · </span>{{ device.clasificacion === 'VOLADORES' ? 'Voladores' : 'Rastreros' }}</p>
      <section class="monitoring-block" :aria-labelledby="`trap-title-${device.id}`">
        <header><div><h4 :id="`trap-title-${device.id}`">Trampa</h4><p>{{ device.tipoNombre }}</p></div></header>
        <BaseSelect :model-value="state" :name="`device-state-${device.id}`" label="Estado observado" required :disabled="disabled" @update:model-value="changeState">
          <option value="ACTIVO">Activo</option>
          <option value="DANADO">Dañado</option>
          <option value="FUERA_DE_USO">Fuera de uso</option>
        </BaseSelect>
        <div v-if="device.plagas.length" class="pest-captures">
          <div class="pest-captures__heading"><strong>Plagas evidenciadas</strong><span>Sin seleccionar = no se evidencia</span></div>
          <div class="pest-chips" role="group" aria-label="Plagas evidenciadas">
            <button v-for="pest in device.plagas" :key="pest.codigo" type="button" class="pest-chip" :class="{ 'pest-chip--active': captureQuantity(pest.codigo) > 0, 'pest-chip--editing': activePestCode === pest.codigo }" :aria-pressed="captureQuantity(pest.codigo) > 0" :disabled="disabled" @click="selectPest(pest.codigo)">
              <span>{{ pest.nombre }}</span><strong v-if="captureQuantity(pest.codigo) > 0">{{ captureQuantity(pest.codigo) }}</strong>
            </button>
          </div>
          <div v-if="activePest" class="pest-editor">
            <BaseInput :model-value="quantities[activePest.codigo] ?? ''" :name="`device-${device.id}-pest-${activePest.codigo}`" :label="`Cantidad · ${activePest.nombre}`" type="number" min="0" max="1000000" step="1" :disabled="disabled" @update:model-value="changeQuantity(activePest.codigo, $event)" />
            <BaseButton size="compact" variant="ghost" :disabled="disabled" @click="clearPest(activePest.codigo)">No se evidencia</BaseButton>
          </div>
          <p v-if="captureError" class="field-error" role="alert">{{ captureError }}</p>
        </div>
        <p v-else class="device-empty">Esta trampa no tiene plagas aplicables configuradas.</p>
      </section>
      <section class="monitoring-block">
        <div class="block-heading"><div><h4>Evidencia fotográfica</h4><p>{{ photoRequired ? 'Obligatoria por el cambio de estado.' : 'Opcional para documentar el puesto.' }}</p></div></div>
        <TechnicianEvidencePicker :model-value="photo ? [photo] : []" :name="`device-photo-${device.id}`" label="Fotografía del puesto" :required="photoRequired" :max="1" :disabled="disabled" :error="photoError || undefined" @update:model-value="changePhoto" />
        <small v-if="hasStoredPhoto && !photo" class="stored-evidence">Ya hay una fotografía guardada. Si eliges otra, la reemplazará.</small>
      </section>
      <details class="device-notes" :open="Boolean(observations)">
        <summary>Observaciones <span>Opcional</span></summary>
        <BaseTextarea :model-value="observations" :name="`device-observations-${device.id}`" label="Observaciones del puesto" :rows="3" maxlength="2000" :disabled="disabled" @update:model-value="observations = $event; changed()" />
      </details>
      <BaseButton :disabled="disabled" @click="save">Guardar puesto de monitoreo</BaseButton>
      <div v-if="mutation?.status === 'SENDING' && !syncing" class="device-conflict" role="status">
        <p>{{ mutation.error || 'La revisión permanece guardada en este celular. Vuelve a sincronizar antes de editarla.' }}</p>
        <BaseButton variant="secondary" size="compact" @click="emit('retry')">Reintentar sincronización</BaseButton>
      </div>
      <div v-if="mutation?.status === 'CONFLICT'" class="device-conflict">
        <p>{{ mutation.error ?? 'La revisión cambió. Elige cuál versión conservar.' }}</p>
        <div v-if="mutation.conflict" class="device-actions"><BaseButton variant="secondary" :disabled="syncing" @click="emit('useRemote')">Usar revisión sincronizada</BaseButton><BaseButton :loading="syncing" @click="emit('retry')">Reintentar mi revisión</BaseButton></div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.device-card { overflow:hidden; border:1px solid var(--border); border-radius:var(--radius); }
.device-summary { display:grid; min-height:58px; width:100%; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:0.65rem; border:0; background:var(--surface); padding:0.75rem; color:var(--text); text-align:left; cursor:pointer; }
.device-summary__copy { display:grid; min-width:0; gap:0.15rem; overflow-wrap:anywhere; }
.device-summary small, .device-context, .device-empty, .block-heading p, .monitoring-block header p, .pest-captures__heading span, .stored-evidence { color:var(--text-secondary); }
.device-summary__chevron--open { transform:rotate(180deg); }
.device-form { display:grid; gap:0.75rem; border-top:1px solid var(--border); background:var(--surface-raised); padding:0.75rem; }
.device-context, .device-empty, .device-conflict p { margin:0; font-size:0.8125rem; }
.monitoring-block { display:grid; gap:0.75rem; border:1px solid var(--border); border-radius:var(--radius); padding:0.75rem; }
.monitoring-block header, .block-heading, .pest-captures__heading { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
.monitoring-block h4, .monitoring-block p { margin:0; }
.monitoring-block h4 { font-size:0.9375rem; }
.monitoring-block header p, .block-heading p, .pest-captures__heading span { margin-top:0.1rem; font-size:0.78rem; }
.pest-captures { display:grid; gap:0.65rem; }
.pest-captures__heading { align-items:end; }
.pest-chips { display:flex; flex-wrap:wrap; gap:0.45rem; }
.pest-chip { display:inline-flex; min-height:44px; align-items:center; gap:0.45rem; border:1px solid var(--control-border); border-radius:999px; background:var(--surface); padding:0.45rem 0.75rem; color:var(--text); font:inherit; cursor:pointer; }
.pest-chip:hover:not(:disabled), .pest-chip:focus-visible { border-color:var(--border-strong); background:var(--hover); }
.pest-chip--active { border-color:var(--accent); background:var(--accent-subtle); }
.pest-chip--editing { border-color:var(--accent); }
.pest-chip strong { display:grid; min-width:1.55rem; height:1.55rem; place-items:center; border-radius:999px; background:var(--surface-raised); font-size:0.78rem; }
.pest-editor { display:grid; gap:0.45rem; border-radius:var(--radius-sm); background:var(--hover); padding:0.65rem; }
.pest-editor :deep(.base-button) { justify-self:start; }
.field-error { margin:0; color:var(--danger); font-size:0.8rem; }
.stored-evidence { font-size:0.78rem; }
.device-notes { border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:0.2rem 0.75rem 0.75rem; }
.device-notes summary { display:flex; min-height:44px; align-items:center; justify-content:space-between; gap:0.75rem; cursor:pointer; font-weight:650; }
.device-notes summary span { color:var(--text-secondary); font-size:0.75rem; font-weight:400; }
.device-conflict { display:grid; gap:0.65rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.device-actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (min-width:760px) { .pest-editor { grid-template-columns:minmax(0,1fr) auto; align-items:end; } }
@media (max-width:520px) { .device-summary { grid-template-columns:minmax(0,1fr) auto; } .device-summary :deep(.status-badge) { grid-column:1; justify-self:start; } .device-summary > svg { grid-column:2; grid-row:1; } .device-actions { display:grid; grid-template-columns:1fr; } .pest-chip { flex:1 1 auto; justify-content:center; } }
</style>
