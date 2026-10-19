import type { PoolClient } from 'pg'
import { ApiError, bootstrapProfile, type Identity } from '../auth'

export type ProfileRow = {
  id: string
  nombreCompleto: string
  correoGoogle: string
  telefono: string | null
  fotoStoragePath: string | null
  esAdmin: boolean
  esTecnico: boolean
  certificadoStoragePath: string | null
  certificadoFechaEmision: string | null
  certificadoFechaVencimiento: string | null
  version: number
}

const SELECT_PROFILE = [
  'select id, nombre_completo as "nombreCompleto", correo_google as "correoGoogle",',
  'telefono, foto_storage_path as "fotoStoragePath", es_admin as "esAdmin",',
  'es_tecnico as "esTecnico", certificado_storage_path as "certificadoStoragePath",',
  'certificado_fecha_emision as "certificadoFechaEmision",',
  'certificado_fecha_vencimiento as "certificadoFechaVencimiento", version',
  'from public.usuarios where id=$1 and auth_user_id=$2 and activo',
].join(' ')

export async function self(client: PoolClient, identity: Identity): Promise<ProfileRow> {
  const authorized = await bootstrapProfile(client, identity)
  const { rows } = await client.query<ProfileRow>(SELECT_PROFILE, [authorized.id, identity.authUserId])
  if (!rows[0]) throw new ApiError(403, 'La cuenta no está autorizada')
  return { ...rows[0], version: Number(rows[0].version) }
}

export async function auditProfile(client: PoolClient, userId: string, action: string, detail: Record<string, unknown>): Promise<void> {
  await client.query(
    'insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json) values ($1,$2,$3,$4,$5::jsonb)',
    [userId, action, 'Usuarios', userId, JSON.stringify(detail)],
  )
}

export function profileBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'Solicitud no válida')
  return value as Record<string, unknown>
}

export async function readProfileBody(request: Request): Promise<Record<string, unknown>> {
  try { return profileBody(await request.json()) }
  catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(422, 'Solicitud no válida')
  }
}

export function profileVersion(value: unknown): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new ApiError(422, 'La versión del perfil no es válida')
  return number
}

export function versionConflict(): ApiError {
  return new ApiError(409, 'El perfil cambió en otra sesión. Recarga para continuar.', 'VERSION_CONFLICT')
}

export function dateOnly(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(422, label + ' no es válida')
  const date = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(422, label + ' no es válida')
  return value
}
