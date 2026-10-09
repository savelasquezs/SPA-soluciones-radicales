import PizZip from 'pizzip'
import type { ReportData } from './data'

/**
 * Build the Word source document. Google Drive owns PDF layout/conversion;
 * there is intentionally no second PDF renderer or pagination engine.
 */
export interface ReportPhoto { area: string; caption: string; bytes: Uint8Array }

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const DRAW_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const PICTURE_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const escapeXml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ESC[char]!)
  .replace(/\p{Cc}/gu, ' ')
const clean = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()
const date = (value: string): string => new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(value))
const time = (value: string): string => new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true,
}).format(new Date(value))
const number = (value: number): string => new Intl.NumberFormat('es-CO').format(value)
const percent = (value: number | null): string => value === null
  ? 'Sin datos' : value.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %'

function paragraph(value: unknown, options: { bold?: boolean; size?: number; color?: string; before?: number; after?: number } = {}): string {
  const text = clean(value) || '—'
  const size = Math.round((options.size ?? 9) * 2)
  return '<w:p><w:pPr><w:spacing w:before="' + (options.before ?? 0) + '" w:after="' + (options.after ?? 80) + '"/></w:pPr>'
    + '<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/>'
    + (options.bold ? '<w:b/>' : '') + '<w:sz w:val="' + size + '"/>'
    + '<w:color w:val="' + (options.color ?? '243747') + '"/></w:rPr><w:t xml:space="preserve">'
    + escapeXml(text) + '</w:t></w:r></w:p>'
}

const heading = (label: string): string => paragraph(label.toUpperCase(), {
  bold: true, size: 11, color: '193B63', before: 230, after: 125,
})
const detail = (label: string, value: unknown): string => paragraph(label + ': ' + (clean(value) || '—'), { after: 70 })
const cell = (content: string, width = 3150): string =>
  '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/></w:tcPr>' + content + '</w:tc>'
const table = (rows: string[][], widths?: number[]): string => {
  if (!rows.length) return ''
  const cols = widths ?? Array(rows[0]!.length).fill(3150)
  const grid = cols.map((width) => '<w:gridCol w:w="' + width + '"/>').join('')
  return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
    + '<w:bottom w:val="single" w:sz="4" w:color="DDE4E9"/>'
    + '</w:tblBorders></w:tblPr><w:tblGrid>' + grid + '</w:tblGrid>'
    + rows.map((row) => '<w:tr>' + row.map((item, index) => cell(item || paragraph(' '), cols[index])).join('') + '</w:tr>').join('')
    + '</w:tbl>'
}

