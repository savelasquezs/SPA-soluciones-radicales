import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { PoolClient } from 'pg'
import { isServiceId } from '../../../src/helpers/adminServices'
import { ApiError, requireTechnician, type DomainProfile, type Identity } from '../auth'
import { transaction } from '../db'
import { assertAreaNoAccessStoragePath, assertCriterionEvidenceStoragePath, assertDeviceReviewStoragePath, assertFindingEvidenceStoragePath, assertServiceSignatureStoragePath, createAreaNoAccessUploadUrl, createCriterionEvidenceUploadUrl, createDeviceReviewUploadUrl, createFindingEvidenceUploadUrl, createServiceSignatureUploadUrl, criterionEvidenceObjectExists, deleteAreaNoAccessObject, deleteCriterionEvidenceObject, deleteDeviceReviewObject, deleteFindingEvidenceObject, deviceReviewMediaObjectExists, findingEvidenceObjectExists, serviceMediaObjectExists, serviceSignatureObjectExists, type FindingEvidencePhase, type ServiceSignatureRole } from '../r2'
import { authorizeTechnicianAreaChange, authorizeTechnicianDeviceChange, authorizeTechnicianFindingChange, authorizeTechnicianServiceChange, claimTechnicianService, createTechnicianDevice, createTechnicianFinding, finalizeTechnicianService, saveTechnicianAreaAccess, saveTechnicianAreaOrder, saveTechnicianCriterionEvaluation, saveTechnicianDeviceReview, saveTechnicianFindingStatus, startTechnicianService, technicianCommand } from './commands'
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
function reviewVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ApiError(422, 'Carga la versión actual de la revisión.', 'VALIDATION')
  return value
}
function requiredString(value: unknown, message: string, max = 2_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(422, message, 'VALIDATION')
  return value.trim()
}
function optionalString(value: unknown, max = 2_000): string {
  if (typeof value !== 'string' || value.length > max) throw new ApiError(422, 'La información enviada no es válida.', 'VALIDATION')
  return value
}
function findingEvidencePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10) throw new ApiError(422, 'Las evidencias del Hallazgo no son válidas.', 'VALIDATION')
  const paths = value.map(item => requiredString(item, 'La ruta de evidencia no es válida.', 1_000))
  if (new Set(paths).size !== paths.length) throw new ApiError(422, 'Las evidencias del Hallazgo no son válidas.', 'VALIDATION')
  return paths
}
function criterionEvidencePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5) throw new ApiError(422, 'Las evidencias del criterio no son válidas.', 'VALIDATION')
  const paths = value.map(item => requiredString(item, 'La ruta de evidencia no es válida.', 1_000))
  if (new Set(paths).size !== paths.length) throw new ApiError(422, 'Las evidencias del criterio no son válidas.', 'VALIDATION')
  return paths
}
function findingPhase(value: unknown): FindingEvidencePhase {
  if (value !== 'OPENING' && value !== 'CLOSURE') throw new ApiError(422, 'La etapa de la evidencia no es válida.', 'VALIDATION')
  return value
}
function signatureRole(value: unknown): ServiceSignatureRole {
  if (value !== 'TECHNICIAN' && value !== 'CLIENT') throw new ApiError(422, 'El tipo de firma no es válido.', 'VALIDATION')
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
technicianServiceRoutes.post('/:id/signatures/upload-url', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const role = signatureRole(payload.role)
  const fileName = requiredString(payload.fileName, 'El archivo de firma es obligatorio.', 255)
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : ''
  const size = payload.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) throw new ApiError(422, 'El tamaño de la firma no es válido.', 'VALIDATION')
  await read(context, (client, technician) => authorizeTechnicianServiceChange(client, technician.id, serviceId, deviceId, lockToken))
  return context.json(createServiceSignatureUploadUrl({ serviceId, role, fileName, contentType, size }))
})
technicianServiceRoutes.post('/:id/finalize', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const technicianStoragePath = requiredString(payload.technicianStoragePath, 'La firma del Técnico es obligatoria.', 1_000)
  const clientStoragePath = requiredString(payload.clientStoragePath, 'La firma del cliente es obligatoria.', 1_000)
  const clientName = requiredString(payload.clientName, 'Indica el nombre de quien firma por el cliente.', 200)
  assertServiceSignatureStoragePath(technicianStoragePath, serviceId, 'TECHNICIAN')
  assertServiceSignatureStoragePath(clientStoragePath, serviceId, 'CLIENT')
  const commandPayload = { deviceId, technicianStoragePath, clientStoragePath, clientName }
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'SERVICE_FINALIZE', serviceId, null,
    commandPayload, async () => {
      const [technicianExists, clientExists] = await Promise.all([
        serviceSignatureObjectExists(technicianStoragePath, serviceId, 'TECHNICIAN'),
        serviceSignatureObjectExists(clientStoragePath, serviceId, 'CLIENT'),
      ])
      if (!technicianExists || !clientExists) throw new ApiError(422, 'Una firma todavía no está disponible. Vuelve a intentarlo.', 'SIGNATURE_NOT_FOUND')
      return finalizeTechnicianService(client, technician.id, serviceId, deviceId, lockToken,
        technicianStoragePath, clientStoragePath, clientName)
    })))
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
technicianServiceRoutes.post('/:id/areas/:areaId/media/upload-url', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const fileName = requiredString(payload.fileName, 'El nombre de la fotografía es obligatorio.', 255)
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : ''
  const size = payload.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) throw new ApiError(422, 'El tamaño de la fotografía no es válido.', 'VALIDATION')
  await read(context, (client, technician) => authorizeTechnicianAreaChange(client, technician.id, serviceId, deviceId, lockToken, areaId))
  return context.json(createAreaNoAccessUploadUrl({ serviceId, areaId, fileName, contentType, size }))
})
technicianServiceRoutes.post('/:id/areas/:areaId/access', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const expected = version(payload.version)
  if (typeof payload.withoutAccess !== 'boolean') throw new ApiError(422, 'El estado de acceso no es válido.', 'VALIDATION')
  const description = optionalString(payload.description)
  const photoStoragePaths = Array.isArray(payload.photoStoragePaths)
    ? criterionEvidencePaths(payload.photoStoragePaths)
    : payload.photoStoragePath == null ? [] : [requiredString(payload.photoStoragePath, 'Adjunta una fotografía válida.', 1_000)]
  if (photoStoragePaths.length > 5) throw new ApiError(422, 'Adjunta máximo cinco fotografías.', 'VALIDATION')
  if (payload.withoutAccess) {
    if (!description.trim() || !photoStoragePaths.length) throw new ApiError(422, 'Describe la novedad y adjunta una fotografía.', 'VALIDATION')
    await read(context, (client, technician) => authorizeTechnicianAreaChange(client, technician.id, serviceId, deviceId, lockToken, areaId))
    for (const storagePath of photoStoragePaths) {
      assertAreaNoAccessStoragePath(storagePath, serviceId, areaId)
      if (!await serviceMediaObjectExists(storagePath, serviceId, areaId)) {
        throw new ApiError(422, 'Una fotografía todavía no está disponible. Vuelve a cargarla.', 'PHOTO_NOT_FOUND', { storagePath })
      }
    }
  }
  const paths = payload.withoutAccess ? photoStoragePaths : []
  const commandPayload = { deviceId, areaId, version: expected, withoutAccess: payload.withoutAccess, description, photoStoragePaths: paths }
  const saved = await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'AREA_ACCESS', serviceId, expected,
    commandPayload, () => saveTechnicianAreaAccess(client, technician.id, serviceId, deviceId, lockToken, areaId, expected,
      payload.withoutAccess as boolean, description, paths[0] ?? null, paths)))
  for (const removed of saved.removedPhotoPaths) await deleteAreaNoAccessObject(removed, serviceId, areaId)
  return context.json({ area: saved.area })
})
technicianServiceRoutes.post('/:id/areas/:areaId/media/delete', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const storagePath = requiredString(payload.storagePath, 'La ruta de la fotografía es obligatoria.', 1_000)
  assertAreaNoAccessStoragePath(storagePath, serviceId, areaId)
  await read(context, async (client, technician) => {
    await authorizeTechnicianAreaChange(client, technician.id, serviceId, deviceId, lockToken, areaId)
    const referenced = (await client.query<{ found: boolean }>('select exists(select 1 from public.servicio_areas where servicio_id=$1 and (sin_acceso_foto_storage_path=$2 or sin_acceso_evidencias_storage_paths ? $2)) as found', [serviceId, storagePath])).rows[0]?.found
    if (referenced) throw new ApiError(409, 'La fotografía está asociada al servicio y no puede eliminarse.', 'FILE_IN_USE')
  })
  await deleteAreaNoAccessObject(storagePath, serviceId, areaId)
  return context.body(null, 204)
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
  const evidenceStoragePaths = criterionEvidencePaths(payload.evidenceStoragePaths)
  if (evidenceStoragePaths.length) {
    await read(context, async (client, technician) => {
      await authorizeTechnicianServiceChange(client, technician.id, serviceId, deviceId, lockToken)
      const found = (await client.query('select 1 from public.evaluaciones_mip_area where servicio_id=$1 and id=$2', [serviceId, criterionId])).rowCount
      if (!found) throw new ApiError(404, 'El criterio no pertenece a este servicio.', 'CRITERION_NOT_FOUND')
    })
  }
  for (const storagePath of evidenceStoragePaths) {
    assertCriterionEvidenceStoragePath(storagePath, serviceId, criterionId)
    if (!await criterionEvidenceObjectExists(storagePath, serviceId, criterionId)) {
      throw new ApiError(422, 'Una fotografía todavía no está disponible. Vuelve a cargarla.', 'PHOTO_NOT_FOUND', { storagePath })
    }
  }
  const input = { deviceId, criterionId, version: expected, evaluation, observation: payload.observation, evidenceStoragePaths }
  const saved = await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'CRITERION_EVALUATION', serviceId, expected,
    input, () => saveTechnicianCriterionEvaluation(client, technician.id, serviceId, deviceId, lockToken, criterionId, expected, evaluation, payload.observation as string, evidenceStoragePaths)))
  for (const storagePath of saved.removedEvidenceStoragePaths) await deleteCriterionEvidenceObject(storagePath, serviceId, criterionId)
  return context.json(saved)
})

