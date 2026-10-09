import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import { createMasterReadUrl } from '../r2'
import { isServiceId } from '../../../src/helpers/adminServices'

/** Private R2 paths never appear in public reports or technician packages. */
function signedSheet(path: string | null | undefined): string {
  if (!path || !path.startsWith('products/technical-sheets/') || path.includes('..')) {
    throw new ApiError(404,'Este producto no tiene ficha técnica disponible.','PRODUCT_SHEET_NOT_FOUND')
  }
  return createMasterReadUrl(path)
}
export function productSheetIndex(value: unknown): number {
  const index = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(index) || index < 0 || index >= 100) throw new ApiError(422,'Producto no válido.','VALIDATION')
  return index
}
/** Order matches loadServiceResultsData.productos, including repeated products. */
export async function reportProductSheetUrl(client: PoolClient, serviceId: string, index: number): Promise<string> {
  const { rows } = await client.query<{ path: string | null }>(
    "select p.ficha_tecnica_storage_path as path " +
    "from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id " +
    "where pa.servicio_id=$1 and pa.aplicado " +
    "order by coalesce(pa.producto_nombre_snapshot,p.nombre),pa.id " +
    "limit 1 offset $2", [serviceId,productSheetIndex(index)])
  return signedSheet(rows[0]?.path)
}
/** A technician sees planned products even before they are marked applied. */
export async function technicianProductSheetUrl(client: PoolClient, serviceId: string, appliedProductId: string): Promise<string> {
  if (!isServiceId(appliedProductId)) throw new ApiError(422,'Producto no válido.','VALIDATION')
  const { rows } = await client.query<{ path: string | null }>(
    "select p.ficha_tecnica_storage_path as path " +
    "from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id " +
    "where pa.servicio_id=$1 and pa.id=$2", [serviceId,appliedProductId])
  return signedSheet(rows[0]?.path)
}
