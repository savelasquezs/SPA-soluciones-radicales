import { isDateOnly } from '@/helpers/dateTime'

export function personalFieldErrors(name: string, phone: string): { nombre?: string; telefono?: string } {
  const errors: { nombre?: string; telefono?: string } = {}
  if (!name.trim() || name.trim().length > 120) errors.nombre = 'Ingresa un nombre de hasta 120 caracteres.'
  if (phone.trim()) {
    const compact = phone.replace(/[\s().-]/g, '')
    const normalized = compact.startsWith('00') ? '+' + compact.slice(2) : compact
    if (!/^(3[0-9]{9}|\+[1-9][0-9]{7,14})$/.test(normalized)) {
      errors.telefono = 'Ingresa un celular válido con indicativo.'
    }
  }
  return errors
}

export function certificateFieldErrors(path: string | null, issue: string | null, expiry: string | null) {
  const errors: { file?: string; issue?: string; expiry?: string } = {}
  if (!path) errors.file = 'Adjunta un certificado técnico.'
  if (!issue || !isDateOnly(issue)) errors.issue = 'Ingresa la fecha de emisión.'
  if (!expiry || !isDateOnly(expiry)) errors.expiry = 'Ingresa la fecha de vencimiento.'
  if (!errors.issue && !errors.expiry && issue && expiry && expiry < issue) {
    errors.expiry = 'El vencimiento no puede ser anterior a la emisión.'
  }
  return errors
}

export function technicianCertificateStatus(expiry: string | null, today: string) {
  if (!expiry) return { label: 'Sin certificado', tone: 'neutral' as const }
  if (expiry < today) return { label: 'Vencido', tone: 'danger' as const }
  const soon = new Date(today + 'T00:00:00Z')
  soon.setUTCDate(soon.getUTCDate() + 30)
  if (expiry <= soon.toISOString().slice(0, 10)) return { label: 'Por vencer', tone: 'warning' as const }
  return { label: 'Vigente', tone: 'success' as const }
}
