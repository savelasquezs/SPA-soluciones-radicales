import assert from 'node:assert/strict'
import test from 'node:test'
import { runScheduledRetention } from './index.mjs'

const env = {
  RETENTION_API_URL: 'https://example.com/jobs/retention',
  RETENTION_CRON_TOKEN: '0123456789abcdef0123456789abcdef',
  RETENTION_MODE: 'dry-run',
}

test('default dry run never requests deletion and makes one call', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    calls.push(JSON.parse(request.body).mode)
    return { ok: true, json: async () => ({ mode: 'dry-run', candidates: 40, deleted: 0, failed: 0 }) }
  })
  const value = await runScheduledRetention(env)
  assert.deepEqual(calls, ['dry-run'])
  assert.equal(value.deleted, 0)
  assert.equal(value.batches, 1)
})

test('delete runs bounded batches and stops when exhausted', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    assert.equal(JSON.parse(request.body).mode, 'delete')
    calls++
    return { ok: true, json: async () => ({ mode: 'delete', candidates: calls === 1 ? 40 : 3, deleted: calls === 1 ? 40 : 3, failed: 0 }) }
  })
  const value = await runScheduledRetention({ ...env, RETENTION_MODE: 'delete' })
  assert.equal(calls, 2)
  assert.equal(value.deleted, 43)
})

test('fails closed without a secret', async () => {
  await assert.rejects(runScheduledRetention({ ...env, RETENTION_CRON_TOKEN: '' }), /configuración/)
})

test('rejects unexpected backend response', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ mode: 'delete', candidates: 800, deleted: 800, failed: 0 }) }))
  await assert.rejects(runScheduledRetention({ ...env, RETENTION_MODE: 'delete' }), /inválida/)
})
