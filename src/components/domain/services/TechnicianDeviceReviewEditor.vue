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

const props = defineProps<{
  device: TechnicianDevice
  creationMutation?: TechnicianDeviceCreationMutation | null
  mutation: TechnicianDeviceReviewMutation | null
  editable: boolean
  syncing: boolean
}>()
const emit = defineEmits<{
  draft: [input: TechnicianDeviceReviewInput, photo: File | null]
  save: [input: TechnicianDeviceReviewInput, photo: File | null]
  retry: []
  useRemote: []
}>()

const expanded = ref(false)
const state = ref<DeviceState>(props.device.revision?.estadoObservado ?? props.device.estadoAnterior)
const quantities = ref<Record<string, string>>({})
const consumption = ref('')
const chemical = ref('')
const antidote = ref('')
const observations = ref('')
const photo = ref<File | null>(null)
const captureError = ref('')
const photoError = ref('')
const disabled = computed(() => !props.editable || props.syncing || props.creationMutation?.status === 'CONFLICT' || props.mutation?.status === 'CONFLICT')
const photoRequired = computed(() => technicianDevicePhotoRequired(props.device.estadoAnterior, state.value))
const hasStoredPhoto = computed(() => Boolean(props.device.revision?.fotoStoragePath || props.device.revision?.fotoLocalId))

watch(() => props.device.id, reset, { immediate: true })
watch(() => props.device.revision, () => { if (!props.mutation) reset() })

function reset(): void {
  const review = props.device.revision
  state.value = review?.estadoObservado ?? props.device.estadoAnterior
  quantities.value = Object.fromEntries(props.device.plagas.map(pest => [pest.codigo,
    review?.capturas.find(capture => capture.plagaCodigo === pest.codigo)?.cantidad.toString() ?? '']))
  consumption.value = review?.consumo ?? ''
  chemical.value = review?.productoQuimico ?? ''
  antidote.value = review?.antidoto ?? ''
  observations.value = review?.observaciones ?? ''
  photo.value = null
  captureError.value = ''
  photoError.value = ''
}

