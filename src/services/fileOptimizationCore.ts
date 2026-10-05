import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import { MAX_OPTIMIZATION_SOURCE_BYTES } from '@/types/fileOptimization'
import type { OptimizationRequest } from '@/types/fileOptimization'

const MAX_IMAGE_PIXELS = 64_000_000
const MAX_RAW_PDF_PIXELS = 16_000_000
const MIN_PDF_IMAGE_BYTES = 16 * 1024
const PROFILES = {
  standard: { edge: 2560, quality: 0.8, minimumQuality: 0.72, targetBytes: 2 * 1024 * 1024, pdfQuality: 0.75 },
  plan: { edge: 4096, quality: 0.85, minimumQuality: 0.8, targetBytes: 5 * 1024 * 1024, pdfQuality: 0.82 },
} as const

type Profile = typeof PROFILES[keyof typeof PROFILES]

export async function optimizeInWorker({ file, profile }: OptimizationRequest): Promise<File> {
  if (!file.size || file.size > MAX_OPTIMIZATION_SOURCE_BYTES) throw new Error('El archivo original debe pesar entre 1 byte y 64 MB')
  const settings = PROFILES[profile]
  if (file.type === 'application/pdf') return optimizePdf(file, settings)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file
  return optimizeImage(file, settings)
}

function dimensions(width: number, height: number, edge: number): { width: number; height: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width * height > MAX_IMAGE_PIXELS) throw new Error('La resolución del archivo es demasiado grande para este navegador')
  const ratio = Math.min(1, edge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

async function encodeRaster(source: ImageBitmap | OffscreenCanvas, edge: number, type: string, quality: number): Promise<Blob> {
  const size = dimensions(source.width, source.height, edge)
  const canvas = new OffscreenCanvas(size.width, size.height)
  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No fue posible preparar la imagen')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, size.width, size.height)
    const blob = await canvas.convertToBlob({ type, quality })
    if (!blob.size || blob.type !== type) throw new Error('El navegador no admite el formato de compresión requerido')
    return blob
  } finally {
    canvas.width = 1
    canvas.height = 1
  }
}

async function optimizeImage(file: File, profile: Profile): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    dimensions(bitmap.width, bitmap.height, profile.edge)
    let best = await encodeRaster(bitmap, profile.edge, 'image/webp', profile.quality)
    // Bound both work and quality loss; never chase a percentage by destroying detail.
    for (let attempt = 1; best.size > profile.targetBytes && attempt <= 3; attempt += 1) {
      const edge = Math.round(profile.edge * Math.pow(0.9, attempt))
      const quality = Math.max(profile.minimumQuality, profile.quality - attempt * 0.04)
      const candidate = await encodeRaster(bitmap, edge, 'image/webp', quality)
      if (candidate.size < best.size) best = candidate
    }
    if (best.size >= file.size) return file
    return new File([best], file.name.trim().replace(/\.[^.]+$/, '.webp'), {
      type: best.type, lastModified: file.lastModified,
    })
  } finally {
    bitmap.close()
  }
}

function name(dict: PDFDict, key: string): string | undefined {
  return dict.lookup(PDFName.of(key))?.toString()
}

function number(dict: PDFDict, key: string): number | undefined {
  const value = dict.lookup(PDFName.of(key))
  return value instanceof PDFNumber ? value.asNumber() : undefined
}

function mustPreservePdf(document: PDFDocument): boolean {
  if (document.catalog.has(PDFName.of('Perms'))) return true
  // Signatures/XFA can also live in direct, nested dictionaries or arrays.
  // Visit those iteratively; indirect objects are already in the initial queue.
  const pending = document.context.enumerateIndirectObjects().map(([, object]) => object)
  const seen = new Set<object>()
  while (pending.length) {
    const object = pending.pop()!
    if (seen.has(object)) continue
    seen.add(object)
    if (object instanceof PDFArray) {
      pending.push(...object.asArray())
      continue
    }
    const dict = object instanceof PDFDict ? object : object instanceof PDFRawStream ? object.dict : undefined
    if (!dict) continue
    if (name(dict, 'Type') === '/Sig' || name(dict, 'FT') === '/Sig'
      || dict.has(PDFName.of('ByteRange')) || dict.has(PDFName.of('XFA'))) return true
    for (const [, value] of dict.entries()) pending.push(value)
  }
  return false
}

