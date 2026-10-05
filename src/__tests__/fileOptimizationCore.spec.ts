// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { optimizeInWorker } from '@/services/fileOptimizationCore'

async function pdfFile(document: PDFDocument): Promise<File> {
  return new File([new Uint8Array(await document.save())], 'documento.pdf', { type: 'application/pdf' })
}

describe('preservación documental', () => {
  it('conserva intacto un PDF de texto sin imágenes que optimizar', async () => {
    const document = await PDFDocument.create()
    document.addPage().drawText('Texto seleccionable')
    const original = await pdfFile(document)
    expect(await optimizeInWorker({ file: original, profile: 'standard' })).toBe(original)
  })

  it('no reescribe un PDF que contiene una firma digital', async () => {
    const document = await PDFDocument.create()
    document.addPage()
    const signature = document.context.obj({ Type: 'Sig', ByteRange: [0, 100, 200, 300], Contents: PDFHexString.of('00') })
    document.catalog.set(PDFName.of('TestSignature'), document.context.register(signature))
    const original = await pdfFile(document)
    expect(await optimizeInWorker({ file: original, profile: 'standard' })).toBe(original)
  })

  it('conserva PDF certificados mediante Perms', async () => {
    const document = await PDFDocument.create()
    document.addPage()
    document.catalog.set(PDFName.of('Perms'), document.context.obj({}))
    const original = await pdfFile(document)
    expect(await optimizeInWorker({ file: original, profile: 'plan' })).toBe(original)
  })

  it('rechaza un PDF corrupto en lugar de devolverlo silenciosamente', async () => {
    const file = new File(['no es un PDF'], 'roto.pdf', { type: 'application/pdf' })
    await expect(optimizeInWorker({ file, profile: 'standard' })).rejects.toThrow()
  })
})
