import { describe, expect, it } from 'vitest'
import { areaCompliance, reportCompliance, reportEvidence, reportMetrics, scoreText, elapsedMinutes } from '@/helpers/serviceReport'
import type { ServiceResultsData } from '@/types/serviceResults'

const id = '10000000-0000-4000-8000-000000000001'
const path = (kind: string) => 'services/' + id + '/' + kind
const make = (): ServiceResultsData => ({
  id, solicitud: 'SR-0003', cliente: 'Empresa', nit: '9001', sede: 'Principal', direccion: 'Calle 1', tecnico: 'Técnico',
  firmanteCliente: 'Cliente', firmaTecnico: path('signatures/technician/t.png'), firmaCliente: path('signatures/client/c.png'),
  inicioProgramado: '2026-10-09T13:00:00.000Z', inicioReal: '2026-10-09T13:00:00.000Z', finReal: '2026-10-09T15:00:00.000Z',
  productos: [], historico: [],
  areas: [
    { id: 'area-1', nombre: 'Cocina', sinAcceso: false, motivo: null, fotos: [],
      criterios: [
        { nombre: 'Limpieza', evaluacion: 'C', observacion: null, fotos: [path('criteria/crit-1/p1.png')] },
        { nombre: 'Control', evaluacion: 'CP', observacion: 'Se recomienda corregir', fotos: [] },
        { nombre: 'Anexo', evaluacion: 'NA', observacion: null, fotos: [] },
      ],
      puntos: [{ numero: '01', ubicacion: 'Puerta', tipo: 'Trampa', estado: 'BUENO', capturas: [{ plagaNombreSnapshot: 'Moscas', cantidad: 3 }], observaciones: null, foto: path('devices/review/p2.png') }],
      hallazgos: [{ descripcion: 'Hallazgo', recomendacion: 'Corregir', estado: 'ABIERTO', responsable: 'Cliente', fotos: [path('findings/opening/p3.png')] }],
    },
    { id: 'area-2', nombre: 'Bodega', sinAcceso: true, motivo: 'Cerrada', fotos: [path('areas/no-access/p4.png')],
      criterios: [{ nombre: 'Ignorar', evaluacion: 'NC', observacion: null, fotos: [] }], puntos: [], hallazgos: [] },
  ],
})

describe('Informe administrativo MIP', () => {
  it('excluye NA y áreas sin acceso del cumplimiento, sin alterar snapshots', () => {
    const data = make()
    expect(areaCompliance(data.areas[0]!)).toBe(75)
    expect(areaCompliance(data.areas[1]!)).toBeNull()
    expect(reportCompliance(data.areas)).toBe(75)
    expect(scoreText(75.5)).toBe('75,5 %')
  })
  it('diferencia ausencia de evaluaciones y cero real', () => {
    const area = make().areas[0]!
    expect(areaCompliance({ ...area, criterios: [] })).toBeNull()
    expect(areaCompliance({ ...area, criterios: [{ nombre:'A', evaluacion:'NC', observacion:null, fotos:[] }] })).toBe(0)
    expect(scoreText(null)).toBe('—')
  })
  it('contabiliza hallazgos, áreas, puestos y capturas', () => {
    expect(reportMetrics(make())).toMatchObject({ compliance:75, areasReviewed:1, areasWithoutAccess:1, monitoringPoints:1, captures:3, findings:1, criteriaReviewed:3 })
    expect(elapsedMinutes('2026-10-09T13:00:00.000Z','2026-10-09T15:00:00.000Z')).toBe(120)
  })
  it('incluye ambas firmas e imágenes contextualizadas sin duplicados', () => {
    const data = make()
    data.areas[0]!.criterios[1]!.fotos.push(data.firmaTecnico)
    const items = reportEvidence(data)
    expect(items.map(item => item.path)).toEqual([
      path('criteria/crit-1/p1.png'),data.firmaTecnico,path('devices/review/p2.png'),
      path('findings/opening/p3.png'),path('areas/no-access/p4.png'),data.firmaCliente,
    ])
    expect(items.find(item=>item.path===data.firmaCliente)?.caption).toContain('Firma de conformidad')
  })
})
