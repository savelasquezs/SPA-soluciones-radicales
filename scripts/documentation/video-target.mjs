import { readFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const registryPath = resolve(root, 'e2e/documentation/videos.json')

export function resolveVideoId() {
  if (process.env.DOCS_VIDEO_ID) return process.env.DOCS_VIDEO_ID
  const branch = process.env.GITHUB_REF_NAME || ''
  if (branch.startsWith('video/')) return branch.slice('video/'.length)
  return 'mip-gestion-productos-v4'
}

export function loadVideoTarget() {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  const id = resolveVideoId()
  const target = registry[id]
  if (!target) {
    throw new Error(`No existe configuración para el video "${id}" en e2e/documentation/videos.json.`)
  }
  return target
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = loadVideoTarget()
  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput) {
    appendFileSync(githubOutput, [
      `id=${target.id}`,
      `artifact=${target.artifact}`,
      `output=${target.output}`,
      `spec=${target.spec}`,
      `narration=${target.narration}`,
      '',
    ].join('\n'))
  }
  console.log(JSON.stringify(target, null, 2))
}
