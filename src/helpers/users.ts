import { compareDateOnly, todayInTimeZone } from '@/helpers/dateTime'
import type { DateOnly, UserInput, UserRecord } from '@/types/domain'
import { MAX_OPTIMIZATION_SOURCE_BYTES } from '@/types/fileOptimization'

export { MAX_CERTIFICATE_BYTES } from '@/types/fileOptimization'
export type CertificateStatus = 'not-applicable' | 'none' | 'valid' | 'expiring' | 'expired'
export type UserFormErrors = Partial<Record<'nombreCompleto' | 'correoGoogle' | 'roles' | 'certificateFile' | 'certificadoFechaEmision' | 'certificadoFechaVencimiento', string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_CERTIFICATE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

export function certificateStatus(user: Pick<UserRecord, 'esTecnico' | 'certificadoStoragePath' | 'certificadoFechaVencimiento'>, today = todayInTimeZone()): CertificateStatus {
  if (!user.esTecnico) return 'not-applicable'
  if (!user.certificadoStoragePath) return 'none'
  if (!user.certificadoFechaVencimiento) return 'expired'
  if (compareDateOnly(user.certificadoFechaVencimiento, today) < 0) return 'expired'
  const warningDate = addDays(today, 30)
  return compareDateOnly(user.certificadoFechaVencimiento, warningDate) <= 0 ? 'expiring' : 'valid'
}

export function validateUserInput(input: UserInput, certificateFile: File | null): UserFormErrors {
  const errors: UserFormErrors = {}
  if (input.nombreCompleto.trim().length < 2) errors.nombreCompleto = 'Ingresa el nombre completo'
  if (!EMAIL_PATTERN.test(input.correoGoogle.trim())) errors.correoGoogle = 'Ingresa un correo válido'
  if (!input.esAdmin && !input.esTecnico) errors.roles = 'Selecciona al menos un rol'

  const hasCertificate = Boolean(certificateFile || input.certificadoStoragePath)
  if (certificateFile) {
    if (!ALLOWED_CERTIFICATE_TYPES.has(certificateFile.type)) errors.certificateFile = 'Adjunta un PDF, JPG o PNG'
    // The existing 10 MB storage limit is checked AFTER optimization, before signing.
    if (certificateFile.size > MAX_OPTIMIZATION_SOURCE_BYTES) errors.certificateFile = 'El archivo original no puede superar 64 MB'
  }
  if (input.esTecnico && hasCertificate) {
    if (!input.certificadoFechaEmision) errors.certificadoFechaEmision = 'La fecha de emisión es obligatoria'
    if (!input.certificadoFechaVencimiento) errors.certificadoFechaVencimiento = 'La fecha de vencimiento es obligatoria'
    if (input.certificadoFechaEmision && input.certificadoFechaVencimiento
      && compareDateOnly(input.certificadoFechaVencimiento, input.certificadoFechaEmision) < 0) {
      errors.certificadoFechaVencimiento = 'El vencimiento no puede ser anterior a la emisión'
    }
  }
  return errors
}

export function normalizeUserInput(input: UserInput): UserInput {
  const normalized = {
    ...input,
    nombreCompleto: input.nombreCompleto.trim(),
    correoGoogle: input.correoGoogle.trim().toLocaleLowerCase('es-CO'),
  }
  if (!normalized.certificadoStoragePath) {
    normalized.certificadoFechaEmision = null
    normalized.certificadoFechaVencimiento = null
  }
  return normalized
}

function addDays(value: DateOnly, amount: number): DateOnly {
  const parts = value.split('-').map(Number)
  const year = parts[0] ?? 0
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
