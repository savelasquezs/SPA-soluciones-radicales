// @vitest-environment node
import { describe, it, expect } from 'vitest'
import PizZip from 'pizzip'
import { renderCertificateDocx, sampleCertificateData, validateTemplate } from './docx'
import { paragraph, templateFixture } from './testing/fixture'

const word = (bytes: Uint8Array) => new PizZip(bytes).file('word/document.xml')!.asText()
function changedDocument(text: string): Buffer {
  const zip = new PizZip(templateFixture())
  zip.file('word/document.xml', word(templateFixture()).replace('{{negocio_nombre}}', text))
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
describe('Certificate DOCX catalog and safe rendering', () => {
  it.each(['ESTABLECIMIENTO', 'VEHICULO'] as const)('renders %s without unresolved tags', (type) => {
    const rendered = renderCertificateDocx(templateFixture(type), type, sampleCertificateData(type))
    expect(word(rendered)).toContain('PRUEBA-SIN-VALIDEZ')
    expect(word(rendered)).not.toContain('{{')
  })
  it('joins a Word placeholder split across formatted runs and XML-escapes values', () => {
    const template = changedDocument('{{nego</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>cio_nombre}}')
    const rendered = renderCertificateDocx(template, 'ESTABLECIMIENTO', { ...sampleCertificateData('ESTABLECIMIENTO'), negocio_nombre: 'A & B <prueba>' })
    expect(word(rendered)).toContain('A &amp; B &lt;prueba&gt;')
  })
  it('repeats product paragraphs and removes empty blocks', () => {
    const template = templateFixture('ESTABLECIMIENTO', paragraph('{{#productos}}') + paragraph('{{nombre}} · {{registro_sanitario}}') + paragraph('{{/productos}}'))
    const data = sampleCertificateData('ESTABLECIMIENTO')
    expect(word(renderCertificateDocx(template, 'ESTABLECIMIENTO', data))).toContain('REG-PRUEBA-A')
    expect(word(renderCertificateDocx(template, 'ESTABLECIMIENTO', data))).toContain('REG-PRUEBA-B')
    expect(word(renderCertificateDocx(template, 'ESTABLECIMIENTO', { ...data, productos: [] }))).not.toContain('REG-PRUEBA')
  })
  it.each(['{{desconocida}}', '{{__proto__}}', '{{constructor}}', '{{a + b}}', '{{@raw}}', '{{vehiculo_placa}}'])('rejects unknown/unsafe/type-specific tags %s', (tag) => {
    expect(() => validateTemplate(templateFixture('ESTABLECIMIENTO', paragraph(tag)), 'ESTABLECIMIENTO')).toThrow(/permitida|obligatorias|bloques/)
  })
  it('validates tags in headers too', () => {
    expect(() => validateTemplate(templateFixture('ESTABLECIMIENTO', '', '{{secret}}'), 'ESTABLECIMIENTO')).toThrow('Variable no permitida')
    const rendered = renderCertificateDocx(templateFixture('ESTABLECIMIENTO', '', '{{solicitud}}'), 'ESTABLECIMIENTO', sampleCertificateData('ESTABLECIMIENTO'))
    expect(new PizZip(rendered).file('word/header1.xml')!.asText()).toContain('PRUEBA-SIN-VALIDEZ')
  })
  it.each(['{{#productos}}{{sede_nombre}}{{/productos}}', '{{#productos}}{{#metodos}}{{nombre}}{{/metodos}}{{/productos}}', '{{^productos}}Nada{{/productos}}'])('rejects invalid block nesting/scope %s', (tags) => {
    expect(() => validateTemplate(templateFixture('ESTABLECIMIENTO', paragraph(tags)), 'ESTABLECIMIENTO')).toThrow(/permitid/)
  })
  it('requires all identifying/date fields', () => {
    expect(() => validateTemplate(changedDocument('Nombre fijo'), 'ESTABLECIMIENTO')).toThrow('Faltan variables obligatorias')
  })
  it('rejects external linked images', () => {
    const zip = new PizZip(templateFixture())
    zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="x" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="http://127.0.0.1/secret"/></Relationships>')
    expect(() => validateTemplate(zip.generate({ type: 'nodebuffer' }), 'ESTABLECIMIENTO')).toThrow('contenido activo')
  })
  it.each(['word/vbaProject.bin', 'word/embeddings/oleObject1.bin'])('rejects active package parts %s', (name) => {
    const zip = new PizZip(templateFixture()); zip.file(name, 'active')
    expect(() => validateTemplate(zip.generate({ type: 'nodebuffer' }), 'ESTABLECIMIENTO')).toThrow('contenido activo')
  })
  it('rejects split DDE instructions and simple-field instructions', () => {
    for (const xml of ['<w:p><w:r><w:instrText>D</w:instrText><w:instrText>DEAUTO cmd</w:instrText></w:r></w:p>', '<w:fldSimple w:instr="INCLUDETEXT file:///etc/passwd"/>']) {
      expect(() => validateTemplate(templateFixture('ESTABLECIMIENTO', xml), 'ESTABLECIMIENTO')).toThrow('contenido activo')
    }
  })
  it('rejects forged tiny expansion sizes before an unbounded decompression', () => {
    const zip = new PizZip(templateFixture()); zip.file('word/padding.txt', 'a'.repeat(1_000_000))
    const bytes = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    // Lie about every deflated entry's uncompressed size in its central directory.
    for (let offset = 0; offset < bytes.length - 24; offset++) if (bytes.readUInt32LE(offset) === 0x02014b50) bytes.writeUInt32LE(1, offset + 24)
    expect(() => validateTemplate(bytes, 'ESTABLECIMIENTO')).toThrow('tamaño expandido')
  })
  it('rejects a mislabeled PDF and oversized Word input', () => {
    expect(() => validateTemplate(Buffer.from('%PDF-not-word'), 'ESTABLECIMIENTO')).toThrow('Word no es válido')
    expect(() => validateTemplate(new Uint8Array(10 * 1024 * 1024 + 1), 'ESTABLECIMIENTO')).toThrow('10 MB')
  })
})
