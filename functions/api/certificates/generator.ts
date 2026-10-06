import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { ApiError } from '../auth'
import { renderCertificateDocx } from './docx'
import type { CertificateData, CertificateType } from '../../../src/types/certificates'

export const MAX_PDF_BYTES = 15 * 1024 * 1024

/** Also bounds responses without Content-Length. Never buffers unbounded remote content. */
export async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw new ApiError(422, 'El documento supera el tamaño permitido')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new ApiError(502, 'El proveedor devolvió un documento vacío')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxBytes) {
        await reader.cancel()
        throw new ApiError(422, 'El documento supera el tamaño permitido')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  if (!length) throw new ApiError(502, 'El proveedor devolvió un documento vacío')
  return Buffer.concat(chunks)
}

/** One pipeline for synthetic previews and persisted certificates. No browser converter. */
export async function generateCertificatePdf(input: {
  template: Uint8Array; type: CertificateType; data: CertificateData; preview?: boolean
}): Promise<Buffer> {
  const word = renderCertificateDocx(input.template, input.type, input.data)
  try {
    const { convertDocxToPdfWithGoogleDrive } = await import('../google')
    const bytes = await convertDocxToPdfWithGoogleDrive(word, MAX_PDF_BYTES)
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new ApiError(502, 'El conversor no devolvió un PDF válido')
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    if (!document.getPageCount() || document.getPageCount() > 30) throw new ApiError(422, 'El certificado debe tener entre 1 y 30 páginas')
    if (input.preview) {
      const font = await document.embedFont(StandardFonts.HelveticaBold)
      for (const page of document.getPages()) {
        const text = 'PRUEBA - SIN VALIDEZ'
        const size = Math.min(16, page.getWidth() / 24)
        page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: 28, color: rgb(1, 1, 1) })
        page.drawText(text, { x: (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2, y: 8, size, font, color: rgb(0.6, 0.05, 0.05) })
      }
    }
    const compressed = Buffer.from(await document.save({ useObjectStreams: true }))
    return input.preview || compressed.length < bytes.length ? compressed : bytes
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'No fue posible convertir el Word a PDF. Conserva el archivo e inténtalo de nuevo.')
  }
}
