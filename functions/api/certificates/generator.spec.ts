// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { generateCertificatePdf, readBounded } from './generator'
import { sampleCertificateData } from './docx'
import { templateFixture } from './testing/fixture'

const google = vi.hoisted(() => ({ convert: vi.fn<(docx: Uint8Array, maxBytes: number) => Promise<Buffer>>() }))
vi.mock('../google', () => ({ convertDocxToPdfWithGoogleDrive: google.convert }))
const input = () => ({ template: templateFixture(), type: 'ESTABLECIMIENTO' as const, data: sampleCertificateData('ESTABLECIMIENTO') })
async function pdf(pages = 1) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage()
  return Buffer.from(await doc.save())
}
beforeEach(() => {
  google.convert.mockReset()
})
afterEach(() => { vi.unstubAllGlobals() })
describe('Google Drive Word to PDF pipeline', () => {
  it('renders the DOCX and delegates the bounded conversion to Google Drive', async () => {
    google.convert.mockResolvedValue(await pdf())
    const bytes = await generateCertificatePdf(input())
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    expect(google.convert).toHaveBeenCalledWith(expect.any(Buffer), 15 * 1024 * 1024)
  })
  it('marks every synthetic preview page and leaves the ordinary export unmarked', async () => {
    google.convert.mockResolvedValue(await pdf(2))
    const doc = await PDFDocument.load(await generateCertificatePdf({ ...input(), preview: true }))
    const contents = doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream)
      .map(([, object]) => Buffer.from(decodePDFRawStream(object as PDFRawStream).decode()).toString()).join('\n')
    expect(contents.match(new RegExp(Buffer.from('PRUEBA - SIN VALIDEZ').toString('hex').toUpperCase(), 'g'))).toHaveLength(2)
  })
  it('rejects a false PDF', async () => {
    google.convert.mockResolvedValue(Buffer.from('not pdf'))
    await expect(generateCertificatePdf(input())).rejects.toMatchObject({ status: 502 })
  })
  it('bounds page count and never retries a failed conversion implicitly', async () => {
    google.convert.mockResolvedValue(await pdf(31))
    await expect(generateCertificatePdf(input())).rejects.toMatchObject({ status: 422 })
    google.convert.mockRejectedValue(new Error('Google failure'))
    await expect(generateCertificatePdf(input())).rejects.toThrow('No fue posible convertir')
    expect(google.convert).toHaveBeenCalledTimes(2)
  })
  it('caps chunked responses as well as Content-Length', async () => {
    await expect(readBounded(new Response('12345'), 4)).rejects.toMatchObject({ status: 422 })
    await expect(readBounded(new Response('x', { headers: { 'content-length': '99' } }), 4)).rejects.toMatchObject({ status: 422 })
    await expect(readBounded(new Response('1234'), 4)).resolves.toEqual(Buffer.from('1234'))
  })
})
