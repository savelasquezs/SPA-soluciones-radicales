import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({ ApiError: class extends Error { constructor(_status: number, message: string) { super(message) } } }))
import { createMasterUploadUrl } from './r2'

beforeEach(() => {
  vi.stubEnv('R2_ACCOUNT_ID', '0123456789abcdef0123456789abcdef')
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret')
})
afterEach(() => vi.unstubAllEnvs())

describe('R2 con archivos optimizados', () => {
  it.each(['SITE_PLAN', 'USER_CERTIFICATE'] as const)('admite WebP optimizado para %s', (kind) => {
    const signed = createMasterUploadUrl({ kind, fileName: 'foto.webp', contentType: 'image/webp', size: 1024 })
    expect(signed.contentType).toBe('image/webp')
    expect(signed.storagePath).toMatch(/\.webp$/)
  })
  it('no amplía los tipos de las plantillas Word/PDF', () => {
    expect(() => createMasterUploadUrl({ kind: 'CLIENT_ESTABLISHMENT_TEMPLATE', fileName: 'foto.webp', contentType: 'image/webp', size: 1024 })).toThrow('no está permitido')
  })
  it('mantiene la comprobación de MIME y el máximo de 10 MB del certificado', () => {
    expect(() => createMasterUploadUrl({ kind: 'SITE_PLAN', fileName: 'foto.webp', contentType: 'image/png', size: 1024 })).toThrow('MIME')
    expect(() => createMasterUploadUrl({ kind: 'USER_CERTIFICATE', fileName: 'foto.webp', contentType: 'image/webp', size: 10 * 1024 * 1024 + 1 })).toThrow('10 MB')
  })
})
