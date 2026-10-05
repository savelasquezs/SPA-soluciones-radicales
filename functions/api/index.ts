import { randomUUID } from 'node:crypto'

import { cors } from 'hono/cors'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { PoolClient } from 'pg'

import {
  ApiError,
  bootstrapProfile,
  requireAdmin,
  verifyAuthorization,
  type Identity,
} from './auth'
import { pool, transaction } from './db'
import {
  completeGoogleAuthorization,
  createGoogleAuthorization,
  getGoogleStatus,
  sendGmailMessage,
  upsertCalendarEvent,
} from './google'

type AppEnvironment = {
  Variables: {
    identity: Identity
  }
}

type DatabaseError = Error & {
  code?: string
  constraint?: string
}

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const app = new Hono<AppEnvironment>()
const USER_SELECT = `select id,
                            auth_user_id as "authUserId",
                            nombre_completo as "nombreCompleto",
                            correo_google as "correoGoogle",
                            es_admin as "esAdmin",
                            es_tecnico as "esTecnico",
                            activo,
                            certificado_storage_path as "certificadoStoragePath",
                            certificado_fecha_emision as "certificadoFechaEmision",
                            certificado_fecha_vencimiento as "certificadoFechaVencimiento",
                            certificado_observaciones as "certificadoObservaciones",
                            version
                     from public.usuarios`
const CLIENT_SELECT = `select n.id,
                              n.tipo_cliente as "tipoCliente",
                              n.nombre,
                              n.nit,
                              coalesce(n.correos_json, '[]'::jsonb) as correos,
                              n.activo,
                              n.version,
                              n.vigencia_cert_establecimiento_meses as "vigenciaCertificadoMeses",
                              n.plantilla_cert_establecimiento_storage_path as "plantillaCertificadoStoragePath",
                              residence.direccion as "residenciaDireccion",
                              residence.contacto_principal_celular as "residenciaCelular",
                              count(s.id) filter (where s.tipo_sede = 'NEGOCIO')::integer as "sedesCount"
                       from public.negocios n
                       left join public.sedes s on s.negocio_id = n.id
                       left join lateral (
                         select direccion, contacto_principal_celular
                         from public.sedes
                         where negocio_id = n.id and tipo_sede = 'RESIDENCIAL'
                         limit 1
                       ) residence on true`
const CLIENT_GROUP = `group by n.id, residence.direccion, residence.contacto_principal_celular`
const SITE_SELECT = `select s.id,
                            s.negocio_id as "clientId",
                            s.nombre,
                            s.direccion,
                            coalesce(s.correos_json, '[]'::jsonb) as correos,
                            s.hereda_correos_negocio as "heredaCorreosCliente",
                            s.contacto_principal_nombre as "contactoPrincipalNombre",
                            s.contacto_principal_correo as "contactoPrincipalCorreo",
                            s.contacto_principal_celular as "contactoPrincipalCelular",
                            s.valor_servicio as "valorServicio",
                            s.periodicidad_meses as "periodicidadMeses",
                            s.maneja_refuerzo as "manejaRefuerzo",
                            s.tipo_sede as "tipoSede",
                            coalesce(s.formularios_aplicables_json, '[]'::jsonb) as "formulariosAplicablesIds",
                            s.plano_storage_path as "planoStoragePath",
                            s.maneja_vehiculos as "manejaVehiculos",
                            s.genera_certificado_vehiculo as "generaCertificadoVehiculo",
                            s.vigencia_cert_vehiculo_meses as "vigenciaCertificadoVehiculoMeses",
                            s.plantilla_cert_vehiculo_storage_path as "plantillaCertificadoVehiculoStoragePath",
                            s.duracion_servicio_minutos as "duracionServicioMinutos",
                            s.activo,
                            s.version,
                            (select count(*)::integer from public.areas a where a.sede_id = s.id and a.activo) as "areasCount",
                            jsonb_array_length(coalesce(s.formularios_aplicables_json, '[]'::jsonb)) as "formulariosCount",
                            (select min(sv.inicio_programado)
                             from public.servicios sv
                             where sv.sede_id = s.id
                               and sv.estado = 'PROGRAMADO'
                               and sv.inicio_programado >= now()) as "proximoServicio"
                     from public.sedes s`
const AREA_SELECT = `select a.id,
                            a.sede_id as "siteId",
                            a.nombre,
                            a.es_externa as "esExterna",
                            a.activo,
                            a.version,
                            (select count(*)::integer from public.dispositivos d where d.area_id = a.id and d.activo) as "dispositivosCount",
                            (select max(sv.inicio_programado)
                             from public.respuestas_formulario rf
                             join public.servicios sv on sv.id = rf.servicio_id
                             where rf.area_id = a.id and sv.estado = 'FINALIZADO') as "ultimoServicio"
                     from public.areas a`

app.use(
  '/api/*',
  cors({
    origin: (origin) => (allowedOrigins.has(origin) ? origin : ''),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  }),
)

app.use('/api/*', async (context, next) => {
  if (context.req.method === 'OPTIONS') {
    await next()
    return
  }

  const identity = await verifyAuthorization(context.req.header('Authorization'))
  context.set('identity', identity)
  await next()
})

app.get('/health', (context) =>
  context.json({ ok: true, branch: process.env.NEON_BRANCH ?? 'local' }),
)

app.get('/api/session', async (context) => {
  const profile = await transaction((client) => bootstrapProfile(client, context.get('identity')))
  return context.json(profile)
})

app.post('/api/session/role', async (context) => {
  const body = await jsonBody(context.req.raw)
  const role = requiredString(body, 'role').toUpperCase()

  if (role !== 'ADMINISTRADOR' && role !== 'TECNICO') {
    throw new ApiError(422, 'El rol seleccionado no es válido')
  }

  const identity = context.get('identity')
  const profile = await transaction(async (client) => {
    await bootstrapProfile(client, identity)
    await client.query('select private.set_active_role($1, $2::jsonb, $3)', [
      identity.authUserId,
      JSON.stringify(identity.session),
      role,
    ])
    return bootstrapProfile(client, identity)
  })

  return context.json(profile)
})

app.get('/api/users', async (context) => {
  const identity = context.get('identity')
  const users = await transaction(async (client) => {
    await requireAdmin(client, identity)
    const { rows } = await client.query(`${USER_SELECT} order by activo desc, nombre_completo`)
    return rows
  })

  return context.json(users)
})

