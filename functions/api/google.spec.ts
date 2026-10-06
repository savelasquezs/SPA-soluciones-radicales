// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createCipheriv, createHash } from 'node:crypto'

const db = vi.hoisted(() => ({ query: vi.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>() }))
vi.mock('./db', () => ({ pool: db, transaction: vi.fn<(callback: unknown) => Promise<unknown>>() }))

async function pdf() {
  const document = await PDFDocument.create()
  document.addPage()
  return Buffer.from(await document.save())
}

async function googleModule() {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
  vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'https://example.test/callback')
  vi.resetModules()
  return import('./google')
}

beforeEach(() => {
  vi.restoreAllMocks()
  const key = createHash('sha256').update('soluciones-radicales-google-token:client:secret').digest()
  const iv = Buffer.alloc(12, 1)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update('refresh-token', 'utf8'), cipher.final()])
  db.query.mockResolvedValue({ rows: [{
    refresh_token_ciphertext: ciphertext,
    refresh_token_iv: iv,
    refresh_token_tag: cipher.getAuthTag(),
  }] })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Google Drive DOCX conversion', () => {
  it('imports, exports and deletes the temporary Google Doc', async () => {
    const module = await googleModule()
    const output = await pdf()
    const remote = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600, token_type: 'Bearer' }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'temporary-id' }), { headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(output, { headers: { 'content-type': 'application/pdf' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', remote)

    await expect(module.convertDocxToPdfWithGoogleDrive(Buffer.from('docx'), 1024 * 1024)).resolves.toEqual(output)
    expect(remote.mock.calls[1]?.[0]).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(remote.mock.calls[2]?.[0]).toContain('/temporary-id/export?mimeType=application%2Fpdf')
    expect(remote.mock.calls[3]).toMatchObject(['https://www.googleapis.com/drive/v3/files/temporary-id', { method: 'DELETE' }])
  })

  it('queues durable cleanup when deleting the temporary Google Doc fails', async () => {
    const module = await googleModule()
    const output = await pdf()
    const remote = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600, token_type: 'Bearer' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'temporary-id' })))
      .mockResolvedValueOnce(new Response(output, { headers: { 'content-type': 'application/pdf' } }))
      .mockResolvedValueOnce(new Response('error', { status: 503 }))
    vi.stubGlobal('fetch', remote)

    await expect(module.convertDocxToPdfWithGoogleDrive(Buffer.from('docx'), 1024 * 1024))
      .rejects.toThrow('no fue posible eliminar el archivo temporal')
    const cleanupJob = db.query.mock.calls.find(([sql]) => String(sql).includes("values ('STORAGE_CLEANUP'"))
    expect(cleanupJob).toBeDefined()
    expect(cleanupJob?.[1]).toEqual([
      'google-drive-temp:temporary-id',
      JSON.stringify({ scope: 'GOOGLE_DRIVE_TEMP', fileId: 'temporary-id' }),
    ])
  })

  it('deletes the temporary Google Doc when the PDF export fails', async () => {
    const module = await googleModule()
    const remote = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600, token_type: 'Bearer' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'temporary-id' })))
      .mockResolvedValueOnce(new Response('error', { status: 500, headers: { 'content-type': 'text/plain' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', remote)

    await expect(module.convertDocxToPdfWithGoogleDrive(Buffer.from('docx'), 1024)).rejects.toThrow('Google Drive no pudo exportar')
    expect(remote.mock.calls[3]).toMatchObject(['https://www.googleapis.com/drive/v3/files/temporary-id', { method: 'DELETE' }])
  })
})
