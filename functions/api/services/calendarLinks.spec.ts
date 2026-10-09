// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { AdminService } from '../../../src/types/adminServices'
import {
  resolveCalendarAppOrigin, calendarServiceLink, calendarServiceDescription,
} from './calendarLinks'

const id='10000000-0000-4000-8000-000000000001'
const dev='https://develop-soluciones-radicales.solucionesradicales1.workers.dev'
const prod='https://soluciones-radicales.solucionesradicales1.workers.dev'
const preview='https://9c9019ff-soluciones-radicales.solucionesradicales1.workers.dev'
const service = {
  id,solicitud:'SR-0042',tipoServicio:'PRINCIPAL',
  responsable:{ nombreCompleto:'Técnico Laura' },
  colaboradores:[{ nombreCompleto:'Técnico José' }],
} as Pick<AdminService,'id'|'solicitud'|'tipoServicio'|'responsable'|'colaboradores'>

describe('Enlace de servicio en Google Calendar', () => {
  it('selecciona solamente una URL estable de SPA autorizada, no un preview ni una API', () => {
    expect(resolveCalendarAppOrigin('http://localhost:5173,'+dev+','+preview)).toBe(dev)
    expect(resolveCalendarAppOrigin(preview)).toBeNull()
    expect(resolveCalendarAppOrigin(prod)).toBe(prod)
    expect(resolveCalendarAppOrigin(dev+','+prod)).toBeNull()
    expect(resolveCalendarAppOrigin('http://localhost:5173')).toBeNull()
  })

  it('admite un dominio corporativo explícito solo si corresponde a la allowlist HTTPS', () => {
    const custom='https://app.solucionesradicales.co'
    expect(resolveCalendarAppOrigin(custom+','+dev,custom)).toBe(custom)
    expect(() => resolveCalendarAppOrigin(dev,'https://phishing.example')).toThrow('ALLOWED_ORIGINS')
    expect(() => resolveCalendarAppOrigin(dev,'https://develop-soluciones-radicales.solucionesradicales1.workers.dev/servicios')).toThrow('ALLOWED_ORIGINS')
    expect(() => resolveCalendarAppOrigin(dev,'http://phishing.example')).toThrow('ALLOWED_ORIGINS')
    expect(resolveCalendarAppOrigin('http://localhost:5173','http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('construye la URL exacta de ejecución técnica para un servicio principal', () => {
    expect(calendarServiceLink(id,'PRINCIPAL',dev)).toBe(dev+'/servicios/'+id+'/trabajo')
    expect(() => calendarServiceLink('id-malicioso?x=1','PRINCIPAL',dev)).toThrow('inválido')
    const description=calendarServiceDescription(service,dev)
    expect(description).toContain('SR-0042')
    expect(description).toContain('Responsable: Técnico Laura')
    expect(description).toContain('Colaboradores: Técnico José')
    expect(description).toContain('Abrir servicio en Soluciones Radicales:')
    expect(description).toContain(dev+'/servicios/'+id+'/trabajo')
    expect(description).toContain('Accede con tu cuenta Google autorizada')
  })

  it('envía al listado cuando el servicio es Refuerzo (aún no ejecutable en el módulo técnico)', () => {
    const reinforcement = { ...service,tipoServicio:'REFUERZO' } as typeof service
    expect(calendarServiceLink(id,'REFUERZO',dev)).toBe(dev+'/servicios')
    const description=calendarServiceDescription(reinforcement,dev)
    expect(description).toContain('Ver mis servicios en Soluciones Radicales:')
    expect(description).not.toContain('/trabajo')
  })

  it('no bloquea la cita ni inventa enlaces cuando el dominio no está configurado', () => {
    const description=calendarServiceDescription(service,null)
    expect(description).toContain('SR-0042')
    expect(description).toContain('Responsable: Técnico Laura')
    expect(description).not.toContain('https://')
  })
})
