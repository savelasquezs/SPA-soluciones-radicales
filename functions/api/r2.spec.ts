import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message)
    }
  },
}))

import { assertAreaNoAccessStoragePath, assertDeviceReviewStoragePath, assertFindingEvidenceStoragePath, createAreaNoAccessUploadUrl, createDeviceReviewUploadUrl, createFindingEvidenceUploadUrl, createMasterReadUrl, createMasterUploadUrl } from './r2'

const original = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_MASTER_FILES,
  serviceBucket: process.env.R2_BUCKET_SERVICE_MEDIA,
}

describe('Cloudflare R2 presigned URLs', () => {
  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef'
    process.env.R2_ACCESS_KEY_ID = 'access-key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret-key'
    process.env.R2_BUCKET_MASTER_FILES = 'sr-master-files'
    process.env.R2_BUCKET_SERVICE_MEDIA = 'sr-service-media'
  })

  afterEach(() => {
    process.env.R2_ACCOUNT_ID = original.accountId
    process.env.R2_ACCESS_KEY_ID = original.accessKeyId
    process.env.R2_SECRET_ACCESS_KEY = original.secretAccessKey
    process.env.R2_BUCKET_MASTER_FILES = original.bucket
    process.env.R2_BUCKET_SERVICE_MEDIA = original.serviceBucket
  })

  it('firma PUT limitado a content-type y a una ruta generada por servidor', () => {
    const signed = createMasterUploadUrl({
      kind: 'CLIENT_ESTABLISHMENT_TEMPLATE',
      fileName: 'Plantilla ACME.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 2048,
    })
    const url = new URL(signed.url)

    expect(signed.storagePath).toMatch(/^clients\/establishment-templates\/[0-9a-f-]+-Plantilla-ACME\.docx$/)
    expect(url.origin).toBe('https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com')
    expect(url.pathname).toContain('/sr-master-files/clients/establishment-templates/')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/auto/s3/aws4_request')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(signed.expiresIn).toBe(300)
  })

  it('firma GET solo para rutas maestras administradas', () => {
    const url = new URL(createMasterReadUrl('sites/plans/abc-plano.pdf'))
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rechaza extensiones y rutas fuera del almacenamiento maestro', () => {
    expect(() => createMasterUploadUrl({
      kind: 'USER_CERTIFICATE',
      fileName: 'malware.exe',
      contentType: 'application/octet-stream',
      size: 10,
    })).toThrow('El tipo de archivo no está permitido')
    expect(() => createMasterReadUrl('otra-carpeta/archivo.pdf')).toThrow('La ruta del archivo privado no es válida')
  })

  it('firma fotografías del Área únicamente en el bucket y prefijo del Servicio', () => {
    const serviceId = '10000000-0000-4000-8000-000000000001'
    const areaId = '10000000-0000-4000-8000-000000000002'
    const signed = createAreaNoAccessUploadUrl({ serviceId, areaId, fileName: 'Puerta cerrada.jpg', contentType: 'image/jpeg', size: 2_048 })
    const url = new URL(signed.url)
    expect(signed.storagePath).toMatch(new RegExp(`^services/${serviceId}/areas/${areaId}/no-access/[0-9a-f-]+-Puerta-cerrada\\.jpg$`))
    expect(url.pathname).toContain(`/sr-service-media/services/${serviceId}/areas/${areaId}/no-access/`)
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host')
    expect(() => assertAreaNoAccessStoragePath(signed.storagePath, serviceId, '10000000-0000-4000-8000-000000000003')).toThrow('ruta de la fotografía')
  })

  it('rechaza fotografías mayores de 10 MB o con un tipo no permitido', () => {
    const input = { serviceId: '10000000-0000-4000-8000-000000000001', areaId: '10000000-0000-4000-8000-000000000002' }
    expect(() => createAreaNoAccessUploadUrl({ ...input, fileName: 'foto.jpg', contentType: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })).toThrow('10 MB')
    expect(() => createAreaNoAccessUploadUrl({ ...input, fileName: 'foto.pdf', contentType: 'application/pdf', size: 1_000 })).toThrow('JPG, PNG o WebP')
  })

  it('aísla la fotografía de revisión por Servicio y dispositivo congelado', () => {
    const serviceId = '10000000-0000-4000-8000-000000000001'
    const serviceDeviceId = '10000000-0000-4000-8000-000000000004'
    const signed = createDeviceReviewUploadUrl({ serviceId, serviceDeviceId, fileName: 'Daño puesto.webp', contentType: 'image/webp', size: 4_096 })
    const url = new URL(signed.url)
    expect(signed.storagePath).toMatch(new RegExp(`^services/${serviceId}/devices/${serviceDeviceId}/review/[0-9a-f-]+-Dano-puesto\\.webp$`))
    expect(url.pathname).toContain(`/sr-service-media/services/${serviceId}/devices/${serviceDeviceId}/review/`)
    expect(() => assertDeviceReviewStoragePath(signed.storagePath, serviceId, '10000000-0000-4000-8000-000000000005')).toThrow('ruta de la fotografía')
  })

  it('aísla las evidencias de apertura y cierre por Servicio y Hallazgo', () => {
    const serviceId = '10000000-0000-4000-8000-000000000001'
    const findingId = '10000000-0000-4000-8000-000000000006'
    const opening = createFindingEvidenceUploadUrl({ serviceId, findingId, phase: 'OPENING', fileName: 'Inicio.jpg', contentType: 'image/jpeg', size: 4_096 })
    const closure = createFindingEvidenceUploadUrl({ serviceId, findingId, phase: 'CLOSURE', fileName: 'Cierre.webp', contentType: 'image/webp', size: 4_096 })
    expect(opening.storagePath).toMatch(new RegExp(`^services/${serviceId}/findings/${findingId}/opening/[0-9a-f-]+-Inicio\\.jpg$`))
    expect(closure.storagePath).toMatch(new RegExp(`^services/${serviceId}/findings/${findingId}/closure/[0-9a-f-]+-Cierre\\.webp$`))
    expect(() => assertFindingEvidenceStoragePath(opening.storagePath, serviceId, findingId, 'CLOSURE')).toThrow('ruta de la fotografía')
    expect(new URL(closure.url).pathname).toContain(`/sr-service-media/services/${serviceId}/findings/${findingId}/closure/`)
  })
})
