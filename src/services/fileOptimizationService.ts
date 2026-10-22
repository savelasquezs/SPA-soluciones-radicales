import type { MasterFileKind } from '@/services/filesService'
import { MAX_CERTIFICATE_BYTES, MAX_OPTIMIZATION_SOURCE_BYTES, MAX_SERVICE_PHOTO_BYTES } from '@/types/fileOptimization'
import type { OptimizationRequest, OptimizationResponse } from '@/types/fileOptimization'

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}
const OPTIMIZATION_TIMEOUT_MS = 120_000


/**
 * Mobile browsers can display JPEG/PNG/WebP while their Worker cannot decode
 * or encode the same file (ImageBitmap / OffscreenCanvas). Retry through the
 * normal page Canvas; never bypass decoding, MIME validation or the R2 limit.
 */
async function optimizeServicePhotoInPage(file: File): Promise<File> {
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = file.type === 'image/jpeg' && signature.length >= 3
    && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
  const png = file.type === 'image/png' && signature.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)
  const webp = file.type === 'image/webp' && signature.length >= 12
    && String.fromCharCode(...signature.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...signature.slice(8, 12)) === 'WEBP'
  if (!jpeg && !png && !webp) {
    throw new Error('El archivo seleccionado no contiene una fotografía JPG, PNG o WebP válida.')
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Este navegador no pudo preparar la fotografía. Intenta desde otro navegador.')
  }

  let objectUrl = ''
  try {
    objectUrl = URL.createObjectURL(file)
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('No fue posible abrir la fotografía elegida.'))
      image.src = objectUrl
    })
    const { naturalWidth: width, naturalHeight: height } = source
    if (!width || !height || width * height > 64_000_000) {
      throw new Error('La resolución de la fotografía excede lo que permite este navegador.')
    }
    const ratio = Math.min(1, 2560 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No fue posible procesar la fotografía en este dispositivo.')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      const encode = (type: string) => new Promise<Blob | null>((resolve, reject) => {
        try { canvas.toBlob(resolve, type, 0.8) }
        catch (error) { reject(error) }
      })
      // WebP preserves PNG transparency; JPEG is the compatible alternative.
      let compressed = await encode('image/webp')
      if (!compressed?.size || compressed.type !== 'image/webp') {
        const alternative = jpeg ? 'image/jpeg' : 'image/png'
        compressed = await encode(alternative)
        if (!compressed?.size || compressed.type !== alternative) {
          throw new Error('No fue posible procesar la fotografía en este dispositivo.')
        }
      }
      if (compressed.size >= file.size) return file // Same rule as the Worker.
      const extension = compressed.type === 'image/webp' ? 'webp' : compressed.type === 'image/png' ? 'png' : 'jpg'
      return new File([compressed], file.name.replace(/\.[^.]+$/, '.' + extension), {
        type: compressed.type, lastModified: file.lastModified,
      })
    } finally {
      canvas.width = 1
      canvas.height = 1
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/** Returns the file to upload. No upload, metrics, persistence or UI side effects. */
export async function optimizeFileForStorage(kind: MasterFileKind | 'USER_AVATAR' | 'SERVICE_PHOTO', original: File): Promise<File> {
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

  let optimized: File
  try {
    optimized = await new Promise<File>((resolve, reject) => {
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
  } catch (error) {
    if (kind !== 'SERVICE_PHOTO') throw error
    // A validated native image conversion, never a blind upload after failure.
    optimized = await optimizeServicePhotoInPage(file)
  }

  if (kind === 'USER_CERTIFICATE' && optimized.size > MAX_CERTIFICATE_BYTES) {
    throw new Error('El certificado no puede superar 10 MB después de comprimirlo')
  }
  if (kind === 'SERVICE_PHOTO' && optimized.size > MAX_SERVICE_PHOTO_BYTES) {
    throw new Error('La fotografía no puede superar 10 MB después de comprimirla')
  }
  return optimized
}