technicianServiceRoutes.post('/:id/criteria/:criterionId/media/upload-url', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const criterionId = id(context.req.param('criterionId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const fileName = requiredString(payload.fileName, 'El nombre de la fotografía es obligatorio.', 255)
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : ''
  const size = payload.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) throw new ApiError(422, 'El tamaño de la fotografía no es válido.', 'VALIDATION')
  await read(context, async (client, technician) => {
    await authorizeTechnicianServiceChange(client, technician.id, serviceId, deviceId, lockToken)
    const found = (await client.query('select 1 from public.evaluaciones_mip_area where servicio_id=$1 and id=$2', [serviceId, criterionId])).rowCount
    if (!found) throw new ApiError(404, 'El criterio no pertenece a este servicio.', 'CRITERION_NOT_FOUND')
  })
  return context.json(createCriterionEvidenceUploadUrl({ serviceId, criterionId, fileName, contentType, size }))
})

technicianServiceRoutes.post('/:id/criteria/:criterionId/media/delete', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const criterionId = id(context.req.param('criterionId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const storagePath = requiredString(payload.storagePath, 'La ruta de la fotografía es obligatoria.', 1_000)
  assertCriterionEvidenceStoragePath(storagePath, serviceId, criterionId)
  await read(context, async (client, technician) => {
    await authorizeTechnicianServiceChange(client, technician.id, serviceId, deviceId, lockToken)
    const referenced = (await client.query<{ found: boolean }>(`select exists(select 1 from public.evaluaciones_mip_area
      where servicio_id=$1 and id=$2 and evidencias_storage_paths ? $3) as found`, [serviceId, criterionId, storagePath])).rows[0]?.found
    if (referenced) throw new ApiError(409, 'La fotografía está asociada al servicio y no puede eliminarse.', 'FILE_IN_USE')
  })
  await deleteCriterionEvidenceObject(storagePath, serviceId, criterionId)
  return context.body(null, 204)
})

technicianServiceRoutes.post('/:id/areas/:areaId/devices', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const permanentDeviceId = id(payload.permanentDeviceId)
  const serviceDeviceId = id(payload.serviceDeviceId)
  const input = {
    numero: requiredString(payload.numero, 'El número del dispositivo es obligatorio.', 100),
    tipoCodigo: requiredString(payload.tipoCodigo, 'Selecciona un tipo de dispositivo.', 160),
    ubicacion: requiredString(payload.ubicacion, 'La ubicación del dispositivo es obligatoria.', 500),
  }
  const commandPayload = { deviceId, areaId, permanentDeviceId, serviceDeviceId, ...input }
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'DEVICE_CREATE', serviceId, null,
    commandPayload, () => createTechnicianDevice(client, technician.id, serviceId, deviceId, lockToken, areaId,
      permanentDeviceId, serviceDeviceId, input))))
})