app.get('/api/users/:id', async (context) => {
  const identity = context.get('identity')
  const user = await transaction(async (client) => {
    await requireAdmin(client, identity)
    const { rows } = await client.query(`${USER_SELECT} where id = $1`, [context.req.param('id')])
    if (!rows[0]) throw new ApiError(404, 'El usuario no existe')
    return rows[0]
  })
  return context.json(user)
})

app.post('/api/users', async (context) => {
  const body = await jsonBody(context.req.raw)
  const input = userInput(body)
  const identity = context.get('identity')
  const user = await transaction(async (client) => {
    const admin = await requireAdmin(client, identity)
    const { rows } = await client.query(
      `insert into public.usuarios (
         nombre_completo, correo_google, es_admin, es_tecnico, activo,
         certificado_storage_path, certificado_fecha_emision,
         certificado_fecha_vencimiento, certificado_observaciones
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id,
                 auth_user_id as "authUserId",
                 nombre_completo as "nombreCompleto",
                 correo_google as "correoGoogle",
                 es_admin as "esAdmin",
                 es_tecnico as "esTecnico",
                 activo,
                 certificado_storage_path as "certificadoStoragePath",
                 certificado_fecha_emision as "certificadoFechaEmision",
                 certificado_fecha_vencimiento as "certificadoFechaVencimiento",
                 certificado_observaciones as "certificadoObservaciones",
                 version`,
      [
        input.nombreCompleto,
        input.correoGoogle,
        input.esAdmin,
        input.esTecnico,
        input.activo,
        input.certificadoStoragePath,
        input.certificadoFechaEmision,
        input.certificadoFechaVencimiento,
        input.certificadoObservaciones,
      ],
    )
    const created = rows[0]
    await audit(client, admin.id, 'USUARIO_CREADO', 'Usuarios', created.id, {
      correoGoogle: input.correoGoogle,
      roles: rolesOf(input.esAdmin, input.esTecnico),
    })
    return created
  })

  return context.json(user, 201)
})

app.patch('/api/users/:id', async (context) => {
  const body = await jsonBody(context.req.raw)
  const input = userInput(body)
  const version = requiredInteger(body, 'version')
  const identity = context.get('identity')
  const userId = context.req.param('id')
  const user = await transaction(async (client) => {
    const admin = await requireAdmin(client, identity)
    const current = await client.query<{ authUserId: string | null; correoGoogle: string }>(
      `select auth_user_id as "authUserId", correo_google as "correoGoogle"
       from public.usuarios
       where id = $1`,
      [userId],
    )
    const currentUser = current.rows[0]

    if (!currentUser) {
      throw new ApiError(404, 'El usuario no existe')
    }
    if (currentUser.authUserId && currentUser.correoGoogle !== input.correoGoogle) {
      throw new ApiError(409, 'El correo de una identidad Google vinculada no puede modificarse')
    }
    const { rows } = await client.query(
      `update public.usuarios
       set nombre_completo = $1,
           correo_google = $2,
           es_admin = $3,
           es_tecnico = $4,
           activo = $5,
           certificado_storage_path = $6,
           certificado_fecha_emision = $7,
           certificado_fecha_vencimiento = $8,
           certificado_observaciones = $9
       where id = $10 and version = $11
       returning id,
                 auth_user_id as "authUserId",
                 nombre_completo as "nombreCompleto",
                 correo_google as "correoGoogle",
                 es_admin as "esAdmin",
                 es_tecnico as "esTecnico",
                 activo,
                 certificado_storage_path as "certificadoStoragePath",
                 certificado_fecha_emision as "certificadoFechaEmision",
                 certificado_fecha_vencimiento as "certificadoFechaVencimiento",
                 certificado_observaciones as "certificadoObservaciones",
                 version`,
      [
        input.nombreCompleto,
        input.correoGoogle,
        input.esAdmin,
        input.esTecnico,
        input.activo,
        input.certificadoStoragePath,
        input.certificadoFechaEmision,
        input.certificadoFechaVencimiento,
        input.certificadoObservaciones,
        userId,
        version,
      ],
    )
    const updated = rows[0]

    if (!updated) {
      throw new ApiError(409, 'El usuario cambió en otra sesión; recarga e intenta de nuevo')
    }

    await audit(client, admin.id, 'USUARIO_ACTUALIZADO', 'Usuarios', userId, {
      activo: input.activo,
      roles: rolesOf(input.esAdmin, input.esTecnico),
    })
    return updated
  })

  return context.json(user)
})

app.get('/api/catalogs/technicians', async (context) => {
  const identity = context.get('identity')
  const technicians = await transaction(async (client) => {
    await bootstrapProfile(client, identity)
    const { rows } = await client.query(
      `select id,
              nombre_completo as "nombreCompleto",
              correo_google as "correoGoogle"
       from public.usuarios
       where activo and es_tecnico
       order by nombre_completo`,
    )
    return rows
  })
  return context.json(technicians)
})

app.get('/api/clients', async (context) => {
  const active = optionalBooleanQuery(context.req.query('active'), 'active')
  const type = optionalEnum(context.req.query('type'), ['NEGOCIO', 'RESIDENCIAL'], 'type')
  const search = optionalString(context.req.query('search'))
  const clients = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const { rows } = await client.query(
      `${CLIENT_SELECT}
       where ($1::boolean is null or n.activo = $1)
         and ($2::text is null or n.tipo_cliente = $2)
         and (
           $3::text is null
           or n.nombre ilike '%' || $3 || '%'
           or n.nit ilike '%' || $3 || '%'
           or exists (
             select 1 from public.sedes phone_site
             where phone_site.negocio_id = n.id
               and phone_site.contacto_principal_celular like '%' || regexp_replace($3, '[^0-9+]', '', 'g') || '%'
           )
         )
       ${CLIENT_GROUP}
       order by n.nombre`,
      [active, type, search],
    )
    return rows
  })
  return context.json(clients)
})

app.get('/api/clients/:id', async (context) => {
  const record = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    return findClient(client, context.req.param('id'))
  })
  return context.json(record)
})

