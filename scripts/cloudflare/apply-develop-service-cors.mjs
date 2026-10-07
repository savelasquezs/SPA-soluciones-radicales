import { spawnSync } from 'node:child_process'

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_BRANCH !== 'develop') process.exit(0)

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npm, ['run', 'r2:service-cors:apply'], { stdio: 'inherit' })

if (result.error) throw result.error
process.exit(result.status ?? 1)
