import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { JWTPayload } from 'jose'
import type { Identity } from '../auth'

type DbResult = { rows: Record<string, unknown>[]; rowCount: number }
const mocks = vi.hoisted(() => ({
  query: vi.fn<(sql: string, params?: unknown[]) => Promise<DbResult>>(),
  self: vi.fn<(client: unknown, identity: unknown) => Promise<{ id: string }>>(),
  audit: vi.fn<(client: unknown, userId: string, action: string, detail: Record<string, unknown>) => Promise<void>>(),
}))

vi.mock('../db', () => ({
  transaction: async (callback: (client: { query: typeof mocks.query }) => Promise<unknown>) =>
    callback({ query: mocks.query }),
}))
vi.mock('./identity', () => ({
  self: mocks.self,
  auditProfile: mocks.audit,
  readProfileBody: async (request: Request) => request.json(),
}))
vi.mock('../auth', () => ({
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message) }
  },
}))

import { googleChangeRoutes } from './google'

const userId = '4fc871dd-19d0-493e-9871-ce26be1c9649'
const oldAuth = 'old-google-user'
const freshAuth = 'new-google-user'
const token = 'A'.repeat(43)
const makeIdentity = (): Identity => ({ authUserId: freshAuth, session: { sub: freshAuth } satisfies JWTPayload })
const app = new Hono<{ Variables: { identity: Identity } }>()

app.use('*', async (context, next) => {
  context.set('identity', makeIdentity())
  await next()
})
app.route('/google', googleChangeRoutes)
app.onError((error, context) => {
  const status = 'status' in error && typeof error.status === 'number' ? error.status : 500
  return context.json({ error: error.message }, status as 400 | 401 | 403 | 409 | 500)
})

async function finish() {
  return app.request('/google/finish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

const activeRequest = {
  user_id: userId, old_auth_user_id: oldAuth,
  expires_at: new Date(Date.now() + 600_000).toISOString(), consumed_at: null,
}

function respondToValidTransfer(sql: string): DbResult {
  if (sql.includes('from private.user_google_change_requests where state_hash')) {
    return { rows: [activeRequest], rowCount: 1 }
  }
  if (sql.includes('from neon_auth."user"')) {
    return { rows: [{ email: 'nueva@gmail.com', verified: true }], rowCount: 1 }
  }
  if (sql.includes('private.has_google_identity')) {
    return { rows: [{ allowed: true }], rowCount: 1 }
  }
  if (sql.includes('select auth_user_id,activo from public.usuarios')) {
    return { rows: [{ auth_user_id: oldAuth, activo: true }], rowCount: 1 }
  }
  if (sql.includes('select 1 from public.usuarios')) {
    return { rows: [], rowCount: 0 }
  }
  return { rows: [], rowCount: 1 }
}

describe('transferencia verificada de identidad Google', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.self.mockResolvedValue({ id: userId })
    mocks.query.mockImplementation(async sql => respondToValidTransfer(sql))
  })

  it('crea un estado opaco temporal al iniciar el cambio', async () => {
    const response = await app.request('/google/start', { method: 'POST' })
    expect(response.status).toBe(200)
    const body = await response.json() as { token: string; expiresInSeconds: number }
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.expiresInSeconds).toBe(600)
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into private.user_google_change_requests'),
      expect.arrayContaining([userId, freshAuth]),
    )
  })

  it('conserva el usuario interno y revoca el rol antiguo tras autenticar Google', async () => {
    const response = await finish()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ correoGoogle: 'nueva@gmail.com' })
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('update public.usuarios set auth_user_id'),
      [freshAuth, 'nueva@gmail.com', userId],
    )
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from private.user_sessions'),
      [oldAuth],
    )
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('set consumed_at=now()'),
      expect.any(Array),
    )
  })

  it('rechaza un estado vencido o ya consumido sin modificar al usuario', async () => {
    mocks.query.mockImplementation(async sql =>
      sql.includes('from private.user_google_change_requests where state_hash')
        ? { rows: [{ ...activeRequest, consumed_at: new Date().toISOString() }], rowCount: 1 }
        : respondToValidTransfer(sql),
    )
    const response = await finish()
    expect(response.status).toBe(409)
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('update public.usuarios set auth_user_id'))).toBe(false)
  })

  it('no vincula identidades sin correo Google verificado', async () => {
    mocks.query.mockImplementation(async sql =>
      sql.includes('from neon_auth."user"')
        ? { rows: [{ email: 'nueva@gmail.com', verified: false }], rowCount: 1 }
        : respondToValidTransfer(sql),
    )
    const response = await finish()
    expect(response.status).toBe(403)
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('update public.usuarios set auth_user_id'))).toBe(false)
  })

  it('protege contra una segunda cuenta que ya pertenece a un usuario del SPA', async () => {
    mocks.query.mockImplementation(async sql =>
      sql.includes('select 1 from public.usuarios')
        ? { rows: [{ duplicate: true }], rowCount: 1 }
        : respondToValidTransfer(sql),
    )
    const response = await finish()
    expect(response.status).toBe(409)
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('update public.usuarios set auth_user_id'))).toBe(false)
  })
})