/** Read the JPEG SOF dimensions without loading an image codec in the document builder. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('La evidencia debe estar codificada en JPEG')
  for (let at = 2; at + 8 < bytes.length;) {
    if (bytes[at++] !== 0xff) break
    const marker = bytes[at++]!
    if (marker === 0xd9 || marker === 0xda) break
    if (marker >= 0xd0 && marker <= 0xd7) continue
    const length = (bytes[at]! << 8) + bytes[at + 1]!
    if (length < 2 || at + length > bytes.length) break
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb].includes(marker)) {
      const height = (bytes[at + 3]! << 8) + bytes[at + 4]!
      const width = (bytes[at + 5]! << 8) + bytes[at + 6]!
      if (!width || !height) break
      return { width, height }
    }
    at += length
  }
  throw new Error('No fue posible leer las dimensiones de la evidencia')
}

export function renderMipReportDocx(
  input: ReportData, photos: ReportPhoto[],
  signatures: { tecnico: Uint8Array; cliente: Uint8Array },
): Buffer {
  const zip = new PizZip()
  const relationships: string[] = []
  let pictureId = 0
  function image(bytes: Uint8Array, maxWidth: number, maxHeight: number): string {
    const original = jpegSize(bytes)
    pictureId += 1
    const relation = 'rId' + pictureId
    zip.file('word/media/image' + pictureId + '.jpg', bytes)
    relationships.push('<Relationship Id="' + relation + '" Type="' + REL_NS + '/image" Target="media/image' + pictureId + '.jpg"/>')
    const scale = Math.min(maxWidth / original.width, maxHeight / original.height)
    const cx = Math.round(original.width * scale)
    const cy = Math.round(original.height * scale)
    const name = 'Evidencia ' + pictureId
    const drawing = '<wp:inline distT="0" distB="0" distL="0" distR="0">'
      + '<wp:extent cx="' + cx + '" cy="' + cy + '"/>'
      + '<wp:docPr id="' + pictureId + '" name="' + name + '"/>'
      + '<a:graphic><a:graphicData uri="' + PICTURE_NS + '">'
      + '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + pictureId + '" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="' + relation + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
      + '</a:graphicData></a:graphic></wp:inline>'
    return '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:drawing>' + drawing + '</w:drawing></w:r></w:p>'
  }

  const paragraphs: string[] = [
    paragraph('SOLUCIONES RADICALES · MANEJO INTEGRADO DE PLAGAS', { size: 10, bold: true, color: '37669B', after: 75 }),
    paragraph('INFORME TÉCNICO DEL SERVICIO', { size: 18, bold: true, color: '192E4A', after: 65 }),
    paragraph(input.solicitud, { size: 12, bold: true, color: '37669B', after: 200 }),
    detail('Cliente', input.cliente), detail('NIT', input.nit), detail('Sede', input.sede),
    detail('Dirección', input.direccion), detail('Técnico responsable', input.tecnico),
    detail('Fecha programada', date(input.inicioProgramado)),
    detail('Ejecución real', date(input.inicioReal) + ' · ' + time(input.inicioReal) + ' – ' + time(input.finReal)),
  ]
  const accessible = input.areas.filter((area) => !area.sinAcceso)
  const findings = input.areas.reduce((total, area) => total + area.hallazgos.length, 0)
  const points = input.areas.reduce((total, area) => total + area.puntos.length, 0)
  const captures = input.areas.flatMap((area) => area.puntos).flatMap((point) => point.capturas)
    .reduce((total, capture) => total + capture.cantidad, 0)
  const current = input.historico.find((record) => record.solicitud === input.solicitud)
  paragraphs.push(heading('Resultados generales'))
  paragraphs.push(table([[
    paragraph('Cumplimiento: ' + percent(current?.cumplimiento ?? null), { bold: true }),
    paragraph('Áreas: ' + accessible.length + ' / ' + input.areas.length, { bold: true }),
    paragraph('Puestos: ' + points, { bold: true }),
    paragraph('Hallazgos: ' + findings, { bold: true }),
  ]], [2400, 2300, 2300, 2300]))
  paragraphs.push(detail('Capturas de esta visita', number(captures)))
  paragraphs.push(paragraph('Los conteos de capturas no permiten comparar tipos de trampas distintos.', { size: 8, color: '677A88' }))
  if (input.areas.some((area) => area.sinAcceso)) {
    paragraphs.push(detail('Áreas sin acceso (excluidas del cumplimiento)',
      input.areas.filter((area) => area.sinAcceso).map((area) => area.nombre).join(', ')))
  }

  paragraphs.push(heading('Evolución histórica de esta sede'))
  if (!input.historico.length) paragraphs.push(paragraph('Sin visitas comparables'))
  else paragraphs.push(table([
    ['Servicio', 'Fecha', 'Cumplimiento', 'Capturas'].map((value) => paragraph(value, { bold: true })),
    ...input.historico.map((entry) => [
      paragraph(entry.solicitud), paragraph(date(entry.fecha)),
      paragraph(percent(entry.cumplimiento)), paragraph(number(entry.capturas)),
    ]),
  ], [2600, 2200, 2400, 2200]))
  paragraphs.push(paragraph('Cumplimiento: C=100 %, CP=50 %, NC=0 %, NA excluido. No se cuentan áreas sin acceso.', { size: 8, color: '677A88' }))

  paragraphs.push(heading('Productos aplicados'))
  if (!input.productos.length) paragraphs.push(paragraph('No se registraron productos aplicados.'))
  for (const product of input.productos) {
    paragraphs.push(paragraph(product.nombre, { bold: true, color: '193B63' }))
    paragraphs.push(detail('Principio activo', product.principio), detail('Registro', product.registro),
      detail('Lote', product.lote), detail('Dosis', product.dosis), detail('Métodos', product.metodos))
  }

  paragraphs.push(heading('Evaluación de condiciones locativas'))
  for (const area of input.areas) {
    paragraphs.push(paragraph(area.nombre, { size: 10, bold: true, color: '193B63', before: 150 }))
    if (area.sinAcceso) {
      paragraphs.push(detail('Sin acceso. Motivo', area.motivo))
      continue
    }
    if (!area.criterios.length) paragraphs.push(paragraph('Sin criterios registrados.'))
    for (const criterion of area.criterios) {
      const score: Record<string, string> = { C: 'Cumple', CP: 'Cumple parcialmente', NC: 'No cumple', NA: 'No aplica' }
      paragraphs.push(detail(criterion.nombre, criterion.evaluacion ? score[criterion.evaluacion] : 'Sin evaluación'))
      if (criterion.observacion) paragraphs.push(detail('Observación', criterion.observacion))
    }
  }

  paragraphs.push(heading('Puestos de monitoreo'))
  if (!points) paragraphs.push(paragraph('No se registraron puestos revisados.'))
  for (const area of input.areas) for (const point of area.puntos) {
    paragraphs.push(paragraph(area.nombre + ' / Puesto ' + point.numero + ' – ' + point.tipo, { bold: true, color: '193B63', before: 110 }))
    paragraphs.push(detail('Ubicación', point.ubicacion), detail('Estado', point.estado))
    paragraphs.push(detail('Capturas', point.capturas.length
      ? point.capturas.map((capture) => capture.plagaNombreSnapshot + ': ' + number(capture.cantidad)).join(' · ')
      : 'Sin capturas'))
    if (point.observaciones) paragraphs.push(detail('Observaciones', point.observaciones))
  }

  paragraphs.push(heading('Hallazgos y recomendaciones'))
  if (!findings) paragraphs.push(paragraph('No se registraron hallazgos nuevos ni cierres durante esta visita.'))
  for (const area of input.areas) for (const finding of area.hallazgos) {
    paragraphs.push(paragraph(area.nombre + ' / ' + finding.estado, { bold: true, color: '193B63', before: 110 }))
    paragraphs.push(detail('Hallazgo', finding.descripcion), detail('Acción recomendada', finding.recomendacion),
      detail('Responsable', finding.responsable))
  }

  paragraphs.push(heading('Registro fotográfico'))
  if (!photos.length) paragraphs.push(paragraph('No se asociaron fotografías.'))
  let lastArea = ''
  for (let index = 0; index < photos.length;) {
    if (photos[index]!.area !== lastArea) {
      lastArea = photos[index]!.area
      paragraphs.push(paragraph(lastArea, { bold: true, color: '193B63', before: 120 }))
    }
    const row: ReportPhoto[] = []
    while (index < photos.length && row.length < 3 && photos[index]!.area === lastArea) row.push(photos[index++]!)
    paragraphs.push(table([row.map((photo) =>
      image(photo.bytes, 1_500_000, 880_000) + paragraph(photo.caption, { size: 7, color: '4D5B66' }),
    ).concat(Array(3 - row.length).fill(paragraph(' ')))], [3130, 3130, 3130]))
  }

  paragraphs.push(heading('Firmas y conformidad'))
  paragraphs.push(table([[
    image(signatures.tecnico, 2_600_000, 950_000)
      + paragraph('Técnico responsable', { bold: true }) + paragraph(input.tecnico),
    image(signatures.cliente, 2_600_000, 950_000)
      + paragraph('Responsable del cliente', { bold: true }) + paragraph(input.firmanteCliente),
  ]], [4700, 4700]))
  paragraphs.push(paragraph('Informe elaborado con los datos históricos del Servicio. Las observaciones de monitoreo no sustituyen una evaluación sanitaria independiente.', {
    size: 8, color: '677A88', before: 150,
  }))

  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="' + WORD_NS + '" xmlns:r="' + REL_NS + '"'
    + ' xmlns:wp="' + WP_NS + '" xmlns:a="' + DRAW_NS + '" xmlns:pic="' + PICTURE_NS + '">'
    + '<w:body>' + paragraphs.join('')
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>'
  zip.file('word/document.xml', document)
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="jpg" ContentType="image/jpeg"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="' + PKG_NS + '"><Relationship Id="rId1" Type="'
    + REL_NS + '/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Relationships xmlns="' + PKG_NS + '">' + relationships.join('') + '</Relationships>')
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
