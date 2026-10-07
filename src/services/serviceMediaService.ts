import { ApiClientError, apiRequest } from '@/services/apiService'
import { optimizeFileForStorage } from '@/services/fileOptimizationService'

type UploadAuthorization = {
  url: string
  storagePath: string
  contentType: string
}
type FindingEvidencePhase = 'OPENING' | 'CLOSURE'

export async function uploadTechnicianAreaPhoto(
  serviceId: string,
  areaId: string,
  deviceId: string,
  lockToken: string,
  original: File,
): Promise<string> {
  const file = await optimizeFileForStorage('SERVICE_PHOTO', original)
  const authorization = await apiRequest<UploadAuthorization>(`api/technician/services/${serviceId}/areas/${areaId}/media/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, lockToken, fileName: file.name, contentType: file.type, size: file.size }),
  })
  const response = await fetch(authorization.url, {
    method: 'PUT',
    headers: { 'Content-Type': authorization.contentType },
    body: file,
  })
  if (!response.ok) {
    throw new ApiClientError(response.status === 403
      ? 'R2 rechazó la fotografía. Verifica la conexión y vuelve a intentarlo.'
      : 'No fue posible subir la fotografía del Área.', response.status)
  }
  return authorization.storagePath
}

export async function deleteTechnicianAreaPhoto(
  serviceId: string,
  areaId: string,
  deviceId: string,
  lockToken: string,
  storagePath: string,
): Promise<void> {
  await apiRequest<void>(`api/technician/services/${serviceId}/areas/${areaId}/media/delete`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, lockToken, storagePath }),
  })
}

export async function uploadTechnicianDevicePhoto(
  serviceId: string,
  serviceDeviceId: string,
  deviceId: string,
  lockToken: string,
  original: File,
): Promise<string> {
  const file = await optimizeFileForStorage('SERVICE_PHOTO', original)
  const authorization = await apiRequest<UploadAuthorization>(`api/technician/services/${serviceId}/devices/${serviceDeviceId}/media/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, lockToken, fileName: file.name, contentType: file.type, size: file.size }),
  })
  const response = await fetch(authorization.url, {
    method: 'PUT',
    headers: { 'Content-Type': authorization.contentType },
    body: file,
  })
  if (!response.ok) {
    throw new ApiClientError(response.status === 403
      ? 'R2 rechazó la fotografía. Verifica la conexión y vuelve a intentarlo.'
      : 'No fue posible subir la fotografía del dispositivo.', response.status)
  }
  return authorization.storagePath
}

export async function deleteTechnicianDevicePhoto(
  serviceId: string,
  serviceDeviceId: string,
  deviceId: string,
  lockToken: string,
  storagePath: string,
): Promise<void> {
  await apiRequest<void>(`api/technician/services/${serviceId}/devices/${serviceDeviceId}/media/delete`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, lockToken, storagePath }),
  })
}

export async function uploadTechnicianFindingEvidence(
  serviceId: string,
  areaId: string,
  findingId: string,
  phase: FindingEvidencePhase,
  deviceId: string,
  lockToken: string,
  original: File,
): Promise<string> {
  const file = await optimizeFileForStorage('SERVICE_PHOTO', original)
  const authorization = await apiRequest<UploadAuthorization>(`api/technician/services/${serviceId}/areas/${areaId}/findings/${findingId}/media/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, lockToken, phase, fileName: file.name, contentType: file.type, size: file.size }),
  })
  const response = await fetch(authorization.url, {
    method: 'PUT',
    headers: { 'Content-Type': authorization.contentType },
    body: file,
  })
  if (!response.ok) throw new ApiClientError('No fue posible subir la evidencia del Hallazgo.', response.status)
  return authorization.storagePath
}

export async function deleteTechnicianFindingEvidence(
  serviceId: string,
  areaId: string,
  findingId: string,
  phase: FindingEvidencePhase,
  deviceId: string,
  lockToken: string,
  storagePath: string,
): Promise<void> {
  await apiRequest<void>(`api/technician/services/${serviceId}/areas/${areaId}/findings/${findingId}/media/delete`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, lockToken, phase, storagePath }),
  })
}
