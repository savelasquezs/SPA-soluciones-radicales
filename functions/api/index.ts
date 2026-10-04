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

app.use(
  '/api/*',
  cors({
    origin: (origin) => (allowedOrigins.has(origin) ? origin : ''),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
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
    const { rows } = await client.query(
      `select id,
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
       from public.usuarios
       order by activo desc, nombre_completo`,
    )
    return rows
  })

  return context.json(users)
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
  const identity = context.get('identity')
  const clients = await transaction(async (client) => {
    await requireAdmin(client, identity)
    const { rows } = await client.query(
      `select n.id as "negocioId",
              n.nit,
              n.nombre as "negocioNombre",
              s.id as "sedeId",
              s.nombre as "sedeNombre",
              s.direccion,
              s.valor_servicio as "valorServicio",
              s.duracion_servicio_minutos as "duracionServicioMinutos"
       from public.negocios n
       join public.sedes s on s.negocio_id = n.id
       order by n.nombre, s.nombre`,
    )
    return rows
  })
  return context.json(clients)
})

app.post('/api/clients', async (context) => {
  const body = await jsonBody(context.req.raw)
  const identity = context.get('identity')
  const clientRecord = await transaction(async (client) => {
    const admin = await requireAdmin(client, identity)
    const selectedBusinessId = optionalString(body.negocioId)
    let businessId = selectedBusinessId

    if (businessId) {
      const existingBusiness = await client.query<{ id: string }>(
        'select id from public.negocios where id = $1',
        [businessId],
      )
      if (!existingBusiness.rows[0]) {
        throw new ApiError(422, 'El Negocio seleccionado no existe')
      }
    } else {
      const business = await client.query<{ id: string }>(
        `insert into public.negocios (nit, nombre, correos_json)
         values ($1, $2, $3::jsonb)
         returning id`,
        [
          requiredString(body, 'nit'),
          requiredString(body, 'negocioNombre'),
          JSON.stringify(stringArray(body.correos)),
        ],
      )
      businessId = business.rows[0]?.id ?? null
    }

    if (!businessId) {
      throw new ApiError(500, 'No fue posible crear el Negocio')
    }

    const site = await client.query<{ id: string }>(
      `insert into public.sedes (
         negocio_id, nombre, direccion, correos_json, hereda_correos_negocio,
         contacto_principal_nombre, contacto_principal_correo, valor_servicio,
         periodicidad_meses, maneja_refuerzo, tipo_sede, duracion_servicio_minutos
       ) values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id`,
      [
        businessId,
        requiredString(body, 'sedeNombre'),
        requiredString(body, 'direccion'),
        JSON.stringify(stringArray(body.correos)),
        true,
        requiredString(body, 'contactoNombre'),
        optionalEmail(body.contactoCorreo),
        requiredInteger(body, 'valorServicio'),
        requiredInteger(body, 'periodicidadMeses'),
        requiredBoolean(body, 'manejaRefuerzo'),
        enumValue(body.tipoSede, ['NEGOCIO', 'RESIDENCIAL'], 'tipoSede'),
        requiredInteger(body, 'duracionServicioMinutos'),
      ],
    )
    const siteId = site.rows[0]?.id

    if (!siteId) {
      throw new ApiError(500, 'No fue posible crear la Sede')
    }

    await audit(client, admin.id, selectedBusinessId ? 'SEDE_CREADA' : 'NEGOCIO_Y_SEDE_CREADOS', 'Negocios', businessId, {
      sedeId: siteId,
    })
    const created = await client.query<{
      negocioId: string
      nit: string
      negocioNombre: string
      sedeId: string
      sedeNombre: string
      direccion: string
      valorServicio: string
      duracionServicioMinutos: number
    }>(
      `select n.id as "negocioId",
              n.nit,
              n.nombre as "negocioNombre",
              s.id as "sedeId",
              s.nombre as "sedeNombre",
              s.direccion,
              s.valor_servicio as "valorServicio",
              s.duracion_servicio_minutos as "duracionServicioMinutos"
       from public.negocios n
       join public.sedes s on s.negocio_id = n.id
       where s.id = $1`,
      [siteId],
    )
    const clientSite = created.rows[0]
    if (!clientSite) {
      throw new ApiError(500, 'No fue posible recuperar la Sede creada')
    }
    return clientSite
  })

  return context.json(clientRecord, 201)
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
      `select duracion_servicio_minutos as duracion,
              valor_servicio as valor
       from public.sedes
       where id = $1`,
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
     values ($1, 'EMAIL', $1::text, $2::jsonb, 'RUNNING', 1)`,
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
    return context.json({ error: error.message }, error.status as ContentfulStatusCode)
  }

  const databaseError = error as DatabaseError

  if (databaseError.code === '23505') {
    return context.json({ error: 'Ya existe un registro con esos datos' }, 409)
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
  const value = body[key]
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

  return {
    nombreCompleto: requiredString(body, 'nombreCompleto'),
    correoGoogle: requiredEmail(body, 'correoGoogle'),
    esAdmin,
    esTecnico,
    activo: requiredBoolean(body, 'activo'),
    certificadoStoragePath: optionalString(body.certificadoStoragePath),
    certificadoFechaEmision: optionalString(body.certificadoFechaEmision),
    certificadoFechaVencimiento: optionalString(body.certificadoFechaVencimiento),
    certificadoObservaciones: optionalString(body.certificadoObservaciones),
  }
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
