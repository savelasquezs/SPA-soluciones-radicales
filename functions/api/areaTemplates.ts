import { Hono } from 'hono'
import type { PoolClient } from 'pg'
import { ApiError, requireAdmin, type Identity } from './auth'
import { transaction } from './db'

type AreaItem = { nombre: string; esExterna: boolean }
type Scope = 'GLOBAL' | 'PRIVADA'
type TemplateInput = { nombre: string; alcance: Scope; clientId: string | null; areas: AreaItem[]; activo: boolean; version?: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TEMPLATE_SELECT = [
  'select p.id, p.nombre, p.alcance, p.negocio_id as "clientId",',
  'p.areas_json as areas, p.activo, p.version, n.nombre as "clientName"',
  'from public.plantillas_areas p',
  'left join public.negocios n on n.id = p.negocio_id',
].join(' ')

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value)
}

export function optionalAreaTemplateId(value: unknown): string | null {
  if (value == null || value === '') return null
  if (!validUuid(value)) throw new ApiError(422, 'Selecciona una plantilla de áreas válida.')
  return value
}

export function parseTemplateAreas(value: unknown): AreaItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ApiError(422, 'La plantilla debe incluir entre 1 y 100 áreas.')
  }
  const seen = new Set<string>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError(422, 'Revisa las áreas de la plantilla.')
    }
    const record = item as Record<string, unknown>
    const nombre = typeof record.nombre === 'string' ? record.nombre.trim() : ''
    if (!nombre || nombre.length > 120 || typeof record.esExterna !== 'boolean') {
      throw new ApiError(422, 'Cada área requiere un nombre válido y su tipo de ubicación.')
    }
    const key = nombre.normalize('NFC').toLocaleLowerCase('es-CO')
    if (seen.has(key)) throw new ApiError(422, 'La plantilla contiene áreas con el mismo nombre.')
    seen.add(key)
    return { nombre, esExterna: record.esExterna }
  })
}

export function parseAreaTemplateInput(body: Record<string, unknown>, editing = false): TemplateInput {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre || nombre.length > 120) throw new ApiError(422, 'Ingresa un nombre de plantilla válido.')
  if (body.alcance !== 'GLOBAL' && body.alcance !== 'PRIVADA') {
    throw new ApiError(422, 'Selecciona el alcance de la plantilla.')
  }
  const alcance = body.alcance
  const clientId = alcance === 'PRIVADA' ? body.clientId : null
  if (alcance === 'PRIVADA' && !validUuid(clientId)) {
    throw new ApiError(422, 'Selecciona el cliente de la plantilla privada.')
  }
  if (alcance === 'GLOBAL' && body.clientId != null && body.clientId !== '') {
    throw new ApiError(422, 'Una plantilla global no pertenece a un cliente.')
  }
  if (typeof body.activo !== 'boolean') throw new ApiError(422, 'Revisa el estado de la plantilla.')
  const version = body.version
  if (editing && (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0)) {
    throw new ApiError(422, 'La versión de la plantilla no es válida.')
  }
  return { nombre, alcance, clientId: clientId as string | null, areas: parseTemplateAreas(body.areas), activo: body.activo, ...(editing ? { version: version as number } : {}) }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch { /* Se muestra un mensaje funcional, nunca detalles del parser. */ }
  throw new ApiError(400, 'No fue posible leer los datos.')
}

async function requireBusiness(client: PoolClient, clientId: string | null): Promise<void> {
  if (!clientId) return
  const { rowCount } = await client.query(
    "select id from public.negocios where id = $1 and tipo_cliente = 'NEGOCIO'",
    [clientId],
  )
  if (!rowCount) throw new ApiError(422, 'El cliente seleccionado no está disponible.')
}

async function templateById(client: PoolClient, id: string): Promise<unknown> {
  const { rows } = await client.query(TEMPLATE_SELECT + ' where p.id = $1', [id])
  if (!rows[0]) throw new ApiError(404, 'La plantilla no está disponible.')
  return rows[0]
}

async function audit(client: PoolClient, userId: string, action: string, entity: string, id: string, detail: unknown): Promise<void> {
  await client.query(
    'insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json) values ($1, $2, $3, $4, $5::jsonb)',
    [userId, action, entity, id, JSON.stringify(detail)],
  )
}

