<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, ImageOff, RotateCcw, ZoomIn, ZoomOut } from 'lucide-vue-next'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseSpinner from '@/components/base/BaseSpinner.vue'
import type { EvidenceDisplayState } from '@/types/siteInsights'

const props = defineProps<{ open: boolean; index: number; total: number; title: string; caption: string; url: string | null; state: EvidenceDisplayState }>()
const emit = defineEmits<{ close: []; select: [index: number]; retry: []; imageError: [] }>()
const stage = ref<HTMLElement | null>(null)
const image = ref<HTMLImageElement | null>(null)
const loaded = ref(false)
const scale = ref(1)
const x = ref(0), y = ref(0)
const ready = computed(() => props.state === 'AVAILABLE' && loaded.value)
const pointers = new Map<number, { x: number; y: number }>()
let start = { x: 0, y: 0, panX: 0, panY: 0 }
let pinchDistance = 0, pinchScale = 1, gestureWasPinch = false
const transform = computed(() => `translate(${x.value}px,${y.value}px) scale(${scale.value})`)
function reset(): void { scale.value = 1; x.value = 0; y.value = 0; pointers.clear(); gestureWasPinch = false }
watch(() => [props.open,props.index,props.url], () => { reset(); loaded.value = false })
watch(() => props.index, async () => {
  await nextTick()
  if (props.open) stage.value?.focus({ preventScroll: true })
})
function clampPan(): void {
  const viewport = stage.value, picture = image.value
  if (!viewport || !picture) return
  const maxX = Math.max(0,(picture.offsetWidth*scale.value-viewport.clientWidth)/2)
  const maxY = Math.max(0,(picture.offsetHeight*scale.value-viewport.clientHeight)/2)
  x.value = Math.min(maxX,Math.max(-maxX,x.value))
  y.value = Math.min(maxY,Math.max(-maxY,y.value))
}
function zoom(value: number): void {
  if (!ready.value) return
  scale.value = Math.min(5,Math.max(1,value))
  if (scale.value === 1) { x.value = 0; y.value = 0 }
  clampPan()
}
function keydown(event: KeyboardEvent): void {
  if (!props.open || event.altKey || event.ctrlKey || event.metaKey) return
  const dialog = stage.value?.closest('dialog')
  const dialogs = document.querySelectorAll('dialog[open]')
  // A disabled navigation button may drop focus to the document. Capture there,
  // but only the topmost open viewer may consume gallery keys.
  if (!dialog || dialogs[dialogs.length - 1] !== dialog) return
  const key = event.key
  if (!['ArrowLeft','ArrowRight','+','=','-','0'].includes(key)) return
  event.preventDefault()
  event.stopPropagation()
  if (key === 'ArrowLeft' && props.index > 0) emit('select',props.index-1)
  if (key === 'ArrowRight' && props.index < props.total-1) emit('select',props.index+1)
  if (key === '+' || key === '=') zoom(scale.value+0.5)
  if (key === '-') zoom(scale.value-0.5)
  if (key === '0') reset()
}
onMounted(() => document.addEventListener('keydown',keydown,true))
onBeforeUnmount(() => document.removeEventListener('keydown',keydown,true))
function wheel(event: WheelEvent): void { if (ready.value) zoom(scale.value+(event.deltaY < 0 ? 0.25 : -0.25)) }
function distance(): number {
  const values = [...pointers.values()]
  return values.length >= 2 ? Math.hypot(values[0]!.x-values[1]!.x,values[0]!.y-values[1]!.y) : 0
}
function pointerDown(event: PointerEvent): void {
  if (!ready.value || event.button !== 0) return
  stage.value?.setPointerCapture?.(event.pointerId)
  pointers.set(event.pointerId,{ x:event.clientX,y:event.clientY })
  if (pointers.size === 1) { gestureWasPinch = false; start = { x:event.clientX,y:event.clientY,panX:x.value,panY:y.value } }
  else if (pointers.size === 2) { pinchDistance = distance(); pinchScale = scale.value; gestureWasPinch = true }
}
function pointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId,{ x:event.clientX,y:event.clientY })
  if (pointers.size >= 2 && pinchDistance > 0) zoom(pinchScale*distance()/pinchDistance)
  else if (scale.value > 1) { x.value = start.panX+event.clientX-start.x; y.value = start.panY+event.clientY-start.y; clampPan() }
}
function pointerUp(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return
  const dx = event.clientX-start.x, dy = event.clientY-start.y
  if (!gestureWasPinch && pointers.size === 1 && scale.value === 1 && Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.4) {
    const next = props.index+(dx<0 ? 1 : -1)
    if (next>=0 && next<props.total) emit('select',next)
  }
  pointers.delete(event.pointerId)
  const remaining = [...pointers.values()][0]
  if (remaining) start = { ...remaining,panX:x.value,panY:y.value }
}
</script>
<template>
  <BaseDialog class="evidence-dialog" :model-value="open" :title="title || 'Fotografías'" close-label="Cerrar visor" @update:model-value="!$event && emit('close')">
    <div class="evidence-viewer">
      <div ref="stage" class="evidence-viewer__stage" :class="{ 'evidence-viewer__stage--zoomed': scale > 1 }" tabindex="0" role="group" aria-label="Fotografía. Usa las flechas para navegar y más o menos para ampliar." @wheel.prevent="wheel" @dblclick="zoom(scale === 1 ? 2 : 1)" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointers.clear()">
        <img v-if="state === 'AVAILABLE' && url" ref="image" :key="url" :src="url" :alt="title" :style="{ transform, visibility: loaded ? 'visible' : 'hidden' }" draggable="false" referrerpolicy="no-referrer" @load="loaded = true" @error="emit('imageError')" />
        <div v-if="state === 'LOADING' || state === 'IDLE' || (state === 'AVAILABLE' && !loaded)" class="evidence-viewer__message" role="status"><BaseSpinner label="Cargando fotografía" /><span>Cargando fotografía…</span></div>
        <div v-else-if="state === 'MISSING' || state === 'EXPIRED'" class="evidence-viewer__message" role="status"><ImageOff :size="32" aria-hidden="true" /><strong>{{ state === 'EXPIRED' ? 'Foto vencida' : 'Foto no disponible' }}</strong><p>{{ state === 'EXPIRED' ? 'Terminó el plazo de conservación y el archivo ya no está disponible.' : 'El archivo ya no está disponible. Su referencia histórica se conserva.' }}</p></div>
        <div v-else-if="state === 'ERROR'" class="evidence-viewer__message" role="alert"><ImageOff :size="32" aria-hidden="true" /><strong>No pudimos cargar la foto</strong><p>Revisa la conexión y vuelve a intentarlo.</p><BaseButton size="compact" variant="secondary" @click="emit('retry')">Reintentar</BaseButton></div>
      </div>
      <footer class="evidence-viewer__footer">
        <div class="evidence-viewer__navigation"><BaseIconButton label="Foto anterior" :disabled="index <= 0" @click="emit('select',index-1)"><ChevronLeft :size="20" /></BaseIconButton><span aria-live="polite">{{ total ? index+1 : 0 }} / {{ total }}</span><BaseIconButton label="Foto siguiente" :disabled="index >= total-1" @click="emit('select',index+1)"><ChevronRight :size="20" /></BaseIconButton></div>
        <p class="evidence-viewer__caption">{{ caption }}</p>
        <div class="evidence-viewer__zoom"><BaseIconButton label="Reducir zoom" :disabled="!ready || scale <= 1" @click="zoom(scale-0.5)"><ZoomOut :size="19" /></BaseIconButton><span>{{ Math.round(scale*100) }} %</span><BaseIconButton label="Ampliar zoom" :disabled="!ready || scale >= 5" @click="zoom(scale+0.5)"><ZoomIn :size="19" /></BaseIconButton><BaseIconButton label="Ajustar fotografía" :disabled="!ready" @click="reset"><RotateCcw :size="18" /></BaseIconButton></div>
      </footer>
    </div>
  </BaseDialog>
