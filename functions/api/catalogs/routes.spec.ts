// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Identity } from '../auth'
import type * as Repository from './repository'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  listCatalog: vi.fn<typeof Repository.listCatalog>(),
  getCatalogRecord: vi.fn<typeof Repository.getCatalogRecord>(),
  saveProduct: vi.fn<typeof Repository.saveProduct>(),
  saveItem: vi.fn<typeof Repository.saveItem>(),
  auditCatalog: vi.fn<typeof Repository.auditCatalog>(),
  setCatalogActive: vi.fn<typeof Repository.setCatalogActive>(),
  removeCatalogRecord: vi.fn<typeof Repository.removeCatalogRecord>(),
}))
vi.mock('../db', () => ({ transaction: async (fn: (client: object) => Promise<unknown>) => fn({}) }))
vi.mock('../auth', () => ({
  ApiError: class extends Error { constructor(public status: number, message: string, public code?: string, public details?: Record<string, unknown>) { super(message) } },
  requireAdmin: mocks.requireAdmin,
}))
vi.mock('./repository', async () => {
  const { ApiError } = await import('../auth')
  return { ...mocks, catalogKind: (kind: string) => { if (!['products', 'traps', 'pests', 'methods'].includes(kind)) throw new ApiError(404, 'El catálogo no existe'); return kind } }
})
import { ApiError } from '../auth'
import { mipCatalogRoutes } from './routes'
const app = new Hono<{ Variables: { identity: Identity } }>()
app.use('*', async (context, next) => { context.set('identity', { authUserId: 'admin', session: {} }); await next() })
app.route('/api/mip', mipCatalogRoutes)
const id = '10000000-0000-4000-8000-000000000001'
const request = (path: string, value: unknown, method = 'POST') => app.request(`/api/mip/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireAdmin.mockResolvedValue({ id })
  mocks.listCatalog.mockResolvedValue([])
  mocks.saveItem.mockResolvedValue({ id, clave: 'TRAMPA', nombre: 'Trampa', clasificacion: 'RASTREROS', activo: true, version: 1 })
})

describe('API administrativa de catálogos', () => {
  it('rechaza técnico en lectura y escritura', async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, 'Solo Administrador'))
    expect((await app.request('/api/mip/products')).status).toBe(403)
    expect((await request('traps', { nombre: 'Trampa', clasificacion: 'RASTREROS' })).status).toBe(403)
    expect(mocks.saveItem).not.toHaveBeenCalled()
  })
  it('filtra estado, valida entradas y conserva una clasificación exclusiva', async () => {
    expect((await app.request('/api/mip/pests?active=false')).status).toBe(200)
    expect(mocks.listCatalog).toHaveBeenCalledWith({}, 'pests', false)
    expect((await app.request('/api/mip/pests?active=unknown')).status).toBe(422)
    expect((await request('traps', { nombre: 'Trampa', clasificacion: 'MIXTO' })).status).toBe(422)
    expect(mocks.saveItem).not.toHaveBeenCalled()
  })
  it('crea con auditoría y devuelve el snapshot completo sin fetch del cliente', async () => {
    const response = await request('traps', { nombre: 'Trampa', clasificacion: 'RASTREROS' })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id, version: 1 })
    expect(mocks.auditCatalog).toHaveBeenCalledOnce()
  })
  it('exige versión en edición y eliminación y conserva conflictos tipados', async () => {
    expect((await request(`traps/${id}`, { nombre: 'Trampa', clasificacion: 'RASTREROS' }, 'PATCH')).status).toBe(422)
    expect((await request(`traps/${id}`, {}, 'DELETE')).status).toBe(422)
    mocks.saveItem.mockRejectedValue(new ApiError(409, 'Otro usuario modificó el registro.', 'VERSION_CONFLICT'))
    const response = await request(`traps/${id}`, { nombre: 'Trampa', clasificacion: 'RASTREROS', version: 1 }, 'PATCH')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'VERSION_CONFLICT' })
  })
  it('no filtra nombres SQL ni constraints en errores', async () => {
    mocks.saveItem.mockRejectedValue(Object.assign(new Error('secret SQL constraint'), { code: '23505' }))
    const response = await request('traps', { nombre: 'Trampa', clasificacion: 'RASTREROS' })
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('secret SQL')
  })
})
