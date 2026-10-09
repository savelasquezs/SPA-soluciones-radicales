<script setup lang="ts">
import { ImageOff, LoaderCircle, ZoomIn } from 'lucide-vue-next'
import type { ReportEvidenceState } from '@/helpers/serviceReport'

defineProps<{
  path: string
  caption: string
  state: ReportEvidenceState
  url?: string | null
  signature?: boolean
}>()
const emit = defineEmits<{ open: [path: string]; failed: [path: string] }>()
</script>

<template>
  <figure class="report-evidence" :class="{ 'report-evidence--signature': signature }">
    <button v-if="state === 'AVAILABLE' && url" type="button" class="report-evidence__image" :aria-label="'Ampliar ' + caption" @click="emit('open', path)">
      <img :src="url" :alt="caption" decoding="async" referrerpolicy="no-referrer" @error="emit('failed', path)" />
      <ZoomIn :size="16" class="report-evidence__zoom" aria-hidden="true" />
    </button>
    <div v-else class="report-evidence__placeholder" role="status">
      <LoaderCircle v-if="state === 'IDLE' || state === 'LOADING'" :size="20" class="report-evidence__spinner" aria-hidden="true" />
      <ImageOff v-else :size="21" aria-hidden="true" />
      <span v-if="state === 'IDLE' || state === 'LOADING'">Cargando imagen…</span>
      <span v-else-if="state === 'ERROR'">Error al cargar. Reintenta desde la barra superior.</span>
      <span v-else>Imagen no disponible o vencida</span>
    </div>
    <figcaption>{{ caption }}</figcaption>
  </figure>
</template>