/** Inserción transaccional, repetible: conserva áreas existentes, incluso inactivas. */
export async function applyAreaTemplate(client: PoolClient, siteId: string, templateId: string): Promise<{ created: number; skipped: number }> {
  if (!validUuid(siteId) || !validUuid(templateId)) throw new ApiError(422, 'Selecciona una sede y una plantilla válidas.')
  const site = await client.query<{ clientId: string }>(
    "select negocio_id as \"clientId\" from public.sedes where id = $1 and tipo_sede = 'NEGOCIO' for update",
    [siteId],
  )
  if (!site.rows[0]) throw new ApiError(422, 'La Sede no admite plantillas de áreas.')
  const template = await client.query<{ areas: unknown }>(
    "select areas_json as areas from public.plantillas_areas where id = $1 and activo and (alcance = 'GLOBAL' or (alcance = 'PRIVADA' and negocio_id = $2))",
    [templateId, site.rows[0].clientId],
  )
  if (!template.rows[0]) throw new ApiError(422, 'Esta plantilla no está disponible para la Sede.')
  const areas = parseTemplateAreas(template.rows[0].areas)
  const inserted = await client.query<{ id: string }>(
    'insert into public.areas (sede_id, nombre, es_externa, activo) ' +
    'select $1, item.nombre, item."esExterna", true ' +
    'from jsonb_to_recordset($2::jsonb) as item(nombre text, "esExterna" boolean) ' +
    'on conflict do nothing returning id',
    [siteId, JSON.stringify(areas)],
  )
  const created = inserted.rowCount ?? inserted.rows.length
  return { created, skipped: areas.length - created }
}

export const areaTemplatesRoutes = new Hono<{ Variables: { identity: Identity } }>()

areaTemplatesRoutes.get('/', async context => {
  const clientId = context.req.query('clientId') ?? null
  const active = context.req.query('active') ?? null
  if (clientId !== null && !validUuid(clientId)) throw new ApiError(422, 'Cliente no válido.')
  if (active !== null && active !== 'true' && active !== 'false') throw new ApiError(422, 'Filtro no válido.')
  const result = await transaction(async client => {
    await requireAdmin(client, context.get('identity'))
    const { rows } = await client.query(
      TEMPLATE_SELECT + ' where ($1::boolean is null or p.activo = $1)' +
      " and ($2::uuid is null or p.alcance = 'GLOBAL' or p.negocio_id = $2::uuid)" +
      ' order by p.activo desc, p.nombre, p.id',
      [active == null ? null : active === 'true', clientId],
    )
    return rows
  })
  return context.json(result)
})

areaTemplatesRoutes.post('/', async context => {
  const input = parseAreaTemplateInput(await jsonBody(context.req.raw))
  const result = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    await requireBusiness(client, input.clientId)
    const { rows } = await client.query<{ id: string }>(
      'insert into public.plantillas_areas (nombre, alcance, negocio_id, areas_json, activo) ' +
      'values ($1, $2, $3, $4::jsonb, $5) returning id',
      [input.nombre, input.alcance, input.clientId, JSON.stringify(input.areas), input.activo],
    )
    const id = rows[0]!.id
    await audit(client, admin.id, 'PLANTILLA_AREAS_CREADA', 'PlantillasAreas', id, { alcance: input.alcance, clientId: input.clientId, areas: input.areas.length })
    return templateById(client, id)
  })
  return context.json(result, 201)
})

areaTemplatesRoutes.patch('/:id', async context => {
  const id = context.req.param('id')
  if (!validUuid(id)) throw new ApiError(422, 'Plantilla no válida.')
  const input = parseAreaTemplateInput(await jsonBody(context.req.raw), true)
  const result = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    await requireBusiness(client, input.clientId)
    const updated = await client.query(
      'update public.plantillas_areas set nombre = $1, alcance = $2, negocio_id = $3, areas_json = $4::jsonb, activo = $5 ' +
      'where id = $6 and version = $7 returning id',
      [input.nombre, input.alcance, input.clientId, JSON.stringify(input.areas), input.activo, id, input.version],
    )
    if (!updated.rowCount) throw new ApiError(409, 'La plantilla cambió en otra sesión. Actualiza los datos.', 'VERSION_CONFLICT')
    await audit(client, admin.id, 'PLANTILLA_AREAS_ACTUALIZADA', 'PlantillasAreas', id, { alcance: input.alcance, clientId: input.clientId, activo: input.activo })
    return templateById(client, id)
  })
  return context.json(result)
})

areaTemplatesRoutes.post('/sites/:siteId/apply', async context => {
  const siteId = context.req.param('siteId')
  const body = await jsonBody(context.req.raw)
  const templateId = optionalAreaTemplateId(body.templateId)
  if (!templateId) throw new ApiError(422, 'Selecciona una plantilla.')
  const result = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    const counts = await applyAreaTemplate(client, siteId, templateId)
    await audit(client, admin.id, 'PLANTILLA_AREAS_APLICADA', 'Sedes', siteId, { templateId, ...counts })
    return counts
  })
  return context.json(result)
})
