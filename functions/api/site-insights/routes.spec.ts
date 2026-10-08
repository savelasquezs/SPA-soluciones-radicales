// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Identity } from '../auth'
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), listMonitoringPoints: vi.fn(), listMonitoringReviews: vi.fn(), listSiteFindings: vi.fn(), findSiteEvidence: vi.fn(),
  deviceReviewMediaObjectExists: vi.fn(), findingEvidenceObjectExists: vi.fn(), createServiceMediaReadUrl: vi.fn(),
}))
vi.mock('../auth', () => ({
  ApiError: class extends Error { constructor(public status: number, message: string, public code?: string) { super(message) } },
  requireAdmin: mocks.requireAdmin,
}))
vi.mock('../db', () => ({ transaction: async (action: (client: object) => Promise<unknown>) => action({}) }))
vi.mock('./queries', () => mocks)
vi.mock('../r2', () => mocks)
import { ApiError } from '../auth'
import { insightQuery, missingEvidenceStatus, siteInsightsRoutes } from './routes'
const app = new Hono<{ Variables: { identity: Identity } }>()
app.use('*', async (context, next) => { context.set('identity', { authUserId: 'admin', session: {} }); await next() })
app.route('/api/admin/sites', siteInsightsRoutes)
const site = '10000000-0000-4000-8000-000000000001'
const record = '10000000-0000-4000-8000-000000000002'
const base = `/api/admin/sites/${site}`
const collection = { items: [], total: 0, page: 1, pageSize: 20, areas: [], traps: [] }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireAdmin.mockResolvedValue({ id: 'admin' })
  mocks.listMonitoringPoints.mockResolvedValue(collection)
  mocks.listMonitoringReviews.mockResolvedValue(collection)
  mocks.listSiteFindings.mockResolvedValue(collection)
  mocks.findSiteEvidence.mockResolvedValue({ path: 'stored/path.jpg', serviceId: 'service', ownerId: 'owner', retentionAt: null })
  mocks.deviceReviewMediaObjectExists.mockResolvedValue(true)
  mocks.findingEvidenceObjectExists.mockResolvedValue(true)
  mocks.createServiceMediaReadUrl.mockReturnValue({ url: 'https://storage.example.test/photo.jpg', expiresAt: '2099-01-01T00:00:00Z' })
})
describe('site insights readonly authorization and queries', () => {
  it('requires an active administrator for collections, history and private photos', async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, 'Se requiere el rol Administrador'))
    for (const path of ['/monitoring-points', `/monitoring-points/${record}/reviews`, '/findings', `/photos/REVIEW/${record}/0`]) {
      expect((await app.request(base + path)).status).toBe(403)
    }
    expect(mocks.listMonitoringPoints).not.toHaveBeenCalled()
    expect(mocks.findSiteEvidence).not.toHaveBeenCalled()
    expect(mocks.createServiceMediaReadUrl).not.toHaveBeenCalled()
  })
  it('lists without storage requests and prevents every mutation method', async () => {
    expect((await app.request(`${base}/monitoring-points?active=false`)).status).toBe(200)
    expect(mocks.listMonitoringPoints).toHaveBeenCalledWith({}, site, expect.objectContaining({ active: 'false' }))
    expect(mocks.deviceReviewMediaObjectExists).not.toHaveBeenCalled()
    for (const method of ['POST','PUT','PATCH','DELETE']) expect((await app.request(`${base}/findings`, { method })).status).toBe(405)
  })
  it('distinguishes all states from the pending default and bounds every filter', () => {
    expect(insightQuery({}, 'findings').state).toBe('PENDING')
    expect(insightQuery({ state: '' }, 'findings').state).toBe('')
    for (const invalid of [{ page: '0' }, { page: '100000' }, { page: '1.5' }, { state: 'wrong' }, { active: 'yes' }, { area: 'sql' }, { from: '2026-02-31' }, { from: '2026-10-08', to: '2026-10-07' }]) {
      expect(() => insightQuery(invalid, 'points')).toThrow()
    }
  })
  it('does not reinterpret a source belonging to another site or a missing reference', async () => {
    mocks.findSiteEvidence.mockRejectedValue(new ApiError(404, 'La evidencia no está registrada.', 'EVIDENCE_NOT_FOUND'))
    expect((await app.request(`${base}/photos/OPENING/${record}/0`)).status).toBe(404)
    expect(mocks.findingEvidenceObjectExists).not.toHaveBeenCalled()
    expect((await app.request(`${base}/photos/REVIEW/${record}/-1`)).status).toBe(422)
  })
})
describe('private media availability', () => {
  it('returns a fresh read URL and never accepts a caller supplied path', async () => {
    const response = await app.request(`${base}/photos/REVIEW/${record}/0?storagePath=forged`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ status: 'AVAILABLE' })
    expect(mocks.createServiceMediaReadUrl).toHaveBeenCalledWith('stored/path.jpg','service','owner','REVIEW')
  })
  it('reports absent objects separately from never registered references', async () => {
    mocks.deviceReviewMediaObjectExists.mockResolvedValue(false)
    const response = await app.request(`${base}/photos/REVIEW/${record}/0`)
    expect(await response.json()).toEqual({ status: 'MISSING', url: null, expiresAt: null })
    expect(mocks.createServiceMediaReadUrl).not.toHaveBeenCalled()
  })
  it('only labels missing files as expired after their domain retention deadline', async () => {
    mocks.findSiteEvidence.mockResolvedValue({ path: 'stored/path.jpg', serviceId: 'service', ownerId: 'owner', retentionAt: '2000-01-01T00:00:00Z' })
    mocks.findingEvidenceObjectExists.mockResolvedValue(false)
    expect(await (await app.request(`${base}/photos/CLOSURE/${record}/1`)).json()).toMatchObject({ status: 'EXPIRED' })
    expect(missingEvidenceStatus(null)).toBe('MISSING')
    expect(missingEvidenceStatus('invalid')).toBe('MISSING')
    expect(missingEvidenceStatus('2099-01-01T00:00:00Z')).toBe('MISSING')
  })
  it('never classifies provider failures or permissions as expired', async () => {
    mocks.deviceReviewMediaObjectExists.mockRejectedValue(new ApiError(502, 'No fue posible validar la fotografía privada'))
    const response = await app.request(`${base}/photos/REVIEW/${record}/0`)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('EXPIRED')
  })
})