app.post('/api/clients', async (context) => {
  const input = clientInput(await jsonBody(context.req.raw))
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const inserted = await client.query<{ id: string }>(
      `insert into public.negocios (
         tipo_cliente, nombre, nit, correos_json, activo,
         vigencia_cert_establecimiento_meses, plantilla_cert_establecimiento_storage_path
       ) values ($1, $2, $3, $4::jsonb, $5, $6, $7)
       returning id`,
      [input.tipoCliente, input.nombre, input.nit, JSON.stringify(input.correos), input.activo,
        input.vigenciaCertificadoMeses, input.plantillaCertificadoStoragePath],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new ApiError(500, 'No fue posible crear el Cliente')

    if (input.tipoCliente === 'RESIDENCIAL') {
      await client.query(
        `insert into public.sedes (
           negocio_id, nombre, direccion, correos_json, hereda_correos_negocio,
           contacto_principal_nombre, contacto_principal_correo, contacto_principal_celular,
           valor_servicio, periodicidad_meses, maneja_refuerzo, tipo_sede,
           formularios_aplicables_json, maneja_vehiculos, genera_certificado_vehiculo,
           duracion_servicio_minutos, activo
         ) values ($1, $2, $3, '[]'::jsonb, false, $2, null, $4, null, null,
                   false, 'RESIDENCIAL', null, false, false, null, $5)`,
        [id, input.nombre, input.residenciaDireccion, input.residenciaCelular, input.activo],
      )
    }
    await audit(client, admin.id, 'CLIENTE_CREADO', 'Clientes', id, { tipoCliente: input.tipoCliente })
    return findClient(client, id)
  })
  return context.json(record, 201)
})

app.patch('/api/clients/:id', async (context) => {
  const input = clientInput(await jsonBody(context.req.raw), true)
  const id = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const current = await client.query<{ tipoCliente: string; activo: boolean }>(
      'select tipo_cliente as "tipoCliente", activo from public.negocios where id = $1',
      [id],
    )
    if (!current.rows[0]) throw new ApiError(404, 'El Cliente no existe')
    if (current.rows[0].tipoCliente !== input.tipoCliente) {
      throw new ApiError(409, 'El tipo de Cliente no puede modificarse')
    }
    const updated = await client.query(
      `update public.negocios
       set nombre = $1, nit = $2, correos_json = $3::jsonb, activo = $4,
           vigencia_cert_establecimiento_meses = $5,
           plantilla_cert_establecimiento_storage_path = $6
       where id = $7 and version = $8
       returning id`,
      [input.nombre, input.nit, JSON.stringify(input.correos), input.activo,
        input.vigenciaCertificadoMeses, input.plantillaCertificadoStoragePath, id, input.version],
    )
    if (!updated.rowCount) throw conflictError('Cliente')

    if (input.tipoCliente === 'RESIDENCIAL') {
      await client.query(
        `update public.sedes
         set nombre = $1, direccion = $2, contacto_principal_nombre = $1,
             contacto_principal_celular = $3, activo = $4
         where negocio_id = $5 and tipo_sede = 'RESIDENCIAL'`,
        [input.nombre, input.residenciaDireccion, input.residenciaCelular, input.activo, id],
      )
    }
    const auditEvent = current.rows[0].activo === input.activo
      ? 'CLIENTE_ACTUALIZADO'
      : input.activo ? 'CLIENTE_REACTIVADO' : 'CLIENTE_DESACTIVADO'
    await audit(client, admin.id, auditEvent, 'Clientes', id, {
      tipoCliente: input.tipoCliente,
    })
    return findClient(client, id)
  })
  return context.json(record)
})

app.delete('/api/clients/:id', async (context) => {
  const id = context.req.param('id')
  const version = integerValue(context.req.query('version'), 'version')
  await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const dependencies = await client.query<{ hasDependencies: boolean }>(
      `select exists (
         select 1 from public.sedes s
         where s.negocio_id = $1 and (
           exists (select 1 from public.servicios sv where sv.sede_id = s.id)
           or exists (select 1 from public.areas a where a.sede_id = s.id)
           or exists (select 1 from public.dispositivos d where d.sede_id = s.id)
           or exists (select 1 from public.vehiculos v where v.sede_id = s.id)
         )
       ) as "hasDependencies"`,
      [id],
    )
    if (dependencies.rows[0]?.hasDependencies) throw dependencyError('Cliente')
    await client.query('delete from public.sedes where negocio_id = $1', [id])
    const deleted = await client.query('delete from public.negocios where id = $1 and version = $2', [id, version])
    if (!deleted.rowCount) throw conflictError('Cliente')
    await audit(client, admin.id, 'CLIENTE_ELIMINADO', 'Clientes', id, null)
  })
  return context.body(null, 204)
})

app.get('/api/catalogs/client-sites', async (context) => {
  const rows = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const result = await client.query(
      `select n.id as "negocioId", n.nit, n.nombre as "negocioNombre",
              s.id as "sedeId", s.nombre as "sedeNombre", s.direccion,
              s.valor_servicio as "valorServicio",
              s.duracion_servicio_minutos as "duracionServicioMinutos"
       from public.negocios n
       join public.sedes s on s.negocio_id = n.id
       where n.activo and n.tipo_cliente = 'NEGOCIO'
         and s.activo and s.tipo_sede = 'NEGOCIO'
       order by n.nombre, s.nombre`,
    )
    return result.rows
  })
  return context.json(rows)
})

app.get('/api/catalogs/forms', async (context) => {
  const rows = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const result = await client.query(
      `select formulario_id as id,
              min(codigo_formulario) as codigo,
              min(nombre_formulario) as nombre,
              version
       from public.formularios
       where estado_version = 'ACTIVA'
       group by formulario_id, version
       order by min(codigo_formulario), version`,
    )
    return result.rows
  })
  return context.json(rows)
})

app.get('/api/clients/:id/sites', async (context) => {
  const rows = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const result = await client.query(
      `${SITE_SELECT} where s.negocio_id = $1 and s.tipo_sede = 'NEGOCIO' order by s.activo desc, s.nombre`,
      [context.req.param('id')],
    )
    return result.rows
  })
  return context.json(rows)
})

