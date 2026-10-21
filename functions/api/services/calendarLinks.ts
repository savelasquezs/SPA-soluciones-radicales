import type { AdminService } from '../../../src/types/adminServices'
import { isServiceId } from '../../../src/helpers/adminServices'

const STABLE_WORKERS_ORIGINS = new Set([
  'https://develop-soluciones-radicales.solucionesradicales1.workers.dev',
  'https://soluciones-radicales.solucionesradicales1.workers.dev',
])

/**
 * Links in Google Calendar invitations must refer to the SPA, never Neon APIs
 * or ephemeral Cloudflare deployment URLs. Calendar is an external audience:
 * never accept a protocol, credential, path, or origin outside the CORS allowlist.
 *
 * Explicit CALENDAR_APP_ORIGIN supports custom domains and production. When
 * absent, pick a single known stable Cloudflare origin already authorized for
 * this Function; refuse to guess if multiple stable sites are configured.
 */
export function resolveCalendarAppOrigin(
  allowedOrigins: string,
  explicitOrigin?: string,
): string | null {
  const allowed = new Set(allowedOrigins.split(',').map(origin => origin.trim()).filter(Boolean))
  const selected = explicitOrigin?.trim()
  if (selected) {
    let url: URL
    try { url = new URL(selected) } catch { throw new Error('CALENDAR_APP_ORIGIN no es una URL válida') }
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (selected !== url.origin || url.username || url.password
      || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
      || !allowed.has(selected)) {
      throw new Error('CALENDAR_APP_ORIGIN debe ser un origen HTTPS incluido en ALLOWED_ORIGINS')
    }
    return selected
  }
  const stable = [...allowed].filter(origin => STABLE_WORKERS_ORIGINS.has(origin))
  return stable.length === 1 ? stable[0]! : null
}

type CalendarServiceFields = Pick<AdminService, 'id' | 'solicitud' | 'tipoServicio' | 'responsable' | 'colaboradores'>

/** Both Principals and Reinforcements open their assigned technician work screen. */
export function calendarServiceLink(
  serviceId: string,
  _kind: CalendarServiceFields['tipoServicio'],
  appOrigin: string,
): string {
  if (!isServiceId(serviceId)) throw new Error('Servicio inválido para enlace de Calendar')
  return appOrigin + '/servicios/' + encodeURIComponent(serviceId) + '/trabajo'
}

export function calendarServiceDescription(
  service: CalendarServiceFields,
  appOrigin: string | null,
): string {
  const details = [
    service.solicitud,
    'Responsable: ' + service.responsable.nombreCompleto,
    'Colaboradores: ' + (service.colaboradores.map(person => person.nombreCompleto).join(', ') || 'Sin colaboradores'),
    'Tipo: ' + service.tipoServicio,
  ]
  if (appOrigin) {
    details.push('',
      'Abrir servicio en Soluciones Radicales:',
      calendarServiceLink(service.id, service.tipoServicio, appOrigin),
      'Accede con tu cuenta Google autorizada.')
  }
  return details.join('\n')
}
