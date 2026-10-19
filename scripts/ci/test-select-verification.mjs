import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectSuites, changedPaths } from './select-verification.mjs'

const all = { services: true, certificates: true, files: true, catalogs: true }
const none = { services: false, certificates: false, files: false, catalogs: false }

for (const path of ['src/nested/View.vue', 'package.json', 'package-lock.json', '.github/workflows/verification.yml', 'scripts/ci/select-verification.mjs']) {
  test(`${path} selects every suite`, () => assert.deepEqual(selectSuites([path]), all))
}
test('database changes preserve all SQL and related browser coverage', () => {
  assert.deepEqual(selectSuites(['database/migrations/changed.sql']), { ...all, files: false })
})
test('test-only changes preserve original services selection', () => {
  assert.deepEqual(selectSuites(['tests/integration/admin-services.pg.ts']), { ...none, services: true })
})
test('all E2E changes still select certificates and services', () => {
  assert.deepEqual(selectSuites(['e2e/profile.spec.ts']), { ...none, services: true, certificates: true })
})
test('catalog E2E additionally selects catalogs', () => {
  assert.deepEqual(selectSuites(['e2e/mip-catalogs.spec.ts']), { ...all, files: false })
})
test('file E2E selects the original union; runner executes files only once', () => {
  assert.deepEqual(selectSuites(['e2e/file-optimization.spec.ts']), { ...all, catalogs: false })
})
test('configuration wildcard stays root-only', () => {
  assert.deepEqual(selectSuites(['vite.config.ts']), { ...none, certificates: true, files: true })
  assert.deepEqual(selectSuites(['docs/config-notes.md']), none)
})
test('r2 wildcard does not accidentally match nested paths', () => {
  assert.equal(selectSuites(['functions/api/r2.ts']).files, true)
  assert.equal(selectSuites(['functions/api/r2/nested.ts']).files, false)
})
test('documentation alone does not select verification suites', () => {
  assert.deepEqual(selectSuites(['README.md', 'docs/development/workflow.md']), none)
})
test('multiple paths combine selections', () => {
  assert.deepEqual(selectSuites(['tests/unit.ts', 'vite.config.ts']), { ...all, catalogs: false })
})
test('manual services retains the previous workflow scope', () => {
  assert.deepEqual(selectSuites([], 'services'), { ...none, services: true })
  assert.deepEqual(selectSuites([], 'all'), all)
  assert.throws(() => selectSuites([], 'unknown'), /Unknown verification suite/)
})
test('invalid PR refs fail closed instead of skipping coverage', () => {
  assert.throws(() => changedPaths({}), /valid base and head SHAs/)
  assert.throws(() => changedPaths({ pull_request: { base: { sha: '--option' }, head: { sha: 'a'.repeat(40) } } }), /valid base and head SHAs/)
})

test('GitHub wildcard semantics include hidden files and directories', () => {
  assert.deepEqual(selectSuites(['src/.hidden.ts']), all)
  assert.deepEqual(selectSuites(['tests/.fixtures/data.json']), { ...none, services: true })
  assert.deepEqual(selectSuites(['.configrc']), { ...none, certificates: true, files: true })
})
