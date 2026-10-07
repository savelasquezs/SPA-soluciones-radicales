<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ cancel: []; accept: [file: File] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const drawing = ref(false)
const signed = ref(false)

function context(): CanvasRenderingContext2D | null {
  return canvas.value?.getContext('2d') ?? null
}

function initialize(): void {
  const element = canvas.value
  if (!element) return
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const rect = element.getBoundingClientRect()
  element.width = Math.max(1, Math.round(rect.width * ratio))
  element.height = Math.max(1, Math.round(rect.height * ratio))
  const value = context()
  if (!value) return
  value.scale(ratio, ratio)
  value.lineWidth = 3
  value.lineCap = 'round'
  value.lineJoin = 'round'
  value.strokeStyle = '#111827'
}

function point(event: PointerEvent): [number, number] {
  const rect = canvas.value!.getBoundingClientRect()
  return [event.clientX - rect.left, event.clientY - rect.top]
}

function start(event: PointerEvent): void {
  const value = context()
  if (!value || !canvas.value) return
  drawing.value = true
  signed.value = true
  canvas.value.setPointerCapture(event.pointerId)
  const [x, y] = point(event)
  value.beginPath()
  value.moveTo(x, y)
}

function move(event: PointerEvent): void {
  if (!drawing.value) return
  const value = context()
  if (!value) return
  const [x, y] = point(event)
  value.lineTo(x, y)
  value.stroke()
}

function stop(): void {
  drawing.value = false
}

function clear(): void {
  const element = canvas.value
  const value = context()
  if (!element || !value) return
  value.clearRect(0, 0, element.width, element.height)
  signed.value = false
}

function accept(): void {
  if (!signed.value || !canvas.value) return
  canvas.value.toBlob(blob => {
    if (blob) emit('accept', new File([blob], 'firma.png', { type: 'image/png', lastModified: Date.now() }))
  }, 'image/png')
}

onMounted(() => {
  void nextTick(() => {
    initialize()
    canvas.value?.focus()
  })
})
</script>

<template>
  <Teleport to="body">
    <section class="signature-pad" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc="emit('cancel')">
      <header><h2>{{ title }}</h2><p>Firma dentro del recuadro.</p></header>
      <canvas ref="canvas" tabindex="0" aria-label="Lienzo para firma" @pointerdown="start" @pointermove="move" @pointerup="stop" @pointercancel="stop" />
      <footer>
        <BaseButton variant="secondary" @click="clear">Borrar</BaseButton>
        <BaseButton variant="ghost" @click="emit('cancel')">Cancelar</BaseButton>
        <BaseButton :disabled="!signed" @click="accept">Aceptar</BaseButton>
      </footer>
    </section>
  </Teleport>
</template>

<style scoped>
.signature-pad { position:fixed; inset:0; z-index:1000; display:grid; grid-template-rows:auto 1fr auto; gap:1rem; background:var(--surface); padding:max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); color:var(--text); }
header h2, header p { margin:0; }
header p { margin-top:.25rem; color:var(--text-muted); }
canvas { width:100%; height:100%; min-height:16rem; border:2px solid var(--border-strong); border-radius:var(--radius-lg); background:#fff; touch-action:none; }
footer { display:grid; grid-template-columns:repeat(3,1fr); gap:.75rem; }
@media (max-width:480px) { footer { grid-template-columns:1fr 1fr; } footer :last-child { grid-column:1 / -1; } }
</style>
