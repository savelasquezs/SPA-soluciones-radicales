import { describe, expect, it } from 'vitest'
import {
  reportVisitAxisLabels, reportCategoryTotals, reportPestColor,
  reportCapturePlaces, reportDelta, readableCaptureDelta,
} from '@/helpers/reportCharts'
import type { ReportHistoricalVisit } from '@/types/serviceResults'

const make=(overrides:Partial<ReportHistoricalVisit>={}):ReportHistoricalVisit=>({
  solicitud:'001',fecha:'2026-10-09T15:00:00Z',cumplimiento:75,capturas:6,
  puestosRevisados:{voladores:1,rastreros:1},
  especies:[
    {plagaCodigo:'MOSCA_DOMESTICA',plagaNombreSnapshot:'Mosca doméstica',clasificacion:'VOLADORES',cantidad:4},
    {plagaCodigo:'CUCARACHA',plagaNombreSnapshot:'Cucaracha',clasificacion:'RASTREROS',cantidad:2},
  ],
  detallesCapturas:[
    {plagaCodigo:'MOSCA_DOMESTICA',plagaNombreSnapshot:'Mosca doméstica',clasificacion:'VOLADORES',cantidad:3,
      area:'Cocina',puesto:'UV-1',ubicacion:'Entrada'},
    {plagaCodigo:'MOSCA_DOMESTICA',plagaNombreSnapshot:'Mosca doméstica',clasificacion:'VOLADORES',cantidad:1,
      area:'Bodega',puesto:'UV-2',ubicacion:'Pasillo'},
    {plagaCodigo:'CUCARACHA',plagaNombreSnapshot:'Cucaracha',clasificacion:'RASTREROS',cantidad:2,
      area:'Baño',puesto:'A-1',ubicacion:'Desagüe'},
  ],...overrides,
})

describe('Gráficos históricos del informe',()=>{
  it('identifica meses separados, varias visitas del mes y horas del mismo día en Bogotá',()=>{
    expect(reportVisitAxisLabels([
      {fecha:'2026-06-04T15:00:00Z'},{fecha:'2026-09-04T15:00:00Z'},
    ])).toEqual(['jun 2026','sept 2026'])
    expect(reportVisitAxisLabels([
      {fecha:'2026-10-08T15:00:00Z'},{fecha:'2026-10-09T15:00:00Z'},
    ])).toEqual(['08 oct','09 oct'])
    expect(reportVisitAxisLabels([
      {fecha:'2026-10-10T02:23:00Z'},{fecha:'2026-10-10T02:32:00Z'},
    ])).toEqual(['21:23','21:32'])
  })
  it('conserva colores estables por especie incluso al agregar más especies',()=>{
    expect(reportPestColor('MOSCA_DOMESTICA')).toBe(reportPestColor('MOSCA_DOMESTICA'))
    expect(reportPestColor('CUCARACHA')).not.toBe(reportPestColor('HORMIGA'))
    expect(reportPestColor('NUEVA_PLAGA')).toBe(reportPestColor('NUEVA_PLAGA'))
  })
  it('diferencia cero capturas con puestos revisados de ausencia de monitoreo',()=>{
    expect(reportCategoryTotals(make())).toEqual({voladores:4,rastreros:2})
    expect(reportCategoryTotals(make({puestosRevisados:{voladores:1,rastreros:0},
      especies:[]}))).toEqual({voladores:0,rastreros:null})
    expect(reportCategoryTotals(make({puestosRevisados:{voladores:0,rastreros:0}})))
      .toEqual({voladores:null,rastreros:null})
    expect(reportDelta(0,4)).toBe(-4)
    expect(reportDelta(null,4)).toBeNull()
  })
  it('devuelve el desglose por lugar y especie sin información ajena',()=>{
    const visit=make()
    expect(reportCapturePlaces(visit,'VOLADORES','MOSCA_DOMESTICA'))
      .map(place=>[place.area,place.puesto,place.ubicacion,place.cantidad]))
      .toEqual([['Bodega','UV-2','Pasillo',1],['Cocina','UV-1','Entrada',3]])
    expect(reportCapturePlaces(visit,'RASTREROS').map(place=>place.area)).toEqual(['Baño'])
    expect(reportCapturePlaces(make({detallesCapturas:undefined}),'VOLADORES')).toEqual([])
  })
  it('explica la variación sin inventar estimaciones',()=>{
    expect(readableCaptureDelta(2)).toContain('más que')
    expect(readableCaptureDelta(-2)).toContain('menos que')
    expect(readableCaptureDelta(0)).toContain('Igual')
    expect(readableCaptureDelta(null)).toContain('Sin visita anterior')
  })
})
