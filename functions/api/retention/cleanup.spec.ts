// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  signatureDelete: vi.fn(),
  certificateDelete: vi.fn(),
  photoDelete: vi.fn(),
}))
vi.mock('../db', () => ({
  pool: { query: mocks.poolQuery },
  transaction: (callback: (client: unknown) => unknown) => callback({ query: mocks.clientQuery }),
}))
vi.mock('../r2', () => ({
  deleteRetainedServiceSignature: mocks.signatureDelete,
  deleteCertificateObject: mocks.certificateDelete,
  deleteRetainedServicePhoto: mocks.photoDelete,
}))

import { runRetentionBatch } from './cleanup'

const SERVICE = '10000000-0000-4000-8000-000000000001'
const CERTIFICATE = '10000000-0000-4000-8000-000000000002'
const signature = {
  bucket: 'sr-service-media', category: 'SERVICE_SIGNATURE', source_id: SERVICE,
  storage_path: `services/${SERVICE}/signatures/client/firma.png`,
  expires_at: '2026-01-01T00:00:00Z',
}
const pdf = {
  bucket: 'sr-generated-documents', category: 'CERTIFICATE_PDF', source_id: CERTIFICATE,
  storage_path: `certificates/${SERVICE}/${CERTIFICATE}/old.pdf`,
  expires_at: '2026-01-01T00:00:00Z',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.poolQuery.mockResolvedValue({ rows: [signature, pdf], rowCount: 2 })
  mocks.clientQuery.mockImplementation(async (sql: string, args?: unknown[]) => {
    if (sql.includes('from private.storage_retention_candidates')) {
      return { rows: [args?.[0] === signature.bucket ? signature : pdf], rowCount: 1 }
    }
    if (sql.includes('select delete_enabled')) return { rows: [{ delete_enabled: true }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  mocks.signatureDelete.mockResolvedValue(undefined)
  mocks.certificateDelete.mockResolvedValue(undefined)
})

describe('Retención de firmas y certificados', () => {
  it('simula ambas categorías sin eliminar archivos', async () => {
    const result = await runRetentionBatch('dry-run')
    expect(result).toMatchObject({
      mode: 'dry-run', candidates: 2, deleted: 0, failed: 0,
      preview: { SERVICE_SIGNATURE: 1, CERTIFICATE_PDF: 1 },
    })
    expect(mocks.poolQuery.mock.calls[0]?.[1]).toEqual([40, 'dry-run'])
    expect(mocks.signatureDelete).not.toHaveBeenCalled()
    expect(mocks.certificateDelete).not.toHaveBeenCalled()
  })
  it('no elimina nuevas categorías mientras su interruptor permanezca desactivado', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string, args?: unknown[]) => {
      if (sql.includes('from private.storage_retention_candidates')) {
        return { rows: [args?.[0] === signature.bucket ? signature : pdf], rowCount: 1 }
      }
      if (sql.includes('select delete_enabled')) return { rows: [{ delete_enabled: false }], rowCount: 1 }
      return { rows: [], rowCount: 1 }
    })
    const result = await runRetentionBatch('delete')
    expect(result).toMatchObject({ deleted: 0, failed: 0 })
    expect(mocks.signatureDelete).not.toHaveBeenCalled()
    expect(mocks.certificateDelete).not.toHaveBeenCalled()
  })
  it('con autorización, borra exclusivamente las rutas validadas y audita por objeto', async () => {
    const result = await runRetentionBatch('delete')
    expect(result).toMatchObject({ deleted: 2, failed: 0 })
    expect(mocks.signatureDelete).toHaveBeenCalledWith(signature.storage_path, SERVICE)
    expect(mocks.certificateDelete).toHaveBeenCalledWith(pdf.storage_path)
    expect(mocks.photoDelete).not.toHaveBeenCalled()
    expect(mocks.clientQuery.mock.calls.filter(([sql]: [string]) =>
      sql.includes('insert into private.storage_retention_deleted'))).toHaveLength(2)
  })
  it('si la referencia ya no cumple la condición de expiración, no borra nada', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => ({
      rows: sql.includes('from private.storage_retention_candidates') ? [] : [],
      rowCount: 0,
    }))
    const result = await runRetentionBatch('delete')
    expect(result).toMatchObject({ deleted: 0, failed: 0 })
    expect(mocks.certificateDelete).not.toHaveBeenCalled()
    expect(mocks.signatureDelete).not.toHaveBeenCalled()
  })
})
