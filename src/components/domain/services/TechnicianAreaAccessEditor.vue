<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, Images, ShieldAlert, ShieldCheck } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import type { TechnicianArea, TechnicianAreaAccessMutation } from '@/types/technicianServices'

const props = withDefaults(defineProps<{
  area: TechnicianArea
  mutation: TechnicianAreaAccessMutation | null
  editable: boolean
  syncing: boolean
  continueLabel?: string
  restoredDraft?: { description: string; photos: File[] } | null
}>(), { continueLabel: 'Continuar' })

const emit = defineEmits<{
  draft: [withoutAccess: boolean, description: string, files: File[]]
  save: [withoutAccess: boolean, description: string, files: File[], done: (saved: boolean) => void]
  continue: []
  retry: []
  useRemote: []
  cancel: []
}>()

const dialogOpen = ref(false)
const completed = ref(false)
const description = ref(props.area.sinAccesoDescripcion ?? '')
const photos = ref<File[]>([])
const descriptionError = ref('')
const photoError = ref('')
const saveError = ref('')
const submitting = ref(false)
const disabled = computed(() => !props.editable || props.syncing || submitting.value || props.mutation?.status === 'CONFLICT')
const savedCount = computed(() => (props.area.sinAccesoEvidenciasStoragePaths?.length ?? (props.area.sinAccesoFotoStoragePath ? 1 : 0))
  + (props.area.sinAccesoEvidenciasLocalIds?.length ?? (props.area.sinAccesoFotoLocalId ? 1 : 0)))
const hasStoredPhoto = computed(() => savedCount.value > 0)

watch(() => props.area.id, reset)
watch(() => props.mutation?.status, status => { if (status === 'CONFLICT') submitting.value = false })

function resetFields(): void {
  description.value = props.area.sinAccesoDescripcion ?? ''
  photos.value = []
  descriptionError.value = ''
  photoError.value = ''
  saveError.value = ''
}

function reset(): void {
  dialogOpen.value = false
  completed.value = false
  submitting.value = false
  resetFields()
}

function openException(): void {
  completed.value = false
  resetFields()
  if (props.restoredDraft) {
    description.value = props.restoredDraft.description
    photos.value = [...props.restoredDraft.photos]
  }
  dialogOpen.value = true
  emit('draft', true, description.value, photos.value)
}

function closeException(): void {
  if (submitting.value) return
  dialogOpen.value = false
  completed.value = false
  emit('cancel')
}

function changedDescription(value: string): void {
  description.value = value
  descriptionError.value = ''
  emit('draft', true, value, photos.value)
}

function changedPhoto(files: File[]): void {
  photos.value = files
  photoError.value = ''
  emit('draft', true, description.value, files)
}

function validate(): boolean {
  descriptionError.value = !description.value.trim() ? 'Describe por qué no fue posible ingresar.' : ''
  photoError.value = !photos.value.length && !hasStoredPhoto.value ? 'Adjunta al menos una fotografía del Área.' : ''
  if (photos.value.length + savedCount.value > 5) photoError.value = 'Adjunta máximo cinco fotografías por Área.'
  return !descriptionError.value && !photoError.value
}

function completedSave(saved: boolean, withoutAccess: boolean): void {
  submitting.value = false
  if (!saved) {
    saveError.value = 'No se pudo guardar. Revisa el error del Área e inténtalo nuevamente.'
    return
  }
  saveError.value = ''
  if (withoutAccess) completed.value = true
  else closeException()
}

function saveException(): void {
  if (disabled.value || !validate()) return
  submitting.value = true
  emit('save', true, description.value, photos.value, saved => completedSave(saved, true))
}

function enableAccess(): void {
  if (disabled.value) return
  if (!props.area.sinAcceso) { closeException(); return }
  submitting.value = true
  emit('save', false, '', [], saved => completedSave(saved, false))
}

function continueFlow(): void {
  dialogOpen.value = false
  completed.value = false
  emit('continue')
}
</script>

