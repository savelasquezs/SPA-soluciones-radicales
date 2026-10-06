import { describe, expect, it } from 'vitest'

import { useFileSaveProgress } from '@/composables/useFileSaveProgress'

describe('progreso de guardado con archivos', () => {
  it('expone solo la fase actual y vuelve a reposo al terminar', () => {
    const progress = useFileSaveProgress()

    expect(progress.phase.value).toBe('idle')
    expect(progress.phaseLabel.value).toBeNull()

    progress.onUploadPhase('compressing')
    expect(progress.phaseLabel.value).toBe('Comprimiendo…')

    progress.onUploadPhase('uploading')
    expect(progress.phaseLabel.value).toBe('Subiendo…')

    progress.markSaving()
    expect(progress.phaseLabel.value).toBe('Guardando…')

    progress.reset()
    expect(progress.phase.value).toBe('idle')
    expect(progress.phaseLabel.value).toBeNull()
  })
})
