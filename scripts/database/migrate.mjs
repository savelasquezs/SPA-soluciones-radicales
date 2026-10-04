import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const migrationsDir = resolve('database/migrations');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const cli = ['-y', 'neon@6.2.4', 'psql', '--'];

function sqlLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function psql(args, input) {
  const result = spawnSync(npx, [...cli, ...args], {
    encoding: 'utf8',
    input,
    stdio: input === undefined ? ['inherit', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

const validation = spawnSync(
  process.execPath,
  [resolve('scripts/database/check-migrations.mjs')],
  { stdio: 'inherit' },
);

if (validation.status !== 0) {
  process.exit(validation.status ?? 1);
}

psql([
  '-v', 'ON_ERROR_STOP=1',
  '-c',
  `create schema if not exists app_meta;
   create table if not exists app_meta.schema_migrations (
     filename text primary key,
     checksum text not null,
     applied_at timestamptz not null default now()
   );`,
]);

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

for (const file of files) {
  const content = await readFile(resolve(migrationsDir, file), 'utf8');
  const checksum = createHash('sha256').update(content).digest('hex');

  const previous = psql([
    '-At',
    '-c',
    `select checksum from app_meta.schema_migrations where filename = ${sqlLiteral(file)};`,
  ]).trim();

  if (previous) {
    if (previous !== checksum) {
      console.error(`[db:migrate] ERROR: ${file} ya fue aplicada pero su checksum cambió.`);
      process.exit(1);
    }
    console.log(`[db:migrate] omitida: ${file}`);
    continue;
  }

  const script = [
    '\\set ON_ERROR_STOP on',
    'begin;',
    content,
    `insert into app_meta.schema_migrations (filename, checksum) values (${sqlLiteral(file)}, ${sqlLiteral(checksum)});`,
    'commit;',
    '',
  ].join('\n');

  psql([], script);
  console.log(`[db:migrate] aplicada: ${file}`);
}

if (files.length === 0) {
  console.log('[db:migrate] No hay migraciones activas para aplicar.');
}