technicianServiceRoutes.post('/:id/areas/:areaId/findings/:findingId/media/upload-url', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const findingId = id(context.req.param('findingId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const phase = findingPhase(payload.phase)
  const fileName = requiredString(payload.fileName, 'El nombre de la evidencia es obligatorio.', 255)
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : ''
  const size = payload.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) throw new ApiError(422, 'El tamaño de la evidencia no es válido.', 'VALIDATION')
  await read(context, async (client, technician) => {
    if (phase === 'CLOSURE') {
      const finding = await authorizeTechnicianFindingChange(client, technician.id, serviceId, deviceId, lockToken, areaId, findingId)
      if (finding.finding.servicioAperturaId === serviceId || finding.finding.estado === 'CERRADO') {
        throw new ApiError(409, 'El Hallazgo no está disponible para cierre.', 'FINDING_NOT_EDITABLE')
      }
    } else {
      const area = await authorizeTechnicianAreaChange(client, technician.id, serviceId, deviceId, lockToken, areaId)
      if (area.sinAcceso) throw new ApiError(409, 'Habilita el acceso al Área antes de registrar Hallazgos.', 'AREA_WITHOUT_ACCESS')
    }
  })
  return context.json(createFindingEvidenceUploadUrl({ serviceId, findingId, phase, fileName, contentType, size }))
})

