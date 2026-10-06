// Run after test-certificates.mjs, exclusively on its disposable loopback CI database.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid')
if (process.env.CI !== 'true' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/sr_certificates_test') throw new Error('Requires the isolated CI database; never uses DATABASE_URL')
const pool = new Pool({ connectionString: url.href })
try {
  assert.ok((await pool.query("select to_regclass('public.trampas') as name")).rows[0].name, 'Migration 009 must already be applied in CI')
  const bootstrap = await readFile('database/bootstrap/002_mip_catalogs.sql', 'utf8')
  await pool.query(bootstrap)
  const count = (await pool.query("select count(*)::integer as n from public.configuracion where categoria in ('PLAGA','METODO_APLICACION')")).rows[0].n
  await pool.query(bootstrap)
  assert.equal((await pool.query("select count(*)::integer as n from public.configuracion where categoria in ('PLAGA','METODO_APLICACION')")).rows[0].n, count)
  const { rows: [method] } = await pool.query("select id from public.configuracion where categoria = 'METODO_APLICACION' and clave = 'ASPERSION'")
  const { rows: [pest] } = await pool.query("select id from public.configuracion where categoria = 'PLAGA' and clave = 'CUCARACHA'")
  const { rows: [product] } = await pool.query("insert into public.productos(nombre, principio_activo_composicion, dosis_aplicacion) values ('CI synthetic product', 'Synthetic component', 'Synthetic dose') returning id, version::integer")
  assert.equal(product.version, 1)
  await pool.query('insert into public.producto_metodos(producto_id,metodo_id) values ($1,$2)', [product.id, method.id])
  await assert.rejects(pool.query('insert into public.producto_metodos(producto_id,metodo_id) values ($1,$2)', [product.id, pest.id]), { code: '23503' })
  await assert.rejects(pool.query('delete from public.configuracion where id = $1', [method.id]), { code: '23503' })
  await pool.query("insert into public.producto_categorias_plaga(producto_id,clasificacion) values ($1,'RASTREROS')", [product.id])
  const { rows: [futurePest] } = await pool.query("insert into public.configuracion(categoria,clave,nombre,clasificacion_mip) values ('PLAGA','CI_FUTURE','CI future pest','RASTREROS') returning id")
  const covered = await pool.query(`select c.id from public.configuracion c join public.producto_categorias_plaga pc on c.clasificacion_mip = pc.clasificacion where pc.producto_id = $1 and c.id = $2`, [product.id, futurePest.id])
  assert.equal(covered.rowCount, 1, 'New pests inherit whole-category coverage without duplicated IDs')
  assert.equal((await pool.query('select count(*)::integer as n from public.producto_plagas where producto_id = $1', [product.id])).rows[0].n, 0)
  await pool.query('insert into public.producto_plagas(producto_id,plaga_id) values ($1,$2)', [product.id, pest.id])
  await assert.rejects(pool.query("update public.configuracion set clasificacion_mip = 'VOLADORES' where id = $1", [pest.id]), { code: '23503' })
  await assert.rejects(pool.query('delete from public.configuracion where id = $1', [pest.id]), { code: '23503' })
  await assert.rejects(pool.query("update public.configuracion set clave = 'RENAMED' where id = $1", [method.id]), { code: '23514' })
  await assert.rejects(pool.query("insert into public.trampas(clave,nombre,clasificacion) values ('CI_BAD','Bad','MIXTO')"), { code: '23514' })
  await assert.rejects(pool.query("insert into public.configuracion(categoria,clave,nombre) values ('PLAGA','CI_BAD','Bad')"), { code: '23514' })
  const writes = await Promise.all([1, 2].map(i => pool.query('update public.productos set nombre = $2 where id = $1 and version = 1 returning version::integer', [product.id, `CI synthetic product ${i}`])))
  assert.equal(writes.reduce((sum, result) => sum + result.rowCount, 0), 1, 'Only one writer may save the same observed version')
  assert.equal((await pool.query('select version::integer from public.productos where id=$1', [product.id])).rows[0].version, 2)
  const actor = await pool.connect()
  try {
    await actor.query('set role anonymous')
    await assert.rejects(actor.query('select * from public.trampas'), { code: '42501' })
    await actor.query('reset role')
    await actor.query('set role authenticated')
    assert.equal((await actor.query('select * from public.trampas')).rowCount, 0, 'No active admin session means no catalog access')
    await assert.rejects(actor.query("insert into public.trampas(clave,nombre,clasificacion) values ('BAD_AUTH','Unauthorized','RASTREROS')"), { code: '42501' })
    await actor.query('reset role')
  } finally { actor.release() }
  console.log('MIP SQL passed: bootstrap idempotency, typed relations, future category coverage, history protection, optimistic concurrency, RLS and anonymous denial')
} finally { await pool.end() }
