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
