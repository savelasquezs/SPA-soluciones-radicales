import { computed, ref } from 'vue'

import type { MasterFileUploadPhase } from '@/services/filesService'

export type FileSavePhase = 'idle' | MasterFileUploadPhase | 'saving'

export function useFileSaveProgress() {
  const phase = ref<FileSavePhase>('idle')
  const phaseLabel = computed<string | null>(() => {
    if (phase.value === 'compressing') return 'Comprimiendo…'
    if (phase.value === 'uploading') return 'Subiendo…'
    if (phase.value === 'saving') return 'Guardando…'
    return null
  })

  function onUploadPhase(next: MasterFileUploadPhase): void {
    phase.value = next
  }

  function markSaving(): void {
    phase.value = 'saving'
  }

  function reset(): void {
    phase.value = 'idle'
  }

  return { phase, phaseLabel, onUploadPhase, markSaving, reset }
}
