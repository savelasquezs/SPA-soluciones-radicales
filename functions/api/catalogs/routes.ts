import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { isCatalogId, validateCatalogItem, validateCriterionInput, validateProductInput } from '../../../src/helpers/mipCatalogs'
import { ApiError, requireAdmin, type Identity } from '../auth'
import { transaction } from '../db'
import { auditCatalog, catalogKind, getCatalogRecord, listCatalog, removeCatalogRecord, saveCriterion, saveItem, saveProduct, setCatalogActive } from './repository'

export const mipCatalogRoutes = new Hono<{ Variables: { identity: Identity } }>()

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch { throw new ApiError(400, 'La información enviada no es válida') }
}
function id(value: string): string {
  if (!isCatalogId(value)) throw new ApiError(422, 'El identificador no es válido')
  return value
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ApiError(422, 'Falta la versión del registro; vuelve a abrirlo.', 'VALIDATION')
  return Number(value)
}

mipCatalogRoutes.get('/options', async context => {
  const result = await transaction(async client => {
    await requireAdmin(client, context.get('identity'))
    return { methods: await listCatalog(client, 'methods', null), pests: await listCatalog(client, 'pests', null) }
  })
  return context.json(result)
})

mipCatalogRoutes.get('/:kind', async context => {
  const kind = catalogKind(context.req.param('kind'))
  const active = context.req.query('active') ?? 'true'
  if (active !== 'true' && active !== 'false') throw new ApiError(422, 'El filtro de estado no es válido')
  const result = await transaction(async client => {
    await requireAdmin(client, context.get('identity'))
    return listCatalog(client, kind, active === 'true')
  })
  return context.json(result)
})

mipCatalogRoutes.get('/:kind/:id', async context => {
  const kind = catalogKind(context.req.param('kind')), recordId = id(context.req.param('id'))
  const result = await transaction(async client => {
    await requireAdmin(client, context.get('identity'))
    return getCatalogRecord(client, kind, recordId)
  })
  return context.json(result)
})

mipCatalogRoutes.post('/:kind', async context => {
  const kind = catalogKind(context.req.param('kind')), input = await body(context.req.raw)
  const result = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    const parsed = kind === 'products'
      ? validateProductInput(input)
      : kind === 'criteria'
        ? validateCriterionInput(input)
        : validateCatalogItem(kind, input)
    if (Object.keys(parsed.errors).length) throw new ApiError(422, 'Revisa los campos marcados.', 'VALIDATION', { fields: parsed.errors })
    const record = kind === 'products'
      ? await saveProduct(client, validateProductInput(input).value)
      : kind === 'criteria'
        ? await saveCriterion(client, validateCriterionInput(input).value)
        : await saveItem(client, kind, validateCatalogItem(kind, input).value)
    await auditCatalog(client, admin.id, kind, 'CREADO', record)
    return record
  })
  return context.json(result, 201)
})

mipCatalogRoutes.patch('/:kind/:id', async context => {
  const kind = catalogKind(context.req.param('kind')), recordId = id(context.req.param('id')), input = await body(context.req.raw)
  const expected = kind === 'criteria' ? undefined : version(input.version)
  const result = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    const parsed = kind === 'products'
      ? validateProductInput(input)
      : kind === 'criteria'
        ? validateCriterionInput(input)
        : validateCatalogItem(kind, input)
    if (Object.keys(parsed.errors).length) throw new ApiError(422, 'Revisa los campos marcados.', 'VALIDATION', { fields: parsed.errors })
    const record = kind === 'products'
      ? await saveProduct(client, validateProductInput(input).value, recordId, expected)
      : kind === 'criteria'
        ? await saveCriterion(client, validateCriterionInput(input).value, recordId)
        : await saveItem(client, kind, validateCatalogItem(kind, input).value, recordId, expected)
    await auditCatalog(client, admin.id, kind, 'ACTUALIZADO', record)
    return record
  })
  return context.json(result)
})

mipCatalogRoutes.patch('/:kind/:id/state', async context => {
  const kind = catalogKind(context.req.param('kind')), recordId = id(context.req.param('id')), input = await body(context.req.raw)
  const expected = kind === 'criteria' ? undefined : version(input.version)
  if (typeof input.activo !== 'boolean') throw new ApiError(422, 'El estado no es válido')
  const active = input.activo
  const result = await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    const record = await setCatalogActive(client, kind, recordId, expected, active)
    await auditCatalog(client, admin.id, kind, active ? 'REACTIVADO' : 'DESACTIVADO', record)
    return record
  })
  return context.json(result)
})

mipCatalogRoutes.delete('/:kind/:id', async context => {
  const kind = catalogKind(context.req.param('kind')), recordId = id(context.req.param('id')), input = await body(context.req.raw)
  const expected = kind === 'criteria' ? undefined : version(input.version)
  await transaction(async client => {
    const admin = await requireAdmin(client, context.get('identity'))
    const record = await removeCatalogRecord(client, kind, recordId, expected)
    await auditCatalog(client, admin.id, kind, 'ELIMINADO', record)
  })
  return context.body(null, 204)
})

// Database identifiers and constraint details must never escape into the UI.
mipCatalogRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error: error.message, code: error.code, details: error.details }, error.status as ContentfulStatusCode)
  const code = (error as Error & { code?: string }).code
  if (code === '23505') return context.json({ error: 'Ya existe un registro con ese nombre. Revisa también los inactivos.', code: 'DUPLICATE' }, 409)
  if (code === '23503') return context.json({ error: 'El registro está relacionado con productos o revisiones. Conserva sus datos y desactívalo si no se utilizará.', code: 'DEPENDENCIES' }, 409)
  if (code === '23514' || code === '23502' || code === '22P02') return context.json({ error: 'Revisa los datos y la clasificación del registro.', code: 'VALIDATION' }, 422)
  console.error('MIP_CATALOG_ERROR', { code: code ?? 'UNEXPECTED' })
  return context.json({ error: 'No fue posible completar la operación. Intenta nuevamente.' }, 500)
})