app.post('/api/clients/:id/sites', async (context) => {
  const input = siteInput(await jsonBody(context.req.raw))
  const clientId = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const owner = await client.query('select id from public.negocios where id = $1 and tipo_cliente = $2', [clientId, 'NEGOCIO'])
    if (!owner.rowCount) throw new ApiError(422, 'El Cliente Negocio no existe')
    await validateFormIds(client, input.formulariosAplicablesIds)
    const inserted = await client.query<{ id: string }>(
      `insert into public.sedes (
         negocio_id, nombre, direccion, correos_json, hereda_correos_negocio,
         contacto_principal_nombre, contacto_principal_correo, contacto_principal_celular,
         valor_servicio, periodicidad_meses, maneja_refuerzo, tipo_sede,
         formularios_aplicables_json, plano_storage_path, maneja_vehiculos,
         genera_certificado_vehiculo, vigencia_cert_vehiculo_meses,
         plantilla_cert_vehiculo_storage_path, duracion_servicio_minutos, activo
       ) values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11,
                 'NEGOCIO', $12::jsonb, $13, $14, $15, $16, $17, $18, $19)
       returning id`,
      [clientId, input.nombre, input.direccion, JSON.stringify(input.correos), input.heredaCorreosCliente,
        input.contactoPrincipalNombre, input.contactoPrincipalCorreo, input.contactoPrincipalCelular,
        input.valorServicio, input.periodicidadMeses, input.manejaRefuerzo,
        JSON.stringify(input.formulariosAplicablesIds), input.planoStoragePath, input.manejaVehiculos,
        input.generaCertificadoVehiculo, input.vigenciaCertificadoVehiculoMeses,
        input.plantillaCertificadoVehiculoStoragePath, input.duracionServicioMinutos, input.activo],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new ApiError(500, 'No fue posible crear la Sede')
    await audit(client, admin.id, 'SEDE_CREADA', 'Sedes', id, { clientId })
    return findSite(client, id)
  })
  return context.json(record, 201)
})

app.get('/api/sites/:id', async (context) => {
  const record = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    return findSite(client, context.req.param('id'))
  })
  return context.json(record)
})

app.patch('/api/sites/:id', async (context) => {
  const input = siteInput(await jsonBody(context.req.raw), true)
  const id = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const current = await client.query<{ activo: boolean }>('select activo from public.sedes where id = $1 and tipo_sede = $2', [id, 'NEGOCIO'])
    if (!current.rows[0]) throw new ApiError(404, 'La Sede no existe')
    await validateFormIds(client, input.formulariosAplicablesIds)
    const updated = await client.query(
      `update public.sedes
       set nombre = $1, direccion = $2, correos_json = $3::jsonb,
           hereda_correos_negocio = $4, contacto_principal_nombre = $5,
           contacto_principal_correo = $6, contacto_principal_celular = $7,
           valor_servicio = $8, periodicidad_meses = $9, maneja_refuerzo = $10,
           formularios_aplicables_json = $11::jsonb, plano_storage_path = $12,
           maneja_vehiculos = $13, genera_certificado_vehiculo = $14,
           vigencia_cert_vehiculo_meses = $15,
           plantilla_cert_vehiculo_storage_path = $16,
           duracion_servicio_minutos = $17, activo = $18
       where id = $19 and tipo_sede = 'NEGOCIO' and version = $20
       returning id`,
      [input.nombre, input.direccion, JSON.stringify(input.correos), input.heredaCorreosCliente,
        input.contactoPrincipalNombre, input.contactoPrincipalCorreo, input.contactoPrincipalCelular,
        input.valorServicio, input.periodicidadMeses, input.manejaRefuerzo,
        JSON.stringify(input.formulariosAplicablesIds), input.planoStoragePath, input.manejaVehiculos,
        input.generaCertificadoVehiculo, input.vigenciaCertificadoVehiculoMeses,
        input.plantillaCertificadoVehiculoStoragePath, input.duracionServicioMinutos, input.activo, id, input.version],
    )
    if (!updated.rowCount) throw conflictError('Sede')
    const auditEvent = current.rows[0].activo === input.activo
      ? 'SEDE_ACTUALIZADA'
      : input.activo ? 'SEDE_REACTIVADA' : 'SEDE_DESACTIVADA'
    await audit(client, admin.id, auditEvent, 'Sedes', id, null)
    return findSite(client, id)
  })
  return context.json(record)
})

app.delete('/api/sites/:id', async (context) => {
  const id = context.req.param('id')
  const version = integerValue(context.req.query('version'), 'version')
  await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const dependency = await client.query<{ hasDependencies: boolean }>(
      `select exists (select 1 from public.servicios where sede_id = $1)
          or exists (select 1 from public.areas where sede_id = $1)
          or exists (select 1 from public.dispositivos where sede_id = $1)
          or exists (select 1 from public.vehiculos where sede_id = $1) as "hasDependencies"`,
      [id],
    )
    if (dependency.rows[0]?.hasDependencies) throw dependencyError('Sede')
    const deleted = await client.query('delete from public.sedes where id = $1 and version = $2', [id, version])
    if (!deleted.rowCount) throw conflictError('Sede')
    await audit(client, admin.id, 'SEDE_ELIMINADA', 'Sedes', id, null)
  })
  return context.body(null, 204)
})

app.get('/api/sites/:id/areas', async (context) => {
  const rows = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const result = await client.query(`${AREA_SELECT} where a.sede_id = $1 order by a.activo desc, a.nombre`, [context.req.param('id')])
    return result.rows
  })
  return context.json(rows)
})

app.post('/api/sites/:id/areas', async (context) => {
  const input = areaInput(await jsonBody(context.req.raw))
  const siteId = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const inserted = await client.query<{ id: string }>(
      `insert into public.areas (sede_id, nombre, es_externa, activo)
       select $1, $2, $3, $4
       where exists (select 1 from public.sedes where id = $1 and tipo_sede = 'NEGOCIO')
       returning id`,
      [siteId, input.nombre, input.esExterna, input.activo],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new ApiError(422, 'La Sede no permite crear Áreas')
    await audit(client, admin.id, 'AREA_CREADA', 'Areas', id, { siteId })
    return findArea(client, id)
  })
  return context.json(record, 201)
})

app.patch('/api/areas/:id', async (context) => {
  const input = areaInput(await jsonBody(context.req.raw), true)
  const id = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const current = await client.query<{ activo: boolean }>('select activo from public.areas where id = $1', [id])
    if (!current.rows[0]) throw new ApiError(404, 'El Área no existe')
    const updated = await client.query(
      `update public.areas set nombre = $1, es_externa = $2, activo = $3
       where id = $4 and version = $5 returning id`,
      [input.nombre, input.esExterna, input.activo, id, input.version],
    )
    if (!updated.rowCount) throw conflictError('Área')
    const auditEvent = current.rows[0].activo === input.activo
      ? 'AREA_ACTUALIZADA'
      : input.activo ? 'AREA_REACTIVADA' : 'AREA_DESACTIVADA'
    await audit(client, admin.id, auditEvent, 'Areas', id, null)
    return findArea(client, id)
  })
  return context.json(record)
})