function input(): TechnicianDeviceReviewInput {
  return {
    estadoObservado: state.value,
    capturas: props.device.plagas.flatMap(pest => {
      const raw = quantities.value[pest.codigo]?.trim() ?? ''
      return raw ? [{ plagaCodigo: pest.codigo, cantidad: Number(raw) }] : []
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
  if (!photoRequired.value) photo.value = null
  changed()
}

function changeQuantity(code: string, value: string): void {
  quantities.value = { ...quantities.value, [code]: value }
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
    return !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000
  })
  captureError.value = invalidCapture ? 'Cada captura debe ser un número entero entre 1 y 1.000.000.' : ''
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
    <button class="device-summary" type="button" :aria-expanded="expanded" :aria-controls="`device-review-${device.id}`" @click="expanded = !expanded">
      <span class="device-summary__copy"><strong>{{ device.numero }}</strong><small>{{ device.tipoNombre }} · {{ device.ubicacion }}</small></span>
      <StatusBadge v-if="creationMutation?.status === 'CONFLICT'" tone="warning">Alta en conflicto</StatusBadge>
      <StatusBadge v-else-if="creationMutation" tone="warning">{{ creationMutation.status === 'SENDING' ? 'Creando' : 'Creación local' }}</StatusBadge>
      <StatusBadge v-else-if="mutation?.status === 'CONFLICT'" tone="warning">Conflicto</StatusBadge>
      <StatusBadge v-else-if="mutation" tone="warning">{{ mutation.status === 'SENDING' ? 'Sincronizando' : 'Guardado local' }}</StatusBadge>
      <StatusBadge v-else :tone="device.revisado ? 'success' : 'neutral'">{{ device.revisado ? 'Revisado' : 'Pendiente' }}</StatusBadge>
      <ChevronDown :size="18" aria-hidden="true" :class="{ 'device-summary__chevron--open': expanded }" />
    </button>
    <div v-if="expanded" :id="`device-review-${device.id}`" class="device-form">
      <p class="device-context"><span v-if="device.creadoDuranteServicio">Creado en este servicio · </span>Estado anterior: <strong>{{ device.estadoAnterior === 'ACTIVO' ? 'Activo' : device.estadoAnterior === 'DANADO' ? 'Dañado' : 'Fuera de uso' }}</strong><span v-if="device.clasificacion"> · {{ device.clasificacion === 'RASTREROS' ? 'Rastreros' : 'Voladores' }}</span></p>
      <BaseSelect :model-value="state" :name="`device-state-${device.id}`" label="Estado observado" required :disabled="disabled" @update:model-value="changeState">
        <option value="ACTIVO">Activo</option>
        <option value="DANADO">Dañado</option>
        <option value="FUERA_DE_USO">Fuera de uso</option>
      </BaseSelect>
      <fieldset v-if="device.plagas.length" class="captures">
        <legend>Capturas por plaga</legend>
        <BaseInput v-for="pest in device.plagas" :key="pest.codigo" :model-value="quantities[pest.codigo] ?? ''" :name="`device-${device.id}-pest-${pest.codigo}`" :label="pest.nombre" type="number" min="1" max="1000000" step="1" :disabled="disabled" @update:model-value="changeQuantity(pest.codigo, $event)" />
        <p v-if="captureError" role="alert">{{ captureError }}</p>
      </fieldset>
      <p v-else class="device-empty">Este tipo no tiene plagas activas congeladas para registrar capturas.</p>
      <div class="device-fields">
        <BaseInput :model-value="consumption" :name="`device-consumption-${device.id}`" label="Consumo" maxlength="500" :disabled="disabled" @update:model-value="consumption = $event; changed()" />
        <BaseInput :model-value="chemical" :name="`device-chemical-${device.id}`" label="Producto químico" maxlength="500" :disabled="disabled" @update:model-value="chemical = $event; changed()" />
        <BaseInput :model-value="antidote" :name="`device-antidote-${device.id}`" label="Antídoto" maxlength="500" :disabled="disabled" @update:model-value="antidote = $event; changed()" />
      </div>
      <BaseTextarea :model-value="observations" :name="`device-observations-${device.id}`" label="Observaciones del dispositivo" :rows="3" maxlength="2000" :disabled="disabled" @update:model-value="observations = $event; changed()" />
      <div v-if="photoRequired" class="device-photo">
        <span>{{ hasStoredPhoto ? 'Reemplazar fotografía del cambio' : 'Fotografía del cambio de estado' }}</span>
        <TechnicianEvidencePicker :model-value="photo ? [photo] : []" :name="`device-photo-${device.id}`" label="Fotografía" :max="1" :disabled="disabled" @update:model-value="changePhoto" />
        <p v-if="photoError" role="alert">{{ photoError }}</p>
      </div>
      <BaseButton :disabled="disabled" @click="save">Guardar revisión</BaseButton>
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
.device-summary small, .device-context, .device-empty { color:var(--text-secondary); }
.device-summary__chevron--open { transform:rotate(180deg); }
.device-form { display:grid; gap:0.85rem; border-top:1px solid var(--border); background:var(--surface-raised); padding:0.85rem; }
.device-context, .device-empty, .device-conflict p { margin:0; font-size:0.8125rem; }
.captures { display:grid; gap:0.65rem; margin:0; border:1px solid var(--border); border-radius:var(--radius); padding:0.75rem; }
.captures legend { padding:0 0.3rem; font-size:0.875rem; font-weight:700; }
.captures > p { margin:0; color:var(--danger); font-size:0.8rem; }
.device-fields { display:grid; gap:0.75rem; }
.device-photo { display:grid; gap:0.5rem; }
.device-photo > span { font-size:0.875rem; font-weight:650; }
.device-photo > p { margin:0; color:var(--danger); font-size:0.8rem; }
.device-conflict { display:grid; gap:0.65rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.device-actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (min-width:760px) { .device-fields { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:520px) { .device-summary { grid-template-columns:minmax(0,1fr) auto; } .device-summary :deep(.status-badge) { grid-column:1; justify-self:start; } .device-summary > svg { grid-column:2; grid-row:1; } .device-actions { display:grid; grid-template-columns:1fr; } }
</style>
