import { describe, expect, it } from 'vitest'
import {
  buildReportTrends, chartX, chartY, safeCaptures, signedTrend, visitDateLabel,
} from '@/helpers/serviceTrends'
import type { ReportHistoricalVisit } from '@/helpers/serviceTrends'

const history: ReportHistoricalVisit[] = [
  { solicitud:'SR-0003',fecha:'2026-10-09T15:00:00.000Z',cumplimiento:80,capturas:2 },
  { solicitud:'SR-0001',fecha:'2026-09-09T15:00:00.000Z',cumplimiento:60,capturas:5 },
  { solicitud:'SR-0002',fecha:'2026-09-23T15:00:00.000Z',cumplimiento:75,capturas:3 },
]

describe('Tendencias imprimibles del informe MIP', () => {
  it('ordena cronológicamente y mantiene solo las seis visitas más recientes', () => {
    const trends = buildReportTrends(history)
    expect(trends.visits.map(v => v.solicitud)).toEqual(['SR-0001','SR-0002','SR-0003'])
    expect(trends.visits.map(v => v.captures)).toEqual([5,3,2])
    expect(trends.maxCaptures).toBe(5)
    expect(trends.complianceChange).toBe(5)
    expect(trends.captureChange).toBe(-1)
    expect(buildReportTrends(Array.from({length:8},(_,i)=>({
      solicitud: 'SR-' + i,fecha:'2026-10-' + String(i+1).padStart(2,'0') + 'T15:00:00.000Z',
      cumplimiento:i*10,capturas:i,
    }))).visits.map(v=>v.solicitud)).toEqual(['SR-2','SR-3','SR-4','SR-5','SR-6','SR-7'])
  })

  it('trata cero capturas como cero real, nunca divide por cero y no crea tendencias con una visita', () => {
    const chart = buildReportTrends([{solicitud:'001',fecha:'2026-10-09T15:00:00Z',cumplimiento:0,capturas:0}])
    expect(chart.visits[0]).toMatchObject({captures:0,capturesY:144,complianceY:144})
    expect(chart.maxCaptures).toBe(1)
    expect(chart.complianceChange).toBeNull()
    expect(chart.captureChange).toBeNull()
    expect(chartX(0,1)).toBe(190)
    expect(chartY(0,1)).toBe(144)
    expect(chartY(1,1)).toBe(34)
  })

  it('no dibuja falsos ceros ni une puntos cuando el cumplimiento no fue evaluado', () => {
    const chart=buildReportTrends([
      {solicitud:'1',fecha:'2026-08-09T15:00:00Z',cumplimiento:45,capturas:7},
      {solicitud:'2',fecha:'2026-09-09T15:00:00Z',cumplimiento:null,capturas:0},
      {solicitud:'3',fecha:'2026-10-09T15:00:00Z',cumplimiento:80,capturas:4},
    ])
    expect(chart.visits.map(v=>v.complianceY)).toEqual([94.5,null,56])
    expect(chart.complianceSegments).toEqual([])
    expect(chart.complianceChange).toBeNull()
    expect(chart.captureChange).toBe(4)
  })

  it('indica variaciones reales con unidades correctas y formatea fechas de Colombia', () => {
    expect(signedTrend(5, 'pp')).toBe('+5 pp')
    expect(signedTrend(-1,'capturas')).toBe('-1 captura')
    expect(signedTrend(0,'capturas')).toBe('0 capturas')
    expect(signedTrend(null,'pp')).toBe('Sin comparación anterior')
    expect(visitDateLabel('2026-10-09T15:00:00Z')).toContain('09')
    expect(safeCaptures(-3)).toBe(0)
    expect(safeCaptures(Number.NaN)).toBe(0)
  })
})
