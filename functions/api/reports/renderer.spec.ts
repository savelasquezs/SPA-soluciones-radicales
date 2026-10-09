// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { renderMipReport } from './renderer'
import type { ReportData } from './data'

const fixture:ReportData={
  id:'8c3b08f5-c24b-4028-8585-bc0d7046684a',solicitud:'SR-TEST-001',cliente:'Comercial El Molino',
  nit:'900123456-7',sede:'Central',direccion:'Calle 10 # 15-22',tecnico:'Tecnico Prueba',
  firmanteCliente:'Responsable Cliente',
  firmaTecnico:'services/x/signatures/technician/test.png',firmaCliente:'services/x/signatures/client/test.png',
  inicioProgramado:'2026-10-08T14:00:00Z',inicioReal:'2026-10-08T14:10:00Z',finReal:'2026-10-08T16:10:00Z',
  productos:[{nombre:'Producto A',principio:'Activo 1',registro:'RG-01',lote:'123',dosis:'10 ml',metodos:'Aspersion'}],
  historico:[{solicitud:'SR-TEST-000',fecha:'2026-09-07T17:00:00Z',cumplimiento:67.5,capturas:14},
    {solicitud:'SR-TEST-001',fecha:'2026-10-08T16:10:00Z',cumplimiento:81.25,capturas:3}],
  areas:[
    {id:'a',nombre:'Cocina',sinAcceso:false,motivo:null,fotos:[],
      criterios:Array.from({length:24},(_,i)=>({nombre:'Evaluacion de higiene criterio numero '+i,evaluacion:i%2===0?'C' as const:'CP' as const,observacion:null,fotos:[]})),
      puntos:[{numero:'1',ubicacion:'Pared oeste',tipo:'Trampa adhesiva',estado:'ACTIVO',capturas:[{plagaNombreSnapshot:'Cucaracha',cantidad:3}],observaciones:null,foto:null}],
      hallazgos:[{descripcion:'Falta de limpieza en equipos',recomendacion:'Limpieza profunda',estado:'ABIERTO',responsable:'Encargado',fotos:[]}]},
    {id:'b',nombre:'Exterior',sinAcceso:true,motivo:'Area cerrada',fotos:[],criterios:[],puntos:[],hallazgos:[]},
  ],
}
describe('renderMipReport',()=>{
  it('generates a paginated PDF with historical series and compact grouped photos',async()=>{
    const jpeg=new Uint8Array(await sharp({create:{width:200,height:100,channels:3,background:'#dddddd'}}).jpeg().toBuffer())
    const photos=Array.from({length:9},(_,i)=>({area:i<6?'Cocina':'Exterior',caption:'Evidencia '+(i+1),bytes:jpeg}))
    const bytes=await renderMipReport(fixture,photos,{tecnico:jpeg,cliente:jpeg})
    const loaded=await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBeGreaterThan(3)
    expect(bytes.byteLength).toBeLessThan(15*1024*1024)
    expect(loaded.getTitle()).toContain('SR-TEST-001')
  })
  it('supports a service without photographs',async()=>{
    const jpeg=new Uint8Array(await sharp({create:{width:20,height:20,channels:3,background:'#eeeeee'}}).jpeg().toBuffer())
    const loaded=await PDFDocument.load(await renderMipReport(fixture,[],{tecnico:jpeg,cliente:jpeg}))
    expect(loaded.getPageCount()).toBeGreaterThan(1)
  })
})
