import { ApiError } from '../auth'

export const MAX_PDF_BYTES = 15 * 1024 * 1024

/** Prevent unbounded reads even when providers omit or forge Content-Length. */
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
