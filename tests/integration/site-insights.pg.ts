import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { listMonitoringPoints, listMonitoringReviews, listSiteFindings, findSiteEvidence } from '../../functions/api/site-insights/queries'
import type { InsightQuery } from '../../src/types/siteInsights'

const target = new URL(process.env.TEST_DATABASE_URL ?? '')
if (process.env.CI !== 'true' || !['localhost','127.0.0.1'].includes(target.hostname) || target.pathname !== '/sr_certificates_test') throw new Error('Ephemeral CI database required')
const pool = new Pool({ connectionString: target.toString() })
let db: PoolClient | undefined
const ids = { admin: randomUUID(), tech: randomUUID(), client: randomUUID(), site: randomUUID(), area: randomUUID(), point: randomUUID(), service: randomUUID(), serviceArea: randomUUID(), servicePoint: randomUUID(), review: randomUUID(), finding: randomUUID() }
const trap = `TRAP_${randomUUID().replaceAll('-','')}`
const query: InsightQuery = { page: 1, search: '', area: '', state: '', active: '', trap: '', from: '', to: '' }
beforeAll(async () => {
  db = await pool.connect()
  await db.query('begin')
  for (const [id,admin,tech] of [[ids.admin,true,false],[ids.tech,false,true]] as const) await db.query('insert into public.usuarios(id,nombre_completo,correo_google,es_admin,es_tecnico) values($1,$2,$3,$4,$5)', [id,'Técnico de prueba',`${id}@example.invalid`,admin,tech])
  await db.query("insert into public.negocios(id,nombre,nit,correos_json,vigencia_cert_establecimiento_meses) values($1,'Cliente de prueba',$2,'[]',12)", [ids.client,ids.client])
  await db.query(`insert into public.sedes(id,negocio_id,nombre,direccion,correos_json,hereda_correos_negocio,contacto_principal_nombre,contacto_principal_celular,valor_servicio,periodicidad_meses,maneja_refuerzo,tipo_sede,duracion_servicio_minutos)
    values($1,$2,'Sede de prueba','Dirección de prueba','[]',true,'Contacto','+573000000002',100000,1,false,'NEGOCIO',60)`, [ids.site,ids.client])
  await db.query("insert into public.areas(id,sede_id,nombre) values($1,$2,'Área original')", [ids.area,ids.site])
  await db.query("insert into public.trampas(clave,nombre,clasificacion) values($1,$2,'RASTREROS')", [trap,`Trampa ${trap}`])
  await db.query("insert into public.dispositivos(id,sede_id,area_id,numero,tipo_dispositivo_codigo,ubicacion,estado_actual,activo) values($1,$2,$3,'P-01',$4,'Ubicación original','ACTIVO',false)", [ids.point,ids.site,ids.area,trap])
  await db.query(`insert into public.servicios(id,sede_id,tipo_servicio,estado,inicio_programado,fin_programado,inicio_real,creado_por_id,tecnico_responsable_id,valor_servicio)
    values($1,$2,'PRINCIPAL','EN_PROCESO',now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour',$3,$4,100000)`, [ids.service,ids.site,ids.admin,ids.tech])
  await db.query("insert into public.servicio_areas(id,servicio_id,area_id,nombre_snapshot,es_externa_snapshot,posicion_inicial,posicion_recorrido) values($1,$2,$3,'Área original',false,1,1)", [ids.serviceArea,ids.service,ids.area])
  await db.query(`insert into public.servicio_dispositivos(id,servicio_id,servicio_area_id,dispositivo_id,numero_snapshot,ubicacion_snapshot,tipo_dispositivo_codigo_snapshot,tipo_dispositivo_nombre_snapshot,clasificacion_snapshot,plagas_snapshot_json,estado_anterior_snapshot)
    values($1,$2,$3,$4,'P-01','Ubicación original',$5,'Trampa original','RASTREROS','[]','ACTIVO')`, [ids.servicePoint,ids.service,ids.serviceArea,ids.point,trap])
  await db.query(`insert into public.revisiones_dispositivos(id,servicio_id,dispositivo_id,area_id,numero_snapshot,ubicacion_snapshot,tipo_dispositivo_codigo,estado_observado,capturas_json,servicio_dispositivo_id,foto_storage_path)
    values($1,$2,$3,$4,'P-01','Ubicación original',$5,'ACTIVO','[]',$6,$7)`, [ids.review,ids.service,ids.point,ids.area,trap,ids.servicePoint,`services/${ids.service}/devices/${ids.servicePoint}/review/photo.jpg`])
  await db.query(`insert into public.hallazgos(id,sede_id,area_id,servicio_apertura_id,fecha_apertura,descripcion,recomendacion_accion,estado,responsable_nombre,evidencias_apertura_storage_paths)
    values($1,$2,$3,$4,now(),'Grieta en pared','Sellar la grieta','ABIERTO','Encargado',$5::jsonb)`, [ids.finding,ids.site,ids.area,ids.service,JSON.stringify([`services/${ids.service}/findings/${ids.finding}/opening/photo.jpg`])])
  await db.query("update public.dispositivos set numero='P-actual',ubicacion='Ubicación actual' where id=$1", [ids.point])
  await db.query("update public.areas set nombre='Área actual' where id=$1", [ids.area])
})
afterAll(async () => { if (db) { await db.query('rollback'); db.release() }; await pool.end() })
describe('site insights · real PostgreSQL queries', () => {
  it('separates enabled from physical condition and excludes ongoing visits from last finalized review', async () => {
    const result = await listMonitoringPoints(db!,ids.site,query)
    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({ id: ids.point, number: 'P-actual', areaName: 'Área actual', enabled: false, condition: 'ACTIVO', inProgress: true, lastReview: null })
    expect((await listMonitoringPoints(db!,ids.site,{ ...query, active: 'true' })).total).toBe(0)
    expect((await listMonitoringPoints(db!,ids.site,{ ...query, page: 2 })).items).toHaveLength(0)
  })
  it('preserves historical names and exposes photo references rather than storage keys', async () => {
    const result = await listMonitoringReviews(db!,ids.site,ids.point,query)
    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({ number: 'P-01', areaName: 'Área original', location: 'Ubicación original', trapName: 'Trampa original', service: { state: 'EN_PROCESO' }, photos: [{ kind: 'REVIEW', recordId: ids.review, index: 0 }] })
    expect(JSON.stringify(result)).not.toContain('/review/photo.jpg')
    expect((await listMonitoringReviews(db!,ids.site,ids.point,{ ...query, state: 'FINALIZADO' })).total).toBe(0)
  })
  it('filters findings and resolves opening metadata and media', async () => {
    const result = await listSiteFindings(db!,ids.site,{ ...query, state: 'PENDING' })
    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({ description: 'Grieta en pared', areaName: 'Área original', state: 'ABIERTO', photos: [{ kind: 'OPENING', recordId: ids.finding, index: 0 }] })
    expect((await listSiteFindings(db!,ids.site,{ ...query, state: 'CERRADO' })).total).toBe(0)
    expect((await findSiteEvidence(db!,ids.site,'OPENING',ids.finding,0)).path).toContain(`/findings/${ids.finding}/opening/`)
  })
  it('rejects evidence references across sites and never broadens Data API write privileges', async () => {
    await expect(findSiteEvidence(db!,randomUUID(),'REVIEW',ids.review,0)).rejects.toMatchObject({ code: 'EVIDENCE_NOT_FOUND' })
    await expect(findSiteEvidence(db!,ids.site,'REVIEW',ids.review,1)).rejects.toMatchObject({ code: 'EVIDENCE_NOT_FOUND' })
    const result = await db!.query("select has_table_privilege('authenticated','public.dispositivos','UPDATE') as point_write,has_table_privilege('authenticated','public.hallazgos','DELETE') as finding_delete")
    expect(result.rows[0]).toEqual({ point_write: false, finding_delete: false })
  })
})
