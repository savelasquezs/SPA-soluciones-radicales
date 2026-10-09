import { describe, expect, it } from 'vitest'
import { newReportToken, reportTokenHash, publicReportData, reportPaths, validReportToken } from '../../functions/api/service-results/public'
import type { ServiceResultsData } from '@/types/serviceResults'

const serviceId = '10000000-0000-4000-8000-000000000010'
const image = 'services/' + serviceId + '/criteria/a/photo.png'
const techSign = 'services/' + serviceId + '/signatures/technician/tech.png'
const clientSign = 'services/' + serviceId + '/signatures/client/client.png'
const source: ServiceResultsData = {
  id:serviceId,solicitud:'SR-0010',cliente:'Cliente',nit:'NIT',sede:'Principal',direccion:'Dirección',
  tecnico:'Técnico',firmanteCliente:'Cliente',firmaTecnico:techSign,firmaCliente:clientSign,
  inicioProgramado:'2026-10-01T15:00:00Z',inicioReal:'2026-10-01T15:00:00Z',finReal:'2026-10-01T16:00:00Z',
  productos:[],historico:[],
  areas:[{id:'another-sensitive-uuid',nombre:'Bodega',sinAcceso:false,motivo:null,fotos:[],
    criterios:[{nombre:'Orden',evaluacion:'C',observacion:null,fotos:[image,image]}],
    puntos:[],hallazgos:[]}],
}
describe('Enlace público del informe', () => {
  it('genera tokens de 256 bits aleatorios y solo persiste su hash', () => {
    const token = newReportToken()
    const next = newReportToken()
    expect(validReportToken(token)).toBe(true)
    expect(validReportToken(next)).toBe(true)
    expect(next).not.toBe(token)
    expect(reportTokenHash(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(reportTokenHash(token)).not.toContain(token)
    expect(validReportToken('abc')).toBe(false)
  })
  it('expone referencias opacas sin publicar rutas privadas ni IDs de la base', () => {
    const publicData = publicReportData(source)
    expect(reportPaths(source)).toEqual([image, techSign, clientSign])
    expect(publicData.id).toBe('public')
    expect(publicData.areas[0]!.id).toBe('1')
    expect(publicData.firmaTecnico).toBe('e:1')
    expect(publicData.firmaCliente).toBe('e:2')
    expect(publicData.areas[0]!.criterios[0]!.fotos).toEqual(['e:0','e:0'])
    expect(JSON.stringify(publicData)).not.toContain('services/')
    expect(JSON.stringify(publicData)).not.toContain(serviceId)
  })
  it('nunca incluye rutas de evidencia ajena al servicio', () => {
    const invalid = 'services/00000000-0000-4000-8000-000000000011/other.jpg'
    const data = { ...source, areas:[{...source.areas[0]!,fotos:[invalid]}] }
    expect(reportPaths(data)).not.toContain(invalid)
    expect(publicReportData(data).areas[0]!.fotos).toEqual([])
  })
})
