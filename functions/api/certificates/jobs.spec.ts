// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PoolClient } from 'pg'
const mock = vi.hoisted(() => ({ query: vi.fn<(sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>>() }))
vi.mock('../db', () => ({ pool: mock, transaction: (callback: (client: unknown) => unknown) => callback(mock) }))
import { claimCertificateJob, lockCertificateJob, markEmailDispatching, failCertificateJob } from './jobs'
const input = { serviceId: 'service' }
const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
function row(values: Record<string, unknown> = {}) { return { id: 'job', status: 'PENDING', leased: false, payload: { actorId: 'admin', fingerprint }, ...values } }
beforeEach(() => { mock.query.mockReset() })
function claimResult(value = row()) { mock.query.mockImplementation(async (sql) => ({ rows: sql.startsWith('select id, status') ? [value] : [], rowCount: 1 })) }
describe('durable certificate operation idempotency', () => {
  it('claims atomically through insert-on-conflict and a row lock', async () => {
    claimResult()
    const result = await claimCertificateJob('DOCUMENT', 'request', input, 'admin')
    expect(result.completed).toBe(false)
    expect(result.token).toMatch(/^[0-9a-f-]{36}$/)
    expect(mock.query.mock.calls.map(([sql]) => sql).join(' ')).toContain('for update')
    expect(mock.query.mock.calls[0]![1]).toEqual(['DOCUMENT', 'certificate:request', expect.any(String)])
  })
  it('returns completed results instead of generating/sending a second time', async () => {
    claimResult(row({ status: 'COMPLETED', payload: { actorId: 'admin', fingerprint, result: { sent: true } } }))
    await expect(claimCertificateJob('EMAIL', 'request', input, 'admin')).resolves.toMatchObject({ completed: true, result: { sent: true } })
    expect(mock.query).toHaveBeenCalledTimes(2)
  })
  it('rejects reused keys with different data or administrator', async () => {
    claimResult()
    await expect(claimCertificateJob('DOCUMENT', 'request', { serviceId: 'another' }, 'admin')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(claimCertificateJob('DOCUMENT', 'request', input, 'another-admin')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('rejects concurrent attempts but reclaims an expired document lease', async () => {
    claimResult(row({ status: 'RUNNING', leased: true }))
    await expect(claimCertificateJob('DOCUMENT', 'request', input, 'admin')).rejects.toMatchObject({ code: 'OPERATION_RUNNING' })
    claimResult(row({ status: 'RUNNING', leased: false }))
    await expect(claimCertificateJob('DOCUMENT', 'request', input, 'admin')).resolves.toMatchObject({ completed: false })
  })
  it.each([{ dispatching: true }, { uncertain: true }])('never reclaims ambiguous email delivery %j', async (state) => {
    claimResult(row({ status: 'FAILED', payload: { actorId: 'admin', fingerprint, ...state } }))
    await expect(claimCertificateJob('EMAIL', 'request', input, 'admin')).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_UNKNOWN' })
  })
  it('guards dispatch and final persistence with the attempt token', async () => {
    mock.query.mockResolvedValue({ rows: [], rowCount: 0 })
    const job = { id: 'job', token: 'old-token', completed: false }
    await expect(lockCertificateJob(mock as unknown as PoolClient, job)).rejects.toMatchObject({ code: 'OPERATION_REPLACED' })
    await expect(markEmailDispatching(job)).rejects.toMatchObject({ status: 409 })
    await failCertificateJob(job, new Error('secret-database-host'), true)
    expect(mock.query.mock.lastCall?.[1]).toEqual(['job', 'old-token', 'No fue posible completar la operación', true])
  })
})
