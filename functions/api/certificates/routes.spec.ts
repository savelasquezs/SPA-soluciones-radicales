// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { MailInput } from '../mailMessage'
import type { LoadedCertificateContext } from './repository'
import type { Identity } from '../auth'
import type { CertificateSettings } from '../../../src/types/certificates'
const mocks = vi.hoisted(() => ({
  query: vi.fn<(sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>>(),
  load: vi.fn<typeof import('./repository').loadCertificateContext>(), settings: vi.fn<typeof import('./repository').loadSettings>(), claim: vi.fn<typeof import('./jobs').claimCertificateJob>(), lock: vi.fn<typeof import('./jobs').lockCertificateJob>(), complete: vi.fn<typeof import('./jobs').completeCertificateJob>(), fail: vi.fn<typeof import('./jobs').failCertificateJob>(), dispatch: vi.fn<typeof import('./jobs').markEmailDispatching>(),
  read: vi.fn<typeof import('../r2').readMasterObject>(), write: vi.fn<typeof import('../r2').putCertificateObject>(), pdf: vi.fn<typeof import('./generator').generateCertificatePdf>(), readPdf: vi.fn<typeof import('../r2').readCertificateObject>(), send: vi.fn<(input: MailInput) => Promise<string>>(), admin: vi.fn<(client: unknown, identity: Identity) => Promise<{ id: string }>>(),
}))
vi.mock('../db', () => ({ pool: { query: mocks.query }, transaction: (callback: (client: unknown) => unknown) => callback({ query: mocks.query }) }))
vi.mock('../auth', async (original) => ({ ...await original<typeof import('../auth')>(), requireAdmin: mocks.admin }))
vi.mock('../google', () => ({ sendGmailMessage: mocks.send }))
vi.mock('../r2', async (original) => ({ ...await original<typeof import('../r2')>(), readMasterObject: mocks.read, putCertificateObject: mocks.write, readCertificateObject: mocks.readPdf }))
vi.mock('./generator', async (original) => ({ ...await original<typeof import('./generator')>(), generateCertificatePdf: mocks.pdf }))
vi.mock('./repository', async (original) => ({ ...await original<typeof import('./repository')>(), loadCertificateContext: mocks.load, loadSettings: mocks.settings }))
vi.mock('./jobs', () => ({ claimCertificateJob: mocks.claim, lockCertificateJob: mocks.lock, completeCertificateJob: mocks.complete, failCertificateJob: mocks.fail, markEmailDispatching: mocks.dispatch }))
import { ApiError } from '../auth'
import { certificateRoutes } from './routes'
const id = '11111111-1111-4111-8111-111111111111'
const vehicle = '22222222-2222-4222-8222-222222222222'
const templatePath = `clients/establishment-templates/${id}-base.docx`
const settings: CertificateSettings = { converterReady: true, templates: [{ type: 'ESTABLECIMIENTO', storagePath: templatePath, fileName: 'base.docx', revision: id }, { type: 'VEHICULO', storagePath: `sites/vehicle-templates/${id}-base.docx`, fileName: 'base.docx', revision: id }] }
const app = new Hono<{ Variables: { identity: Identity } }>()
app.use('*', async (c, next) => { c.set('identity', { authUserId: c.req.header('Authorization') ?? '', session: {} }); await next() })
app.route('/certificates', certificateRoutes)
let loaded: LoadedCertificateContext
function request(path: string, body?: unknown, authorization = 'admin') {
  return app.request(`/certificates${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}
const generate = () => ({ requestId: id, serviceId: id, type: 'ESTABLECIMIENTO', vehicleIds: [], previousPaths: { ESTABLECIMIENTO: null }, confirmReplace: false })
beforeEach(() => {
  vi.clearAllMocks()
  loaded = {
    source: { id, version: '1', solicitud: 'SS-123', state: 'FINALIZADO', serviceType: 'PRINCIPAL', siteType: 'NEGOCIO', clientType: 'NEGOCIO', siteId: id, clientName: 'Negocio', nit: '900', siteName: 'Sede', address: 'Dirección', technicianName: 'Ana', issuedOn: '2026-01-31', businessMonths: 1, vehicleMonths: 2, vehicleEnabled: true, businessEmails: [], siteEmails: [], contactEmail: null },
    settings: settings as LoadedCertificateContext['settings'], products: [], historicalData: {},
    context: { serviceId: id, solicitud: 'SS-123', clientName: 'Negocio', siteName: 'Sede', recipients: ['uno@example.test', 'dos@example.test'], vehicles: [{ id: vehicle, placa: 'ABC-123' }], documents: [], availability: { ESTABLECIMIENTO: { available: true, reason: null, templateSource: 'GLOBAL' }, VEHICULO: { available: true, reason: null, templateSource: 'GLOBAL' } } },
  }
  mocks.admin.mockImplementation(async (_client: unknown, identity: Identity) => {
    if (identity.authUserId !== 'admin') throw new ApiError(403, 'Se requiere el rol Administrador')
    return { id }
  })
  mocks.query.mockImplementation(async (sql) => ({ rows: sql.includes('select version::text') ? [{ version: '1' }] : [], rowCount: 1 }))
  mocks.load.mockImplementation(async () => loaded); mocks.settings.mockResolvedValue(settings)
  mocks.claim.mockResolvedValue({ id, token: 'token', completed: false })
  mocks.fail.mockResolvedValue(undefined); mocks.lock.mockResolvedValue(undefined); mocks.complete.mockResolvedValue(undefined); mocks.dispatch.mockResolvedValue(undefined)
  mocks.read.mockResolvedValue(Buffer.from('word')); mocks.pdf.mockResolvedValue(Buffer.from('%PDF-test'))
  mocks.readPdf.mockResolvedValue(Buffer.from('%PDF-test')); mocks.write.mockResolvedValue(undefined)
  mocks.send.mockImplementation(async (input) => { await input.onDispatch?.(); return 'gmail-id' })
})
describe('certificate API authorization and mutations', () => {
  it.each(['/settings', '/services?siteId=' + id, '/services/' + id + '/context'])('requires admin for %s', async (path) => {
    expect((await request(path, undefined, 'technician')).status).toBe(403)
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it('creates a synthetic PDF without official records, R2 writes, jobs or mail', async () => {
    const response = await request('/preview', { type: 'ESTABLECIMIENTO' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ preview: true, data: expect.objectContaining({ solicitud: 'PRUEBA-SIN-VALIDEZ' }) }))
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled()
  })
  it('generates one PDF, persists snapshot and audit, but never sends automatically', async () => {
    const response = await request('/generate', generate())
    expect(response.status).toBe(201)
    const result = await response.json()
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].expiresOn).toBe('2026-02-28')
    expect(mocks.write).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ certificates: expect.any(Array), sourceVersion: '1' }))
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('CERTIFICADO_GENERADO'))).toBe(true)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('rejects non-attended vehicles and stale expected paths before creating any PDF', async () => {
    expect((await request('/generate', { ...generate(), type: 'VEHICULO', vehicleIds: [id], previousPaths: { [id]: null } })).status).toBe(422)
    expect((await request('/generate', { ...generate(), previousPaths: { ESTABLECIMIENTO: 'stale.pdf' } })).status).toBe(409)
    expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled()
  })
  it('replays a completed generation without doing IO again', async () => {
    mocks.claim.mockResolvedValue({ id, token: '', completed: true, result: { documents: [] } })
    expect((await request('/generate', generate())).status).toBe(200)
    expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled()
  })
  it('queues only new orphan objects after a storage timeout; never replaces the old record', async () => {
    mocks.write.mockRejectedValue(new Error('private bucket timeout'))
    const response = await request('/generate', generate())
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private bucket')
    expect(mocks.query.mock.calls.some(([sql, params]) => sql.includes('STORAGE_CLEANUP') && String(params?.[1]).includes('CERTIFICATE_ORPHANS'))).toBe(true)
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('insert into public.certificados'))).toBe(false)
  })
  it('detects changed service version before certificate persistence', async () => {
    mocks.query.mockImplementation(async (sql) => ({ rows: sql.includes('select version::text') ? [{ version: '2' }] : [], rowCount: 1 }))
    const response = await request('/generate', generate())
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('VERSION_CONFLICT')
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  function mail() {
    loaded.context.documents = [{ id, vehicleId: null, type: 'ESTABLECIMIENTO', label: 'Establecimiento', storagePath: `certificates/${id}/${id}/${id}.pdf`, issuedOn: '2026-01-31', expiresOn: '2026-02-28' }]
    return { requestId: id, serviceId: id, documents: loaded.context.documents.map(({ id, storagePath }) => ({ id, storagePath })), recipients: ['uno@example.test', 'dos@example.test'], subject: 'Editado', text: 'Mensaje editado' }
  }
  it('sends only selected current attachments to registered recipients after a durable dispatch marker', async () => {
    const response = await request('/send', mail())
    expect(response.status).toBe(200)
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: ['dos@example.test', 'uno@example.test'], subject: 'Editado', text: 'Mensaje editado', attachments: [expect.objectContaining({ bytes: Buffer.from('%PDF-test') })] }))
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalled()
  })
  it('rejects unknown recipients, changed PDFs, and cross-service selections', async () => {
    const input = mail()
    expect((await request('/send', { ...input, recipients: ['outsider@example.test'] })).status).toBe(422)
    expect((await request('/send', { ...input, documents: [{ id, storagePath: 'old.pdf' }] })).status).toBe(409)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('marks uncertain delivery rather than automatically resending an accepted-or-unknown message', async () => {
    mocks.send.mockImplementation(async (input) => { await input.onDispatch?.(); throw new Error('network closed after send') })
    const response = await request('/send', mail())
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe('EMAIL_DELIVERY_UNKNOWN')
    expect(mocks.fail).toHaveBeenCalledWith(expect.anything(), expect.anything(), true)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})
