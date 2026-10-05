// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { optimizeInWorker } from '@/services/fileOptimizationCore'

describe('protecciones PDF en diccionarios directos', () => {
  it.each(['signature', 'xfa'] as const)('no intenta comprimir imágenes cuando %s está anidado', async (kind) => {
    const document = await PDFDocument.create()
    document.addPage()
    document.catalog.set(PDFName.of('AcroForm'), document.context.obj(kind === 'signature'
      ? { Fields: [{ FT: 'Sig' }] }
      : { XFA: [] }))
    // A decoder must never be called for protected documents, even when images exist.
    document.context.register(PDFRawStream.of(document.context.obj({
      Type: 'XObject', Subtype: 'Image', Filter: 'DCTDecode',
      Width: 1000, Height: 1000, BitsPerComponent: 8, ColorSpace: 'DeviceRGB',
    }), new Uint8Array(20_000)))
    const bytes = await document.save({ updateFieldAppearances: false })
    const file = new File([new Uint8Array(bytes)], 'protegido.pdf', { type: 'application/pdf' })
    expect(await optimizeInWorker({ file, profile: 'standard' })).toBe(file)
  })
})
