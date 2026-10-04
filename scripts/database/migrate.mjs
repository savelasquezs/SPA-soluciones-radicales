import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const migrationsDir = resolve('database/migrations');

function parseEnvValue(content, key) {
  const line = content
    .split(/\r?\n/u)
    .find((entry) => entry.startsWith(`${key}=`));

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

const validation = spawnSync(
  process.execPath,
  [resolve('scripts/database/check-migrations.mjs')],
  { stdio: 'inherit' },
);

if (validation.status !== 0) {
  process.exit(validation.status ?? 1);
}

const connectionString = await loadEnvValue('DATABASE_URL_UNPOOLED');
if (!connectionString) {
  throw new Error('DATABASE_URL_UNPOOLED no está configurada. Ejecuta neon env pull.');
}
if (new URL(connectionString).hostname.includes('-pooler')) {
  throw new Error('DATABASE_URL_UNPOOLED apunta a una conexión pooled.');
}

const branch = await loadEnvValue('NEON_BRANCH');
if (!branch) {
  throw new Error('NEON_BRANCH no está configurada. Confirma la rama antes de migrar.');
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query(`
    create schema if not exists app_meta;
    create table if not exists app_meta.schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = await readFile(resolve(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const previous = await client.query(
      'select checksum from app_meta.schema_migrations where filename = $1',
      [file],
    );

    if (previous.rowCount > 0) {
      if (previous.rows[0].checksum !== checksum) {
        throw new Error(`${file} ya fue aplicada pero su checksum cambió.`);
      }
      console.log(`[db:migrate] omitida: ${file}`);
      continue;
    }

    try {
      await client.query('begin');
      await client.query(content);
      await client.query(
        'insert into app_meta.schema_migrations (filename, checksum) values ($1, $2)',
        [file, checksum],
      );
      await client.query('commit');
      console.log(`[db:migrate] aplicada: ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  if (files.length === 0) {
    console.log('[db:migrate] No hay migraciones activas para aplicar.');
  }

  console.log(`[db:migrate] rama Neon: ${branch}`);
} finally {
  await client.end();
}
