import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PoolClient } from 'pg'

vi.mock('@neon/functions', () => ({ attachDatabasePool: vi.fn<() => void>(), waitUntil: vi.fn<() => void>() }))

import { pool, transaction } from '../../functions/api/db'
import { claimTechnicianService, releaseTechnicianServiceLock, startTechnicianService, technicianCommand } from '../../functions/api/technician-services/commands'
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
}

async function fixture(offset = '30 minutes'): Promise<Fixture> {
  const value: Fixture = {
    admin: randomUUID(), technician: randomUUID(), collaborator: randomUUID(), unrelated: randomUUID(), service: randomUUID(),
    internalArea: randomUUID(), externalArea: randomUUID(), generalCriterion: randomUUID(), externalCriterion: randomUUID(),
    device: randomUUID(), product: randomUUID(), methodCode: `METHOD_${randomUUID().replaceAll('-', '')}`,
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
    await client.query("insert into public.configuracion(id,categoria,clave,nombre) values($1,'METODO_APLICACION',$2,$3),($4,'TIPO_DISPOSITIVO',$5,$6)",
      [method, value.methodCode, `Aspersión ${value.methodCode}`, randomUUID(), deviceType, `Trampa ${deviceType}`])
    await client.query('insert into public.productos(id,nombre,principio_activo_composicion,dosis_aplicacion,registro_sanitario) values($1,$2,\'Composición inicial\',\'5 mL/L\',\'RS-1\')', [value.product, `Producto inicial ${value.product}`])
    await client.query('insert into public.producto_metodos(producto_id,metodo_id) values($1,$2)', [value.product, method])
    await client.query('insert into public.dispositivos(id,sede_id,area_id,numero,tipo_dispositivo_codigo,ubicacion,estado_actual) values($1,$2,$3,\'D-01\',$4,\'Bajo mesón\',\'ACTIVO\')',
      [value.device, site, value.internalArea, deviceType])
    await client.query(`insert into public.servicios(id,sede_id,tipo_servicio,inicio_programado,fin_programado,creado_por_id,
      tecnico_responsable_id,tecnicos_colaboradores_ids_json,valor_servicio)
      values($1,$2,'PRINCIPAL',now()+$3::interval,now()+$3::interval+interval '90 minutes',$4,$5,$6::jsonb,0)`,
      [value.service, site, offset, value.admin, value.technician, JSON.stringify([value.collaborator])])
    await client.query(`insert into public.productos_aplicados(servicio_id,producto_id,lote,fecha_fabricacion,fecha_vencimiento,dosis,metodo_aplicacion_codigo)
      values($1,$2,'L-TECH','2026-01-01','2030-01-01',to_jsonb('5 mL/L'::text),$3)`, [value.service, value.product, value.methodCode])
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
    expect(session.package.areas.find(area => area.areaId === value.internalArea)?.dispositivos[0]?.numero).toBe('D-01')
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

  it('replays the same start idempotently and rejects request reuse with another device', async () => {
    const value = await fixture(), requestId = randomUUID(), deviceId = randomUUID()
    const run = (selectedDevice: string) => transaction(client => technicianCommand(client, value.technician, requestId, 'SERVICE_START', value.service, 1,
      { deviceId: selectedDevice, version: 1 }, () => startTechnicianService(client, value.technician, value.service, 1, selectedDevice)))
    const first = await run(deviceId), replay = await run(deviceId)
    expect(replay.lock.token).toBe(first.lock.token)
    await expect(run(randomUUID())).rejects.toMatchObject({ code: 'REQUEST_REUSED' })
    expect(Number((await pool.query("select count(*) from public.auditoria where registro_id=$1 and accion='SERVICIO_INICIADO'", [value.service])).rows[0].count)).toBe(1)
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
    const value = await fixture()
    await transaction(client => startTechnicianService(client, value.technician, value.service, 1, randomUUID()))
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
    expect(await asTechnician(value.unrelated, async client => (await client.query('select id from public.servicio_areas where servicio_id=$1', [value.service])).rows)).toEqual([])
    await expect(asTechnician(value.technician, client => client.query('update public.servicio_areas set posicion_recorrido=0 where servicio_id=$1', [value.service]))).rejects.toMatchObject({ code: '42501' })
  })
})
