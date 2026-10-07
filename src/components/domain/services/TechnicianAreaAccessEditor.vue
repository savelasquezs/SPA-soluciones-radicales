<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import type { TechnicianArea, TechnicianAreaAccessMutation } from '@/types/technicianServices'

const props = defineProps<{
  area: TechnicianArea
  mutation: TechnicianAreaAccessMutation | null
  editable: boolean
  syncing: boolean
}>()
const emit = defineEmits<{
  draft: [withoutAccess: boolean, description: string, photo: File | null]
  save: [withoutAccess: boolean, description: string, photo: File | null]
  retry: []
  useRemote: []
}>()

const withoutAccess = ref(props.area.sinAcceso)
const description = ref(props.area.sinAccesoDescripcion ?? '')
const photo = ref<File | null>(null)
const descriptionError = ref('')
const photoError = ref('')
const disabled = computed(() => !props.editable || props.syncing || props.mutation?.status === 'CONFLICT')
const hasStoredPhoto = computed(() => Boolean(props.area.sinAccesoFotoStoragePath || props.area.sinAccesoFotoLocalId))

watch(() => props.area.id, () => reset())
watch(() => [props.area.sinAcceso, props.area.sinAccesoDescripcion, props.area.sinAccesoFotoStoragePath, props.area.sinAccesoFotoLocalId], () => {
  if (!props.mutation) reset()
})

function reset(): void {
  withoutAccess.value = props.area.sinAcceso
  description.value = props.area.sinAccesoDescripcion ?? ''
  photo.value = null
  descriptionError.value = ''
  photoError.value = ''
}

function validate(): boolean {
  descriptionError.value = withoutAccess.value && !description.value.trim() ? 'Describe por qué no fue posible ingresar.' : ''
  photoError.value = withoutAccess.value && !photo.value && !hasStoredPhoto.value ? 'Adjunta una fotografía del Área.' : ''
  return !descriptionError.value && !photoError.value
}

function changedAccess(value: boolean): void {
  withoutAccess.value = value
  if (!value) {
    description.value = ''
    photo.value = null
    descriptionError.value = ''
    photoError.value = ''
    emit('draft', false, '', null)
    emit('save', false, '', null)
    return
  }
  emit('draft', true, description.value, photo.value)
}

function changedDescription(value: string): void {
  description.value = value
  descriptionError.value = ''
  emit('draft', withoutAccess.value, value, photo.value)
}

function changedPhoto(value: File | null): void {
  photo.value = value
  photoError.value = ''
  emit('draft', withoutAccess.value, description.value, value)
  if (value && description.value.trim()) save()
}

function save(): void {
  if (disabled.value || !withoutAccess.value || !validate()) return
  emit('save', true, description.value, photo.value)
}
</script>

<template>
  <article class="access-card">
    <header>
      <div><h3>Acceso al Área</h3><p>Usa esta excepción únicamente cuando no sea posible ingresar.</p></div>
      <StatusBadge v-if="mutation?.status === 'CONFLICT'" tone="warning">Conflicto</StatusBadge>
      <StatusBadge v-else-if="mutation" tone="warning">{{ mutation.status === 'SENDING' ? 'Sincronizando' : 'Guardado local' }}</StatusBadge>
      <StatusBadge v-else :tone="area.sinAcceso ? 'warning' : 'success'">{{ area.sinAcceso ? 'Sin acceso' : 'Acceso habilitado' }}</StatusBadge>
    </header>
    <BaseCheckbox :model-value="withoutAccess" :name="`area-without-access-${area.id}`" label="No fue posible acceder a esta Área" :disabled="disabled" @update:model-value="changedAccess" />
    <div v-if="withoutAccess" class="access-fields">
      <BaseTextarea :model-value="description" :name="`area-access-description-${area.id}`" label="Descripción" :rows="3" required :disabled="disabled" :error="descriptionError || undefined" hint="Indica la causa concreta. Se guarda al salir del campo." @update:model-value="changedDescription" @blur="save" />
      <BaseFileUpload :model-value="photo" :name="`area-access-photo-${area.id}`" :label="hasStoredPhoto ? 'Reemplazar fotografía' : 'Fotografía del Área'" required :disabled="disabled" accept=".jpg,.jpeg,.png,.webp" :error="photoError || undefined" :hint="hasStoredPhoto ? 'Ya existe una fotografía guardada. Selecciona otra solo para reemplazarla.' : 'JPG, PNG o WebP · hasta 10 MB'" @update:model-value="changedPhoto" />
      <BaseButton variant="secondary" :disabled="disabled" @click="save">Guardar excepción</BaseButton>
    </div>
    <div v-if="mutation?.status === 'CONFLICT'" class="access-conflict">
      <p>{{ mutation.error ?? 'El estado de acceso cambió. Elige cuál versión conservar.' }}</p>
      <div v-if="mutation.conflict" class="access-actions"><BaseButton variant="secondary" :disabled="syncing" @click="emit('useRemote')">Usar estado sincronizado</BaseButton><BaseButton :loading="syncing" @click="emit('retry')">Reintentar mi cambio</BaseButton></div>
    </div>
  </article>
</template>

<style scoped>
.access-card, .access-fields { display:grid; gap:0.85rem; }
.access-card { border:1px solid var(--border); border-radius:var(--radius); padding:0.85rem; }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:0.75rem; }
h3, p { margin:0; }
h3 { font-size:0.95rem; }
header p { margin-top:0.2rem; color:var(--text-secondary); font-size:0.8rem; }
.access-fields > .button { width:100%; }
.access-conflict { display:grid; gap:0.65rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.access-actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (max-width:520px) { .access-actions { display:grid; grid-template-columns:1fr; } }
</style>
