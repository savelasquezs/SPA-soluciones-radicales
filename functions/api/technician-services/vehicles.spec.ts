import type { PoolClient } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTechnicianVehicle, finalizeTechnicianService, saveTechnicianVehicles } from './commands'

vi.mock('./queries', () => ({
  assignedServiceState: vi.fn<() => Promise<{ estado: string; tipo_servicio: string }>>(
    async () => ({ estado: 'EN_PROCESO', tipo_servicio: 'PRINCIPAL' })),
  getTechnicianPackage: vi.fn<() => Promise<{ service: { estado: string } }>>(
    async () => ({ service: { estado: 'FINALIZADO' } })),
}))
vi.mock('../services/commands', () => ({
  audit: vi.fn<() => Promise<void>>(async () => undefined),
  queueServiceCertificates: vi.fn<() => Promise<void>>(async () => undefined),
  assertVersion: vi.fn<() => void>(),
}))

const user = '11111111-1111-4111-8111-111111111111'
const service = '22222222-2222-4222-8222-222222222222'
const phone = '33333333-3333-4333-8333-333333333333'
const token = '44444444-4444-4444-8444-444444444444'
const site = '55555555-5555-4555-8555-555555555555'
const vehicleId = '66666666-6666-4666-8666-666666666666'

function mockClient(options: {
  enabled?: boolean
  missingConfirmation?: boolean
  existingVehicle?: boolean
  allowedIds?: string[]
} = {}) {
  const queries: string[] = []
  const query = vi.fn<(sql: string) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>>(async sql => {
    queries.push(sql)
    if (sql.includes('from private.service_execution_locks')) {
      return { rows: [{ user_id: user, device_id: phone, lock_token: token }] }
    }
    if (sql.includes('as "siteId"')) {
      return { rows: [{ siteId: site, enabled: options.enabled ?? true }] }
    }
    if (sql.includes('insert into public.vehiculos')) {
      return { rows: options.existingVehicle ? [] : [{ id: vehicleId, placa: 'ABC123', activo: true }] }
    }
    if (sql.includes('lower(btrim(placa))=lower(btrim($2))')) {
      return { rows: [{ id: vehicleId, placa: 'ABC123', activo: true }] }
    }
    if (sql.includes('from public.vehiculos v join public.servicios s')) {
      return { rows: (options.allowedIds ?? [vehicleId]).map(id => ({ id })) }
    }
    if (sql.includes('as missing')) {
      return { rows: [{ missing: options.missingConfirmation ?? false }] }
    }
    if (sql.includes('count(*)::integer')) return { rows: [{ count: 0 }] }
    return { rows: [], rowCount: 1 }
  })
  return { client: { query } as unknown as PoolClient, query, queries }
}

beforeEach(() => vi.clearAllMocks())

describe('technician service vehicle authorization and closure', () => {
  it('does not permit vehicle creation when the site is not enabled', async () => {
    const { client, queries } = mockClient({ enabled: false })
    await expect(createTechnicianVehicle(client, user, service, phone, token, vehicleId, 'ABC123'))
      .rejects.toThrow('no requiere atención de vehículos')
    expect(queries.some(sql => sql.includes('insert into public.vehiculos'))).toBe(false)
  })

  it('reuses an existing normalized plate instead of creating a duplicate', async () => {
    const { client } = mockClient({ existingVehicle: true })
    await expect(createTechnicianVehicle(client, user, service, phone, token, vehicleId, 'ABC123'))
      .resolves.toMatchObject({ created: false, vehicle: { id: vehicleId, placa: 'ABC123' } })
  })

  it('only records vehicle IDs authorized for the same site', async () => {
    const { client, queries } = mockClient({ allowedIds: [] })
    await expect(saveTechnicianVehicles(client, user, service, phone, token, [vehicleId]))
      .rejects.toThrow('Actualiza las placas')
    expect(queries.some(sql => sql.includes('update public.servicios set vehiculos_atendidos_ids_json'))).toBe(false)
  })

  it('accepts a confirmed empty selection as valid', async () => {
    const { client, query } = mockClient({ allowedIds: [] })
    await expect(saveTechnicianVehicles(client, user, service, phone, token, []))
      .resolves.toEqual({ attendedVehicleIds: [] })
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('update public.servicios set vehiculos_atendidos_ids_json'),
      [service, '[]'],
    )
  })

  it('rejects finalization when vehicles were never confirmed', async () => {
    const { client, queries } = mockClient({ missingConfirmation: true })
    await expect(finalizeTechnicianService(client, user, service, phone, token,
      'services/technician.png', 'services/client.png', 'Representante'))
      .rejects.toThrow('Confirma los vehículos atendidos')
    expect(queries.some(sql => sql.includes("set estado='FINALIZADO'"))).toBe(false)
  })

  it('allows the established closure after confirming zero vehicles', async () => {
    const { client, queries } = mockClient({ missingConfirmation: false })
    await expect(finalizeTechnicianService(client, user, service, phone, token,
      'services/technician.png', 'services/client.png', 'Representante'))
      .resolves.toHaveProperty('package')
    expect(queries.some(sql => sql.includes("set estado='FINALIZADO'"))).toBe(true)
  })
})
