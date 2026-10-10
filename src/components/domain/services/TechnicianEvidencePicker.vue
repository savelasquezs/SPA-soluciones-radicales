<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Camera, Images, RotateCcw, X } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseField from '@/components/base/BaseField.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import TechnicianPhotoEditor from './TechnicianPhotoEditor.vue'

const props = withDefaults(defineProps<{
  modelValue: File[]
  name: string
  label: string
  required?: boolean
  disabled?: boolean
  error?: string
  max?: number
}>(), { required: false, disabled: false, error: undefined, max: 10 })

const emit = defineEmits<{ 'update:modelValue': [files: File[]] }>()
const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const cameraOpen = ref(false)
const viewerOpen = ref(false)
const viewerIndex = ref(0)
const viewerEditing = ref(false)
const cameraEditing = ref(false)
const capturedFile = ref<File | null>(null)
const cameraError = ref('')
const previewUrls = new Map<string, string>()
let stream: MediaStream | null = null

const viewerFile = computed(() => props.modelValue[viewerIndex.value] ?? null)

watch(capturedFile, async file => {
  if (!file && cameraOpen.value && stream) {
    await nextTick()
    if (video.value) { video.value.srcObject = stream; await video.value.play().catch(() => { cameraError.value = 'No se pudo reanudar la cámara.' }) }
  }
})

watch(() => props.modelValue.map(fileKey).join('|'), () => {
  const retained = new Set(props.modelValue.map(fileKey))
  const capturedKey = capturedFile.value ? fileKey(capturedFile.value) : null
  for (const [key, url] of previewUrls) {
    if (retained.has(key) || key === capturedKey) continue
    URL.revokeObjectURL(url)
    previewUrls.delete(key)
  }
  if (viewerIndex.value >= props.modelValue.length) viewerIndex.value = Math.max(0, props.modelValue.length - 1)
})

onBeforeUnmount(() => {
  stopCamera()
  for (const url of previewUrls.values()) URL.revokeObjectURL(url)
  previewUrls.clear()
})

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function previewUrl(file: File): string {
  const key = fileKey(file)
  const existing = previewUrls.get(key)
  if (existing) return existing
  let created: string
  try { created = URL.createObjectURL(file) }
  catch { return "" }
  previewUrls.set(key, created)
  return created
}

function mergeFiles(files: File[]): File[] {
  const current = new Map(props.modelValue.map(file => [fileKey(file), file]))
  for (const file of files) if (current.size < props.max) current.set(fileKey(file), file)
  return [...current.values()]
}

function select(event: Event): void {
  const selected = Array.from((event.target as HTMLInputElement).files ?? [])
  if (selected.length) emit('update:modelValue', mergeFiles(selected))
  if (cameraInput.value) cameraInput.value.value = ''
  if (galleryInput.value) galleryInput.value.value = ''
}

function remove(index: number): void {
  const file = props.modelValue[index]
  if (file) {
    const key = fileKey(file)
    const url = previewUrls.get(key)
    if (url) URL.revokeObjectURL(url)
    previewUrls.delete(key)
  }
  emit('update:modelValue', props.modelValue.filter((_, current) => current !== index))
}

function openViewer(index: number): void {
  viewerEditing.value = false
  viewerIndex.value = index
  viewerOpen.value = true
}

async function openCamera(): Promise<void> {
  if (props.disabled || props.modelValue.length >= props.max) return
  cameraError.value = ''
  capturedFile.value = null
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraInput.value?.click()
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    cameraOpen.value = true
    await nextTick()
    if (video.value) {
      video.value.srcObject = stream
      await video.value.play()
    }
  } catch {
    stopCamera()
    cameraInput.value?.click()
  }
}