app.delete('/api/areas/:id', async (context) => {
  const id = context.req.param('id')
  const version = integerValue(context.req.query('version'), 'version')
  await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const dependency = await client.query<{ hasDependencies: boolean }>(
      `select exists (select 1 from public.dispositivos where area_id = $1)
          or exists (select 1 from public.respuestas_formulario where area_id = $1)
          or exists (select 1 from public.hallazgos where area_id = $1) as "hasDependencies"`,
      [id],
    )
    if (dependency.rows[0]?.hasDependencies) throw dependencyError('Área')
    const deleted = await client.query('delete from public.areas where id = $1 and version = $2', [id, version])
    if (!deleted.rowCount) throw conflictError('Área')
    await audit(client, admin.id, 'AREA_ELIMINADA', 'Areas', id, null)
  })
  return context.body(null, 204)
})

app.get('/api/clients/:id/services', async (context) => {
  const page = positiveQueryInteger(context.req.query('page'), 1)
  const result = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    return serviceHistory(client, 'client', context.req.param('id'), page)
  })
  return context.json(result)
})

app.get('/api/sites/:id/services', async (context) => {
  const page = positiveQueryInteger(context.req.query('page'), 1)
  const result = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    return serviceHistory(client, 'site', context.req.param('id'), page)
  })
  return context.json(result)
})

app.get('/api/services', async (context) => {
  const identity = context.get('identity')
  const services = await transaction(async (client) => {
    await bootstrapProfile(client, identity)
    const { rows } = await client.query(
      `select s.id,
              s.solicitud,
              n.nombre as "negocioNombre",
              se.nombre as "sedeNombre",
              u.nombre_completo as "tecnicoNombre",
              s.inicio_programado as "inicioProgramado",
              s.fin_programado as "finProgramado",
              s.estado,
              s.calendar_event_id as "calendarEventId",
              s.calendar_sync_estado as "calendarSyncEstado",
              s.calendar_sync_error as "calendarSyncError"
       from public.servicios s
       join public.sedes se on se.id = s.sede_id
       join public.negocios n on n.id = se.negocio_id
       join public.usuarios u on u.id = s.tecnico_responsable_id
       where private.can_access_service(s.id, $1, $2::jsonb)
       order by s.inicio_programado desc
       limit 100`,
      [identity.authUserId, JSON.stringify(identity.session)],
    )
    return rows
  })
  return context.json(services)
})

