import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { PoolClient } from 'pg'
import { isServiceId } from '../../../src/helpers/adminServices'
import { ApiError, requireTechnician, type DomainProfile, type Identity } from '../auth'
import { transaction } from '../db'
import { claimTechnicianService, saveTechnicianAreaOrder, saveTechnicianCriterionEvaluation, startTechnicianService, technicianCommand } from './commands'
import { getTechnicianPackage, listTechnicianServices } from './queries'

type Environment = { Variables: { identity: Identity } }
export const technicianServiceRoutes = new Hono<Environment>()
technicianServiceRoutes.use('*', bodyLimit({ maxSize: 50_000, onError: context => context.json({ error: 'La información enviada supera el tamaño permitido.', code: 'VALIDATION' }, 413) }))

function id(value: unknown): string {
  if (!isServiceId(value)) throw new ApiError(422, 'El identificador no es válido.', 'VALIDATION')
  return value
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new ApiError(422, 'Carga la versión actual del servicio.', 'VALIDATION')
  return value
}
async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'La información enviada no es válida.', 'VALIDATION')
  }
}
async function read<T>(context: Context<Environment>, work: (client: PoolClient, technician: DomainProfile) => Promise<T>): Promise<T> {
  return transaction(async client => work(client, await requireTechnician(client, context.get('identity'))))
}

technicianServiceRoutes.get('/', async context => context.json(await read(context, (client, technician) => listTechnicianServices(client, technician.id))))
technicianServiceRoutes.get('/:id/package', async context => context.json(await read(context, (client, technician) => getTechnicianPackage(client, technician.id, id(context.req.param('id'))))))
technicianServiceRoutes.post('/:id/start', async context => {
  const payload = await body(context.req.raw), serviceId = id(context.req.param('id')), requestId = id(payload.requestId), deviceId = id(payload.deviceId), expected = version(payload.version)
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'SERVICE_START', serviceId, expected,
    { deviceId, version: expected }, () => startTechnicianService(client, technician.id, serviceId, expected, deviceId))))
})
technicianServiceRoutes.post('/:id/claim', async context => {
  const payload = await body(context.req.raw), serviceId = id(context.req.param('id')), requestId = id(payload.requestId), deviceId = id(payload.deviceId)
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'SERVICE_CLAIM', serviceId, null,
    { deviceId }, () => claimTechnicianService(client, technician.id, serviceId, deviceId))))
})
technicianServiceRoutes.post('/:id/areas/order', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  if (!Array.isArray(payload.areaIds) || payload.areaIds.length > 500) throw new ApiError(422, 'El orden de Áreas no es válido.', 'VALIDATION')
  const areaIds = payload.areaIds.map(id)
  if (!Array.isArray(payload.versions) || payload.versions.length > 500) throw new ApiError(422, 'Actualiza el recorrido antes de guardarlo.', 'VALIDATION')
  const versions = payload.versions.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(422, 'Actualiza el recorrido antes de guardarlo.', 'VALIDATION')
    const record = item as Record<string, unknown>
    return { id: id(record.id), version: version(record.version) }
  })
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'AREA_ORDER', serviceId, null,
    { deviceId, areaIds, versions }, () => saveTechnicianAreaOrder(client, technician.id, serviceId, deviceId, lockToken, areaIds, versions))))
})
technicianServiceRoutes.post('/:id/criteria/:criterionId', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const criterionId = id(context.req.param('criterionId'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const expected = version(payload.version)
  if (typeof payload.evaluation !== 'string' || !['C', 'CP', 'NC', 'NA'].includes(payload.evaluation)) {
    throw new ApiError(422, 'Selecciona una evaluación válida.', 'VALIDATION')
  }
  if (typeof payload.observation !== 'string' || payload.observation.length > 2_000) {
    throw new ApiError(422, 'La observación no puede superar 2000 caracteres.', 'VALIDATION')
  }
  const evaluation = payload.evaluation as 'C' | 'CP' | 'NC' | 'NA'
  const input = { deviceId, criterionId, version: expected, evaluation, observation: payload.observation }
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'CRITERION_EVALUATION', serviceId, expected,
    input, () => saveTechnicianCriterionEvaluation(client, technician.id, serviceId, deviceId, lockToken, criterionId, expected, evaluation, payload.observation as string))))
})

technicianServiceRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error: error.message, code: error.code, details: error.details }, error.status as ContentfulStatusCode)
  const code = (error as Error & { code?: string }).code
  if (code === '40001' || code === '40P01') return context.json({ error: 'Hubo un cambio simultáneo. Vuelve a intentar.', code: 'CONCURRENT_WRITE' }, 409)
  if (['23503', '23505', '23514', '23502', '22P02', 'P0001'].includes(code ?? '')) return context.json({ error: 'No fue posible iniciar con los datos actuales. Actualiza el servicio.', code: 'VALIDATION' }, 422)
  console.error('TECHNICIAN_SERVICES_ERROR', { code: code ?? 'UNEXPECTED' })
  return context.json({ error: 'No fue posible completar la operación. Intenta nuevamente.', code: 'UNEXPECTED' }, 500)
})
