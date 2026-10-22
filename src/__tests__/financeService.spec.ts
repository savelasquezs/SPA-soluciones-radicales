import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
  optimize: vi.fn<(kind: string, file: File) => Promise<File>>(),
}))
vi.mock('@/services/apiService', () => ({ apiRequest: mocks.api }))
vi.mock('@/services/fileOptimizationService', () => ({ optimizeFileForStorage: mocks.optimize }))

import { uploadPaymentProof } from '@/services/financeService'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response))
})
afterEach(() => vi.unstubAllGlobals())

const paymentId = '00000000-0000-4000-8000-000000000007'
const upload = {
  url: 'https://r2.example.test/presigned',
  storagePath: 'payments/' + paymentId + '/proof/comprobante.webp',
  contentType: 'image/webp',
}

describe('subida privada de comprobantes', () => {
  it('reutiliza la compresión y firma/sube/valida exactamente el archivo resultante', async () => {
    const file = new File(['contenido de la foto'], 'comprobante.jpg', { type: 'image/jpeg' })
    const compressed = new File(['webp'], 'comprobante.webp', { type: 'image/webp' })
    mocks.optimize.mockResolvedValue(compressed)
    mocks.api.mockResolvedValueOnce(upload).mockResolvedValueOnce({ ok: true })

    await uploadPaymentProof(paymentId, file)

    expect(mocks.optimize).toHaveBeenCalledExactlyOnceWith('SERVICE_PHOTO', file)
    expect(mocks.api).toHaveBeenNthCalledWith(1, 'api/finance/payments/' + paymentId + '/proof/upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName: compressed.name, contentType: compressed.type, size: compressed.size }),
    })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(upload.url, {
      method: 'PUT', headers: { 'Content-Type': upload.contentType }, body: compressed,
    })
    expect(mocks.api).toHaveBeenNthCalledWith(2, 'api/finance/payments/' + paymentId + '/proof', {
      method: 'POST', body: JSON.stringify({ storagePath: upload.storagePath }),
    })
  })

  it('no solicita permisos ni sube nada si la imagen no se puede procesar', async () => {
    mocks.optimize.mockRejectedValue(new Error('La fotografía no es válida'))
    await expect(uploadPaymentProof(paymentId, new File(['x'], 'invalida.jpg')))
      .rejects.toThrow('La fotografía no es válida')
    expect(mocks.api).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('no marca el comprobante como adjunto cuando falla la subida real a R2', async () => {
    mocks.optimize.mockResolvedValue(new File(['webp'], 'comprobante.webp', { type: 'image/webp' }))
    mocks.api.mockResolvedValueOnce(upload)
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)

    await expect(uploadPaymentProof(paymentId, new File(['foto'], 'comprobante.jpg')))
      .rejects.toThrow('No fue posible subir el comprobante')
    expect(mocks.api).toHaveBeenCalledTimes(1)
  })

  it('conserva la posibilidad de reintentar si R2 responde pero no se confirma la referencia', async () => {
    const photo = new File(['webp'], 'comprobante.webp', { type: 'image/webp' })
    mocks.optimize.mockResolvedValue(photo)
    mocks.api.mockResolvedValueOnce(upload).mockRejectedValueOnce(new Error('Revisa tu conexión'))
    await expect(uploadPaymentProof(paymentId, photo)).rejects.toThrow('Revisa tu conexión')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(mocks.api).toHaveBeenCalledTimes(2)
  })
})
