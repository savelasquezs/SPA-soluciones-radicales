// @vitest-environment node
import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import sharp from 'sharp'
import { renderMipReportDocx } from './docx'
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
describe('MIP Word report for shared Google Drive conversion', () => {
  it('builds a valid DOCX with history, service records, three-column photographic evidence and both signatures', async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 200, height: 100, channels: 3, background: '#dddddd' } }).jpeg().toBuffer())
    const photos = Array.from({ length: 9 }, (_, i) => ({ area: i < 6 ? 'Cocina' : 'Exterior', caption: 'Evidencia ' + (i + 1), bytes: jpeg }))
    const bytes = renderMipReportDocx(fixture, photos, { tecnico: jpeg, cliente: jpeg })
    const doc = new PizZip(bytes)
    const xml = doc.file('word/document.xml')!.asText()
    const relationships = doc.file('word/_rels/document.xml.rels')!.asText()
    expect(xml).toContain('INFORME TÉCNICO DEL SERVICIO')
    expect(xml).toContain('SR-TEST-001')
    expect(xml).toContain('Evolución histórica de esta sede'.toUpperCase())
    expect(xml).toContain('Falta de limpieza en equipos')
    expect(xml).toContain('Responsable Cliente')
    expect(xml).toContain('w:tbl')
    expect((xml.match(/<wp:inline/g) ?? [])).toHaveLength(11)
    expect((relationships.match(/Type="[^"]*\/image"/g) ?? [])).toHaveLength(11)
    expect(Object.keys(doc.files).filter(path => path.startsWith('word/media/') && path.endsWith('.jpg'))).toHaveLength(11)
    expect(bytes.length).toBeLessThan(15 * 1024 * 1024)
  })

  it('supports reports without photographs and escapes dangerous XML text', async () => {
    const jpeg = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: '#eeeeee' } }).jpeg().toBuffer())
    const doc = new PizZip(renderMipReportDocx({ ...fixture, cliente: 'A & B <C>' }, [], { tecnico: jpeg, cliente: jpeg }))
    const xml = doc.file('word/document.xml')!.asText()
    expect(xml).toContain('A &amp; B &lt;C&gt;')
    expect(xml).toContain('No se asociaron fotografías')
    expect((xml.match(/<wp:inline/g) ?? [])).toHaveLength(2)
  })
})
