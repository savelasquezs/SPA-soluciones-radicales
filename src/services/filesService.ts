import { apiRequest, ApiClientError } from '@/services/apiService'
import { optimizeFileForStorage } from '@/services/fileOptimizationService'

export type MasterFileKind =
  | 'USER_CERTIFICATE'
  | 'CLIENT_ESTABLISHMENT_TEMPLATE'
  | 'SITE_PLAN'
  | 'SITE_VEHICLE_TEMPLATE'

export type MasterFileUploadPhase = 'compressing' | 'uploading'
export type MasterFileUploadPhaseHandler = (phase: MasterFileUploadPhase) => void

type UploadAuthorization = {
  url: string
  storagePath: string
  contentType: string
  expiresIn: number
}

export async function uploadMasterFile(
  kind: MasterFileKind,
  originalFile: File,
  onPhase?: MasterFileUploadPhaseHandler,
): Promise<string> {
  onPhase?.('compressing')
  const file = await optimizeFileForStorage(kind, originalFile)
  onPhase?.('uploading')
  const authorization = await apiRequest<UploadAuthorization>('api/files/master/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  })

  const response = await fetch(authorization.url, {
    method: 'PUT',
    headers: { 'Content-Type': authorization.contentType },
    body: file,
  })

  if (!response.ok) {
    throw new ApiClientError(
      response.status === 403
        ? 'R2 rechazó la carga. Verifica el origen permitido del bucket y vuelve a intentarlo.'
        : 'No fue posible subir el archivo privado.',
      response.status,
    )
  }

  return authorization.storagePath
}

export async function getMasterFileUrl(storagePath: string): Promise<string> {
  const response = await apiRequest<{ url: string }>('api/files/master/read-url', {
    method: 'POST',
    body: JSON.stringify({ storagePath }),
  })
  return response.url
}

export async function deleteMasterFile(storagePath: string): Promise<void> {
  await apiRequest<void>('api/files/master/delete', {
    method: 'POST',
    body: JSON.stringify({ storagePath }),
  })
}
