import { Hono } from 'hono'

import { ApiError, type Identity } from '../auth'
import { transaction } from '../db'
import {
  assertOwnedProfileStoragePath, createMasterReadUrl, createProfileReadUrl,
  createProfileUploadUrl, deleteMasterObject, profileObjectExists,
  type ProfileFileKind,
} from '../r2'
import {
  auditProfile, dateOnly, profileVersion, readProfileBody, self, versionConflict,
} from './identity'

type Env = { Variables: { identity: Identity } }
const profileRoutes = new Hono<Env>()

function requiredName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ApiError(422, 'El nombre debe tener entre 1 y 120 caracteres')
  }
  return value.trim()
}

function optionalPhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new ApiError(422, 'Celular no válido')
  const text = value.replace(/[\s().-]/g, '')
  const international = text.startsWith('00') ? '+' + text.slice(2) : text
  const normalized = /^3[0-9]{9}$/.test(international) ? '+57' + international : international
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) throw new ApiError(422, 'Ingresa un celular válido con indicativo')
  return normalized
}

profileRoutes.get('/', async context => {
  return context.json(await transaction(client => self(client, context.get('identity'))))
})

profileRoutes.patch('/', async context => {
  const body = await readProfileBody(context.req.raw)
  const name = requiredName(body.nombreCompleto)
  const phone = optionalPhone(body.telefono)
  const version = profileVersion(body.version)
  const identity = context.get('identity')
  const record = await transaction(async client => {
    const current = await self(client, identity)
    const update = await client.query(
      'update public.usuarios set nombre_completo=$1, telefono=$2 where id=$3 and version=$4 returning id',
      [name, phone, current.id, version],
    )
    if (!update.rowCount) throw versionConflict()
    await auditProfile(client, current.id, 'PERFIL_DATOS_ACTUALIZADOS', { campos: ['nombre_completo', 'telefono'] })
    return self(client, identity)
  })
  return context.json(record)
})

profileRoutes.get('/avatar-url', async context => {
  const record = await transaction(client => self(client, context.get('identity')))
  return context.json({
    url: record.fotoStoragePath ? createProfileReadUrl('AVATAR', record.id, record.fotoStoragePath) : null,
  })
})

profileRoutes.post('/files/upload-url', async context => {
  const body = await readProfileBody(context.req.raw)
  const kind = body.kind
  if (kind !== 'AVATAR' && kind !== 'CERTIFICATE') throw new ApiError(422, 'Tipo de archivo no permitido')
  if (typeof body.fileName !== 'string' || typeof body.contentType !== 'string' || !Number.isSafeInteger(body.size)) {
    throw new ApiError(422, 'Archivo no válido')
  }
  const record = await transaction(client => self(client, context.get('identity')))
  if (kind === 'CERTIFICATE' && !record.esTecnico) throw new ApiError(403, 'La credencial es exclusiva de técnicos')
  return context.json(createProfileUploadUrl(kind, record.id, {
    fileName: body.fileName, contentType: body.contentType, size: Number(body.size),
  }))
})

profileRoutes.post('/files/discard', async context => {
  const body = await readProfileBody(context.req.raw)
  if (body.kind !== 'AVATAR' && body.kind !== 'CERTIFICATE') throw new ApiError(422, 'Tipo de archivo no permitido')
  if (typeof body.storagePath !== 'string') throw new ApiError(422, 'Archivo no válido')
  const kind: ProfileFileKind = body.kind
  const identity = context.get('identity')
  await transaction(async client => {
    const record = await self(client, identity)
    assertOwnedProfileStoragePath(kind, record.id, body.storagePath as string)
    // Serialized with mutations, to prevent deleting a referenced upload.
    const { rows } = await client.query<{ photo: string | null; certificate: string | null }>(
      'select foto_storage_path as photo, certificado_storage_path as certificate from public.usuarios where id=$1 for update',
      [record.id],
    )
    if ((kind === 'AVATAR' ? rows[0]?.photo : rows[0]?.certificate) === body.storagePath) {
      throw new ApiError(409, 'No es posible eliminar un archivo en uso')
    }
    if (kind === 'CERTIFICATE') {
      const archived = await client.query(
        "select 1 from public.auditoria where registro_id=$2 and accion='PERFIL_CERTIFICADO_ACTUALIZADO' and (detalle_json->>'currentPath'=$1 or detalle_json->>'previousPath'=$1) limit 1",
        [body.storagePath, record.id],
      )
      if (archived.rowCount) throw new ApiError(409, 'El certificado forma parte del historial y se conserva')
    }
    await deleteMasterObject(body.storagePath as string)
  })
  return context.body(null, 204)
})

