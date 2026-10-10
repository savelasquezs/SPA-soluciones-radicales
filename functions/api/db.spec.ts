// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Query = (sql: string) => Promise<{ rows: unknown[] }>
type Release = (destroy?: boolean) => void

const { connect, query, release, events, poolConfig, attach } = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<{ query: Query; release: Release }>>(),
  query: vi.fn<Query>(), release: vi.fn<Release>(), attach: vi.fn<(pool: unknown) => void>(),
  events: new Map<string, () => void>(), poolConfig: {} as Record<string, unknown>,
}))
vi.mock('@neon/functions', () => ({ attachDatabasePool: attach }))
vi.mock('pg', () => ({ Pool: class {
  constructor(config: Record<string, unknown>) { Object.assign(poolConfig, config) }
  connect = connect
  on(event: string, callback: () => void) { events.set(event, callback) }
} }))
vi.mock('./auth', () => ({ ApiError: class extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message) }
} }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/test')
  connect.mockResolvedValue({ query, release })
  query.mockResolvedValue({ rows: [] })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('pool recuperable después de suspensión', () => {
  it('limita conexiones y consultas sin cambiar la suspensión de Neon', async () => {
    await import('./db')
    expect(poolConfig).toMatchObject({ max: 5, connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000, statement_timeout: 20000, query_timeout: 25000 })
    expect(events.has('error')).toBe(true)
  })

  it('devuelve 503 cuando no se consigue conexión y no ejecuta la transacción', async () => {
    const { transaction } = await import('./db')
    connect.mockRejectedValueOnce(new Error('connect timeout'))
    const work = vi.fn<() => Promise<void>>()
    await expect(transaction(work)).rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' })
    expect(work).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('libera el cliente después de confirmar', async () => {
    const { transaction } = await import('./db')
    await expect(transaction(async () => 42)).resolves.toBe(42)
    expect(query.mock.calls.map(call => call[0])).toEqual(['begin', 'commit'])
    expect(release).toHaveBeenCalledWith(false)
  })

  it('preserva el error original si rollback también falla y descarta el cliente', async () => {
    const { transaction } = await import('./db')
    const original = new Error('regla de dominio')
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('rollback disconnected'))
    await expect(transaction(async () => { throw original })).rejects.toBe(original)
    expect(release).toHaveBeenCalledWith(true)
  })

  it('no repite la operación si se corta la conexión durante COMMIT', async () => {
    const { transaction } = await import('./db')
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(Object.assign(new Error('lost'), { code: 'ECONNRESET' }))
    const work = vi.fn<() => Promise<number>>().mockResolvedValue(42)
    await expect(transaction(work)).rejects.toMatchObject({ status: 503, code: 'COMMIT_UNCONFIRMED' })
    expect(work).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledWith(true)
  })

  it('maneja la caída de un cliente inactivo sin registrar secretos', async () => {
    await import('./db')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => events.get('error')!()).not.toThrow()
    expect(warning).toHaveBeenCalledWith('Se descartó una conexión inactiva de PostgreSQL.')
  })
})