async function optimizePdf(file: File, profile: Profile): Promise<File> {
  // Replacing image object slots preserves page operators, text, vectors and links.
  // A signed PDF must remain byte-for-byte identical, not merely visually identical.
  const document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false, throwOnInvalidObject: true })
  if (mustPreservePdf(document)) return file
  let changed = false
  for (const [reference, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || name(object.dict, 'Subtype') !== '/Image') continue
    const replacement = await recompressPdfImage(object, profile)
    if (!replacement) continue
    document.context.assign(reference, replacement)
    changed = true
  }
  if (!changed) return file
  const bytes = await document.save({ useObjectStreams: true, updateFieldAppearances: false })
  if (bytes.byteLength >= file.size) return file
  const verified = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true })
  if (verified.getPageCount() !== document.getPageCount()) throw new Error('No fue posible verificar el PDF comprimido')
  return new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf', lastModified: file.lastModified })
}

async function recompressPdfImage(image: PDFRawStream, profile: Profile): Promise<PDFRawStream | null> {
  const dict = image.dict
  // Never flatten transparency, reinterpret colour spaces or alter image masks.
  if (['SMask', 'Mask', 'ImageMask', 'Decode', 'Alternates'].some((key) => dict.has(PDFName.of(key)))) return null
  const colorSpace = name(dict, 'ColorSpace')
  if (colorSpace !== '/DeviceRGB' && colorSpace !== '/DeviceGray') return null
  if (number(dict, 'BitsPerComponent') !== 8 || image.contents.byteLength < MIN_PDF_IMAGE_BYTES) return null
  const width = number(dict, 'Width') ?? 0
  const height = number(dict, 'Height') ?? 0
  dimensions(width, height, profile.edge)
  let filter = dict.lookup(PDFName.of('Filter'))
  if (filter instanceof PDFArray && filter.size() === 1) filter = filter.lookup(0)
  const parameters = dict.lookup(PDFName.of('DecodeParms'))
  if (parameters && !(parameters instanceof PDFDict)) return null
  if (parameters instanceof PDFDict && (number(parameters, 'Predictor') ?? 1) !== 1) return null

  let source: ImageBitmap | OffscreenCanvas
  if (filter?.toString() === '/DCTDecode') {
    // PDF image placement ignores EXIF orientation; do not rotate an embedded JPEG.
    if (parameters instanceof PDFDict && parameters.keys().length) return null
    source = await createImageBitmap(new Blob([new Uint8Array(image.contents)], { type: 'image/jpeg' }), { imageOrientation: 'none' })
    if (source.width !== width || source.height !== height) {
      source.close()
      return null
    }
  } else if (filter?.toString() === '/FlateDecode') {
    if (width * height > MAX_RAW_PDF_PIXELS || typeof DecompressionStream === 'undefined') return null
    const channels = colorSpace === '/DeviceRGB' ? 3 : 1
    const pixels = await inflateBounded(image.contents, width * height * channels)
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const input = pixel * channels
      const output = pixel * 4
      rgba[output] = pixels[input]!
      rgba[output + 1] = pixels[input + (channels === 3 ? 1 : 0)]!
      rgba[output + 2] = pixels[input + (channels === 3 ? 2 : 0)]!
      rgba[output + 3] = 255
    }
    source = new OffscreenCanvas(width, height)
    const context = source.getContext('2d')
    if (!context) throw new Error('No fue posible preparar una imagen del PDF')
    context.putImageData(new ImageData(rgba, width, height), 0, 0)
  } else {
    // Unsupported codecs are kept, never rasterize the document as a fallback.
    return null
  }

  try {
    const blob = await encodeRaster(source, profile.edge, 'image/jpeg', profile.pdfQuality)
    if (blob.size >= image.contents.byteLength) return null
    const size = dimensions(width, height, profile.edge)
    const replacement = dict.clone()
    replacement.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
    replacement.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
    replacement.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
    replacement.set(PDFName.of('Width'), PDFNumber.of(size.width))
    replacement.set(PDFName.of('Height'), PDFNumber.of(size.height))
    replacement.delete(PDFName.of('DecodeParms'))
    return PDFRawStream.of(replacement, new Uint8Array(await blob.arrayBuffer()))
  } finally {
    if ('close' in source) source.close()
    else { source.width = 1; source.height = 1 }
  }
}

async function inflateBounded(bytes: Uint8Array, expectedBytes: number): Promise<Uint8Array> {
  const reader = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const output = new Uint8Array(expectedBytes)
  let offset = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (offset + value.byteLength > expectedBytes) throw new Error('La imagen del PDF supera su resolución declarada')
      output.set(value, offset)
      offset += value.byteLength
    }
    if (offset !== expectedBytes) throw new Error('La imagen del PDF está incompleta')
    return output
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