technicianServiceRoutes.post('/:id/areas/:areaId/findings', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const findingId = id(payload.findingId)
  const input = {
    descripcion: requiredString(payload.descripcion, 'Describe el Hallazgo.'),
    recomendacionAccion: requiredString(payload.recomendacionAccion, 'Describe la recomendación o acción correctiva.'),
    responsableNombre: requiredString(payload.responsableNombre, 'Indica el responsable.', 200),
    responsableCorreo: optionalString(payload.responsableCorreo, 320),
  }
  const evidenceStoragePaths = findingEvidencePaths(payload.evidenceStoragePaths)
  for (const storagePath of evidenceStoragePaths) {
    assertFindingEvidenceStoragePath(storagePath, serviceId, findingId, 'OPENING')
  }
  if (evidenceStoragePaths.length) {
    await read(context, async (client, technician) => {
      const area = await authorizeTechnicianAreaChange(client, technician.id, serviceId, deviceId, lockToken, areaId)
      if (area.sinAcceso) throw new ApiError(409, 'Habilita el acceso al Área antes de registrar Hallazgos.', 'AREA_WITHOUT_ACCESS')
    })
    const exists = await Promise.all(evidenceStoragePaths.map(path => findingEvidenceObjectExists(path, serviceId, findingId, 'OPENING')))
    const missing = exists.findIndex(value => !value)
    if (missing >= 0) throw new ApiError(422, 'Una evidencia todavía no está disponible. Vuelve a cargarla.', 'PHOTO_NOT_FOUND', { storagePath: evidenceStoragePaths[missing] })
  }
  const commandPayload = { deviceId, areaId, findingId, ...input, evidenceStoragePaths }
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'FINDING_CREATE', serviceId, null,
    commandPayload, () => createTechnicianFinding(client, technician.id, serviceId, deviceId, lockToken, areaId, findingId, input, evidenceStoragePaths))))
})

