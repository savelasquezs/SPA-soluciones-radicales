import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'

import { canonicalCoverage, productToInput, validateProductInput } from '../../../src/helpers/mipCatalogs'
import type { MipCatalogItem, MipCatalogKind, MipItemInput, MipItemKind, MipProduct, MipProductInput, MipRecord } from '../../../src/types/mipCatalogs'
import { ApiError } from '../auth'

const ITEM_FIELDS = `id, clave, nombre, clasificacion_mip as clasificacion, activo, version::integer`
const TRAP_FIELDS = `id, clave, nombre, clasificacion, activo, version::integer`
const CATEGORY: Record<Exclude<MipItemKind, 'traps'>, string> = { methods: 'METODO_APLICACION', pests: 'PLAGA' }
const PRODUCT_SELECT = `select p.id, p.nombre, p.principio_activo_composicion as "principioActivo",
  p.dosis_aplicacion as "dosisAplicacion", p.registro_sanitario as "registroSanitario",
  p.grado_toxicologico as "gradoToxicologico", p.fabricante, p.antidoto,
  p.ficha_tecnica_storage_path as "fichaTecnicaStoragePath", p.activo, p.version::integer,
  coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'clave', c.clave, 'nombre', c.nombre,
    'clasificacion', c.clasificacion_mip, 'activo', c.activo, 'version', c.version) order by c.orden nulls last, c.nombre)
    from public.producto_metodos pm join public.configuracion c on c.id = pm.metodo_id
    where pm.producto_id = p.id), '[]'::jsonb) as metodos,
  coalesce((select jsonb_agg(pc.clasificacion order by pc.clasificacion)
    from public.producto_categorias_plaga pc where pc.producto_id = p.id), '[]'::jsonb) as categorias,
  coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'clave', c.clave, 'nombre', c.nombre,
    'clasificacion', c.clasificacion_mip, 'activo', c.activo, 'version', c.version) order by c.orden nulls last, c.nombre)
    from public.producto_plagas pp join public.configuracion c on c.id = pp.plaga_id
    where pp.producto_id = p.id), '[]'::jsonb) as plagas
  from public.productos p`

export function catalogKind(value: string): MipCatalogKind {
  if (value === 'products' || value === 'traps' || value === 'pests' || value === 'methods') return value
  throw new ApiError(404, 'El catálogo no existe')
}

export async function listCatalog(client: PoolClient, kind: MipCatalogKind, active: boolean | null): Promise<MipRecord[]> {
  let rows: MipRecord[]
  if (kind === 'products') {
    rows = (await client.query<MipProduct>(`${PRODUCT_SELECT} where ($1::boolean is null or p.activo = $1) order by lower(p.nombre), p.id limit 1001`, [active])).rows
  } else if (kind === 'traps') {
    rows = (await client.query<MipCatalogItem>(`select ${TRAP_FIELDS} from public.trampas where ($1::boolean is null or activo = $1) order by lower(nombre), id limit 1001`, [active])).rows
  } else {
    rows = (await client.query<MipCatalogItem>(`select ${ITEM_FIELDS} from public.configuracion where categoria = $1 and ($2::boolean is null or activo = $2) order by orden nulls last, lower(nombre), id limit 1001`, [CATEGORY[kind], active])).rows
  }
  if (rows.length > 1000) throw new ApiError(422, 'El catálogo supera el límite de esta vista. Contacta a administración.', 'CATALOG_LIMIT')
  return rows
}

export async function getCatalogRecord(client: PoolClient, kind: MipCatalogKind, id: string): Promise<MipRecord> {
  const rows = kind === 'products'
    ? (await client.query<MipProduct>(`${PRODUCT_SELECT} where p.id = $1`, [id])).rows
    : kind === 'traps'
      ? (await client.query<MipCatalogItem>(`select ${TRAP_FIELDS} from public.trampas where id = $1`, [id])).rows
      : (await client.query<MipCatalogItem>(`select ${ITEM_FIELDS} from public.configuracion where id = $1 and categoria = $2`, [id, CATEGORY[kind]])).rows
  const record = rows[0]
  if (!record) throw new ApiError(404, 'El registro ya no existe')
  return record
}

