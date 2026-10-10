import { apiRequest, ApiClientError } from '@/services/apiService'
import { optimizeFileForStorage } from '@/services/fileOptimizationService'
import type { MasterFileUploadPhaseHandler } from '@/services/filesService'
import type { PersonalProfile } from '@/types/domain'

export type ProfileUploadKind = 'AVATAR' | 'CERTIFICATE'
type UploadAuthorization = { url: string; storagePath: string; contentType: string }
type GoogleHandoff = { token: string; expiresInSeconds: number }

export function getPersonalProfile(): Promise<PersonalProfile> {
  return apiRequest<PersonalProfile>('api/profile/')
}

export function savePersonalData(input: Pick<PersonalProfile, 'nombreCompleto' | 'telefono' | 'version'>): Promise<PersonalProfile> {
  return apiRequest('api/profile/', { method: 'PATCH', body: JSON.stringify(input) })
}

export function saveProfileAvatar(storagePath: string | null, version: number): Promise<PersonalProfile> {
  return apiRequest('api/profile/avatar', { method: 'PATCH', body: JSON.stringify({ storagePath, version }) })
}

export function savePersonalCertificate(
  input: Pick<PersonalProfile, 'certificadoStoragePath' | 'certificadoFechaEmision' | 'certificadoFechaVencimiento' | 'version'>,
): Promise<PersonalProfile> {
  return apiRequest('api/profile/certificate', { method: 'PATCH', body: JSON.stringify(input) })
}

export async function getPersonalCertificateUrl(): Promise<string> {
  return (await apiRequest<{ url: string }>('api/profile/certificate/read-url')).url
}

export async function uploadPersonalFile(
  kind: ProfileUploadKind,
  original: File,
  onPhase?: MasterFileUploadPhaseHandler,
): Promise<string> {
  onPhase?.('compressing')
  const file = await optimizeFileForStorage(kind === 'AVATAR' ? 'USER_AVATAR' : 'USER_CERTIFICATE', original)
  onPhase?.('uploading')
  const authorization = await apiRequest<UploadAuthorization>('api/profile/files/upload-url', {
    method: 'POST',
    body: JSON.stringify({ kind, fileName: file.name, contentType: file.type, size: file.size }),
  })
  const response = await fetch(authorization.url, {
    method: 'PUT',
    headers: { 'Content-Type': authorization.contentType },
    body: file,
  })
  if (!response.ok) throw new ApiClientError('No fue posible subir el archivo privado a R2.', response.status)
  return authorization.storagePath
}

export async function discardPersonalUpload(kind: ProfileUploadKind, storagePath: string): Promise<void> {
  await apiRequest('api/profile/files/discard', {
    method: 'POST', body: JSON.stringify({ kind, storagePath }),
  })
}

export function startGoogleIdentityChange(): Promise<GoogleHandoff> {
  return apiRequest('api/profile/google/start', { method: 'POST', body: '{}' })
}

export function finishGoogleIdentityChange(token: string): Promise<{ correoGoogle: string }> {
  return apiRequest('api/profile/google/finish', { method: 'POST', body: JSON.stringify({ token }) })
}
