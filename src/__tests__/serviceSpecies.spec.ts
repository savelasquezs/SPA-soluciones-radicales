import { describe, expect, it } from 'vitest'
import { buildSpeciesCharts, buildCapturePointSummary, SPECIES_CHART } from '@/helpers/serviceSpecies'
import type { ReportHistoricalVisit, ServiceAreaResult } from '@/types/serviceResults'

const historical:ReportHistoricalVisit[]=[
  {solicitud:'003',fecha:'2026-10-09T15:00:00Z',cumplimiento:80,capturas:2,
    puestosRevisados:{rastreros:1,voladores:1},
    especies:[{plagaCodigo:'MOSCA',plagaNombreSnapshot:'Moscas',clasificacion:'VOLADORES',cantidad:2}]},
  {solicitud:'001',fecha:'2026-09-09T15:00:00Z',cumplimiento:60,capturas:6,
    puestosRevisados:{rastreros:2,voladores:1},
    especies:[
      {plagaCodigo:'CUCARACHA',plagaNombreSnapshot:'Cucarachas',clasificacion:'RASTREROS',cantidad:2},
      {plagaCodigo:'CUCARACHA',plagaNombreSnapshot:'Cucarachas',clasificacion:'RASTREROS',cantidad:1},
      {plagaCodigo:'RATON',plagaNombreSnapshot:'Ratones',clasificacion:'RASTREROS',cantidad:2},
      {plagaCodigo:'MOSCA',plagaNombreSnapshot:'Moscas',clasificacion:'VOLADORES',cantidad:1},
    ]},
  {solicitud:'002',fecha:'2026-09-23T15:00:00Z',cumplimiento:75,capturas:0,
    puestosRevisados:{rastreros:0,voladores:1},especies:[]},
]

describe('Desglose histórico de capturas por especie',()=>{
  it('agrupa por especie y fecha, conserva el orden de visitas y separa categorías',()=>{
    const charts=buildSpeciesCharts(historical)
    expect(charts[0]!.classification).toBe('VOLADORES')
    expect(charts[1]!.classification).toBe('RASTREROS')
    expect(charts[1]!.species.map(p=>p.name)).toEqual(['Cucarachas','Ratones'])
    expect(charts[1]!.visits.map(v=>v.solicitud)).toEqual(['001','002','003'])
    expect(charts[1]!.visits[0]!.total).toBe(5)
    expect(charts[1]!.visits[0]!.bars.map(b=>b.count)).toEqual([3,2])
    expect(charts[0]!.visits[0]!.total).toBe(1)
    expect(charts[0]!.visits[2]!.total).toBe(2)
  })
  it('no convierte una visita sin monitoreo en cero capturas',()=>{
    const [flyers,crawlers]=buildSpeciesCharts(historical)
    expect(flyers!.visits[1]).toMatchObject({hasMonitoring:true,total:0})
    expect(crawlers!.visits[1]).toMatchObject({hasMonitoring:false,total:0})
    expect(crawlers!.visits[2]).toMatchObject({hasMonitoring:true,total:0})
    expect(crawlers!.max).toBeGreaterThanOrEqual(3)
    expect(crawlers!.visits[0]!.bars[0]!.height).toBeGreaterThan(0)
    expect(crawlers!.visits[2]!.bars[0]!.y).toBe(SPECIES_CHART.bottom)
  })
  it('conserva el historial cuando no hubo capturas y limita las visitas a seis',()=>{
    const noCaptures=buildSpeciesCharts([
      {solicitud:'001',fecha:'2026-10-09T15:00:00Z',cumplimiento:null,capturas:0,
        puestosRevisados:{rastreros:1,voladores:0},especies:[]},
    ])
    expect(noCaptures[1]).toMatchObject({hasHistory:true,hasMonitoring:true,species:[]})
    expect(noCaptures[0]).toMatchObject({hasHistory:true,hasMonitoring:false})
    expect(buildSpeciesCharts([])[0]!.hasHistory).toBe(false)
    const many=Array.from({length:8},(_,index)=>({
      solicitud:String(index),fecha:'2026-10-'+String(index+1).padStart(2,'0')+'T15:00:00Z',
      cumplimiento:null,capturas:0,
    }))
    expect(buildSpeciesCharts(many)[0]!.visits.map(v=>v.solicitud)).toEqual(['2','3','4','5','6','7'])
  })
})

describe('Detalle compacto de puestos en la visita',()=>{
  const point=(numero:string,capturas:ServiceAreaResult['puntos'][number]['capturas'],
    extra:Partial<ServiceAreaResult['puntos'][number]>={})=>({
      numero,ubicacion:'Entrada',tipo:'Trampa adhesiva',estado:'ACTIVO',capturas,observaciones:null,foto:null,...extra,
    })
  const areas:ServiceAreaResult[]=[
    {id:'1',nombre:'Cocina',sinAcceso:false,motivo:null,fotos:[],criterios:[],hallazgos:[],puntos:[
      point('01',[{plagaNombreSnapshot:'Cucarachas',cantidad:2},{plagaNombreSnapshot:'Ratones',cantidad:1}]),
      point('02',[]),point('03',[],{estado:'DANADO',observaciones:'Cambiar',foto:'e:1'}),
      point('04',[],{estado:null}),
    ]},
    {id:'2',nombre:'Cerrada',sinAcceso:true,motivo:null,fotos:[],criterios:[],hallazgos:[],puntos:[
      point('05',[{plagaNombreSnapshot:'Cucarachas',cantidad:100}]),
    ]},
  ]
  it('muestra solo puestos con capturas, cuenta los ceros reales y conserva observaciones/fotos',()=>{
    const summary=buildCapturePointSummary(areas)
    expect(summary).toMatchObject({total:3,reviewed:3,captured:1,withoutCaptures:2,withoutReview:1})
    expect(summary.rows.map(row=>[row.numero,row.area])).toEqual([['01','Cocina']])
    expect(summary.attention.map(row=>row.numero)).toEqual(['03'])
    expect(summary.attention[0]).toMatchObject({estado:'DANADO',observaciones:'Cambiar',foto:'e:1'})
  })
})
