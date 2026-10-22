import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = { rows: unknown[]; rowCount: number }
type Query = (sql: string, params?: unknown[]) => Promise<QueryResult>
type Transaction = (callback: (client: { query: Query }) => Promise<unknown>) => Promise<unknown>

const { requireAdmin, transaction, clientQuery } = vi.hoisted(() => ({
  requireAdmin: vi.fn<(client: unknown, identity: unknown) => Promise<{ id: string }>>(),
  transaction: vi.fn<Transaction>(),
  clientQuery: vi.fn<Query>(),
}))
vi.mock('./auth', () => ({
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number, message: string, public readonly code?: string) { super(message) }
  },
  requireAdmin,
}))
vi.mock('./db', () => ({ transaction }))

import { applyAreaTemplate, areaTemplatesRoutes, optionalAreaTemplateId, parseAreaTemplateInput, parseTemplateAreas } from './areaTemplates'

const siteId = '00000000-0000-4000-8000-000000000001'
const clientId = '00000000-0000-4000-8000-000000000002'
const templateId = '00000000-0000-4000-8000-000000000003'
const areas = [{ nombre: 'Cocina', esExterna: false }, { nombre: 'Patio', esExterna: true }]
const draft = { nombre: 'Restaurantes', alcance: 'PRIVADA', clientId, areas, activo: true }

describe('Validación de plantillas de áreas', () => {
  it('normaliza nombres y exterior, manteniendo el alcance del cliente', () => {
    expect(parseAreaTemplateInput({ ...draft, nombre: '  Restaurantes  ', areas: [{ nombre: ' Cocina ', esExterna: false }] }))
      .toMatchObject({ nombre: 'Restaurantes', clientId, areas: [{ nombre: 'Cocina', esExterna: false }] })
  })
  it('rechaza nombres repetidos, vacíos, mal tipados y un lote excesivo', () => {
    expect(() => parseTemplateAreas([{ nombre: 'Patio', esExterna: false }, { nombre: ' patio ', esExterna: true }])).toThrow('mismo nombre')
    expect(() => parseTemplateAreas([{ nombre: '', esExterna: true }])).toThrow('nombre válido')
    expect(() => parseTemplateAreas([{ nombre: 'Cocina', esExterna: 'no' }])).toThrow('tipo')
    expect(() => parseTemplateAreas(Array.from({ length: 101 }, (_, i) => ({ nombre: 'A' + i, esExterna: false })))).toThrow('entre 1 y 100')
  })
  it('impide usar un cliente con plantilla global o una privada sin cliente', () => {
    expect(() => parseAreaTemplateInput({ ...draft, alcance: 'GLOBAL' })).toThrow('no pertenece')
    expect(() => parseAreaTemplateInput({ ...draft, clientId: null })).toThrow('Selecciona el cliente')
    expect(() => parseAreaTemplateInput({ ...draft, version: 0 }, true)).toThrow('versión')
    expect(() => optionalAreaTemplateId('injection')).toThrow('válida')
  })
})

describe('Aplicación transaccional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ id: 'admin' })
    transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({ query: clientQuery }))
  })

  it('inserta únicamente faltantes, usa lock y devuelve cuántas se omitieron', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.sedes')) return { rows: [{ clientId }], rowCount: 1 }
      if (sql.includes('from public.plantillas_areas')) return { rows: [{ areas }], rowCount: 1 }
      if (sql.includes('insert into public.areas')) return { rows: [{ id: 'created' }], rowCount: 1 }
      return { rows: [], rowCount: 1 }
    })
    const result = await applyAreaTemplate({ query: clientQuery } as never, siteId, templateId)
    expect(result).toEqual({ created: 1, skipped: 1 })
    expect(clientQuery.mock.calls[0]![0]).toContain('for update')
    expect(clientQuery.mock.calls[1]![0]).toContain("alcance = 'PRIVADA' and negocio_id = $2")
    expect(clientQuery.mock.calls[2]![0]).toContain('on conflict do nothing')
    expect(clientQuery.mock.calls[2]![1]).toEqual([siteId, JSON.stringify(areas)])
  })

  it('no inserta áreas de una plantilla ajena o inactiva', async () => {
    clientQuery.mockImplementation(async (sql: string) => sql.includes('from public.sedes')
      ? { rows: [{ clientId }], rowCount: 1 } : { rows: [], rowCount: 0 })
    await expect(applyAreaTemplate({ query: clientQuery } as never, siteId, templateId)).rejects.toThrow('no está disponible')
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('insert into public.areas'))).toBe(false)
  })

  it('solo permite operaciones administrativas en los endpoints', async () => {
    requireAdmin.mockRejectedValue(new Error('Sin acceso'))
    const response = await areaTemplatesRoutes.request('/', { method: 'GET' })
    expect(response.status).not.toBe(200)
    expect(clientQuery).not.toHaveBeenCalled()
  })

  it('filtra plantillas para el cliente sin mostrar las privadas de otros', async () => {
    clientQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    const response = await areaTemplatesRoutes.request('/?clientId=' + clientId + '&active=true', { method: 'GET' })
    expect(response.status).toBe(200)
    const sql = clientQuery.mock.calls[0]![0] as string
    expect(sql).toContain("p.alcance = 'GLOBAL' or p.negocio_id = $2::uuid")
    expect(clientQuery.mock.calls[0]![1]).toEqual([true, clientId])
  })
})
