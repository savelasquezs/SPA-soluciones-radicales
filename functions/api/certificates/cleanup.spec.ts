// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  query: vi.fn<(...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>(),
}))
const drive = vi.hoisted(() => ({
  remove: vi.fn<(fileId: string) => Promise<void>>(),
}))
const r2 = vi.hoisted(() => ({
  remove: vi.fn<(path: string) => Promise<void>>(),
}))

vi.mock('../db', () => ({
  transaction: vi.fn(async (callback: (value: typeof client) => Promise<unknown>) => callback(client)),
}))
vi.mock('../google', () => ({ deleteGoogleDriveTemporaryFile: drive.remove }))
vi.mock('../r2', () => ({ deleteCertificateObject: r2.remove }))

import { cleanupCertificateOrphans } from './cleanup'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('certificate cleanup queue', () => {
  it('deletes a queued Google Drive temporary and completes the job', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'cleanup-job', payload: { scope: 'GOOGLE_DRIVE_TEMP', fileId: 'temporary-id' } }],
      })
      .mockResolvedValueOnce({ rows: [] })
    drive.remove.mockResolvedValue()

    await expect(cleanupCertificateOrphans()).resolves.toEqual({ processed: 1 })

    expect(drive.remove).toHaveBeenCalledWith('temporary-id')
    expect(client.query.mock.calls[1]?.[0]).toContain("status = 'COMPLETED'")
  })

  it('keeps a failed Google Drive cleanup for a later retry', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'cleanup-job', payload: { scope: 'GOOGLE_DRIVE_TEMP', fileId: 'temporary-id' } }],
      })
      .mockResolvedValueOnce({ rows: [] })
    drive.remove.mockRejectedValue(new Error('temporary failure'))

    await expect(cleanupCertificateOrphans()).resolves.toEqual({ processed: 0 })

    expect(client.query.mock.calls[1]?.[0]).toContain("status = 'FAILED'")
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      'cleanup-job',
      'No fue posible limpiar el documento temporal de Google Drive',
    ])
  })
})
