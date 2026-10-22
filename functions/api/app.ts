import { assertMasterUnreferenced } from './certificates/cleanup'
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
import { certificateRoutes } from './certificates/routes'
import { areaTemplatesRoutes, applyAreaTemplate, optionalAreaTemplateId } from './areaTemplates'
import {
  completeGoogleAuthorization,
  createGoogleAuthorization,
  getGoogleStatus,
  sendGmailMessage,
} from './google'
import {
  MASTER_FILE_KINDS,
  assertMasterStoragePath,
  createMasterReadUrl,
  createMasterUploadUrl,
  createProfileReadUrl,
  deleteMasterObject,
} from './r2'

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
                              residence.direccion as "residenciaDireccion",
                              residence.contacto_principal_celular as "residenciaCelular",
                              residence.valor_servicio as "residenciaValorServicio",
                              count(s.id) filter (where s.tipo_sede = 'NEGOCIO')::integer as "sedesCount"
                       from public.negocios n
                       left join public.sedes s on s.negocio_id = n.id
                       left join lateral (
                         select direccion, contacto_principal_celular, valor_servicio
                         from public.sedes
                         where negocio_id = n.id and tipo_sede = 'RESIDENCIAL'
                         limit 1
                       ) residence on true`
const CLIENT_GROUP = `group by n.id, residence.direccion, residence.contacto_principal_celular, residence.valor_servicio`
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
                            s.plano_storage_path as "planoStoragePath",
                            s.maneja_vehiculos as "manejaVehiculos",
                            s.genera_certificado_vehiculo as "generaCertificadoVehiculo",
                            s.vigencia_cert_vehiculo_meses as "vigenciaCertificadoVehiculoMeses",
                            s.duracion_servicio_minutos as "duracionServicioMinutos",
                            s.activo,
                            s.version,
                            (select count(*)::integer from public.areas a where a.sede_id = s.id and a.activo) as "areasCount",
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
                            (select count(*)::integer from public.dispositivos d where d.area_id = a.id and d.activo) as "dispositivosCount"
                     from public.areas a`

app.use(
  '/api/*',
  cors({
    origin: (origin) => (allowedOrigins.has(origin) ? origin : ''),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  }),
)

