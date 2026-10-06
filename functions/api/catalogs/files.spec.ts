// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertMasterStoragePath, createMasterUploadUrl, MASTER_FILE_KINDS } from '../r2'

afterEach(() => vi.unstubAllEnvs())
describe('fichas técnicas reutilizan archivos maestros', () => {
  it('admite ficha PDF privada y no credenciales en la respuesta', () => {
    vi.stubEnv('R2_ACCOUNT_ID', 'test-account'); vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key'); vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret')
    expect(MASTER_FILE_KINDS).toContain('PRODUCT_TECHNICAL_SHEET')
    const result = createMasterUploadUrl({ kind: 'PRODUCT_TECHNICAL_SHEET', fileName: 'ficha.pdf', contentType: 'application/pdf', size: 100 })
    expect(result.storagePath).toMatch(/^products\/technical-sheets\/.+\.pdf$/)
    expect(result.expiresIn).toBe(300)
    expect(result.url).not.toContain('test-secret')
    expect(() => assertMasterStoragePath(result.storagePath)).not.toThrow()
  })
  it('rechaza ejecutables, MIME incorrecto, tamaño excedido y traversal', () => {
    expect(() => createMasterUploadUrl({ kind: 'PRODUCT_TECHNICAL_SHEET', fileName: 'file.exe', contentType: 'application/octet-stream', size: 1 })).toThrow()
    expect(() => createMasterUploadUrl({ kind: 'PRODUCT_TECHNICAL_SHEET', fileName: 'file.pdf', contentType: 'image/png', size: 1 })).toThrow()
    expect(() => createMasterUploadUrl({ kind: 'PRODUCT_TECHNICAL_SHEET', fileName: 'file.pdf', contentType: 'application/pdf', size: 11 * 1024 * 1024 })).toThrow()
    expect(() => assertMasterStoragePath('products/technical-sheets/../secret.pdf')).toThrow()
  })
})
