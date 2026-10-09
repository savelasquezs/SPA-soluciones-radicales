// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminService } from '../../../src/types/adminServices'
import type { CalendarEventInput } from '../calendarClient'

const state = vi.hoisted(() => ({
  query: vi.fn<(sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>>(),
  calendar: vi.fn<(event: CalendarEventInput) => Promise<string>>(),
  snapshot: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('@neon/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('../db', () => ({
  transaction: (work: (client: { query: typeof state.query }) => Promise<unknown>) => work({ query: state.query }),
}))
vi.mock('../google', () => ({
  upsertCalendarEvent: state.calendar,
  sendGmailMessage: vi.fn(),
}))
vi.mock('./queries', () => ({ getCalendarSnapshot: state.snapshot }))
vi.mock('./commands', () => ({ audit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }))

import { drainServiceJobs } from './jobs'

const id='10000000-0000-4000-8000-000000000001'
const actor='10000000-0000-4000-8000-000000000002'
const stable='https://develop-soluciones-radicales.solucionesradicales1.workers.dev'
const technician={nombreCompleto:'Técnico Laura',correoGoogle:'tecnico@example.test'}
const initialService = {
  id, solicitud:'SR-0042',tipoServicio:'PRINCIPAL',clienteNombre:'Casa Verde',
  sedeNombre:'Laureles',responsable:technician,colaboradores:[],
  direccion:'Calle 10, Medellín',inicioProgramado:'2026-10-09T14:00:00Z',
  finProgramado:'2026-10-09T16:00:00Z',estado:'PROGRAMADO',
  calendar:{estado:'PENDIENTE'},
} as AdminService

beforeEach(() => {
  state.query.mockReset()
  state.calendar.mockReset().mockResolvedValue('sr' + id.replaceAll('-',''))
  state.snapshot.mockReset().mockResolvedValue({
    record:initialService,calendar_revision:'1',calendar_event_id:null,
  })
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes('select id,job_type,attempts,payload from private.integration_jobs')) {
      return { rows:[{
        id:'10000000-0000-4000-8000-000000000003',
        job_type:'CALENDAR',attempts:0,payload:{
          scope:'ADMIN_SERVICES',actorId:actor,serviceId:id,revision:1,
        },
      }],rowCount:1 }
    }
    if (sql.includes('pg_try_advisory_xact_lock')) return { rows:[{locked:true}],rowCount:1 }
    if (sql.includes('update public.servicios set calendar_event_id')) return { rows:[{id}],rowCount:1 }
    return { rows:[],rowCount:1 }
  })
  vi.stubEnv('ALLOWED_ORIGINS','http://localhost:5173,'+stable)
  vi.stubEnv('CALENDAR_APP_ORIGIN','')
})

afterEach(() => vi.unstubAllEnvs())

describe('Calendar scheduled delivery with a direct service link',()=>{
  it('puts a direct technician route in the event description without changing other fields', async () => {
    expect(await drainServiceJobs(1)).toEqual({processed:1})
    expect(state.calendar).toHaveBeenCalledOnce()
    const arg=state.calendar.mock.calls[0]?.[0]
    expect(arg).toMatchObject({
      serviceId:id,summary:'MIP · Casa Verde · Laureles',location:'Calle 10, Medellín',
      start:'2026-10-09T14:00:00Z',end:'2026-10-09T16:00:00Z',
      attendees:['tecnico@example.test'],cancelled:false,eventId:null,
    })
    expect(arg.description).toContain('Abrir servicio en Soluciones Radicales:')
    expect(arg.description).toContain(stable+'/servicios/'+id+'/trabajo')
    expect(arg.description).toContain('SR-0042')
  })
})