technicianServiceRoutes.post('/:id/areas/:areaId/findings/:findingId/status', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const findingId = id(context.req.param('findingId'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const expected = version(payload.version)
  if (payload.estado !== 'EN_PROCESO' && payload.estado !== 'CERRADO') throw new ApiError(422, 'El estado del Hallazgo no es válido.', 'VALIDATION')
  const input = { estado: payload.estado, observacionCierre: optionalString(payload.observacionCierre) } as const
  const evidenceStoragePaths = findingEvidencePaths(payload.evidenceStoragePaths)
  if (input.estado === 'CERRADO' && !evidenceStoragePaths.length) throw new ApiError(422, 'Adjunta al menos una evidencia para cerrar el Hallazgo.', 'VALIDATION')
  for (const storagePath of evidenceStoragePaths) {
    assertFindingEvidenceStoragePath(storagePath, serviceId, findingId, 'CLOSURE')
  }
  if (evidenceStoragePaths.length) {
    await read(context, (client, technician) => authorizeTechnicianFindingChange(client, technician.id, serviceId, deviceId, lockToken, areaId, findingId))
    const exists = await Promise.all(evidenceStoragePaths.map(path => findingEvidenceObjectExists(path, serviceId, findingId, 'CLOSURE')))
    const missing = exists.findIndex(value => !value)
    if (missing >= 0) throw new ApiError(422, 'Una evidencia todavía no está disponible. Vuelve a cargarla.', 'PHOTO_NOT_FOUND', { storagePath: evidenceStoragePaths[missing] })
  }
  const commandPayload = { deviceId, areaId, findingId, version: expected, ...input, evidenceStoragePaths }
  return context.json(await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'FINDING_STATUS', serviceId, expected,
    commandPayload, () => saveTechnicianFindingStatus(client, technician.id, serviceId, deviceId, lockToken, areaId, findingId, expected, input, evidenceStoragePaths))))
})

technicianServiceRoutes.post('/:id/areas/:areaId/findings/:findingId/media/delete', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const areaId = id(context.req.param('areaId'))
  const findingId = id(context.req.param('findingId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const phase = findingPhase(payload.phase)
  const storagePath = requiredString(payload.storagePath, 'La ruta de la evidencia es obligatoria.', 1_000)
  assertFindingEvidenceStoragePath(storagePath, serviceId, findingId, phase)
  await read(context, async (client, technician) => {
    if (phase === 'CLOSURE') await authorizeTechnicianFindingChange(client, technician.id, serviceId, deviceId, lockToken, areaId, findingId)
    else await authorizeTechnicianAreaChange(client, technician.id, serviceId, deviceId, lockToken, areaId)
    const referenced = (await client.query<{ found: boolean }>(`select exists(select 1 from public.hallazgos where id=$1
      and (coalesce(evidencias_apertura_storage_paths,'[]'::jsonb) ? $2
        or coalesce(evidencias_cierre_storage_paths,'[]'::jsonb) ? $2)) as found`, [findingId, storagePath])).rows[0]?.found
    if (referenced) throw new ApiError(409, 'La evidencia está asociada al Hallazgo y no puede eliminarse.', 'FILE_IN_USE')
  })
  await deleteFindingEvidenceObject(storagePath, serviceId, findingId, phase)
  return context.body(null, 204)
})

technicianServiceRoutes.post('/:id/devices/:serviceDeviceId/media/upload-url', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const serviceDeviceId = id(context.req.param('serviceDeviceId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const fileName = requiredString(payload.fileName, 'El nombre de la fotografía es obligatorio.', 255)
  const contentType = typeof payload.contentType === 'string' ? payload.contentType : ''
  const size = payload.size
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) throw new ApiError(422, 'El tamaño de la fotografía no es válido.', 'VALIDATION')
  await read(context, (client, technician) => authorizeTechnicianDeviceChange(client, technician.id, serviceId, deviceId, lockToken, serviceDeviceId))
  return context.json(createDeviceReviewUploadUrl({ serviceId, serviceDeviceId, fileName, contentType, size }))
})

technicianServiceRoutes.post('/:id/devices/:serviceDeviceId/review', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const serviceDeviceId = id(context.req.param('serviceDeviceId'))
  const requestId = id(payload.requestId)
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const reviewId = id(payload.reviewId)
  const expected = reviewVersion(payload.version)
  if (typeof payload.estadoObservado !== 'string' || !['ACTIVO', 'DANADO', 'FUERA_DE_USO'].includes(payload.estadoObservado)) {
    throw new ApiError(422, 'Selecciona un estado válido para el dispositivo.', 'VALIDATION')
  }
  if (!Array.isArray(payload.capturas) || payload.capturas.length > 200) throw new ApiError(422, 'Las capturas registradas no son válidas.', 'VALIDATION')
  const captures = payload.capturas.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'Las capturas registradas no son válidas.', 'VALIDATION')
    const capture = value as Record<string, unknown>
    const plagaCodigo = requiredString(capture.plagaCodigo, 'Selecciona una plaga válida.', 160)
    if (typeof capture.cantidad !== 'number' || !Number.isSafeInteger(capture.cantidad) || capture.cantidad < 1 || capture.cantidad > 1_000_000) {
      throw new ApiError(422, 'La cantidad capturada no es válida.', 'VALIDATION')
    }
    return { plagaCodigo, cantidad: capture.cantidad }
  })
  const input = {
    estadoObservado: payload.estadoObservado as 'ACTIVO' | 'DANADO' | 'FUERA_DE_USO',
    capturas: captures,
    consumo: optionalString(payload.consumo, 500),
    productoQuimico: optionalString(payload.productoQuimico, 500),
    antidoto: optionalString(payload.antidoto, 500),
    observaciones: optionalString(payload.observaciones),
  }
  const photoStoragePath = payload.photoStoragePath === null ? null : requiredString(payload.photoStoragePath, 'Adjunta una fotografía válida.', 1_000)
  if (photoStoragePath) {
    assertDeviceReviewStoragePath(photoStoragePath, serviceId, serviceDeviceId)
    await read(context, (client, technician) => authorizeTechnicianDeviceChange(client, technician.id, serviceId, deviceId, lockToken, serviceDeviceId))
    if (!await deviceReviewMediaObjectExists(photoStoragePath, serviceId, serviceDeviceId)) {
      throw new ApiError(422, 'La fotografía todavía no está disponible. Vuelve a cargarla.', 'PHOTO_NOT_FOUND')
    }
  }
  const commandPayload = { deviceId, serviceDeviceId, reviewId, version: expected, ...input, photoStoragePath }
  const saved = await read(context, (client, technician) => technicianCommand(client, technician.id, requestId, 'DEVICE_REVIEW', serviceId, expected,
    commandPayload, () => saveTechnicianDeviceReview(client, technician.id, serviceId, deviceId, lockToken, serviceDeviceId, reviewId, expected, input, photoStoragePath)))
  if (saved.replacedPhotoPath) await deleteDeviceReviewObject(saved.replacedPhotoPath, serviceId, serviceDeviceId)
  return context.json({ review: saved.review })
})

