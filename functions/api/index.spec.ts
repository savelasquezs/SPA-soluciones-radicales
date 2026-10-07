import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = { rows: unknown[]; rowCount: number }
type Query = (sql: string, params?: unknown[]) => Promise<QueryResult>
type Transaction = (
  callback: (client: { query: Query }) => Promise<unknown>,
) => Promise<unknown>

const {
  bootstrapProfile,
  clientQuery,
  poolQuery,
  requireAdmin,
  requireTechnician,
  transaction,
  upsertCalendarEvent,
  verifyAuthorization,
} = vi.hoisted(() => ({
  bootstrapProfile: vi.fn<(client: unknown, identity: unknown) => Promise<unknown>>(),
  clientQuery: vi.fn<Query>(),
  poolQuery: vi.fn<Query>(),
  requireAdmin: vi.fn<(client: unknown, identity: unknown) => Promise<unknown>>(),
  requireTechnician: vi.fn<(client: unknown, identity: unknown) => Promise<unknown>>(),
  transaction: vi.fn<Transaction>(),
  upsertCalendarEvent: vi.fn<(input: unknown) => Promise<string>>(),
  verifyAuthorization: vi.fn<(header: string | undefined) => Promise<unknown>>(),
}))

vi.mock('./auth', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly code?: string,
      public readonly details?: Record<string, unknown>,
    ) {
      super(message)
    }
  },
  bootstrapProfile,
  requireAdmin,
  requireTechnician,
  verifyAuthorization,
}))

vi.mock('./db', () => ({
  pool: { query: poolQuery },
  transaction,
}))

vi.mock('./google', () => ({
  completeGoogleAuthorization: vi.fn<(code: string, state: string) => Promise<string>>(),
  createGoogleAuthorization: vi.fn<(
    client: unknown,
    requestedById: string,
    returnUrl: string,
  ) => Promise<string>>(),
  getGoogleStatus: vi.fn<() => Promise<{ connected: boolean; email: string | null }>>(),
  sendGmailMessage: vi.fn<(input: unknown) => Promise<string>>(),
  upsertCalendarEvent,
}))

import app from './index'

const serviceId = '25059690-890e-40a7-ad5c-5245023138cf'

describe('retired synchronous service writes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthorization.mockResolvedValue({ authUserId:'auth-user', session:{ sub:'auth-user' } })
  })
  it.each(['/api/services', `/api/services/${serviceId}/calendar/retry`])(
    'does not expose the unversioned write %s', async path => {
      const response = await app.request(path, { method:'POST', headers:{ Authorization:'Bearer token' } })
      expect(response.status).toBe(404)
      expect(clientQuery).not.toHaveBeenCalled()
      expect(poolQuery).not.toHaveBeenCalled()
      expect(upsertCalendarEvent).not.toHaveBeenCalled()
    },
  )
})

describe('User certificate integrity', () => {
  const validUser = {
    nombreCompleto: 'Técnico de prueba',
    correoGoogle: 'tecnico@example.com',
    esAdmin: false,
    esTecnico: true,
    activo: true,
    certificadoStoragePath: null,
    certificadoFechaEmision: null,
    certificadoFechaVencimiento: null,
    certificadoObservaciones: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthorization.mockResolvedValue({ authUserId: 'auth-user', session: { sub: 'auth-user' } })
    requireAdmin.mockResolvedValue({ id: 'admin-id' })
    transaction.mockImplementation(async (callback) => callback({ query: clientQuery }))
  })

  it('allows a technician without a certificate and persists null dates', async () => {
    clientQuery.mockImplementation(async (sql) => sql.includes('insert into public.usuarios')
      ? { rows: [{ id: 'user-id', ...validUser, version: 1 }], rowCount: 1 }
      : { rows: [], rowCount: 1 })

    const response = await app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(validUser),
    })

    expect(response.status).toBe(201)
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.usuarios'),
      expect.arrayContaining([null, null, null]),
    )
  })

  it('requires both dates when a certificate path exists', async () => {
    const response = await app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validUser, certificadoStoragePath: 'certificados/tecnico.pdf' }),
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toEqual({ error: 'La fecha de emisión es obligatoria cuando existe un certificado' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('returns a safe conflict for a duplicated email', async () => {
    clientQuery.mockRejectedValue(Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'usuarios_correo_google_uidx',
    }))

    const response = await app.request('/api/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(validUser),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'Este correo ya está registrado.' })
  })
})

