import { apiRequest, ApiClientError } from '@/services/apiService'
import { normalizeUserInput } from '@/helpers/users'
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
  if (update.file) {
    throw new UserServiceError('La carga de certificados requiere el backend autorizado de Cloudflare R2.', false)
  }
  return updateUser(user.id, {
    ...user,
    certificadoFechaEmision: update.certificadoFechaEmision,
    certificadoFechaVencimiento: update.certificadoFechaVencimiento,
    certificadoObservaciones: update.certificadoObservaciones,
  })
}

export async function uploadUserCertificate(_userId: string, _file: File): Promise<never> {
  throw new UserServiceError('La carga de certificados requiere el backend autorizado de Cloudflare R2.', false)
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