app.post('/api/services', async (context) => {
  const body = await jsonBody(context.req.raw)
  const identity = context.get('identity')
  const service = await transaction(async (client) => {
    const admin = await requireAdmin(client, identity)
    const site = await client.query<{ duracion: number; valor: number }>(
      `select s.duracion_servicio_minutos as duracion,
              s.valor_servicio as valor
       from public.sedes s
       join public.negocios n on n.id = s.negocio_id
       where s.id = $1 and s.activo and s.tipo_sede = 'NEGOCIO'
         and n.activo and n.tipo_cliente = 'NEGOCIO'`,
      [requiredString(body, 'sedeId')],
    )
    const siteConfig = site.rows[0]

    if (!siteConfig) {
      throw new ApiError(422, 'La Sede seleccionada no existe')
    }

    const duration = requiredPositiveInteger(body, 'duracionMinutos')
    const start = dateValue(body.inicioProgramado, 'inicioProgramado')
    const end = new Date(start.getTime() + duration * 60_000)
    const inserted = await client.query<{ id: string; solicitud: string }>(
      `insert into public.servicios (
         solicitud, sede_id, tipo_servicio, estado, inicio_programado,
         fin_programado, creado_por_id, tecnico_responsable_id,
         tecnicos_colaboradores_ids_json, formularios_versiones_json,
         valor_servicio, observaciones, calendar_sync_estado
       ) values (
         'PENDIENTE', $1, 'PRINCIPAL', 'PROGRAMADO', $2, $3, $4, $5,
         $6::jsonb, '[]'::jsonb, $7, $8, 'PENDIENTE'
       )
       returning id, solicitud`,
      [
        requiredString(body, 'sedeId'),
        start.toISOString(),
        end.toISOString(),
        admin.id,
        requiredString(body, 'tecnicoResponsableId'),
        JSON.stringify(stringArray(body.tecnicosColaboradoresIds)),
        siteConfig.valor,
        optionalString(body.observaciones),
      ],
    )
    const created = inserted.rows[0]

    if (!created) {
      throw new ApiError(500, 'No fue posible crear el Servicio')
    }

    await client.query(
      `insert into private.integration_jobs (job_type, idempotency_key, payload)
       values ('CALENDAR', $1, jsonb_build_object('serviceId', $2::text))
       on conflict (job_type, idempotency_key) do update
       set status = 'PENDING', run_after = now(), lease_until = null, last_error = null`,
      [created.id, created.id],
    )
    await audit(client, admin.id, 'SERVICIO_PROGRAMADO', 'Servicios', created.id, {
      solicitud: created.solicitud,
    })
    return created
  })

  try {
    const synced = await syncCalendar(service.id)
    return context.json(synced, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible sincronizar Calendar'
    return context.json(
      {
        ...service,
        calendarSyncEstado: 'ERROR',
        calendarSyncError: message,
        warning: 'El Servicio quedó guardado y puedes reintentar Calendar.',
      },
      201,
    )
  }
})

app.post('/api/services/:id/calendar/retry', async (context) => {
  const identity = context.get('identity')
  const serviceId = context.req.param('id')
  await transaction(async (client) => {
    await requireAdmin(client, identity)
    const result = await client.query(
      `update public.servicios
       set calendar_sync_estado = 'PENDIENTE', calendar_sync_error = null
       where id = $1
       returning id`,
      [serviceId],
    )

    if (!result.rowCount) {
      throw new ApiError(404, 'El Servicio no existe')
    }

    await client.query(
      `insert into private.integration_jobs (job_type, idempotency_key, payload)
       values ('CALENDAR', $1, jsonb_build_object('serviceId', $1::text))
       on conflict (job_type, idempotency_key) do update
       set status = 'PENDING', run_after = now(), lease_until = null, last_error = null`,
      [serviceId],
    )
  })

  return context.json(await syncCalendar(serviceId))
})

app.get('/api/google/status', async (context) => {
  await transaction((client) => requireAdmin(client, context.get('identity')))
  return context.json(await getGoogleStatus())
})

app.post('/api/google/authorization-url', async (context) => {
  const body = await jsonBody(context.req.raw)
  const returnUrl = requiredString(body, 'returnUrl')
  assertAllowedReturnUrl(returnUrl)
  const identity = context.get('identity')
  const authorizationUrl = await transaction(async (client) => {
    const admin = await requireAdmin(client, identity)
    return createGoogleAuthorization(client, admin.id, returnUrl)
  })
  return context.json({ authorizationUrl })
})

app.get('/google/callback', async (context) => {
  const error = context.req.query('error')
  const code = context.req.query('code')
  const state = context.req.query('state')

  if (error) {
    throw new ApiError(400, `Google rechazó la autorización: ${error}`)
  }
  if (!code || !state) {
    throw new ApiError(400, 'Google no devolvió los datos de autorización esperados')
  }

  const returnUrl = new URL(await completeGoogleAuthorization(code, state))
  returnUrl.searchParams.set('google', 'connected')
  return context.redirect(returnUrl.toString())
})

app.post('/api/email/test', async (context) => {
  const body = await jsonBody(context.req.raw)
  const identity = context.get('identity')
  const recipient = requiredEmail(body, 'to')
  const subject = optionalString(body.subject) ?? 'Prueba de integración Gmail'
  const text = requiredString(body, 'text')
  const admin = await transaction((client) => requireAdmin(client, identity))
  const jobId = randomUUID()

  await pool.query(
    `insert into private.integration_jobs (id, job_type, idempotency_key, payload, status, attempts)
     values ($1::uuid, 'EMAIL', $1::uuid::text, $2::jsonb, 'RUNNING', 1)`,
    [jobId, JSON.stringify({ to: recipient, subject })],
  )

  try {
    const messageId = await sendGmailMessage({
      to: recipient,
      subject,
      text,
    })
    await transaction(async (client) => {
      await client.query(
        `update private.integration_jobs
         set status = 'COMPLETED', lease_until = null, last_error = null
         where id = $1`,
        [jobId],
      )
      await audit(client, admin.id, 'CORREO_PRUEBA_ENVIADO', 'Integraciones', jobId, {
        destinatario: recipient,
        messageId,
      })
    })
    return context.json({ sent: true, messageId })
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : 'No fue posible enviar el correo'
    await transaction(async (client) => {
      await client.query(
        `update private.integration_jobs
         set status = 'FAILED', lease_until = null, last_error = $2,
             run_after = now() + interval '5 minutes'
         where id = $1`,
        [jobId, message.slice(0, 1000)],
      )
      await audit(client, admin.id, 'CORREO_PRUEBA_FALLIDO', 'Integraciones', jobId, {
        destinatario: recipient,
        error: message.slice(0, 500),
      })
    })
    throw sendError
  }
})

app.notFound((context) => context.json({ error: 'Ruta no encontrada' }, 404))

app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) },
      error.status as ContentfulStatusCode,
    )
  }

  const databaseError = error as DatabaseError

  if (databaseError.code === '23505') {
    const message = {
      usuarios_correo_google_uidx: 'Este correo ya está registrado.',
      negocios_nit_uidx: 'Este NIT ya está registrado.',
      areas_sede_nombre_uidx: 'Ya existe un Área con ese nombre en la Sede.',
      sedes_residencial_cliente_uidx: 'El Cliente Casa ya tiene una ubicación residencial.',
    }[databaseError.constraint ?? ''] ?? 'Ya existe un registro con esos datos'
    return context.json({ error: message }, 409)
  }
  if (databaseError.code === '23503') {
    return context.json({ error: 'El registro tiene dependencias y no puede eliminarse', code: 'DEPENDENCIES' }, 409)
  }
  if (databaseError.code === '23514' || databaseError.code === 'P0001') {
    return context.json({ error: databaseError.message }, 422)
  }

  console.error(error)
  return context.json({ error: 'Ocurrió un error interno' }, 500)
})