describe('Clients, Sites and Areas API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthorization.mockResolvedValue({ authUserId: 'auth-user', session: { sub: 'auth-user' } })
    requireAdmin.mockResolvedValue({ id: 'admin-id' })
    transaction.mockImplementation(async (callback) => callback({ query: clientQuery }))
  })

  it('creates a minimal residential Client with one internal residential Site', async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.includes('insert into public.negocios')) return { rows: [{ id: 'client-id' }], rowCount: 1 }
      if (sql.includes('insert into public.sedes')) return { rows: [], rowCount: 1 }
      if (sql.includes('from public.negocios n')) {
        return { rows: [{ id: 'client-id', tipoCliente: 'RESIDENCIAL', nombre: 'María Gómez', nit: null, correos: [], activo: true, version: 1, residenciaDireccion: 'Calle 1', residenciaCelular: '+573001234567', sedesCount: 0 }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })

    const response = await app.request('/api/clients', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoCliente: 'RESIDENCIAL', nombre: 'María Gómez', nit: null, correos: [], activo: true, vigenciaCertificadoMeses: null, residenciaDireccion: 'Calle 1', residenciaCelular: '300 123 4567' }),
    })

    expect(response.status).toBe(201)
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('insert into public.sedes'), ['client-id', 'María Gómez', 'Calle 1', '+573001234567', true])
  })

  it('keeps the Services catalog separate and filters residential locations', async () => {
    clientQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    const response = await app.request('/api/catalogs/client-sites', { headers: { Authorization: 'Bearer token' } })
    expect(response.status).toBe(200)
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("n.tipo_cliente = 'NEGOCIO'"))
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("s.tipo_sede = 'NEGOCIO'"))
  })

  it('rejects a commercial Client without NIT', async () => {
    const response = await app.request('/api/clients', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoCliente: 'NEGOCIO', nombre: 'Acme', nit: '', correos: [], activo: true, vigenciaCertificadoMeses: 12 }),
    })
    expect(response.status).toBe(422)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('applies active, type and search filters to the administrative Client list', async () => {
    clientQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    const response = await app.request('/api/clients?active=false&type=RESIDENCIAL&search=300', {
      headers: { Authorization: 'Bearer token' },
    })

    expect(response.status).toBe(200)
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('n.nombre ilike'), [false, 'RESIDENCIAL', '300'])
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('contacto_principal_celular'), [false, 'RESIDENCIAL', '300'])
  })

  it('rejects an invalid residential phone before opening a transaction', async () => {
    const response = await app.request('/api/clients', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoCliente: 'RESIDENCIAL', nombre: 'Casa', correos: [], activo: true, residenciaDireccion: 'Calle 1', residenciaCelular: '123' }),
    })

    expect(response.status).toBe(422)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects a Site without a valid required phone', async () => {
    const response = await app.request('/api/clients/client-id/sites', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Principal', direccion: 'Calle 1', correos: [], heredaCorreosCliente: true,
        contactoPrincipalNombre: 'Ana', contactoPrincipalCorreo: null, contactoPrincipalCelular: '12',
        valorServicio: 100000, periodicidadMeses: 1, manejaRefuerzo: false,
        planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false,
        vigenciaCertificadoVehiculoMeses: null,
        duracionServicioMinutos: 120, activo: true,
      }),
    })

    expect(response.status).toBe(422)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('returns a typed conflict when an Area version is stale', async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.includes('select activo from public.areas')) return { rows: [{ activo: true }], rowCount: 1 }
      if (sql.includes('update public.areas')) return { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 1 }
    })
    const response = await app.request('/api/areas/area-id', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Cocina', esExterna: false, activo: true, version: 1 }),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ code: 'VERSION_CONFLICT', details: { entity: 'Área' } })
  })
})

describe('administrator service authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthorization.mockResolvedValue({ authUserId:'technician-auth',session:{ sub:'technician-auth' } })
    transaction.mockImplementation(async callback=>callback({ query:clientQuery }))
  })
  it('rejects reading and creating administrative services for a technician', async () => {
    const { ApiError }=await import('./auth')
    requireAdmin.mockRejectedValue(new ApiError(403,'Solo Administrador'))
    const headers={ Authorization:'Bearer synthetic-token','Content-Type':'application/json' }
    expect((await app.request('/api/admin/services/workspace',{ headers })).status).toBe(403)
    const response=await app.request('/api/admin/services',{ method:'POST',headers,body:JSON.stringify({
      requestId:serviceId,input:{ sedeId:serviceId,programacion:{ inicioProgramado:'2030-10-06T14:00:00Z',duracionMinutos:90,tecnicoResponsableId:serviceId,tecnicosColaboradoresIds:[] },refuerzo:null,productos:[],cobro:{ metodoPago:null,tecnicoRecaudoPrevistoId:null },observaciones:'' },
    }) })
    expect(response.status).toBe(403)
    expect(clientQuery).not.toHaveBeenCalled();expect(upsertCalendarEvent).not.toHaveBeenCalled()
  })
})

describe('technician service authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthorization.mockResolvedValue({ authUserId:'technician-auth',session:{ sub:'technician-auth' } })
    transaction.mockImplementation(async callback=>callback({ query:clientQuery }))
  })
  it('exposes the assigned-service surface only to the active Technician role',async()=>{
    const { ApiError }=await import('./auth')
    requireTechnician.mockRejectedValue(new ApiError(403,'Se requiere el rol Técnico'))
    const response=await app.request('/api/technician/services',{ headers:{ Authorization:'Bearer synthetic-token' } })
    expect(response.status).toBe(403)
    expect(clientQuery).not.toHaveBeenCalled()
  })
  it('lists technician services through the dedicated authority',async()=>{
    requireTechnician.mockResolvedValue({ id:'technician-id' })
    clientQuery.mockResolvedValue({ rows:[],rowCount:0 })
    const response=await app.request('/api/technician/services',{ headers:{ Authorization:'Bearer synthetic-token' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("s.tipo_servicio='PRINCIPAL'"),['technician-id'])
  })
})