export async function lockRecord(client: PoolClient, kind: MipCatalogKind, id: string, expectedVersion: number): Promise<MipRecord> {
  // Only names from this closed mapping can enter SQL identifiers.
  const table = kind === 'products' ? 'productos' : kind === 'traps' ? 'trampas' : 'configuracion'
  const category = kind === 'pests' || kind === 'methods' ? CATEGORY[kind] : null
  const values: unknown[] = category ? [id, category] : [id]
  const row = (await client.query<{ version: number }>(`select version::integer from public.${table} where id = $1 ${category ? 'and categoria = $2' : ''} for update`, values)).rows[0]
  if (!row) throw new ApiError(404, 'El registro ya no existe')
  if (row.version !== expectedVersion) throw new ApiError(409, 'El registro cambió en otra sesión. Tus cambios se conservan; actualiza el registro antes de volver a guardar.', 'VERSION_CONFLICT')
  return getCatalogRecord(client, kind, id)
}

async function validateReferences(client: PoolClient, input: MipProductInput, previous?: MipProduct): Promise<MipProductInput> {
  const ids = [...new Set([...input.metodoIds, ...input.plagaIds])].sort()
  const rows = (await client.query<MipCatalogItem & { categoria: string }>(`select ${ITEM_FIELDS}, categoria from public.configuracion where id = any($1::uuid[]) order by id for share`, [ids])).rows
  const byId = new Map(rows.map(row => [row.id, row]))
  for (const [selected, category, prior] of [
    [input.metodoIds, 'METODO_APLICACION', previous?.metodos ?? []],
    [input.plagaIds, 'PLAGA', previous?.plagas ?? []],
  ] as const) {
    for (const id of selected) {
      const item = byId.get(id)
      if (!item || item.categoria !== category || (!item.activo && !prior.some(row => row.id === id)) || (category === 'PLAGA' && !item.clasificacion)) {
        throw new ApiError(422, 'Una opción seleccionada no está disponible. Revisa los métodos y las plagas.', 'VALIDATION', { fields: { [category === 'PLAGA' ? 'plagaIds' : 'metodoIds']: 'Selecciona una opción vigente del catálogo.' } })
      }
    }
  }
  return { ...input, ...canonicalCoverage(input.categorias, input.plagaIds, rows) }
}

