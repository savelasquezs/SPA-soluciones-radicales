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
  transaction,
  upsertCalendarEvent,
  verifyAuthorization,
} = vi.hoisted(() => ({
  bootstrapProfile: vi.fn<(client: unknown, identity: unknown) => Promise<unknown>>(),
  clientQuery: vi.fn<Query>(),
  poolQuery: vi.fn<Query>(),
  requireAdmin: vi.fn<(client: unknown, identity: unknown) => Promise<unknown>>(),
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

describe('Calendar service synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthorization.mockResolvedValue({ authUserId: 'auth-user', session: { sub: 'auth-user' } })
    requireAdmin.mockResolvedValue({ id: 'admin-id' })
    transaction.mockImplementation(async (callback) => callback({ query: clientQuery }))
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.sedes')) {
        return { rows: [{ duracion: 120, valor: 180_000 }], rowCount: 1 }
      }
      if (sql.includes('insert into public.servicios')) {
        return { rows: [{ id: serviceId, solicitud: 'SR-00000002' }], rowCount: 1 }
      }
      if (sql.includes("set calendar_sync_estado = 'PENDIENTE'")) {
        return { rows: [{ id: serviceId }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.servicios s')) {
        return {
          rows: [{
            id: serviceId,
            solicitud: 'SR-00000002',
            creado_por_id: 'admin-id',
            negocio_nombre: 'Cliente de prueba',
            sede_nombre: 'Sede de prueba',
            direccion: 'Dirección de prueba',
            tecnico_nombre: 'Técnico de prueba',
            inicio_programado: new Date('2026-10-06T15:00:00.000Z'),
            fin_programado: new Date('2026-10-06T17:00:00.000Z'),
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 1 }
    })
  })

  it('keeps the created service and records an error when Calendar fails', async () => {
    upsertCalendarEvent.mockRejectedValue(new Error('Google no disponible'))

    const response = await app.request('/api/services', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sedeId: 'site-id',
        tecnicoResponsableId: 'technician-id',
        tecnicosColaboradoresIds: [],
        inicioProgramado: '2026-10-06T15:00:00.000Z',
        duracionMinutos: 120,
        observaciones: 'Prueba controlada',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      id: serviceId,
      solicitud: 'SR-00000002',
      calendarSyncEstado: 'ERROR',
      calendarSyncError: 'Google no disponible',
    })
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("set calendar_sync_estado = 'ERROR'"),
      [serviceId, 'Google no disponible'],
    )
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("set status = 'FAILED'"),
      [serviceId, 'Google no disponible'],
    )
  })

  it('retries an errored service and persists the Calendar event identifier', async () => {
    upsertCalendarEvent.mockResolvedValue('sr25059690890e40a7ad5c5245023138cf')

    const response = await app.request(`/api/services/${serviceId}/calendar/retry`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: serviceId,
      calendarSyncEstado: 'SINCRONIZADO',
      calendarEventId: 'sr25059690890e40a7ad5c5245023138cf',
    })
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("set calendar_event_id = $2"),
      [serviceId, 'sr25059690890e40a7ad5c5245023138cf'],
    )
    expect(upsertCalendarEvent).toHaveBeenCalledOnce()
  })
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
      body: JSON.stringify({ tipoCliente: 'RESIDENCIAL', nombre: 'María Gómez', nit: null, correos: [], activo: true, vigenciaCertificadoMeses: null, plantillaCertificadoStoragePath: null, residenciaDireccion: 'Calle 1', residenciaCelular: '300 123 4567' }),
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
      body: JSON.stringify({ tipoCliente: 'NEGOCIO', nombre: 'Acme', nit: '', correos: [], activo: true, vigenciaCertificadoMeses: 12, plantillaCertificadoStoragePath: 'templates/acme.docx' }),
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
        valorServicio: 100000, periodicidadMeses: 1, manejaRefuerzo: false, formulariosAplicablesIds: [],
        planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false,
        vigenciaCertificadoVehiculoMeses: null, plantillaCertificadoVehiculoStoragePath: null,
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
