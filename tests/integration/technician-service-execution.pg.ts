import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PoolClient } from 'pg'

vi.mock('@neon/functions', () => ({ attachDatabasePool: vi.fn<() => void>(), waitUntil: vi.fn<() => void>() }))

import { pool, transaction } from '../../functions/api/db'
import { claimTechnicianService, createTechnicianDevice, releaseTechnicianServiceLock, saveTechnicianAreaAccess, saveTechnicianCriterionEvaluation, saveTechnicianDeviceReview, startTechnicianService, technicianCommand } from '../../functions/api/technician-services/commands'
import type { DeviceState } from '../../src/types/technicianServices'
import { getTechnicianPackage } from '../../functions/api/technician-services/queries'

const target = new URL(process.env.TEST_DATABASE_URL ?? '')
if (process.env.CI !== 'true' || !['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/sr_certificates_test') throw new Error('Ephemeral CI database required')

type Fixture = {
  admin: string
  technician: string
  collaborator: string
  unrelated: string
  service: string
  internalArea: string
  externalArea: string
  generalCriterion: string
  externalCriterion: string
  device: string
  product: string
  methodCode: string
  pestCode: string
}

async function fixture(offset = '30 minutes', deviceState: DeviceState = 'ACTIVO'): Promise<Fixture> {
  const value: Fixture = {
    admin: randomUUID(), technician: randomUUID(), collaborator: randomUUID(), unrelated: randomUUID(), service: randomUUID(),
    internalArea: randomUUID(), externalArea: randomUUID(), generalCriterion: randomUUID(), externalCriterion: randomUUID(),
    device: randomUUID(), product: randomUUID(), methodCode: `METHOD_${randomUUID().replaceAll('-', '')}`,
    pestCode: `PEST_${randomUUID().replaceAll('-', '')}`,
  }
  const business = randomUUID(), site = randomUUID(), method = randomUUID(), deviceType = `DEVICE_${randomUUID().replaceAll('-', '')}`
  await transaction(async client => {
    for (const [name, id, admin, technician] of [
      ['admin', value.admin, true, false], ['technician', value.technician, false, true],
      ['collaborator', value.collaborator, false, true], ['unrelated', value.unrelated, false, true],
    ] as const) {
      await client.query('insert into public.usuarios(id,auth_user_id,nombre_completo,correo_google,es_admin,es_tecnico) values($1,$2,$3,$4,$5,$6)',
        [id, `technician-ci:${id}`, `Technician CI ${name}`, `${id}@example.invalid`, admin, technician])
    }
    await client.query("insert into public.negocios(id,nombre,nit,correos_json,vigencia_cert_establecimiento_meses) values($1,$2,$3,'[]',12)", [business, `Technician CI ${business}`, business])
    await client.query(`insert into public.sedes(id,negocio_id,nombre,direccion,correos_json,hereda_correos_negocio,contacto_principal_nombre,
      contacto_principal_celular,valor_servicio,periodicidad_meses,maneja_refuerzo,tipo_sede,duracion_servicio_minutos)
      values($1,$2,'Sede técnica','Dirección sintética','[]',true,'Cliente presente','+573000000002',300000,1,false,'NEGOCIO',90)`, [site, business])
    await client.query('insert into public.areas(id,sede_id,nombre,es_externa) values($1,$3,\'Cocina\',false),($2,$3,\'Exterior\',true)', [value.internalArea, value.externalArea, site])
    await client.query('insert into public.criterios_mip(id,nombre,solo_area_externa) values($1,$3,false),($2,$4,true)',
      [value.generalCriterion, value.externalCriterion, `Orden y aseo ${value.generalCriterion}`, `Perímetro ${value.externalCriterion}`])
    await client.query("insert into public.configuracion(id,categoria,clave,nombre,clasificacion_mip,categoria_producto) values($1,'METODO_APLICACION',$2,$3,null,null),($4,'PLAGA',$5,$6,'RASTREROS','INSECTOS_RASTREROS')",
      [method, value.methodCode, `Aspersión ${value.methodCode}`, randomUUID(), value.pestCode, `Plaga ${value.pestCode}`])
    await client.query("insert into public.trampas(id,clave,nombre,clasificacion) values($1,$2,$3,'RASTREROS')", [randomUUID(), deviceType, `Trampa ${deviceType}`])
    await client.query('insert into public.productos(id,nombre,principio_activo_composicion,dosis_aplicacion,registro_sanitario) values($1,$2,\'Composición inicial\',\'5 mL/L\',\'RS-1\')', [value.product, `Producto inicial ${value.product}`])
    await client.query('insert into public.producto_metodos(producto_id,metodo_id) values($1,$2)', [value.product, method])
    await client.query('insert into public.dispositivos(id,sede_id,area_id,numero,tipo_dispositivo_codigo,ubicacion,estado_actual) values($1,$2,$3,\'D-01\',$4,\'Bajo mesón\',$5)',
      [value.device, site, value.internalArea, deviceType, deviceState])
    await client.query(`insert into public.servicios(id,sede_id,tipo_servicio,inicio_programado,fin_programado,creado_por_id,
      tecnico_responsable_id,tecnicos_colaboradores_ids_json,valor_servicio)
      values($1,$2,'PRINCIPAL',now()+$3::interval,now()+$3::interval+interval '90 minutes',$4,$5,$6::jsonb,0)`,
      [value.service, site, offset, value.admin, value.technician, JSON.stringify([value.collaborator])])
    await client.query(`insert into public.productos_aplicados(servicio_id,producto_id,lote,fecha_vencimiento)
      values($1,$2,'L-TECH','2030-01-01')`, [value.service, value.product])
  })
  return value
}

beforeAll(async () => {
  await pool.query(`create or replace function auth.session() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('test.auth_session',true),''),'{}')::jsonb $$`)
})
afterAll(async () => { await pool.end() })

describe('technician service execution · real PostgreSQL', () => {
  it('rejects an online start before the one-hour window without leaving snapshots or a lock', async () => {
    const value = await fixture('2 hours')
    await expect(transaction(client => startTechnicianService(client, value.technician, value.service, 1, randomUUID()))).rejects.toMatchObject({ code: 'SERVICE_TOO_EARLY' })
    expect(Number((await pool.query('select count(*) from public.servicio_areas where servicio_id=$1', [value.service])).rows[0].count)).toBe(0)
    expect(Number((await pool.query('select count(*) from private.service_execution_locks where service_id=$1', [value.service])).rows[0].count)).toBe(0)
  })

  it('freezes areas, applicable criteria, devices and read-only product data at start', async () => {
    const value = await fixture(), deviceId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, deviceId))
    expect(session.package.frozen).toBe(true)
    expect(session.package.service.estado).toBe('EN_PROCESO')
    expect(session.lock.deviceId).toBe(deviceId)
    expect(session.package.areas).toHaveLength(2)
    expect(session.package.areas.find(area => area.areaId === value.internalArea)?.criterios.some(item => item.criterioId === value.generalCriterion)).toBe(true)
    expect(session.package.areas.find(area => area.areaId === value.internalArea)?.criterios.some(item => item.criterioId === value.externalCriterion)).toBe(false)
    expect(session.package.areas.find(area => area.areaId === value.externalArea)?.criterios.some(item => item.criterioId === value.generalCriterion)).toBe(true)
    expect(session.package.areas.find(area => area.areaId === value.externalArea)?.criterios.some(item => item.criterioId === value.externalCriterion)).toBe(true)
    expect(session.package.areas.find(area => area.areaId === value.internalArea)?.dispositivos[0]).toMatchObject({
      numero: 'D-01',
      tipoNombre: expect.stringContaining('Trampa'),
      clasificacion: 'RASTREROS',
      plagas: expect.arrayContaining([{ codigo: value.pestCode, nombre: expect.stringContaining('Plaga') }]),
      revision: null,
    })
    expect(session.package.products[0]).toMatchObject({
      registroSanitario: 'RS-1',
      dosisReferencia: '5 mL/L',
      lote: 'L-TECH',
      dosis: '5 mL/L',
      metodoAplicacion: `Aspersión ${value.methodCode}`,
    })
    await pool.query('update public.productos set nombre=\'Producto renombrado\' where id=$1', [value.product])
    await pool.query('update public.productos set registro_sanitario=\'RS-2\',dosis_aplicacion=\'10 mL/L\' where id=$1', [value.product])
    await pool.query('update public.criterios_mip set nombre=\'Criterio renombrado\' where id=$1', [value.generalCriterion])
    await pool.query('update public.dispositivos set numero=\'D-99\' where id=$1', [value.device])
    const frozen = await transaction(client => getTechnicianPackage(client, value.technician, value.service))
    expect(frozen.products[0]?.nombre).toContain('Producto inicial')
    expect(frozen.products[0]).toMatchObject({ registroSanitario: 'RS-1', dosisReferencia: '5 mL/L' })
    expect(frozen.areas.flatMap(area => area.criterios).some(criterion => criterion.nombre === 'Criterio renombrado')).toBe(false)
    expect(frozen.areas.flatMap(area => area.dispositivos)[0]?.numero).toBe('D-01')
    expect((await pool.query('select aplicado from public.productos_aplicados where servicio_id=$1', [value.service])).rows[0].aplicado).toBe(true)
  })

  it('uses all catalogue methods without requiring per-visit dose or method', async () => {
    const value = await fixture()
    const secondMethod = randomUUID(), secondCode = `SECOND_${randomUUID().replaceAll('-', '')}`
    await pool.query("insert into public.configuracion(id,categoria,clave,nombre) values($1,'METODO_APLICACION',$2,'Nebulización')", [secondMethod, secondCode])
    await pool.query('insert into public.producto_metodos(producto_id,metodo_id) values($1,$2)', [value.product, secondMethod])
    const before = await transaction(client => getTechnicianPackage(client, value.technician, value.service))
    expect(before.products[0]?.dosis).toBe('5 mL/L')
    expect(before.products[0]?.metodoAplicacion).toContain('Nebulización')
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, randomUUID()))
    expect(session.package.products[0]?.metodoAplicacion).toContain('Nebulización')
    expect(session.package.products[0]?.metodoAplicacion).toContain(value.methodCode)
    const frozen = await pool.query('select dosis,metodo_aplicacion_codigo,metodo_aplicacion_nombre_snapshot from public.productos_aplicados where servicio_id=$1', [value.service])
    expect(frozen.rows[0].dosis).toBe('5 mL/L')
    expect(frozen.rows[0].metodo_aplicacion_codigo).toBeNull()
    expect(frozen.rows[0].metodo_aplicacion_nombre_snapshot).toContain('Nebulización')
  })

  it('rejects an incomplete product catalogue but never asks for visit-specific dose or method', async () => {
    const value = await fixture()
    await pool.query('delete from public.producto_metodos where producto_id=$1', [value.product])
    await expect(transaction(client => startTechnicianService(client, value.technician, value.service, 1, randomUUID()))).rejects.toMatchObject({ code:'PRODUCT_CATALOG_INCOMPLETE' })
    expect(Number((await pool.query('select count(*) from private.service_execution_locks where service_id=$1', [value.service])).rows[0].count)).toBe(0)
  })

  it('replays the same start idempotently and rejects request reuse with another device', async () => {
    const value = await fixture(), requestId = randomUUID(), deviceId = randomUUID()
    const run = (selectedDevice: string) => transaction(client => technicianCommand(client, value.technician, requestId, 'SERVICE_START', value.service, 1,
      { deviceId: selectedDevice, version: 1 }, () => startTechnicianService(client, value.technician, value.service, 1, selectedDevice)))
    const first = await run(deviceId), replay = await run(deviceId)
    expect(replay.lock.token).toBe(first.lock.token)
    await expect(run(randomUUID())).rejects.toMatchObject({ code: 'REQUEST_REUSED' })
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_INICIADO'", [value.service])).rows[0].count)).toBe(1)
  })

  it('saves a criterion evaluation idempotently and rejects a stale version with the remote answer', async () => {
    const value = await fixture(), deviceId = randomUUID(), requestId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, deviceId))
    const criterion = session.package.areas.find(area => area.areaId === value.internalArea)!.criterios.find(item => item.criterioId === value.generalCriterion)!
    const payload = { deviceId, criterionId: criterion.id, version: criterion.version, evaluation: 'CP', observation: 'Mejora pendiente' }
    const save = () => transaction(client => technicianCommand(client, value.technician, requestId, 'CRITERION_EVALUATION', value.service, criterion.version,
      payload, () => saveTechnicianCriterionEvaluation(client, value.technician, value.service, deviceId, session.lock.token, criterion.id, criterion.version, 'CP', 'Mejora pendiente')))
    const first = await save(), replay = await save()
    expect(first.criterion).toMatchObject({ evaluacion: 'CP', observacion: 'Mejora pendiente', version: 2 })
    expect(replay).toEqual(first)
    await expect(transaction(client => saveTechnicianCriterionEvaluation(client, value.technician, value.service, deviceId, session.lock.token,
      criterion.id, 1, 'NC', 'Otra respuesta'))).rejects.toMatchObject({ code: 'VERSION_CONFLICT', details: { remote: { evaluacion: 'CP', version: 2 } } })
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_CRITERIO_EVALUADO'", [value.service])).rows[0].count)).toBe(1)
  })

  it('registers a no-access Area with mandatory evidence and optimistic concurrency', async () => {
    const value = await fixture(), deviceId = randomUUID(), requestId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, deviceId))
    const area = session.package.areas.find(item => item.areaId === value.internalArea)!
    const photoPath = `services/${value.service}/areas/${area.id}/no-access/evidence.jpg`
    const payload = { deviceId, areaId: area.id, version: area.version, withoutAccess: true, description: 'Puerta cerrada', photoStoragePath: photoPath }
    const save = () => transaction(client => technicianCommand(client, value.technician, requestId, 'AREA_ACCESS', value.service, area.version,
      payload, () => saveTechnicianAreaAccess(client, value.technician, value.service, deviceId, session.lock.token, area.id, area.version, true, 'Puerta cerrada', photoPath)))
    const first = await save(), replay = await save()
    expect(first.area).toMatchObject({ sinAcceso: true, sinAccesoDescripcion: 'Puerta cerrada', sinAccesoFotoStoragePath: photoPath, version: 2 })
    expect(replay).toEqual(first)
    await expect(transaction(client => saveTechnicianAreaAccess(client, value.technician, value.service, deviceId, session.lock.token,
      area.id, 1, false, '', null))).rejects.toMatchObject({ code: 'VERSION_CONFLICT', details: { remote: { sinAcceso: true, version: 2 } } })
    const criterion = area.criterios.find(item => item.criterioId === value.generalCriterion)!
    await expect(transaction(client => saveTechnicianCriterionEvaluation(client, value.technician, value.service, deviceId, session.lock.token,
      criterion.id, criterion.version, 'C', ''))).rejects.toMatchObject({ code: 'AREA_WITHOUT_ACCESS' })
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_AREA_SIN_ACCESO_REGISTRADA'", [value.service])).rows[0].count)).toBe(1)
  })

  it('saves one device review from frozen pests and requires evidence only for a new bad state', async () => {
    const value = await fixture(), phoneId = randomUUID(), requestId = randomUUID(), reviewId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, phoneId))
    const device = session.package.areas.find(area => area.areaId === value.internalArea)!.dispositivos[0]!
    const input = {
      estadoObservado: 'DANADO' as const,
      capturas: [{ plagaCodigo: value.pestCode, cantidad: 3 }],
      consumo: 'Parcial', productoQuimico: 'Cebo', antidoto: 'Sin dato', observaciones: 'Base desprendida',
    }
    await expect(transaction(client => saveTechnicianDeviceReview(client, value.technician, value.service, phoneId, session.lock.token,
      device.id, reviewId, 0, input, null))).rejects.toMatchObject({ code: 'VALIDATION' })
    const photoPath = `services/${value.service}/devices/${device.id}/review/evidence.jpg`
    const payload = { deviceId: phoneId, serviceDeviceId: device.id, reviewId, version: 0, ...input, photoStoragePath: photoPath }
    const save = () => transaction(client => technicianCommand(client, value.technician, requestId, 'DEVICE_REVIEW', value.service, 0,
      payload, () => saveTechnicianDeviceReview(client, value.technician, value.service, phoneId, session.lock.token, device.id, reviewId, 0, input, photoPath)))
    const first = await save(), replay = await save()
    expect(first.review).toMatchObject({
      id: reviewId, estadoObservado: 'DANADO', version: 1, fotoStoragePath: photoPath,
      capturas: [{ plagaCodigo: value.pestCode, plagaNombreSnapshot: expect.stringContaining('Plaga'), cantidad: 3 }],
    })
    expect(replay).toEqual(first)
    expect((await pool.query('select estado_actual from public.dispositivos where id=$1', [value.device])).rows[0]?.estado_actual).toBe('DANADO')
    await expect(transaction(client => saveTechnicianDeviceReview(client, value.technician, value.service, phoneId, session.lock.token,
      device.id, reviewId, 0, { ...input, observaciones: 'Respuesta obsoleta' }, photoPath))).rejects.toMatchObject({
      code: 'VERSION_CONFLICT', details: { remote: { estadoObservado: 'DANADO', version: 1 } },
    })
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_DISPOSITIVO_REVISADO'", [value.service])).rows[0].count)).toBe(1)
  })

  it('does not require a new photo when the frozen device was already damaged', async () => {
    const value = await fixture('30 minutes', 'DANADO'), phoneId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, phoneId))
    const device = session.package.areas.find(area => area.areaId === value.internalArea)!.dispositivos[0]!
    const saved = await transaction(client => saveTechnicianDeviceReview(client, value.technician, value.service, phoneId, session.lock.token,
      device.id, randomUUID(), 0, { estadoObservado: 'DANADO', capturas: [], consumo: '', productoQuimico: '', antidoto: '', observaciones: '' }, null))
    expect(saved.review).toMatchObject({ estadoObservado: 'DANADO', fotoStoragePath: null, version: 1 })
  })

  it('creates a permanent device from the frozen catalog and adds it to the current service idempotently', async () => {
    const value = await fixture(), phoneId = randomUUID(), requestId = randomUUID()
    const permanentDeviceId = randomUUID(), serviceDeviceId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, phoneId))
    const area = session.package.areas.find(item => item.areaId === value.internalArea)!
    const type = session.package.deviceTypes[0]!
    await expect(pool.query("delete from public.configuracion where categoria='PLAGA' and clave=$1", [value.pestCode]))
      .rejects.toMatchObject({ code: '23503' })
    const input = { numero: 'D-02', tipoCodigo: type.codigo, ubicacion: 'Junto a la puerta' }
    const payload = { deviceId: phoneId, areaId: area.id, permanentDeviceId, serviceDeviceId, ...input }
    const save = () => transaction(client => technicianCommand(client, value.technician, requestId, 'DEVICE_CREATE', value.service, null,
      payload, () => createTechnicianDevice(client, value.technician, value.service, phoneId, session.lock.token,
        area.id, permanentDeviceId, serviceDeviceId, input)))
    const first = await save(), replay = await save()
    expect(replay).toEqual(first)
    expect(first.device).toMatchObject({
      id: serviceDeviceId, dispositivoId: permanentDeviceId, numero: 'D-02', tipoCodigo: type.codigo,
      creadoDuranteServicio: true, estadoAnterior: 'ACTIVO', revisado: false,
    })
    expect((await pool.query('select area_id,estado_actual from public.dispositivos where id=$1', [permanentDeviceId])).rows[0])
      .toEqual({ area_id: value.internalArea, estado_actual: 'ACTIVO' })
    expect((await pool.query('select creado_durante_servicio from public.servicio_dispositivos where id=$1', [serviceDeviceId])).rows[0]?.creado_durante_servicio).toBe(true)
    await expect(transaction(client => createTechnicianDevice(client, value.technician, value.service, phoneId, session.lock.token,
      area.id, randomUUID(), randomUUID(), { ...input, numero: 'D-01' }))).rejects.toMatchObject({ code: 'DEVICE_NUMBER_CONFLICT' })
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_DISPOSITIVO_CREADO'", [value.service])).rows[0].count)).toBe(1)
  })

  it('keeps one persistent mobile editor until an administrator releases the service', async () => {
    const value = await fixture(), firstDevice = randomUUID(), secondDevice = randomUUID()
    await transaction(client => startTechnicianService(client, value.technician, value.service, 1, firstDevice))
    await expect(transaction(client => claimTechnicianService(client, value.collaborator, value.service, secondDevice))).rejects.toMatchObject({ code: 'SERVICE_LOCKED' })
    await transaction(client => releaseTechnicianServiceLock(client, value.admin, value.service, 'Cambio autorizado de equipo'))
    const claimed = await transaction(client => claimTechnicianService(client, value.collaborator, value.service, secondDevice))
    expect(claimed.lock.deviceId).toBe(secondDevice)
  })

  it('enforces assigned-technician RLS and denies direct snapshot writes', async () => {
    const value = await fixture(), phoneId = randomUUID()
    const session = await transaction(client => startTechnicianService(client, value.technician, value.service, 1, phoneId))
    const device = session.package.areas.find(area => area.areaId === value.internalArea)!.dispositivos[0]!
    await transaction(client => saveTechnicianDeviceReview(client, value.technician, value.service, phoneId, session.lock.token,
      device.id, randomUUID(), 0, { estadoObservado: 'ACTIVO', capturas: [], consumo: '', productoQuimico: '', antidoto: '', observaciones: '' }, null))
    const authSession = { iat: 1700000000, exp: 4102444800 }
    for (const user of [value.technician, value.unrelated]) {
      await pool.query(`insert into private.user_sessions(session_id,auth_user_id,active_role,expires_at)
        values(private.session_key($1,$2::jsonb),$1,'TECNICO',to_timestamp(4102444800))`, [`technician-ci:${user}`, JSON.stringify(authSession)])
    }
    async function asTechnician(user: string, work: (client: PoolClient) => Promise<unknown>): Promise<unknown> {
      return transaction(async client => {
        await client.query("select set_config('test.user_id',$1,true),set_config('test.auth_session',$2,true)", [`technician-ci:${user}`, JSON.stringify(authSession)])
        await client.query('set local role authenticated')
        return work(client)
      })
    }
    expect(await asTechnician(value.technician, async client => (await client.query('select id from public.servicio_areas where servicio_id=$1', [value.service])).rows)).toHaveLength(2)
    expect(await asTechnician(value.technician, async client => (await client.query('select id from public.revisiones_dispositivos where servicio_id=$1', [value.service])).rows)).toHaveLength(1)
    expect(await asTechnician(value.technician, async client => (await client.query('select id from public.servicio_tipos_dispositivo where servicio_id=$1', [value.service])).rows)).not.toHaveLength(0)
    expect(await asTechnician(value.unrelated, async client => (await client.query('select id from public.servicio_areas where servicio_id=$1', [value.service])).rows)).toEqual([])
    expect(await asTechnician(value.unrelated, async client => (await client.query('select id from public.revisiones_dispositivos where servicio_id=$1', [value.service])).rows)).toEqual([])
    expect(await asTechnician(value.unrelated, async client => (await client.query('select id from public.servicio_tipos_dispositivo where servicio_id=$1', [value.service])).rows)).toEqual([])
    await expect(asTechnician(value.technician, client => client.query('update public.servicio_areas set posicion_recorrido=0 where servicio_id=$1', [value.service]))).rejects.toMatchObject({ code: '42501' })
  })
})
