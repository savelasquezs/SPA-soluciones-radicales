import type { MasterFileKind } from '@/services/filesService'
import { MAX_CERTIFICATE_BYTES, MAX_OPTIMIZATION_SOURCE_BYTES } from '@/types/fileOptimization'
import type { OptimizationRequest, OptimizationResponse } from '@/types/fileOptimization'

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}
const OPTIMIZATION_TIMEOUT_MS = 120_000

/** Returns the file to upload. No upload, metrics, persistence or UI side effects. */
export async function optimizeFileForStorage(kind: MasterFileKind, original: File): Promise<File> {
  const extension = original.name.trim().split('.').pop()?.toLowerCase() ?? ''
  const contentType = MIME_BY_EXTENSION[extension]
  if (!contentType) return original
  if (original.size === 0) throw new Error('El archivo está vacío')
  if (original.size > MAX_OPTIMIZATION_SOURCE_BYTES) {
    throw new Error('El archivo original no puede superar 64 MB')
  }
  if (original.type && original.type !== 'application/octet-stream' && original.type !== contentType) {
    throw new Error('El tipo de archivo no corresponde a su extensión')
  }
  if (typeof Worker === 'undefined') {
    throw new Error('Este navegador no permite comprimir archivos. Usa un navegador actualizado.')
  }
  const file = original.type === contentType ? original : new File([original], original.name, {
    type: contentType, lastModified: original.lastModified,
  })

  const optimized = await new Promise<File>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/fileOptimization.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (result?: File, error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      worker.terminate()
      if (error) reject(error)
      else if (result) resolve(result.size < file.size ? result : file)
      else reject(new Error('No fue posible comprimir el archivo'))
    }
    const timeout = setTimeout(() => finish(undefined,
      new Error('La compresión tardó demasiado. Prueba con un archivo de menor tamaño.')), OPTIMIZATION_TIMEOUT_MS)
    worker.onmessage = ({ data }: MessageEvent<OptimizationResponse>) => {
      if (!data.ok) finish(undefined, new Error(data.error))
      else if (!data.file || data.file.size === 0) finish(undefined, new Error('La compresión produjo un archivo vacío'))
      else finish(data.file)
    }
    worker.onerror = () => finish(undefined, new Error('No fue posible comprimir el archivo. No se ha subido a R2.'))
    worker.onmessageerror = () => finish(undefined, new Error('No fue posible recibir el archivo comprimido'))
    try {
      worker.postMessage({ file, profile: kind === 'SITE_PLAN' ? 'plan' : 'standard' } satisfies OptimizationRequest)
    } catch {
      finish(undefined, new Error('No fue posible iniciar la compresión del archivo'))
    }
  })

  if (kind === 'USER_CERTIFICATE' && optimized.size > MAX_CERTIFICATE_BYTES) {
    throw new Error('El certificado no puede superar 10 MB después de comprimirlo')
  }
  return optimized
}
