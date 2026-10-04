import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationsDir = resolve('database/migrations');
const filenamePattern = /^\d{8}_\d{3}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const transactionPattern = /^\s*(begin|commit|rollback)\s*;/im;
const forbidden = [
  { pattern: /\bauth\.users\b/i, label: 'auth.users (Supabase)' },
  { pattern: /\bstorage\.buckets\b/i, label: 'storage.buckets (Supabase)' },
  { pattern: /\bservice_role\b/i, label: 'service_role (Supabase)' },
  { pattern: /\bto\s+anon\b/i, label: 'rol anon (usar anonymous en Neon)' },
  { pattern: /\bsupabase\b/i, label: 'referencia activa a Supabase' },
];

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

let failed = false;

for (const file of files) {
  if (!filenamePattern.test(file)) {
    console.error(`[db:check] Nombre inválido: ${file}`);
    failed = true;
  }

  const sql = await readFile(resolve(migrationsDir, file), 'utf8');

  if (transactionPattern.test(sql)) {
    console.error(`[db:check] ${file}: no incluir BEGIN/COMMIT/ROLLBACK; el runner controla la transacción.`);
    failed = true;
  }

  for (const rule of forbidden) {
    if (rule.pattern.test(sql)) {
      console.error(`[db:check] ${file}: contiene ${rule.label}.`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);

console.log(
  files.length === 0
    ? '[db:check] Sin migraciones SQL activas. Estructura válida.'
    : `[db:check] ${files.length} migración(es) válidas.`,
);