function capture(): void {
  if (!video.value || !video.value.videoWidth || !video.value.videoHeight) {
    cameraError.value = 'La cámara todavía no está lista.'
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.value.videoWidth
  canvas.height = video.value.videoHeight
  const context = canvas.getContext('2d')
  if (!context) {
    cameraError.value = 'No fue posible preparar la fotografía.'
    return
  }
  context.drawImage(video.value, 0, 0, canvas.width, canvas.height)
  canvas.toBlob(blob => {
    if (!blob) {
      cameraError.value = 'No fue posible capturar la fotografía.'
      return
    }
    capturedFile.value = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
    cameraError.value = ''
  }, 'image/jpeg', 0.9)
}

function retake(): void {
  cameraEditing.value = false
  if (capturedFile.value) {
    const key = fileKey(capturedFile.value)
    const url = previewUrls.get(key)
    if (url) URL.revokeObjectURL(url)
    previewUrls.delete(key)
  }
  capturedFile.value = null
}

function useCaptured(takeAnother: boolean): void {
  if (!capturedFile.value) return
  cameraEditing.value = false
  const next = mergeFiles([capturedFile.value])
  emit('update:modelValue', next)
  capturedFile.value = null
  if (takeAnother && next.length < props.max) return
  cameraOpen.value = false
  stopCamera()
}

function stopCamera(): void {
  cameraEditing.value = false
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
  if (video.value) video.value.srcObject = null
  capturedFile.value = null
  cameraError.value = ''
}

function saveViewerEdit(updated: File): void {
  emit('update:modelValue', props.modelValue.map((item, index) => index === viewerIndex.value ? updated : item))
  viewerEditing.value = false
}

function saveCapturedEdit(updated: File): void {
  capturedFile.value = updated
  cameraEditing.value = false
}

function closeCamera(): void {
  cameraOpen.value = false
  stopCamera()
}
</script>

<template>
  <BaseField v-slot="{ describedBy }" :name="name" :label="label" :required="required" :error="error" :disabled="disabled">
    <div class="evidence-picker" :class="{ 'evidence-picker--invalid': error }">
      <div class="evidence-picker__actions">
        <BaseButton size="compact" variant="secondary" :disabled="disabled || modelValue.length >= max" @click="openCamera">
          <Camera :size="18" aria-hidden="true" />Tomar foto
        </BaseButton>
        <BaseButton size="compact" variant="secondary" :disabled="disabled || modelValue.length >= max" @click="galleryInput?.click()">
          <Images :size="18" aria-hidden="true" />Subir foto
        </BaseButton>
      </div>
      <span>{{ modelValue.length ? `${modelValue.length} de ${max} seleccionadas` : 'JPG, PNG o WebP · hasta 10 MB cada una' }}</span>
      <input
        :id="name"
        ref="cameraInput"
        class="evidence-picker__input"
        type="file"
        :name="name"
        accept="image/*"
        capture="environment"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        @change="select"
      />
      <input
        :id="`${name}-gallery`"
        ref="galleryInput"
        class="evidence-picker__input"
        type="file"
        :name="`${name}-gallery`"
        accept="image/*"
        multiple
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        @change="select"
      />
      <ul v-if="modelValue.length" class="evidence-picker__previews">
        <li v-for="(file, index) in modelValue" :key="fileKey(file)">
          <button type="button" class="evidence-picker__preview" :aria-label="`Ver fotografía ${index + 1}`" @click="openViewer(index)">
            <img :src="previewUrl(file)" :alt="`Fotografía ${index + 1}`" />
          </button>
          <BaseIconButton label="Quitar evidencia" size="small" :disabled="disabled" @click="remove(index)"><X :size="17" /></BaseIconButton>
        </li>
      </ul>
    </div>
  </BaseField>

  <BaseDialog v-model="viewerOpen" title="Fotografía" size="compact">
    <TechnicianPhotoEditor v-if="viewerEditing && viewerFile" :file="viewerFile" @save="saveViewerEdit" @cancel="viewerEditing = false" />
    <template v-else>
      <img v-if="viewerFile" class="evidence-viewer" :src="previewUrl(viewerFile)" alt="Vista previa de la fotografía" />
      <div class="evidence-picker__viewer-actions">
        <BaseButton v-if="viewerFile && !disabled" size="compact" variant="secondary" @click="viewerEditing = true">Dibujar o recortar</BaseButton>
      </div>
    </template>
  </BaseDialog>

  <BaseDialog :model-value="cameraOpen" title="Tomar fotografía" description="Revisa la imagen antes de agregarla." :close-on-escape="false" @update:model-value="value => { if (!value) closeCamera() }">
    <TechnicianPhotoEditor v-if="capturedFile && cameraEditing" :file="capturedFile" @save="saveCapturedEdit" @cancel="cameraEditing = false" />
    <div v-else class="camera-capture">
      <video v-if="!capturedFile" ref="video" autoplay playsinline muted />
      <img v-else :src="previewUrl(capturedFile)" alt="Fotografía capturada" />
      <p v-if="cameraError" role="alert">{{ cameraError }}</p>
      <div class="camera-capture__actions">
        <BaseButton v-if="!capturedFile" @click="capture"><Camera :size="18" aria-hidden="true" />Capturar</BaseButton>
        <template v-else>
          <BaseButton variant="secondary" @click="retake"><RotateCcw :size="18" aria-hidden="true" />Repetir</BaseButton>
          <BaseButton variant="secondary" @click="cameraEditing = true">Dibujar o recortar</BaseButton>
          <BaseButton @click="useCaptured(false)">Usar foto</BaseButton>
          <BaseButton v-if="modelValue.length + 1 < max" variant="secondary" @click="useCaptured(true)">Usar y tomar otra</BaseButton>
        </template>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.evidence-picker { display:grid; gap:0.65rem; border:1px dashed var(--control-border); border-radius:var(--radius); padding:0.75rem; }
.evidence-picker--invalid { border-color:var(--danger); }
.evidence-picker > span { color:var(--text-secondary); font-size:0.8125rem; }
.evidence-picker__actions { display:flex; flex-wrap:wrap; gap:0.5rem; }
.evidence-picker__input { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
.evidence-picker__previews { display:grid; grid-template-columns:repeat(auto-fill,minmax(5.5rem,1fr)); gap:0.55rem; margin:0; padding:0; list-style:none; }
.evidence-picker__previews li { position:relative; min-width:0; aspect-ratio:1; border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; background:var(--surface-raised); }
.evidence-picker__preview { width:100%; height:100%; border:0; background:transparent; padding:0; cursor:zoom-in; }
.evidence-picker__preview img { display:block; width:100%; height:100%; object-fit:cover; }
.evidence-picker__previews :deep(.icon-button) { position:absolute; top:0.3rem; right:0.3rem; background:var(--surface); box-shadow:var(--shadow-sm); }
 .evidence-picker__viewer-actions { display:flex; justify-content:flex-end; padding-top:.5rem; }
.evidence-viewer { display:block; width:100%; max-height:70dvh; object-fit:contain; border-radius:var(--radius); background:#000; }
.camera-capture { display:grid; gap:0.85rem; }
.camera-capture video, .camera-capture img { display:block; width:100%; max-height:62dvh; aspect-ratio:3/4; object-fit:cover; border-radius:var(--radius); background:#000; }
.camera-capture p { margin:0; color:var(--danger); font-size:0.8125rem; }
.camera-capture__actions { display:grid; gap:0.55rem; }
@media (min-width:560px) { .camera-capture__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; } }
@media (max-width:420px) { .evidence-picker__actions > * { flex:1 1 8rem; } }
</style>
