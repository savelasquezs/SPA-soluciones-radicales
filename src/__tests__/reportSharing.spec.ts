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
  it('habilita evidencias históricas del hallazgo sin autorizar fotos arbitrarias de otros servicios', () => {
    const historicId = '20000000-0000-4000-8000-000000000020'
    const findingId = '30000000-0000-4000-8000-000000000030'
    const opening = 'services/' + historicId + '/findings/' + findingId + '/opening/old.webp'
    const followup = 'services/' + serviceId + '/findings/' + findingId + '/followup/new.webp'
    const unrelated = 'services/' + historicId + '/criteria/criterion/evidence.webp'
    const finding = {descripcion:'Pendiente',recomendacion:'Corregir',estado:'ABIERTO' as const,
      responsable:'Cliente',fotos:[opening,unrelated],fechaApertura:'2026-09-01T00:00:00Z',
      solicitudApertura:'SR-0009',anterior:true,visitasDesdeApertura:2,
      seguimientos:[{solicitud:'SR-0010',fecha:source.finReal,resultado:'SIN_CAMBIOS' as const,observacion:null,fotos:[followup]}]}
    const data:ServiceResultsData={...source,areas:[{...source.areas[0]!,hallazgos:[finding]}]}
    const paths=reportPaths(data)
    expect(paths).toContain(opening)
    expect(paths).toContain(followup)
    expect(paths).not.toContain(unrelated)
    const publicData=publicReportData(data)
    expect(publicData.areas[0]!.hallazgos[0]!.fotos).toHaveLength(1)
    expect(publicData.areas[0]!.hallazgos[0]!.seguimientos[0]!.fotos[0]).toMatch(/^e:/)
    expect(JSON.stringify(publicData)).not.toContain(historicId)
    expect(JSON.stringify(publicData)).not.toContain('/findings/')
  })
})
