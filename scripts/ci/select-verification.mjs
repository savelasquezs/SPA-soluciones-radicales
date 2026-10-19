import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const filters = JSON.parse(readFileSync(new URL('./verification-paths.json', import.meta.url), 'utf8'))

// The preserved workflow filters use only literals, * and **. Match dotfiles
// too, as GitHub path filters do; node:path.matchesGlob excludes them.
function matchesPath(path, pattern) {
  const expression = pattern.split('**').map((part) => part.split('*')
    .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')
  return new RegExp(`^${expression}$`).test(path)
}

export function selectSuites(paths, manualSuite) {
  if (manualSuite && manualSuite !== 'all' && !Object.hasOwn(filters, manualSuite)) {
    throw new Error(`Unknown verification suite: ${manualSuite}`)
  }
  const all = manualSuite === 'all' || paths.some((path) =>
    path === '.github/workflows/verification.yml' || path.startsWith('scripts/ci/'))
  return Object.fromEntries(Object.entries(filters).map(([suite, patterns]) => [
    suite, all || manualSuite === suite || paths.some((path) => patterns.some((pattern) => matchesPath(path, pattern))),
  ]))
}

export function changedPaths(event) {
  const base = event.pull_request?.base?.sha
  const head = event.pull_request?.head?.sha
  if (![base, head].every((sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error('A pull request with valid base and head SHAs is required')
  }
  // Full history and a merge-base diff preserve PR semantics, including deletions
  // and renames, without relying on the paginated/300-file GitHub paths API.
  return execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  const paths = manual ? [] : changedPaths(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')))
  const suites = selectSuites(paths, manual ? (process.env.CI_SUITE || 'services') : undefined)
  for (const [suite, selected] of Object.entries(suites)) {
    const output = `${suite}=${selected}\n`
    process.stdout.write(output)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  }
}
