import type { AreaInput, ClientInput, SiteInput } from '@/types/domain'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const E164_PATTERN = /^\+[1-9]\d{7,14}$/

export type ClientFormErrors = Partial<Record<
  | 'nombre'
  | 'nit'
  | 'correos'
  | 'residenciaCelular'
  | 'residenciaDireccion'
  | 'vigenciaCertificadoMeses',
  string
>>

export type SiteFormErrors = Partial<Record<
  | 'nombre'
  | 'direccion'
  | 'contactoPrincipalNombre'
  | 'contactoPrincipalCorreo'
  | 'contactoPrincipalCelular'
  | 'valorServicio'
  | 'periodicidadMeses'
  | 'vigenciaCertificadoVehiculoMeses'
  | 'duracionServicioMinutos',
  string
>>

export type AreaFormErrors = Partial<Record<'nombre', string>>

export function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (!compact) return null
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact
  const colombian = /^3\d{9}$/.test(international) ? `+57${international}` : international
  return E164_PATTERN.test(colombian) ? colombian : null
}

export function formatPhone(value: string | null): string {
  if (!value) return '—'
  if (/^\+57(3\d{9})$/.test(value)) {
    const local = value.slice(3)
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  return value
}

export function normalizeEmails(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLocaleLowerCase('es-CO')).filter(Boolean))]
}

export function parseEmails(value: string): string[] {
  return normalizeEmails(value.split(/[\n,;]/))
}

export function validateClientInput(input: ClientInput): ClientFormErrors {
  const errors: ClientFormErrors = {}
  if (input.nombre.trim().length < 2) errors.nombre = 'Ingresa el nombre del cliente'

  const invalidEmail = normalizeEmails(input.correos).find((email) => !EMAIL_PATTERN.test(email))
  if (invalidEmail) errors.correos = `El correo ${invalidEmail} no es válido`

  if (input.tipoCliente === 'NEGOCIO') {
    if (!input.nit?.trim()) errors.nit = 'El NIT es obligatorio'
    if (!Number.isSafeInteger(input.vigenciaCertificadoMeses) || Number(input.vigenciaCertificadoMeses) <= 0) {
      errors.vigenciaCertificadoMeses = 'La vigencia debe ser mayor que cero'
    }
  } else {
    if (!normalizePhone(input.residenciaCelular ?? '')) errors.residenciaCelular = 'Ingresa un celular válido'
    if (!input.residenciaDireccion?.trim()) errors.residenciaDireccion = 'La dirección es obligatoria'
  }
  return errors
}

export function validateSiteInput(input: SiteInput): SiteFormErrors {
  const errors: SiteFormErrors = {}
  if (!input.nombre.trim()) errors.nombre = 'El nombre de la Sede es obligatorio'
  if (!input.direccion.trim()) errors.direccion = 'La dirección es obligatoria'
  if (!input.contactoPrincipalNombre.trim()) errors.contactoPrincipalNombre = 'El contacto principal es obligatorio'
  if (input.contactoPrincipalCorreo && !EMAIL_PATTERN.test(input.contactoPrincipalCorreo.trim())) {
    errors.contactoPrincipalCorreo = 'Ingresa un correo válido'
  }
  if (!normalizePhone(input.contactoPrincipalCelular)) {
    errors.contactoPrincipalCelular = 'Ingresa un celular válido'
  }
  if (!Number.isSafeInteger(input.valorServicio) || input.valorServicio < 0) errors.valorServicio = 'Ingresa un valor entero en COP'
  if (!Number.isSafeInteger(input.periodicidadMeses) || input.periodicidadMeses <= 0) errors.periodicidadMeses = 'La periodicidad debe ser mayor que cero'
  if (!Number.isSafeInteger(input.duracionServicioMinutos) || input.duracionServicioMinutos <= 0) errors.duracionServicioMinutos = 'La duración debe ser mayor que cero'
  if (input.generaCertificadoVehiculo) {
    if (!Number.isSafeInteger(input.vigenciaCertificadoVehiculoMeses) || Number(input.vigenciaCertificadoVehiculoMeses) <= 0) {
      errors.vigenciaCertificadoVehiculoMeses = 'La vigencia debe ser mayor que cero'
    }
  }
  return errors
}

export function validateAreaInput(input: AreaInput): AreaFormErrors {
  return input.nombre.trim() ? {} : { nombre: 'El nombre del Área es obligatorio' }
}
