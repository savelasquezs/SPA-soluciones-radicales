import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import { criterionPhotoOwner } from '../../../src/helpers/serviceEvidence'

export async function findingCriterion(client: PoolClient, serviceId: string, areaId: string,
  criterionId?: string | null, paths: string[] = []) {
  const shared = paths.filter(path => criterionPhotoOwner(path))
  if (!criterionId) {
    if (shared.length) throw new ApiError(422, 'Selecciona el criterio de estas fotografías.', 'VALIDATION')
    return null
  }
  const criterion = (await client.query<{ id: string; criterioId: string; nombre: string; paths: string[] }>(`
    select id,criterio_id as "criterioId",criterio_nombre_snapshot as nombre,evidencias_storage_paths as paths
    from public.evaluaciones_mip_area where id=$1 and servicio_id=$2 and servicio_area_id=$3 for update`,
  [criterionId, serviceId, areaId])).rows[0]
  if (!criterion || shared.some(path => {
    const owner = criterionPhotoOwner(path)!
    return owner.serviceId !== serviceId || owner.criterionId !== criterion.id || !criterion.paths.includes(path)
  })) throw new ApiError(422, 'Las fotografías deben pertenecer al criterio de esta Área y visita.', 'VALIDATION')
  return criterion
}

export async function unreferencedFindingPhotos(client: PoolClient, paths: string[]): Promise<string[]> {
  if (!paths.length) return []
  const { rows } = await client.query<{ path: string }>(`select path from unnest($1::text[]) as photos(path)
    where not exists(select 1 from public.hallazgos h
      where coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb) ? path
        or coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb) ? path)
      and not exists(select 1 from public.hallazgo_seguimientos s where s.evidencias_storage_paths ? path)`, [paths])
  return rows.map(row => row.path)
}
