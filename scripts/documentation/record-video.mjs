import { spawnSync } from 'node:child_process'
import { loadVideoTarget } from './video-target.mjs'

const target = loadVideoTarget()
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(
  command,
  ['playwright', 'test', target.spec, '--config=playwright.docs.config.ts'],
  { stdio: 'inherit', env: process.env },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