profileRoutes.patch('/avatar', async context => {
  const body = await readProfileBody(context.req.raw)
  const version = profileVersion(body.version)
  const path = body.storagePath
  if (path !== null && typeof path !== 'string') throw new ApiError(422, 'Fotografía no válida')
  const identity = context.get('identity')
  const saved = await transaction(async client => {
    const current = await self(client, identity)
    await client.query('select id from public.usuarios where id=$1 for update', [current.id])
    if (path) {
      assertOwnedProfileStoragePath('AVATAR', current.id, path)
      if (path !== current.fotoStoragePath && !await profileObjectExists(path)) throw new ApiError(422, 'Primero sube la fotografía')
    }
    const update = await client.query(
      'update public.usuarios set foto_storage_path=$1 where id=$2 and version=$3 returning id',
      [path, current.id, version],
    )
    if (!update.rowCount) throw versionConflict()
    await auditProfile(client, current.id, 'PERFIL_FOTO_ACTUALIZADA', { personalizada: Boolean(path) })
    return { previous: current.fotoStoragePath, record: await self(client, identity) }
  })
  if (saved.previous && saved.previous !== path) {
    try { await deleteMasterObject(saved.previous) }
    catch { console.warn('No fue posible limpiar la fotografía anterior') }
  }
  return context.json(saved.record)
})

profileRoutes.get('/certificate/read-url', async context => {
  const record = await transaction(client => self(client, context.get('identity')))
  if (!record.esTecnico || !record.certificadoStoragePath) throw new ApiError(404, 'No existe certificado')
  return context.json({ url: createMasterReadUrl(record.certificadoStoragePath) })
})

profileRoutes.patch('/certificate', async context => {
  const body = await readProfileBody(context.req.raw)
  const version = profileVersion(body.version)
  const path = body.certificadoStoragePath
  if (typeof path !== 'string' || !path.trim()) throw new ApiError(422, 'Adjunta el certificado técnico')
  const issue = dateOnly(body.certificadoFechaEmision, 'La fecha de emisión')
  const expiry = dateOnly(body.certificadoFechaVencimiento, 'La fecha de vencimiento')
  if (expiry < issue) throw new ApiError(422, 'El vencimiento no puede ser anterior a la emisión')
  const identity = context.get('identity')
  const record = await transaction(async client => {
    const current = await self(client, identity)
    if (!current.esTecnico) throw new ApiError(403, 'Se requiere rol Técnico')
    await client.query('select id from public.usuarios where id=$1 for update', [current.id])
    if (path !== current.certificadoStoragePath) {
      assertOwnedProfileStoragePath('CERTIFICATE', current.id, path)
      if (!await profileObjectExists(path)) throw new ApiError(422, 'Primero sube el certificado')
    }
    const updated = await client.query(
      'update public.usuarios set certificado_storage_path=$1, certificado_fecha_emision=$2, certificado_fecha_vencimiento=$3 where id=$4 and version=$5 returning id',
      [path, issue, expiry, current.id, version],
    )
    if (!updated.rowCount) throw versionConflict()
    await auditProfile(client, current.id, 'PERFIL_CERTIFICADO_ACTUALIZADO', {
      previousPath: current.certificadoStoragePath, currentPath: path, fechaEmision: issue, fechaVencimiento: expiry,
    })
    return self(client, identity)
  })
  return context.json(record)
})

export { profileRoutes }
