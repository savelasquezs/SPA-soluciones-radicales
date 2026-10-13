import { apiRequest, ApiClientError } from '@/services/apiService'
import { normalizeUserInput } from '@/helpers/users'
import { deleteMasterFile, uploadMasterFile } from '@/services/filesService'
import type { UserInput, UserRecord } from '@/types/domain'

export class UserServiceError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

export type CertificateUpdate = Pick<UserInput, 'certificadoFechaEmision' | 'certificadoFechaVencimiento' | 'certificadoObservaciones'> & {
  file: File | null
}

export async function listUsers(): Promise<UserRecord[]> {
  return request<UserRecord[]>('api/users')
}

export async function getUser(id: string): Promise<UserRecord> {
  return request<UserRecord>(`api/users/${id}`)
}

export async function createUser(input: UserInput): Promise<UserRecord> {
  return request<UserRecord>('api/users', { method: 'POST', body: JSON.stringify(normalizeUserInput(input)) })
}

export async function updateUser(id: string, input: UserInput): Promise<UserRecord> {
  return request<UserRecord>(`api/users/${id}`, { method: 'PATCH', body: JSON.stringify(normalizeUserInput(input)) })
}

export async function setUserActive(user: UserRecord, active: boolean): Promise<UserRecord> {
  return updateUser(user.id, { ...user, activo: active })
}

export async function updateUserCertificate(user: UserRecord, update: CertificateUpdate): Promise<UserRecord> {
  let uploadedPath: string | null = null
  try {
    if (update.file) uploadedPath = await uploadUserCertificate(user.id, update.file)
    const updated = await updateUser(user.id, {
      ...user,
      certificadoStoragePath: uploadedPath ?? user.certificadoStoragePath,
      certificadoFechaEmision: update.certificadoFechaEmision,
      certificadoFechaVencimiento: update.certificadoFechaVencimiento,
      certificadoObservaciones: update.certificadoObservaciones,
    })
    if (uploadedPath && user.certificadoStoragePath && user.certificadoStoragePath !== uploadedPath) {
      void deleteMasterFile(user.certificadoStoragePath).catch(() => undefined)
    }
    return updated
  } catch (error) {
    if (uploadedPath) await deleteMasterFile(uploadedPath).catch(() => undefined)
    throw error
  }
}

export function uploadUserCertificate(_userId: string, file: File): Promise<string> {
  return uploadMasterFile('USER_CERTIFICATE', file)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(path, init)
  } catch (error) {
    if (error instanceof UserServiceError) throw error
    if (error instanceof ApiClientError) {
      throw new UserServiceError(error.message, error.status >= 500 || error.status === 429)
    }
    throw new UserServiceError('No fue posible completar la operación.', true)
  }
}
