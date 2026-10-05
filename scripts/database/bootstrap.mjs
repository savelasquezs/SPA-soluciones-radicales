import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const bootstrapDir = resolve('database/bootstrap');

function parseEnvValue(content, key) {
  const line = content.split(/\r?\n/u).find((entry) => entry.startsWith(`${key}=`));
  if (!line) return undefined;
  const value = line.slice(key.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadEnvValue(key) {
  if (process.env[key]) return process.env[key];
  for (const file of ['.env', '.env.local']) {
    try {
      const value = parseEnvValue(await readFile(resolve(file), 'utf8'), key);
      if (value) return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

const connectionString = await loadEnvValue('DATABASE_URL_UNPOOLED');
const branch = await loadEnvValue('NEON_BRANCH');

if (!connectionString || !branch) {
  throw new Error('Faltan DATABASE_URL_UNPOOLED o NEON_BRANCH. Ejecuta neon env pull.');
}
if (new URL(connectionString).hostname.includes('-pooler')) {
  throw new Error('DATABASE_URL_UNPOOLED apunta a una conexión pooled.');
}
if (branch === 'production' && process.env.ALLOW_NEON_PRODUCTION !== 'true') {
  throw new Error('Bootstrap bloqueado en production. Requiere ALLOW_NEON_PRODUCTION=true explícito.');
}

const files = (await readdir(bootstrapDir)).filter((name) => name.endsWith('.sql')).sort();
const client = new pg.Client({ connectionString });
await client.connect();

try {
  for (const file of files) {
    const content = await readFile(resolve(bootstrapDir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(content);
      await client.query('commit');
      console.log(`[db:bootstrap] aplicada: ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  console.log(`[db:bootstrap] rama Neon: ${branch}`);
} finally {
  await client.end();
}