export async function saveProduct(client: PoolClient, input: MipProductInput, id?: string, expectedVersion?: number): Promise<MipProduct> {
  const previous = id ? await lockRecord(client, 'products', id, expectedVersion!) as MipProduct : undefined
  const value = await validateReferences(client, input, previous)
  const productId = id ?? randomUUID()
  const values = [productId, value.nombre, value.principioActivo, value.dosisAplicacion, value.registroSanitario, value.gradoToxicologico, value.fabricante, value.antidoto, value.fichaTecnicaStoragePath]
  if (id) {
    await client.query(`update public.productos set nombre = $2, principio_activo_composicion = $3,
      dosis_aplicacion = $4, registro_sanitario = $5, grado_toxicologico = $6,
      fabricante = $7, antidoto = $8, ficha_tecnica_storage_path = $9 where id = $1`, values)
  } else {
    await client.query(`insert into public.productos
      (id, nombre, principio_activo_composicion, dosis_aplicacion, registro_sanitario, grado_toxicologico, fabricante, antidoto, ficha_tecnica_storage_path)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, values)
  }
  await client.query('delete from public.producto_metodos where producto_id = $1', [productId])
  await client.query('delete from public.producto_plagas where producto_id = $1', [productId])
  await client.query('delete from public.producto_categorias_plaga where producto_id = $1', [productId])
  await client.query('insert into public.producto_metodos (producto_id, metodo_id) select $1, unnest($2::uuid[])', [productId, value.metodoIds])
  await client.query('insert into public.producto_plagas (producto_id, plaga_id) select $1, unnest($2::uuid[])', [productId, value.plagaIds])
  await client.query('insert into public.producto_categorias_plaga (producto_id, clasificacion) select $1, unnest($2::text[])', [productId, value.categorias])
  return getCatalogRecord(client, 'products', productId) as Promise<MipProduct>
}

export async function saveItem(client: PoolClient, kind: MipItemKind, input: MipItemInput, id?: string, expectedVersion?: number): Promise<MipCatalogItem> {
  const previous = id ? await lockRecord(client, kind, id, expectedVersion!) as MipCatalogItem : undefined
  const itemId = id ?? randomUUID()
  if (kind === 'traps') {
    if (previous && previous.clasificacion !== input.clasificacion) await assertUnused(client, kind, previous)
    if (id) await client.query('update public.trampas set nombre = $2, clasificacion = $3 where id = $1', [id, input.nombre, input.clasificacion])
    else await client.query('insert into public.trampas (id, clave, nombre, clasificacion) values ($1,$2,$3,$4)', [itemId, `TRAMPA_${itemId.replace(/-/g, '')}`, input.nombre, input.clasificacion])
  } else {
    // Stable generated identity; neither the user nor a rename can alter historical keys.
    if (id) await client.query('update public.configuracion set nombre = $2, clasificacion_mip = $3 where id = $1', [id, input.nombre, input.clasificacion])
    else await client.query('insert into public.configuracion (id, categoria, clave, nombre, clasificacion_mip) values ($1,$2,$3,$4,$5)', [itemId, CATEGORY[kind], `MIP_${itemId.replace(/-/g, '')}`, input.nombre, input.clasificacion])
  }
  return getCatalogRecord(client, kind, itemId) as Promise<MipCatalogItem>
}

export async function setCatalogActive(client: PoolClient, kind: MipCatalogKind, id: string, version: number, active: boolean): Promise<MipRecord> {
  const current = await lockRecord(client, kind, id, version)
  if (active && kind === 'products') {
    const { errors } = validateProductInput(productToInput(current as MipProduct))
    if (Object.keys(errors).length) throw new ApiError(422, 'Completa los datos del producto antes de activarlo.', 'VALIDATION', { fields: errors })
  }
  if ((kind === 'pests' || kind === 'traps') && !(current as MipCatalogItem).clasificacion) throw new ApiError(422, 'Edita el registro y completa su clasificación antes de cambiar el estado.', 'VALIDATION')
  const table = kind === 'products' ? 'productos' : kind === 'traps' ? 'trampas' : 'configuracion'
  await client.query(`update public.${table} set activo = $2 where id = $1`, [id, active])
  return getCatalogRecord(client, kind, id)
}

export async function assertUnused(client: PoolClient, kind: MipCatalogKind, record: MipRecord): Promise<void> {
  let used = false
  if (kind === 'products') {
    used = (await client.query<{ used: boolean }>('select exists (select 1 from public.productos_aplicados where producto_id = $1) as used', [record.id])).rows[0]!.used
  } else if (kind === 'traps') {
    // Compatibility check only: do not migrate physical posts/types in this catalog task.
    used = (await client.query<{ used: boolean }>(`select exists (select 1 from public.dispositivos where tipo_dispositivo_codigo = $1 union all select 1 from public.revisiones_dispositivos where tipo_dispositivo_codigo = $1) as used`, [(record as MipCatalogItem).clave])).rows[0]!.used
  } else if (kind === 'methods') {
    used = (await client.query<{ used: boolean }>(`select exists (select 1 from public.producto_metodos where metodo_id = $1 union all select 1 from public.productos_aplicados where metodo_aplicacion_codigo = $2) as used`, [record.id, (record as MipCatalogItem).clave])).rows[0]!.used
  } else {
    used = (await client.query<{ used: boolean }>(`select exists (select 1 from public.producto_plagas where plaga_id = $1 union all select 1 from public.revisiones_dispositivos where capturas_json @> jsonb_build_array(jsonb_build_object('plagaCodigo', $2::text))) as used`, [record.id, (record as MipCatalogItem).clave])).rows[0]!.used
  }
  if (used) throw new ApiError(409, 'El registro tiene referencias o historial. Puedes desactivarlo; no se eliminarán sus datos.', 'DEPENDENCIES')
}

export async function removeCatalogRecord(client: PoolClient, kind: MipCatalogKind, id: string, version: number): Promise<MipRecord> {
  const current = await lockRecord(client, kind, id, version)
  await assertUnused(client, kind, current)
  const table = kind === 'products' ? 'productos' : kind === 'traps' ? 'trampas' : 'configuracion'
  await client.query(`delete from public.${table} where id = $1`, [id])
  return current
}

export async function auditCatalog(client: PoolClient, actorId: string, kind: MipCatalogKind, action: string, record: MipRecord): Promise<void> {
  await client.query(`insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
    values ($1, $2, $3, $4, $5::jsonb)`, [actorId, `CATALOGO_${action}`, kind, record.id, JSON.stringify(record)])
}
