import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from './auth'
import { createMasterReadUrl, createMasterUploadUrl } from './r2'

const original = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_MASTER_FILES,
}

describe('Cloudflare R2 presigned URLs', () => {
  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef'
    process.env.R2_ACCESS_KEY_ID = 'access-key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret-key'
    process.env.R2_BUCKET_MASTER_FILES = 'sr-master-files'
  })

  afterEach(() => {
    process.env.R2_ACCOUNT_ID = original.accountId
    process.env.R2_ACCESS_KEY_ID = original.accessKeyId
    process.env.R2_SECRET_ACCESS_KEY = original.secretAccessKey
    process.env.R2_BUCKET_MASTER_FILES = original.bucket
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
    })).toThrow(ApiError)
    expect(() => createMasterReadUrl('otra-carpeta/archivo.pdf')).toThrow(ApiError)
  })
})
