import { randomBytes, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const configPath = 'cloudflare/storage-retention/wrangler.jsonc'
async function envValue(key) {
  if (process.env[key]) return process.env[key]
  for (const file of ['.env', '.env.local']) {
    try {
      const text = await readFile(file, 'utf8')
      const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
      if (match) return match[1].trim().replace(/^["']|["']$/g, '')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return null
}

const branch = await envValue('NEON_BRANCH')
if (branch !== 'desarrollo') throw new Error('Este comando solo admite NEON_BRANCH=desarrollo.')
const databaseUrl = await envValue('DATABASE_URL_UNPOOLED')
if (!databaseUrl) throw new Error('Ejecuta neon env pull. Falta DATABASE_URL_UNPOOLED.')

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  const tables = await client.query("select to_regclass('private.storage_retention_auth') as name")
  if (!tables.rows[0].name) throw new Error('Primero aplica la migración de retención.')
  const token = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(token).digest('hex')

  // No se imprime ni se escribe el secreto en ningún archivo.
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', 'RETENTION_CRON_TOKEN',
    '--config', configPath], {
    input: token,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) throw new Error('No fue posible configurar el secreto en Cloudflare.')

  await client.query(
    `insert into private.storage_retention_auth(name, token_sha256)
      values ('cloudflare-cron',$1)
      on conflict(name) do update set token_sha256=excluded.token_sha256, updated_at=now()`,
    [hash],
  )
  console.log('Credencial instalada: secreto en Cloudflare, hash en Neon. No se mostró el token.')
} finally {
  await client.end()
}