technicianServiceRoutes.post('/:id/devices/:serviceDeviceId/media/delete', async context => {
  const payload = await body(context.req.raw)
  const serviceId = id(context.req.param('id'))
  const serviceDeviceId = id(context.req.param('serviceDeviceId'))
  const deviceId = id(payload.deviceId)
  const lockToken = id(payload.lockToken)
  const storagePath = requiredString(payload.storagePath, 'La ruta de la fotografía es obligatoria.', 1_000)
  assertDeviceReviewStoragePath(storagePath, serviceId, serviceDeviceId)
  await read(context, async (client, technician) => {
    await authorizeTechnicianDeviceChange(client, technician.id, serviceId, deviceId, lockToken, serviceDeviceId)
    const referenced = (await client.query<{ found: boolean }>(`select exists(select 1 from public.revisiones_dispositivos
      where servicio_id=$1 and servicio_dispositivo_id=$2 and foto_storage_path=$3) as found`, [serviceId, serviceDeviceId, storagePath])).rows[0]?.found
    if (referenced) throw new ApiError(409, 'La fotografía está asociada al servicio y no puede eliminarse.', 'FILE_IN_USE')
  })
  await deleteDeviceReviewObject(storagePath, serviceId, serviceDeviceId)
  return context.body(null, 204)
})

technicianServiceRoutes.onError((error, context) => {
  if (error instanceof ApiError) return context.json({ error: error.message, code: error.code, details: error.details }, error.status as ContentfulStatusCode)
  const code = (error as Error & { code?: string }).code
  if (code === '40001' || code === '40P01') return context.json({ error: 'Hubo un cambio simultáneo. Vuelve a intentar.', code: 'CONCURRENT_WRITE' }, 409)
  if (['23503', '23505', '23514', '23502', '22P02', 'P0001'].includes(code ?? '')) return context.json({ error: 'No fue posible iniciar con los datos actuales. Actualiza el servicio.', code: 'VALIDATION' }, 422)
  console.error('TECHNICIAN_SERVICES_ERROR', { code: code ?? 'UNEXPECTED' })
  return context.json({ error: 'No fue posible completar la operación. Intenta nuevamente.', code: 'UNEXPECTED' }, 500)
})
