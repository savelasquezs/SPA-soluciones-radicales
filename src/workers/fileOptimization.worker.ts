import { optimizeInWorker } from '@/services/fileOptimizationCore'
import type { OptimizationRequest, OptimizationResponse } from '@/types/fileOptimization'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<OptimizationRequest>) => void) | null
  postMessage: (message: OptimizationResponse) => void
}

scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ ok: true, file: await optimizeInWorker(data) })
  } catch {
    scope.postMessage({
      ok: false,
      error: data.file.type.startsWith('image/')
        ? 'El navegador no pudo comprimir esta fotografía. No se ha subido a R2.'
        : 'No fue posible comprimir el archivo. Comprueba que sea válido y no esté protegido con contraseña. No se ha subido a R2.',
    })
  }
}