<template>
  <article v-if="area.sinAcceso" class="access-summary">
    <ShieldAlert :size="22" aria-hidden="true" />
    <div><strong>Área sin acceso</strong><p>{{ area.sinAccesoDescripcion }}</p><small><Images :size="15" aria-hidden="true" />{{ savedCount }} fotografía(s) guardada(s)</small></div>
    <div class="access-summary__actions"><BaseButton size="compact" variant="secondary" :disabled="!editable || syncing || submitting" @click="openException">Editar</BaseButton><BaseButton size="compact" :loading="submitting" :disabled="disabled" @click="enableAccess"><ShieldCheck :size="17" aria-hidden="true" />Habilitar acceso</BaseButton></div>
  </article>

  <BaseButton v-else class="access-trigger" size="compact" variant="secondary" :disabled="!editable || syncing || submitting" @click="openException"><ShieldAlert :size="16" aria-hidden="true" />Registrar área sin acceso</BaseButton>

  <BaseDialog :model-value="dialogOpen" :title="completed ? 'Área registrada sin acceso' : 'No fue posible acceder al Área'" :description="completed ? 'La excepción quedó guardada y esta Área ya no tiene tareas pendientes.' : 'Indica el motivo y adjunta evidencia antes de continuar.'" :close-on-escape="!submitting" @update:model-value="value => { if (!value) closeException() }">
    <div v-if="completed" class="access-completed">
      <ShieldCheck :size="34" aria-hidden="true" />
      <p>Los criterios y puestos de monitoreo quedaron exceptuados para esta visita.</p>
      <BaseButton @click="continueFlow">{{ continueLabel }}<ArrowRight :size="18" aria-hidden="true" /></BaseButton>
      <BaseButton variant="secondary" @click="closeException">Permanecer en esta Área</BaseButton>
    </div>
    <div v-else class="access-fields">
      <BaseButton variant="secondary" :disabled="submitting" @click="enableAccess"><ShieldCheck :size="18" aria-hidden="true" />Habilitar Área</BaseButton>
      <BaseTextarea :model-value="description" :name="`area-access-description-${area.id}`" label="Motivo" :rows="3" required :disabled="disabled" :error="descriptionError || undefined" hint="Explica la causa concreta." @update:model-value="changedDescription" />
      <TechnicianEvidencePicker :model-value="photos" :name="`area-access-photo-${area.id}`" :label="hasStoredPhoto ? 'Agregar fotografías' : 'Fotografías del Área'" required :max="Math.max(0, 5 - savedCount)" :disabled="disabled" :error="photoError || undefined" @update:model-value="changedPhoto" />
      <p v-if="hasStoredPhoto" class="access-stored">{{ savedCount }} fotografía(s) ya guardada(s); puedes añadir más.</p>
      <p v-if="saveError" class="access-error" role="alert">{{ saveError }}</p>
      <BaseButton variant="danger" :loading="submitting" :disabled="disabled" @click="saveException">Guardar Área sin acceso</BaseButton>
    </div>
    <div v-if="mutation?.status === 'CONFLICT'" class="access-conflict">
      <p>{{ mutation.error ?? 'El estado de acceso cambió. Elige cuál versión conservar.' }}</p>
      <div v-if="mutation.conflict" class="access-actions"><BaseButton variant="secondary" :disabled="syncing" @click="emit('useRemote')">Usar estado sincronizado</BaseButton><BaseButton :loading="syncing" @click="emit('retry')">Reintentar mi cambio</BaseButton></div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.access-trigger { justify-self:start; }
.access-summary { display:grid; grid-template-columns:auto minmax(0,1fr); gap:0.75rem; border:1px solid var(--warning); border-radius:var(--radius-lg); background:var(--warning-subtle); padding:0.85rem; color:var(--warning); }
.access-summary p, .access-summary small { margin:0; }
.access-summary p { margin-top:0.2rem; color:var(--text); font-size:0.875rem; }
.access-summary small { display:flex; align-items:center; gap:0.35rem; margin-top:0.45rem; }
.access-summary__actions { grid-column:1/-1; display:flex; flex-wrap:wrap; gap:0.5rem; }
.access-fields, .access-completed { display:grid; gap:0.85rem; }
.access-completed { text-align:center; }
.access-completed > svg { justify-self:center; color:var(--success); }
.access-completed p { margin:0; color:var(--text-secondary); }
.access-error { margin:0; color:var(--danger); font-size:0.8125rem; }
.access-stored { margin:0; color:var(--text-secondary); font-size:0.8125rem; }
.access-conflict { display:grid; gap:0.65rem; margin-top:0.75rem; border-radius:var(--radius); background:var(--warning-subtle); padding:0.75rem; color:var(--warning); }
.access-conflict p { margin:0; }
.access-actions { display:flex; flex-wrap:wrap; gap:0.55rem; }
@media (max-width:520px) { .access-summary__actions, .access-actions { display:grid; grid-template-columns:1fr; } }
</style>