app.use('/api/*', async (context, next) => {
  if (context.req.method === 'OPTIONS') {
    await next()
    return
  }

  if (context.req.path.startsWith('/api/public/reports/')) {
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
  const profile = await transaction(async client => {
    const current = await bootstrapProfile(client, context.get('identity'))
    const { rows } = await client.query<{ foto_storage_path: string | null }>(
      'select foto_storage_path from public.usuarios where id=$1', [current.id],
    )
    const path = rows[0]?.foto_storage_path
    return {
      ...current,
      avatarUrl: path ? createProfileReadUrl('AVATAR', current.id, path) : null,
    }
  })
  return context.json(profile)
})

app.post('/api/files/master/upload-url', async (context) => {
  const body = await jsonBody(context.req.raw)
  const kind = enumValue(body.kind, MASTER_FILE_KINDS, 'kind')
  const fileName = requiredString(body, 'fileName')
  const contentType = typeof body.contentType === 'string' ? body.contentType : ''
  const size = requiredPositiveInteger(body, 'size')

  await transaction((client) => requireAdmin(client, context.get('identity')))
  return context.json(createMasterUploadUrl({ kind, fileName, contentType, size }))
})

app.post('/api/files/master/read-url', async (context) => {
  const body = await jsonBody(context.req.raw)
  const storagePath = requiredString(body, 'storagePath')
  assertMasterStoragePath(storagePath)
  await transaction((client) => requireAdmin(client, context.get('identity')))
  return context.json({ url: createMasterReadUrl(storagePath) })
})

app.post('/api/files/master/delete', async (context) => {
  const body = await jsonBody(context.req.raw)
  const storagePath = requiredString(body, 'storagePath')
  assertMasterStoragePath(storagePath)
  await transaction((client) => requireAdmin(client, context.get('identity')))
  await transaction(async (client) => {
    await assertMasterUnreferenced(client, storagePath)
    await deleteMasterObject(storagePath)
  })
  return context.body(null, 204)
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
         tipo_cliente, nombre, nit, correos_json, activo, vigencia_cert_establecimiento_meses
       ) values ($1, $2, $3, $4::jsonb, $5, $6)
       returning id`,
      [input.tipoCliente, input.nombre, input.nit, JSON.stringify(input.correos), input.activo,
        input.vigenciaCertificadoMeses],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new ApiError(500, 'No fue posible crear el Cliente')

    if (input.tipoCliente === 'RESIDENCIAL') {
      await client.query(
        `insert into public.sedes (
           negocio_id, nombre, direccion, correos_json, hereda_correos_negocio,
           contacto_principal_nombre, contacto_principal_correo, contacto_principal_celular,
           valor_servicio, periodicidad_meses, maneja_refuerzo, tipo_sede,
           maneja_vehiculos, genera_certificado_vehiculo,
           duracion_servicio_minutos, activo
         ) values ($1, $2, $3, '[]'::jsonb, false, $2, null, $4, $5, null,
                   false, 'RESIDENCIAL', false, false, null, $6)`,
        [id, input.nombre, input.residenciaDireccion, input.residenciaCelular, input.residenciaValorServicio, input.activo],
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
           vigencia_cert_establecimiento_meses = $5
       where id = $6 and version = $7
       returning id`,
      [input.nombre, input.nit, JSON.stringify(input.correos), input.activo,
        input.vigenciaCertificadoMeses, id, input.version],
    )
    if (!updated.rowCount) throw conflictError('Cliente')

    if (input.tipoCliente === 'RESIDENCIAL') {
      await client.query(
        `update public.sedes
         set nombre = $1, direccion = $2, contacto_principal_nombre = $1,
             contacto_principal_celular = $3, valor_servicio = $4, activo = $5
         where negocio_id = $6 and tipo_sede = 'RESIDENCIAL'`,
        [input.nombre, input.residenciaDireccion, input.residenciaCelular, input.residenciaValorServicio, input.activo, id],
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
       ) or exists (select 1 from public.plantillas_areas where negocio_id = $1) as "hasDependencies"`,
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
  const body = await jsonBody(context.req.raw)
  const input = siteInput(body)
  const areaTemplateId = optionalAreaTemplateId(body.areaTemplateId)
  const clientId = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const owner = await client.query('select id from public.negocios where id = $1 and tipo_cliente = $2', [clientId, 'NEGOCIO'])
    if (!owner.rowCount) throw new ApiError(422, 'El Cliente Negocio no existe')
    const inserted = await client.query<{ id: string }>(
      `insert into public.sedes (
         negocio_id, nombre, direccion, correos_json, hereda_correos_negocio,
         contacto_principal_nombre, contacto_principal_correo, contacto_principal_celular,
         valor_servicio, periodicidad_meses, maneja_refuerzo, tipo_sede,
         plano_storage_path, maneja_vehiculos,
         genera_certificado_vehiculo, vigencia_cert_vehiculo_meses,
         duracion_servicio_minutos, activo
       ) values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11,
                 'NEGOCIO', $12, $13, $14, $15, $16, $17)
       returning id`,
      [clientId, input.nombre, input.direccion, JSON.stringify(input.correos), input.heredaCorreosCliente,
        input.contactoPrincipalNombre, input.contactoPrincipalCorreo, input.contactoPrincipalCelular,
        input.valorServicio, input.periodicidadMeses, input.manejaRefuerzo,
        input.planoStoragePath, input.manejaVehiculos,
        input.generaCertificadoVehiculo, input.vigenciaCertificadoVehiculoMeses,
        input.duracionServicioMinutos, input.activo],
    )
    const id = inserted.rows[0]?.id
    if (!id) throw new ApiError(500, 'No fue posible crear la Sede')
    if (areaTemplateId) await applyAreaTemplate(client, id, areaTemplateId)
    await audit(client, admin.id, 'SEDE_CREADA', 'Sedes', id, { clientId, areaTemplateId })
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
    const current = await client.query<{ activo: boolean; manejaVehiculos: boolean }>(
      'select activo, maneja_vehiculos as "manejaVehiculos" from public.sedes where id=$1 and tipo_sede=$2 for update', [id, 'NEGOCIO'])
    if (!current.rows[0]) throw new ApiError(404, 'La Sede no existe')
    if (current.rows[0].manejaVehiculos !== input.manejaVehiculos) {
      const running = await client.query(
        "select 1 from public.servicios where sede_id=$1 and tipo_servicio='PRINCIPAL' and estado='EN_PROCESO' limit 1", [id])
      if (running.rowCount) throw new ApiError(409,
        'No cambies la gestión de vehículos mientras exista un servicio principal en proceso.', 'SITE_VEHICLES_BUSY')
    }
    const updated = await client.query(
      `update public.sedes
       set nombre = $1, direccion = $2, correos_json = $3::jsonb,
           hereda_correos_negocio = $4, contacto_principal_nombre = $5,
           contacto_principal_correo = $6, contacto_principal_celular = $7,
           valor_servicio = $8, periodicidad_meses = $9, maneja_refuerzo = $10,
           plano_storage_path = $11,
           maneja_vehiculos = $12, genera_certificado_vehiculo = $13,
           vigencia_cert_vehiculo_meses = $14,
           duracion_servicio_minutos = $15, activo = $16
       where id = $17 and tipo_sede = 'NEGOCIO' and version = $18
       returning id`,
      [input.nombre, input.direccion, JSON.stringify(input.correos), input.heredaCorreosCliente,
        input.contactoPrincipalNombre, input.contactoPrincipalCorreo, input.contactoPrincipalCelular,
        input.valorServicio, input.periodicidadMeses, input.manejaRefuerzo,
        input.planoStoragePath, input.manejaVehiculos,
        input.generaCertificadoVehiculo, input.vigenciaCertificadoVehiculoMeses,
        input.duracionServicioMinutos, input.activo, id, input.version],
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


const VEHICLE_SELECT = `select v.id, v.sede_id as "siteId", v.placa, v.activo, v.version
  from public.vehiculos v`

async function findVehicle(client: PoolClient, id: string) {
  const { rows } = await client.query(`${VEHICLE_SELECT} where v.id = $1`, [id])
  if (!rows[0]) throw new ApiError(404, 'El vehículo no existe')
  return rows[0]
}

function vehiclePlate(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(422, 'Ingresa una placa válida')
  const plate = value.trim().toUpperCase()
  if (!/^[A-Z0-9-]{3,12}$/.test(plate)) throw new ApiError(422, 'La placa debe tener entre 3 y 12 caracteres, letras, números o guion')
  return plate
}

app.get('/api/sites/:id/vehicles', async (context) => {
  const rows = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const siteId = context.req.param('id')
    const exists = await client.query("select id from public.sedes where id = $1 and tipo_sede = 'NEGOCIO'", [siteId])
    if (!exists.rowCount) throw new ApiError(404, 'La Sede no existe')
    return (await client.query(`${VEHICLE_SELECT} where v.sede_id = $1 order by v.activo desc, v.placa`, [siteId])).rows
  })
  return context.json(rows)
})

app.post('/api/sites/:id/vehicles', async (context) => {
  const body = await jsonBody(context.req.raw)
  const placa = vehiclePlate(body.placa)
  const siteId = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const inserted = await client.query<{ id: string }>(
      `insert into public.vehiculos(sede_id, placa)
       select s.id, $2 from public.sedes s
       where s.id = $1 and s.tipo_sede = 'NEGOCIO' and s.activo and s.maneja_vehiculos
       returning id`, [siteId, placa])
    const id = inserted.rows[0]?.id
    if (!id) throw new ApiError(422, 'Habilita la gestión de vehículos en una Sede activa')
    await audit(client, admin.id, 'VEHICULO_CREADO', 'Vehiculos', id, { siteId })
    return findVehicle(client, id)
  })
  return context.json(record, 201)
})

app.patch('/api/vehicles/:id', async (context) => {
  const body = await jsonBody(context.req.raw)
  const placa = vehiclePlate(body.placa)
  const activo = requiredBoolean(body, 'activo')
  const version = requiredPositiveInteger(body, 'version')
  const id = context.req.param('id')
  const record = await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const previous = await client.query<{ placa: string; activo: boolean; siteId: string; enabled: boolean }>(
      `select v.placa, v.activo, v.sede_id as "siteId",
        (s.maneja_vehiculos and s.activo and s.tipo_sede = 'NEGOCIO') as enabled
        from public.vehiculos v join public.sedes s on s.id=v.sede_id
        where v.id=$1 for update of v`, [id])
    const current = previous.rows[0]
    if (!current) throw new ApiError(404, 'El vehículo no existe')
    if (!current.enabled && (activo || placa !== current.placa)) {
      throw new ApiError(422, 'La Sede debe estar activa y manejar vehículos para esta operación')
    }
    if (placa !== current.placa) {
      const history = await client.query(
        `select (
           exists(select 1 from public.certificados where vehiculo_id=$1)
           or exists(select 1 from public.servicios
             where sede_id=$2 and coalesce(vehiculos_atendidos_ids_json, '[]'::jsonb) ? ($1::uuid)::text)
         ) as used`, [id, current.siteId])
      if (history.rows[0]?.used) throw new ApiError(409,
        'La placa tiene historial y no puede modificarse. Desactiva el vehículo y registra la placa correcta.', 'VEHICLE_HISTORY')
    }
    const updated = await client.query('update public.vehiculos set placa=$1, activo=$2 where id=$3 and version=$4 returning id',
      [placa, activo, id, version])
    if (!updated.rowCount) throw conflictError('Vehículo')
    await audit(client, admin.id, current.activo === activo ? 'VEHICULO_ACTUALIZADO' : activo ? 'VEHICULO_REACTIVADO' : 'VEHICULO_DESACTIVADO',
      'Vehiculos', id, null)
    return findVehicle(client, id)
  })
  return context.json(record)
})

app.delete('/api/vehicles/:id', async (context) => {
  const id = context.req.param('id')
  const version = integerValue(context.req.query('version'), 'version')
  await transaction(async (client) => {
    const admin = await requireAdmin(client, context.get('identity'))
    const result = await client.query<{ siteId: string }>(
      'select sede_id as "siteId" from public.vehiculos where id=$1 for update', [id])
    const current = result.rows[0]
    if (!current) throw new ApiError(404, 'El vehículo no existe')
    const history = await client.query(
      `select (
         exists(select 1 from public.certificados where vehiculo_id=$1)
         or exists(select 1 from public.servicios where sede_id=$2
           and coalesce(vehiculos_atendidos_ids_json, '[]'::jsonb) ? ($1::uuid)::text)
       ) as used`, [id, current.siteId])
    if (history.rows[0]?.used) throw dependencyError('Vehículo')
    const deleted = await client.query('delete from public.vehiculos where id=$1 and version=$2', [id, version])
    if (!deleted.rowCount) throw conflictError('Vehículo')
    await audit(client, admin.id, 'VEHICULO_ELIMINADO', 'Vehiculos', id, null)
  })
  return context.body(null, 204)
})

app.get('/api/sites/:siteId/vehicles/:vehicleId/certificates', async (context) => {
  const siteId = context.req.param('siteId')
  const vehicleId = context.req.param('vehicleId')
  const page = integerValue(context.req.query('page') ?? '1', 'page')
  if (page < 1 || page > 10000) throw new ApiError(422, 'Página no válida')
  const result = await transaction(async (client) => {
    await requireAdmin(client, context.get('identity'))
    const vehicle = await client.query(
      'select id from public.vehiculos where id=$1 and sede_id=$2', [vehicleId, siteId])
    if (!vehicle.rowCount) throw new ApiError(404, 'El vehículo no pertenece a esta Sede')
    const { rows } = await client.query(
      `select c.id, sv.id as "serviceId", sv.solicitud,
       c.fecha_expedicion::text as "issuedOn", c.fecha_vencimiento::text as "expiresOn",
       c.estado_generacion as "status",
       (c.pdf_storage_path is not null and c.estado_generacion in ('GENERADO','ENVIADO')
        and not exists(select 1 from private.storage_retention_deleted d
         where d.bucket='sr-generated-documents' and d.storage_path=c.pdf_storage_path)) as "pdfAvailable"
       from public.certificados c
       join public.servicios sv on sv.id=c.servicio_id
       where c.vehiculo_id=$1 and sv.sede_id=$2
       order by c.fecha_expedicion desc, c.id desc limit 21 offset $3`,
       [vehicleId, siteId, (page-1)*20])
    return { items: rows.slice(0,20), page, hasMore: rows.length > 20 }
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

app.route('/api/certificates', certificateRoutes)
app.route('/api/area-templates', areaTemplatesRoutes)

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
      plantillas_areas_global_nombre_uidx: 'Ya existe una plantilla global con ese nombre.',
      plantillas_areas_privada_nombre_uidx: 'El cliente ya tiene una plantilla con ese nombre.',
      vehiculos_sede_placa_uidx: 'Ya existe un vehículo con esa placa en la Sede.',
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
      residenciaDireccion: null,
      residenciaCelular: null,
      residenciaValorServicio: null,
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
    residenciaDireccion: requiredString(body, 'residenciaDireccion'),
    residenciaCelular: requiredPhone(body, 'residenciaCelular'),
    residenciaValorServicio: body.residenciaValorServicio == null || body.residenciaValorServicio === ''
      ? null : requiredInteger(body, 'residenciaValorServicio'),
    version,
  }
}

function siteInput(body: Record<string, unknown>, editing = false) {
  const manejaVehiculos = requiredBoolean(body, 'manejaVehiculos')
  const generaCertificadoVehiculo = manejaVehiculos && requiredBoolean(body, 'generaCertificadoVehiculo')
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
    planoStoragePath: optionalString(body.planoStoragePath),
    manejaVehiculos,
    generaCertificadoVehiculo,
    vigenciaCertificadoVehiculoMeses: generaCertificadoVehiculo
      ? requiredPositiveInteger(body, 'vigenciaCertificadoVehiculoMeses')
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
