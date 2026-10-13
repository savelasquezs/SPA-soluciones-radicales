// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createCipheriv, createHash } from 'node:crypto'

const db = vi.hoisted(() => ({ query: vi.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>() }))
let encryptedToken: { refresh_token_ciphertext: Buffer; refresh_token_iv: Buffer; refresh_token_tag: Buffer }
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
  encryptedToken = {
    refresh_token_ciphertext: ciphertext,
    refresh_token_iv: iv,
    refresh_token_tag: cipher.getAuthTag(),
  }
  db.query.mockResolvedValue({ rows: [encryptedToken] })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Google OAuth integration health', () => {
  function mockIntegrationQuery() {
    db.query.mockImplementation(async (sql) => ({
      rows: [String(sql).includes('select cuenta_correo')
        ? { cuenta_correo: 'solucionesradicales1@gmail.com' }
        : encryptedToken],
    }))
  }

  it('detects a revoked refresh token and prevents Gmail dispatch', async () => {
    mockIntegrationQuery()
    const module = await googleModule()
    const remote = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
    }), { status: 400 }))
    vi.stubGlobal('fetch', remote)
    const onDispatch = vi.fn()

    await expect(module.sendGmailMessage({
      to: 'cliente@example.com', subject: 'Informe', text: 'Mensaje', onDispatch,
    })).rejects.toMatchObject({
      status: 409,
      code: 'GOOGLE_REAUTH_REQUIRED',
      message: expect.stringContaining('Vuelve a autorizar'),
    })
    expect(onDispatch).not.toHaveBeenCalled()

    await expect(module.getGoogleStatus()).resolves.toEqual({
      connected: false,
      email: 'solucionesradicales1@gmail.com',
      needsReauthorization: true,
    })
    expect(remote).toHaveBeenCalledTimes(2)
    expect(remote.mock.calls.every(([url]) => url === 'https://oauth2.googleapis.com/token')).toBe(true)
  })

  it('reports connected only when Google accepts the refresh token', async () => {
    mockIntegrationQuery()
    const module = await googleModule()
    const remote = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access', expires_in: 3600, token_type: 'Bearer',
    })))
    vi.stubGlobal('fetch', remote)

    await expect(module.getGoogleStatus()).resolves.toEqual({
      connected: true,
      email: 'solucionesradicales1@gmail.com',
      needsReauthorization: false,
    })
    expect(remote).toHaveBeenCalledTimes(1)
  })

  it('does not mistake a Google network failure for a revoked token', async () => {
    mockIntegrationQuery()
    const module = await googleModule()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')))

    await expect(module.getGoogleStatus()).rejects.toMatchObject({ status: 502 })
  })

  it('reports a missing account as disconnected without calling Google', async () => {
    db.query.mockResolvedValue({ rows: [] })
    const module = await googleModule()
    const remote = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', remote)

    await expect(module.getGoogleStatus()).resolves.toEqual({
      connected: false, email: null, needsReauthorization: false,
    })
    expect(remote).not.toHaveBeenCalled()
  })
})

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

    await expect(module.convertDocumentToPdfWithGoogleDrive(Buffer.from('docx'), 1024 * 1024)).resolves.toEqual(output)
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

    await expect(module.convertDocumentToPdfWithGoogleDrive(Buffer.from('docx'), 1024 * 1024))
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

    await expect(module.convertDocumentToPdfWithGoogleDrive(Buffer.from('docx'), 1024)).rejects.toThrow('Google Drive no pudo exportar')
    expect(remote.mock.calls[3]).toMatchObject(['https://www.googleapis.com/drive/v3/files/temporary-id', { method: 'DELETE' }])
  })
})
