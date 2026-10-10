<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { Crop, Pencil, RotateCcw, Save, X } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'

const props = defineProps<{ file: File }>()
const emit = defineEmits<{ save: [file: File]; cancel: [] }>()
type Point = { x: number; y: number }
type Selection = { from: Point; to: Point }

const surface = ref<HTMLCanvasElement | null>(null)
const mode = ref<'DRAW' | 'CROP'>('DRAW')
const busy = ref(true)
const error = ref('')
const strokes = ref<Point[][]>([])
const selected = ref<Selection | null>(null)
let source: HTMLCanvasElement | null = null
let active = false

function render(): void {
  const canvas = surface.value
  if (!canvas || !source) return
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width
    canvas.height = source.height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0)
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.strokeStyle = '#fae15b'
  context.lineWidth = Math.max(4, Math.round(source.width / 250))
  for (const stroke of strokes.value) {
    if (!stroke.length) continue
    context.beginPath()
    context.moveTo(stroke[0]!.x, stroke[0]!.y)
    if (stroke.length === 1) context.lineTo(stroke[0]!.x + 0.2, stroke[0]!.y + 0.2)
    else for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
  if (selected.value) {
    const { from, to } = selected.value
    context.save()
    context.strokeStyle = '#ffffff'
    context.lineWidth = Math.max(2, source.width / 450)
    context.setLineDash([12, 8])
    context.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y)
    context.restore()
  }
}

async function load(): Promise<void> {
  error.value = ''
  busy.value = true
  let url = ''
  try {
    url = URL.createObjectURL(props.file)
    const image = new Image()
    image.src = url
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('No se pudo abrir esta fotografía.')) })
    const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight))
    source = document.createElement('canvas')
    source.width = Math.max(1, Math.round(image.naturalWidth * scale))
    source.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = source.getContext('2d')
    if (!context) throw new Error('No se pudo preparar la imagen para editar.')
    context.drawImage(image, 0, 0, source.width, source.height)
    await nextTick()
    render()
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No se pudo abrir la fotografía.'
  } finally {
    if (url) URL.revokeObjectURL(url)
    busy.value = false
  }
}

function point(event: PointerEvent): Point {
  const canvas = surface.value!, bounds = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) / bounds.width * canvas.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) / bounds.height * canvas.height)),
  }
}
function start(event: PointerEvent): void {
  if (!source || !surface.value || busy.value) return
  active = true
  surface.value.setPointerCapture(event.pointerId)
  const origin = point(event)
  if (mode.value === 'DRAW') strokes.value = [...strokes.value, [origin]]
  else selected.value = { from: origin, to: origin }
  render()
}
function move(event: PointerEvent): void {
  if (!active) return
  if (mode.value === 'DRAW') strokes.value[strokes.value.length - 1]?.push(point(event))
  else if (selected.value) selected.value.to = point(event)
  render()
}
function stop(): void { active = false }
function undo(): void {
  if (selected.value) selected.value = null
  else strokes.value = strokes.value.slice(0, -1)
  render()
}
function applyCrop(): void {
  if (!source || !selected.value || !surface.value) return
  const { from, to } = selected.value
  const left = Math.round(Math.min(from.x, to.x)), top = Math.round(Math.min(from.y, to.y))
  const width = Math.round(Math.abs(from.x - to.x)), height = Math.round(Math.abs(from.y - to.y))
  if (width < 20 || height < 20) { error.value = 'Selecciona un área más grande para recortar.'; return }
  const cropped = document.createElement('canvas')
  cropped.width = width
  cropped.height = height
  selected.value = null
  render()
  cropped.getContext('2d')?.drawImage(surface.value, left, top, width, height, 0, 0, width, height)
  source = cropped
  strokes.value = []
  mode.value = 'DRAW'
  error.value = ''
  render()
}
function save(): void {
  if (!source || !surface.value || busy.value) return
  busy.value = true
  selected.value = null
  render()
  surface.value.toBlob(blob => {
    busy.value = false
    if (!blob) { error.value = 'No se pudo guardar la fotografía editada.'; return }
    emit('save', new File([blob], `evidencia-editada-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
  }, 'image/jpeg', 0.9)
}
function reset(): void {
  strokes.value = []
  selected.value = null
  mode.value = 'DRAW'
  void load()
}
onMounted(() => { void load() })
</script>

<template>
  <div class="photo-editor">
    <div class="photo-editor__tools" role="group" aria-label="Herramientas de edición">
      <BaseButton size="compact" :variant="mode === 'DRAW' ? 'primary' : 'secondary'" :disabled="busy" @click="mode = 'DRAW'; selected = null; render()"><Pencil :size="16" />Dibujar</BaseButton>
      <BaseButton size="compact" :variant="mode === 'CROP' ? 'primary' : 'secondary'" :disabled="busy" @click="mode = 'CROP'"><Crop :size="16" />Recortar</BaseButton>
      <BaseButton size="compact" variant="ghost" :disabled="busy || (!strokes.length && !selected)" @click="undo">Deshacer</BaseButton>
    </div>
    <p class="photo-editor__hint">{{ mode === 'DRAW' ? 'Dibuja sobre la fotografía para señalar detalles.' : 'Arrastra para seleccionar la zona que deseas conservar.' }}</p>
    <div class="photo-editor__stage">
      <canvas ref="surface" aria-label="Fotografía para editar" @pointerdown="start" @pointermove="move" @pointerup="stop" @pointercancel="stop" />
    </div>
    <p v-if="error" role="alert" class="photo-editor__error">{{ error }}</p>
    <div class="photo-editor__actions">
      <BaseButton v-if="selected" size="compact" variant="secondary" @click="applyCrop"><Crop :size="16" />Aplicar recorte</BaseButton>
      <BaseButton size="compact" variant="ghost" :disabled="busy" @click="reset"><RotateCcw :size="16" />Restablecer</BaseButton>
      <BaseButton size="compact" variant="secondary" @click="emit('cancel')"><X :size="16" />Cancelar</BaseButton>
      <BaseButton size="compact" :loading="busy" :disabled="busy || Boolean(error)" @click="save"><Save :size="16" />Guardar foto</BaseButton>
    </div>
  </div>
</template>

<style scoped>
.photo-editor { display:grid; gap:.55rem; min-width:0; }
.photo-editor__tools,.photo-editor__actions { display:flex; flex-wrap:wrap; gap:.35rem; }
.photo-editor__hint { margin:0; color:var(--text-secondary); font-size:.77rem; }
.photo-editor__stage { display:flex; align-items:center; justify-content:center; min-height:11rem; border-radius:var(--radius); background:#111; overflow:hidden; }
.photo-editor__stage canvas { display:block; max-width:100%; max-height:54dvh; width:auto; height:auto; touch-action:none; cursor:crosshair; }
.photo-editor__error { margin:0; color:var(--danger); font-size:.78rem; }
.photo-editor__actions { justify-content:flex-end; }
@media(max-width:420px) { .photo-editor__actions .base-button { flex:1 1 auto; } }
</style>
