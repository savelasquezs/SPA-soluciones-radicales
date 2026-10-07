import { ApiError } from './auth'

export interface CalendarEventInput {
  serviceId: string
  eventId?: string | null
  summary: string
  description: string
  location: string
  start: string
  end: string
  attendees?: string[]
  cancelled?: boolean
}
interface Attendee { email: string; responseStatus?: string }
interface ExistingEvent { id?: string; etag?: string; attendees?: Attendee[]; status?: string }
const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

async function request(url: string, headers: Record<string, string>, init: RequestInit = {}): Promise<Response> {
  try { return await fetch(url, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(20_000), redirect: 'error' }) }
  catch { throw new ApiError(502, 'No fue posible comunicarse con Calendar.', 'CALENDAR_UNAVAILABLE') }
}
async function eventJson(response: Response): Promise<ExistingEvent> {
  try { return await response.json() as ExistingEvent }
  catch { throw new ApiError(502, 'Calendar no devolvió un resultado válido.', 'CALENDAR_UNAVAILABLE') }
}

/** One stable company event per service. PATCH preserves unrelated event fields. */
export async function writeCalendarEvent(input: CalendarEventInput, accessToken: string, retry = 0): Promise<string> {
  const id = input.eventId || `sr${input.serviceId.replaceAll('-', '')}`
  const url = `${baseUrl}/${encodeURIComponent(id)}`
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  if (input.cancelled) {
    const deleted = await request(`${url}?sendUpdates=all`, headers, { method: 'DELETE' })
    if (!deleted.ok && deleted.status !== 404 && deleted.status !== 410) throw new ApiError(502, 'No fue posible cancelar el evento de Calendar.', 'CALENDAR_UNAVAILABLE')
    return id
  }

  // Reading the current attendee list preserves existing RSVP values for members
  // who remain assigned. ETags keep a concurrent external edit from being lost.
  const loaded = await request(`${url}?fields=id,etag,status,attendees(email,responseStatus)`, headers)
  const exists = loaded.ok
  if (!exists && loaded.status !== 404) throw new ApiError(502, 'No fue posible consultar el evento de Calendar.', 'CALENDAR_UNAVAILABLE')
  const previous = exists ? await eventJson(loaded) : {}
  if (previous.status === 'cancelled') throw new ApiError(409, 'El evento fue cancelado en Calendar. Revisa la integración antes de sincronizarlo.', 'CALENDAR_CANCELLED_EXTERNALLY')
  const attendees = input.attendees === undefined ? undefined : [...new Set(input.attendees.map(email => email.trim().toLowerCase()).filter(Boolean))].map(email => {
    const old = previous.attendees?.find(value => value.email.toLowerCase() === email)
    return old?.responseStatus ? { email, responseStatus: old.responseStatus } : { email }
  })
  const event = {
    summary: input.summary, description: input.description, location: input.location,
    start: { dateTime: input.start, timeZone: 'America/Bogota' },
    end: { dateTime: input.end, timeZone: 'America/Bogota' },
    ...(attendees === undefined ? {} : { attendees }),
  }
  const result = exists
    ? await request(`${url}?sendUpdates=all`, headers, { method: 'PATCH', headers: previous.etag ? { 'If-Match': previous.etag } : {}, body: JSON.stringify(event) })
    : await request(`${baseUrl}?sendUpdates=all`, headers, { method: 'POST', body: JSON.stringify({ id, ...event }) })
  // A timed-out creation can have succeeded remotely. Reusing the same event ID
  // makes its retry a read + patch, never a second appointment.
  if (!exists && result.status === 409 && retry < 1) {
    return writeCalendarEvent({ ...input, eventId: id }, accessToken, retry + 1)
  }
  if (result.status === 412) throw new ApiError(409, 'El evento cambió en Calendar. Se reintentará sin sobrescribir cambios concurrentes.', 'CALENDAR_VERSION_CONFLICT')
  if (!result.ok) throw new ApiError(502, 'No fue posible guardar el evento de Calendar.', 'CALENDAR_UNAVAILABLE')
  const body = await eventJson(result)
  if (!body.id) throw new ApiError(502, 'Calendar no confirmó el evento.', 'CALENDAR_UNAVAILABLE')
  return body.id
}
