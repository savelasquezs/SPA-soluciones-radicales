import PizZip from 'pizzip'
import type { CertificateType } from '../../../../src/types/certificates'
export const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
export function templateFixture(type: CertificateType = 'ESTABLECIMIENTO', extra = '', header = ''): Buffer {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}</Types>`)
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  const text = paragraph(`{{${type === 'ESTABLECIMIENTO' ? 'negocio_nombre' : 'vehiculo_placa'}}}`) + paragraph('{{solicitud}}') + paragraph('{{fecha_expedicion}} — {{fecha_vencimiento}}')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${text}${extra}<w:sectPr>${header ? '<w:headerReference w:type="default" r:id="rId2"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`)
  if (header) {
    zip.file('word/header1.xml', `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(header)}</w:hdr>`)
    zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>')
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