async function syncCalendar(serviceId: string) {
  const serviceResult = await pool.query<{
    id: string
    solicitud: string
    creado_por_id: string
    negocio_nombre: string
    sede_nombre: string
    direccion: string
    tecnico_nombre: string
    inicio_programado: Date
    fin_programado: Date
  }>(
    `select s.id, s.solicitud, s.creado_por_id,
            n.nombre as negocio_nombre, se.nombre as sede_nombre,
            se.direccion, u.nombre_completo as tecnico_nombre,
            s.inicio_programado, s.fin_programado
     from public.servicios s
     join public.sedes se on se.id = s.sede_id
     join public.negocios n on n.id = se.negocio_id
     join public.usuarios u on u.id = s.tecnico_responsable_id
     where s.id = $1`,
    [serviceId],
  )
  const service = serviceResult.rows[0]

  if (!service) {
    throw new ApiError(404, 'El Servicio no existe')
  }

  await pool.query(
    `update private.integration_jobs
     set status = 'RUNNING', attempts = attempts + 1,
         lease_until = now() + interval '5 minutes', last_error = null
     where job_type = 'CALENDAR' and idempotency_key = $1`,
    [serviceId],
  )

  try {
    const eventId = await upsertCalendarEvent({
      serviceId,
      summary: `${service.solicitud} · ${service.negocio_nombre}`,
      description: `Sede: ${service.sede_nombre}\nTécnico: ${service.tecnico_nombre}`,
      location: service.direccion,
      start: service.inicio_programado.toISOString(),
      end: service.fin_programado.toISOString(),
    })
    await transaction(async (client) => {
      await client.query(
        `update public.servicios
         set calendar_event_id = $2,
             calendar_sync_estado = 'SINCRONIZADO',
             calendar_ultima_sync_at = now(),
             calendar_sync_error = null
         where id = $1`,
        [serviceId, eventId],
      )
      await client.query(
        `update private.integration_jobs
         set status = 'COMPLETED', lease_until = null, last_error = null
         where job_type = 'CALENDAR' and idempotency_key = $1`,
        [serviceId],
      )
      await audit(client, service.creado_por_id, 'CALENDAR_SERVICIO_SINCRONIZADO', 'Servicios', serviceId, {
        calendarEventId: eventId,
      })
    })
    return {
      id: service.id,
      solicitud: service.solicitud,
      calendarSyncEstado: 'SINCRONIZADO',
      calendarEventId: eventId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible sincronizar Calendar'
    await transaction(async (client) => {
      await client.query(
        `update public.servicios
         set calendar_sync_estado = 'ERROR',
             calendar_ultima_sync_at = now(),
             calendar_sync_error = $2
         where id = $1`,
        [serviceId, message.slice(0, 1000)],
      )
      await client.query(
        `update private.integration_jobs
         set status = 'FAILED', lease_until = null, last_error = $2,
             run_after = now() + interval '5 minutes'
         where job_type = 'CALENDAR' and idempotency_key = $1`,
        [serviceId, message.slice(0, 1000)],
      )
      await audit(client, service.creado_por_id, 'CALENDAR_SERVICIO_FALLIDO', 'Servicios', serviceId, {
        error: message.slice(0, 500),
      })
    })
    throw error
  }
}

async function audit(
  client: PoolClient,
  userId: string,
  action: string,
  entity: string,
  recordId: string,
  detail: unknown,
): Promise<void> {
  await client.query(
    `insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [userId, action, entity, recordId, JSON.stringify(detail)],
  )
}

async function findClient(client: PoolClient, id: string): Promise<unknown> {
  const { rows } = await client.query(`${CLIENT_SELECT} where n.id = $1 ${CLIENT_GROUP}`, [id])
  if (!rows[0]) throw new ApiError(404, 'El Cliente no existe')
  return rows[0]
}

async function findSite(client: PoolClient, id: string): Promise<unknown> {
  const { rows } = await client.query(`${SITE_SELECT} where s.id = $1`, [id])
  if (!rows[0]) throw new ApiError(404, 'La Sede no existe')
  return rows[0]
}

async function findArea(client: PoolClient, id: string): Promise<unknown> {
  const { rows } = await client.query(`${AREA_SELECT} where a.id = $1`, [id])
  if (!rows[0]) throw new ApiError(404, 'El Área no existe')
  return rows[0]
}

async function validateFormIds(client: PoolClient, ids: string[]): Promise<void> {
  if (!ids.length) return
  const { rows } = await client.query<{ count: string }>(
    `select count(distinct formulario_id)::text as count
     from public.formularios
     where estado_version = 'ACTIVA' and formulario_id = any($1::uuid[])`,
    [ids],
  )
  if (Number(rows[0]?.count) !== ids.length) {
    throw new ApiError(422, 'La selección contiene un Formulario inactivo o inexistente')
  }
}

async function serviceHistory(
  client: PoolClient,
  scope: 'client' | 'site',
  id: string,
  page: number,
): Promise<{ items: unknown[]; page: number; pageSize: number; total: number }> {
  const pageSize = 20
  const condition = scope === 'client' ? 'se.negocio_id = $1' : 's.sede_id = $1'
  const count = await client.query<{ total: string }>(
    `select count(*)::text as total
     from public.servicios s
     join public.sedes se on se.id = s.sede_id
     where ${condition}`,
    [id],
  )
  const { rows } = await client.query(
    `select s.id, s.solicitud, s.inicio_programado as fecha,
            s.tipo_servicio as tipo, u.nombre_completo as tecnico,
            s.estado, s.valor_servicio as valor
     from public.servicios s
     join public.sedes se on se.id = s.sede_id
     join public.usuarios u on u.id = s.tecnico_responsable_id
     where ${condition}
     order by s.inicio_programado desc
     limit $2 offset $3`,
    [id, pageSize, (page - 1) * pageSize],
  )
  return { items: rows, page, pageSize, total: Number(count.rows[0]?.total ?? 0) }
}

function clientInput(body: Record<string, unknown>, editing = false) {
  const tipoCliente = enumValue(body.tipoCliente, ['NEGOCIO', 'RESIDENCIAL'], 'tipoCliente')
  const correos = emailArray(body.correos)
  const active = requiredBoolean(body, 'activo')
  const version = editing ? requiredPositiveInteger(body, 'version') : undefined

  if (tipoCliente === 'NEGOCIO') {
    return {
      tipoCliente,
      nombre: requiredString(body, 'nombre'),
      nit: requiredString(body, 'nit'),
      correos,
      activo: active,
      vigenciaCertificadoMeses: requiredPositiveInteger(body, 'vigenciaCertificadoMeses'),
      plantillaCertificadoStoragePath: requiredString(body, 'plantillaCertificadoStoragePath'),
      residenciaDireccion: null,
      residenciaCelular: null,
      version,
    }
  }

  return {
    tipoCliente,
    nombre: requiredString(body, 'nombre'),
    nit: null,
    correos: [],
    activo: active,
    vigenciaCertificadoMeses: null,
    plantillaCertificadoStoragePath: null,
    residenciaDireccion: requiredString(body, 'residenciaDireccion'),
    residenciaCelular: requiredPhone(body, 'residenciaCelular'),
    version,
  }
}

function siteInput(body: Record<string, unknown>, editing = false) {
  const manejaVehiculos = requiredBoolean(body, 'manejaVehiculos')
  const generaCertificadoVehiculo = manejaVehiculos && requiredBoolean(body, 'generaCertificadoVehiculo')
  const formulariosAplicablesIds = uniqueStrings(body.formulariosAplicablesIds)
  return {
    nombre: requiredString(body, 'nombre'),
    direccion: requiredString(body, 'direccion'),
    correos: emailArray(body.correos),
    heredaCorreosCliente: requiredBoolean(body, 'heredaCorreosCliente'),
    contactoPrincipalNombre: requiredString(body, 'contactoPrincipalNombre'),
    contactoPrincipalCorreo: optionalEmail(body.contactoPrincipalCorreo),
    contactoPrincipalCelular: requiredPhone(body, 'contactoPrincipalCelular'),
    valorServicio: requiredInteger(body, 'valorServicio'),
    periodicidadMeses: requiredPositiveInteger(body, 'periodicidadMeses'),
    manejaRefuerzo: requiredBoolean(body, 'manejaRefuerzo'),
    formulariosAplicablesIds,
    planoStoragePath: optionalString(body.planoStoragePath),
    manejaVehiculos,
    generaCertificadoVehiculo,
    vigenciaCertificadoVehiculoMeses: generaCertificadoVehiculo
      ? requiredPositiveInteger(body, 'vigenciaCertificadoVehiculoMeses')
      : null,
    plantillaCertificadoVehiculoStoragePath: generaCertificadoVehiculo
      ? requiredString(body, 'plantillaCertificadoVehiculoStoragePath')
      : null,
    duracionServicioMinutos: requiredPositiveInteger(body, 'duracionServicioMinutos'),
    activo: requiredBoolean(body, 'activo'),
    version: editing ? requiredPositiveInteger(body, 'version') : undefined,
  }
}

function areaInput(body: Record<string, unknown>, editing = false) {
  return {
    nombre: requiredString(body, 'nombre'),
    esExterna: requiredBoolean(body, 'esExterna'),
    activo: requiredBoolean(body, 'activo'),
    version: editing ? requiredPositiveInteger(body, 'version') : undefined,
  }
}

function conflictError(entity: string): ApiError {
  return new ApiError(409, 'El registro cambió en otra sesión. Actualiza los datos e intenta nuevamente.', 'VERSION_CONFLICT', { entity })
}

function dependencyError(entity: string): ApiError {
  return new ApiError(409, `${entity} tiene dependencias o historial y no puede eliminarse. Puedes desactivarlo.`, 'DEPENDENCIES', { entity })
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid body')
    }
    return body as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'El cuerpo JSON no es válido')
  }
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(422, `${key} es obligatorio`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredInteger(body: Record<string, unknown>, key: string): number {
  const rawValue = body[key]
  const value = typeof rawValue === 'string' && /^\d+$/u.test(rawValue)
    ? Number(rawValue)
    : rawValue
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ApiError(422, `${key} debe ser un entero válido`)
  }
  return Number(value)
}

function requiredPositiveInteger(body: Record<string, unknown>, key: string): number {
  const value = requiredInteger(body, key)
  if (value === 0) {
    throw new ApiError(422, `${key} debe ser mayor que cero`)
  }
  return value
}

function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key]
  if (typeof value !== 'boolean') {
    throw new ApiError(422, `${key} debe ser booleano`)
  }
  return value
}

function requiredEmail(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ApiError(422, `${key} no es un correo válido`)
  }
  return value
}

function optionalEmail(value: unknown): string | null {
  const normalized = optionalString(value)?.toLowerCase() ?? null
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ApiError(422, 'El correo de contacto no es válido')
  }
  return normalized
}

function stringArray(value: unknown): string[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new ApiError(422, 'La lista enviada no es válida')
  }
  return value.map((entry) => entry.trim()).filter(Boolean)
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set(stringArray(value))]
}

function emailArray(value: unknown): string[] {
  const emails = [...new Set(stringArray(value).map((email) => email.toLowerCase()))]
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new ApiError(422, 'La lista contiene un correo no válido')
  }
  return emails
}

function requiredPhone(body: Record<string, unknown>, key: string): string {
  const raw = requiredString(body, key).replace(/[\s().-]/g, '')
  const international = raw.startsWith('00') ? `+${raw.slice(2)}` : raw
  const normalized = /^3\d{9}$/.test(international) ? `+57${international}` : international
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new ApiError(422, `${key} no es un celular válido`)
  }
  return normalized
}

function integerValue(value: unknown, key: string): number {
  return requiredInteger({ [key]: value }, key)
}

function positiveQueryInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  return requiredPositiveInteger({ value }, 'value')
}

function optionalBooleanQuery(value: string | undefined, key: string): boolean | null {
  if (value === undefined) return null
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ApiError(422, `${key} debe ser true o false`)
}

function optionalEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  key: string,
): T | null {
  if (value === undefined || value === null || value === '') return null
  return enumValue(value, values, key)
}

function dateValue(value: unknown, key: string): Date {
  if (typeof value !== 'string') {
    throw new ApiError(422, `${key} es obligatorio`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(422, `${key} no es una fecha válida`)
  }
  return date
}

function enumValue<T extends string>(value: unknown, values: readonly T[], key: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new ApiError(422, `${key} no es válido`)
  }
  return value as T
}

function userInput(body: Record<string, unknown>) {
  const esAdmin = requiredBoolean(body, 'esAdmin')
  const esTecnico = requiredBoolean(body, 'esTecnico')

  if (!esAdmin && !esTecnico) {
    throw new ApiError(422, 'Selecciona al menos un rol')
  }

  const certificadoStoragePath = optionalString(body.certificadoStoragePath)
  let certificadoFechaEmision = optionalString(body.certificadoFechaEmision)
  let certificadoFechaVencimiento = optionalString(body.certificadoFechaVencimiento)

  if (!certificadoStoragePath) {
    certificadoFechaEmision = null
    certificadoFechaVencimiento = null
  } else {
    if (!certificadoFechaEmision) throw new ApiError(422, 'La fecha de emisión es obligatoria cuando existe un certificado')
    if (!certificadoFechaVencimiento) throw new ApiError(422, 'La fecha de vencimiento es obligatoria cuando existe un certificado')
    if (!isDateOnly(certificadoFechaEmision) || !isDateOnly(certificadoFechaVencimiento)) {
      throw new ApiError(422, 'Las fechas del certificado no son válidas')
    }
    if (certificadoFechaVencimiento < certificadoFechaEmision) {
      throw new ApiError(422, 'El vencimiento no puede ser anterior a la emisión')
    }
  }

  return {
    nombreCompleto: requiredString(body, 'nombreCompleto'),
    correoGoogle: requiredEmail(body, 'correoGoogle'),
    esAdmin,
    esTecnico,
    activo: requiredBoolean(body, 'activo'),
    certificadoStoragePath,
    certificadoFechaEmision,
    certificadoFechaVencimiento,
    certificadoObservaciones: optionalString(body.certificadoObservaciones),
  }
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function rolesOf(isAdmin: boolean, isTechnician: boolean): string[] {
  return [isAdmin ? 'ADMINISTRADOR' : null, isTechnician ? 'TECNICO' : null].filter(
    (role): role is string => Boolean(role),
  )
}

function assertAllowedReturnUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ApiError(422, 'returnUrl no es válida')
  }
  if (!allowedOrigins.has(url.origin)) {
    throw new ApiError(422, 'returnUrl no pertenece a un origen permitido')
  }
}

export default app
