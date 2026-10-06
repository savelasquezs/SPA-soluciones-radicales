// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { generateCertificatePdf, isConverterReady, readBounded } from './generator'
import { sampleCertificateData } from './docx'
import { templateFixture } from './testing/fixture'

const remote = vi.fn<typeof fetch>()
const input = () => ({ template: templateFixture(), type: 'ESTABLECIMIENTO' as const, data: sampleCertificateData('ESTABLECIMIENTO') })
async function pdf(pages = 1) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage()
  return Buffer.from(await doc.save())
}
beforeEach(() => {
  vi.stubEnv('CERTIFICATE_CONVERTER_URL', 'https://private-converter.example.test/')
  vi.stubEnv('CERTIFICATE_CONVERTER_TOKEN', 'test-only-token')
  vi.stubGlobal('fetch', remote); remote.mockReset()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('private Word to PDF pipeline', () => {
  it('uses multipart native compression, timeout and secret only on the backend', async () => {
    remote.mockResolvedValue(new Response(await pdf(), { headers: { 'content-type': 'application/pdf' } }))
    const bytes = await generateCertificatePdf(input())
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    const [url, options] = remote.mock.calls[0]!
    expect(String(url)).toBe('https://private-converter.example.test/forms/libreoffice/convert')
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer test-only-token' } })
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    const form = options?.body as FormData
    expect(form.get('files')).toBeInstanceOf(Blob)
    expect(form.get('maxImageResolution')).toBe('150')
    expect(form.get('losslessImageCompression')).toBe('false')
    expect(form.get('exportFormFields')).toBe('false')
  })
  it('marks every synthetic preview page and leaves the ordinary export unmarked', async () => {
    remote.mockImplementation(async () => new Response(await pdf(2), { headers: { 'content-type': 'application/pdf' } }))
    const doc = await PDFDocument.load(await generateCertificatePdf({ ...input(), preview: true }))
    const contents = doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream)
      .map(([, object]) => Buffer.from(decodePDFRawStream(object as PDFRawStream).decode()).toString()).join('\n')
    expect(contents.match(new RegExp(Buffer.from('PRUEBA - SIN VALIDEZ').toString('hex').toUpperCase(), 'g'))).toHaveLength(2)
  })
  it.each(['', 'http://example.test', 'https://u:p@example.test', 'https://example.test?x=1'])('rejects missing or insecure configuration %s', async (url) => {
    vi.stubEnv('CERTIFICATE_CONVERTER_URL', url)
    expect(isConverterReady()).toBe(false)
    await expect(generateCertificatePdf(input())).rejects.toMatchObject({ status: 503, code: 'CONVERTER_NOT_CONFIGURED' })
    expect(remote).not.toHaveBeenCalled()
  })
  it.each([['text/html', '<html>error</html>'], ['application/pdf', 'not pdf']])('rejects a false PDF %s', async (mime, body) => {
    remote.mockResolvedValue(new Response(body, { headers: { 'content-type': mime } }))
    await expect(generateCertificatePdf(input())).rejects.toMatchObject({ status: 502 })
  })
  it('bounds page count and never retries a failed converter implicitly', async () => {
    remote.mockResolvedValue(new Response(await pdf(31), { headers: { 'content-type': 'application/pdf' } }))
    await expect(generateCertificatePdf(input())).rejects.toMatchObject({ status: 422 })
    remote.mockRejectedValue(new Error('private provider failure'))
    await expect(generateCertificatePdf(input())).rejects.toThrow('No fue posible convertir')
    expect(remote).toHaveBeenCalledTimes(2)
  })
  it('caps chunked responses as well as Content-Length', async () => {
    await expect(readBounded(new Response('12345'), 4)).rejects.toMatchObject({ status: 422 })
    await expect(readBounded(new Response('x', { headers: { 'content-length': '99' } }), 4)).rejects.toMatchObject({ status: 422 })
    await expect(readBounded(new Response('1234'), 4)).resolves.toEqual(Buffer.from('1234'))
  })
})
