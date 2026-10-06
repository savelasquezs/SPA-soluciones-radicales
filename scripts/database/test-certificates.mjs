// Runs only against the disposable CI PostgreSQL service; never uses DATABASE_URL.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { Pool } from 'pg'
const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid')
if (process.env.CI !== 'true' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/sr_certificates_test') {
  throw new Error('Requires the isolated sr_certificates_test database on CI loopback')
}
const pool = new Pool({ connectionString: url.href })
try {
  const existing = await pool.query("select to_regclass('public.usuarios') as table_name")
  assert.equal(existing.rows[0].table_name, null, 'Refuse an existing application database')
  await pool.query(`create role anonymous; create role authenticated;
    create schema auth; create schema neon_auth;
    create function auth.user_id() returns text language sql stable as $$ select current_setting('test.user_id', true) $$;
    create function auth.session() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table neon_auth.account ("userId" text, "providerId" text);`)
  for (const name of (await readdir('database/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const client = await pool.connect()
    try { await client.query('begin'); await client.query(await readFile(`database/migrations/${name}`, 'utf8')); await client.query('commit'); console.log('Applied', name) }
    catch (error) { await client.query('rollback'); throw error }
    finally { client.release() }
  }
  const { rows: [business] } = await pool.query(`insert into public.negocios(nombre, nit, vigencia_cert_establecimiento_meses)
    values ('CI synthetic', '900000000', 2) returning id`)
  await assert.rejects(pool.query('update public.negocios set vigencia_cert_establecimiento_meses = 0 where id = $1', [business.id]), { code: '23514' })
  await assert.rejects(pool.query('update public.negocios set vigencia_cert_establecimiento_meses = null where id = $1', [business.id]), { code: '23514' })
  const { rows: [site] } = await pool.query(`insert into public.sedes(negocio_id, nombre, direccion, contacto_principal_nombre,
    contacto_principal_celular, valor_servicio, periodicidad_meses, tipo_sede, maneja_vehiculos, genera_certificado_vehiculo, vigencia_cert_vehiculo_meses)
    values ($1, 'CI site', 'CI address', 'CI contact', '+573000000000', 1000, 1, 'NEGOCIO', true, true, 1) returning id`, [business.id])
  await assert.rejects(pool.query('update public.sedes set maneja_vehiculos = false where id = $1', [site.id]), { code: '23514' })
  await assert.rejects(pool.query('update public.sedes set vigencia_cert_vehiculo_meses = null where id = $1', [site.id]), { code: '23514' })
  await pool.query("insert into public.negocios(nombre, tipo_cliente) values ('CI residence', 'RESIDENCIAL')")
  await assert.rejects(pool.query("insert into public.negocios(nombre, tipo_cliente, vigencia_cert_establecimiento_meses) values ('Bad residence', 'RESIDENCIAL', 1)"), { code: '23514' })
  const jobValues = ['DOCUMENT', 'certificate:concurrency-ci', '{}']
  const inserted = await Promise.all(Array.from({ length: 8 }, () => pool.query(`insert into private.integration_jobs(job_type, idempotency_key, payload)
    values ($1, $2, $3::jsonb) on conflict(job_type, idempotency_key) do nothing returning id`, jobValues)))
  assert.equal(inserted.reduce((sum, result) => sum + result.rowCount, 0), 1)
  const dates = await pool.query("select ('2024-01-31'::date + make_interval(months => 1))::date::text as expiry")
  assert.equal(dates.rows[0].expiry, '2024-02-29')
  const anonymous = await pool.connect()
  try {
    await anonymous.query('set role anonymous')
    await assert.rejects(anonymous.query('select * from public.certificados'), { code: '42501' })
    await assert.rejects(anonymous.query('select * from private.integration_jobs'), { code: '42501' })
    await anonymous.query('reset role')
  } finally { anonymous.release() }
  console.log('Certificate SQL checks passed: all migrations, fallback constraints, concurrency, date math, anonymous denial')
} finally { await pool.end() }