</template>
<style scoped>
.evidence-dialog { width:calc(100vw - 2rem); height:calc(100dvh - 2rem); }
.evidence-dialog :deep(.base-dialog__panel) { height:100%; grid-template-rows:auto minmax(0,1fr); }
.evidence-dialog :deep(.base-dialog__header) { align-items:center; padding:0.65rem 1rem; border-bottom:1px solid var(--border); }
.evidence-dialog :deep(.base-dialog__header h2) { font-size:1rem; line-height:1.4; overflow-wrap:anywhere; }
.evidence-dialog :deep(.base-dialog__body) { display:flex; min-width:0; padding:0; overflow:hidden; }
.evidence-viewer { display:grid; grid-template-rows:minmax(0,1fr) auto; width:100%; min-width:0; min-height:0; }
.evidence-viewer__stage { position:relative; display:flex; align-items:center; justify-content:center; min-height:0; min-width:0; overflow:hidden; background:var(--bg); touch-action:none; user-select:none; }
.evidence-viewer__stage--zoomed { cursor:grab; }
.evidence-viewer__stage--zoomed:active { cursor:grabbing; }
.evidence-viewer__stage img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; transform-origin:center; }
.evidence-viewer__message { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.8rem; padding:1.5rem; text-align:center; color:var(--text-secondary); }
.evidence-viewer__message strong { color:var(--text); }
.evidence-viewer__message p { margin:0; max-width:30rem; font-size:0.875rem; }
.evidence-viewer__footer { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:0.6rem; padding:0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom)); border-top:1px solid var(--border); }
.evidence-viewer__navigation, .evidence-viewer__zoom { display:flex; align-items:center; gap:0.35rem; font-size:0.8125rem; font-variant-numeric:tabular-nums; }
.evidence-viewer__caption { margin:0; flex:1 1 12rem; min-width:0; overflow-wrap:anywhere; text-align:center; font-size:0.8125rem; color:var(--text-secondary); }
@media(max-width:600px) { .evidence-dialog { width:100vw; height:100dvh; max-height:100dvh; margin:0; border-radius:0; } .evidence-dialog :deep(.base-dialog__header) { padding-top:calc(0.65rem + env(safe-area-inset-top)); } .evidence-viewer__caption { flex-basis:100%; order:3; } .evidence-viewer__footer { gap:0.25rem; padding-inline:0.35rem; } .evidence-viewer__navigation, .evidence-viewer__zoom { gap:0; } }
</style>
