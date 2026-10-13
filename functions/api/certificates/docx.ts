import { inflateRawSync } from 'node:zlib'
import Docxtemplater, { type DXT } from 'docxtemplater'
import PizZip from 'pizzip'
import { DOMParser } from '@xmldom/xmldom'

import { ApiError } from '../auth'
import { CERTIFICATE_BLOCKS, CERTIFICATE_VARIABLES, type CertificateData, type CertificateType } from '../../../src/types/certificates'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
const MAX_EXPANDED_BYTES = 24 * 1024 * 1024

function openTemplate(bytes: Uint8Array): PizZip {
  if (!bytes.length || bytes.length > MAX_TEMPLATE_BYTES) {
    throw new ApiError(422, 'La plantilla debe ser un Word .docx de hasta 10 MB')
  }
  try {
    const zip = new PizZip(bytes)
    const entries = Object.values(zip.files)
    if (entries.length > 400 || !zip.file('word/document.xml') || !zip.file('[Content_Types].xml')) throw new Error('Invalid package')
    let expanded = 0
    for (const entry of entries) {
      // PizZip reads the central directory without inflating entries. Bound expansion first.
      const metadata = (entry as unknown as { _data: { uncompressedSize?: number; compressionMethod: string; getCompressedContent: () => Uint8Array } })._data
      const size = metadata.uncompressedSize
      if (!entry.dir && (!Number.isSafeInteger(size) || size! < 0)) throw new Error('Invalid size')
      expanded += size ?? 0
      if (expanded > MAX_EXPANDED_BYTES || entry.name.includes('..') || entry.name.startsWith('/')) throw new Error('Unsafe archive')
      if (/vbaproject|activex|embeddings|encryptedpackage/i.test(entry.name)) throw new Error('Active content')
      if (!entry.dir) {
        // Do not trust a forged ZIP size: cap the actual inflater, not only its metadata.
        const compressed = metadata.getCompressedContent()
        const decoded = metadata.compressionMethod === '\x08\x00'
          ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, size!) })
          : metadata.compressionMethod === '\x00\x00' ? Buffer.from(compressed) : null
        if (!decoded || decoded.length !== size) throw new Error('Invalid expansion')
        zip.file(entry.name, decoded)
      }
    }
    for (const entry of entries.filter((item) => /\.(xml|rels)$/i.test(item.name))) {
      const xml = zip.file(entry.name)!.asText()
      if (xml.length > 3 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY|<w:altChunk|macroEnabled/i.test(xml)) throw new Error('Active XML')
      const document = new DOMParser({ onError: () => { throw new Error('Invalid XML') } }).parseFromString(xml, 'text/xml')
      const elements = Array.from(document.getElementsByTagName('*'))
      let instructions = ''
      for (const element of elements) {
        if (element.localName === 'Relationship' && element.getAttribute('TargetMode') === 'External'
          && !element.getAttribute('Type')?.endsWith('/hyperlink')) throw new Error('Remote resource')
        if (['altChunk', 'OLEObject', 'dataSource'].includes(element.localName ?? '')) throw new Error('Active content')
        if (element.localName === 'instrText') instructions += element.textContent ?? ''
        if (element.localName === 'fldSimple') instructions += element.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'instr') ?? ''
      }
      if (/DDE|INCLUDETEXT|INCLUDEPICTURE|DATABASE|\bLINK\b/i.test(instructions)) throw new Error('Active field')
    }
    return zip
  } catch {
    throw new ApiError(422, 'El Word no es válido o contiene contenido activo, recursos externos o un tamaño expandido excesivo')
  }
}

function compileTemplate(bytes: Uint8Array, type: CertificateType): Docxtemplater {
  const zip = openTemplate(bytes)
  const syntaxTrees: DXT.Part[][] = []
  // Consume the final parser tree via the module hook, including headers/footers.
  // Do not import the diagnostic inspect-module: it relies on undeclared dev dependencies.
  const catalogModule: DXT.Module = {
    name: 'CertificateCatalog',
    set(event: { inspect?: { postparsed?: DXT.Part[] } }) {
      if (event.inspect?.postparsed) syntaxTrees.push(event.inspect.postparsed)
    },
  }
  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true, linebreaks: true, errorLogging: false,
      delimiters: { start: '{{', end: '}}' },
      modules: [catalogModule],
      parser: (tag) => ({ get: (scope: Record<string, unknown>) => Object.hasOwn(scope, tag) ? scope[tag] : undefined }),
      nullGetter: () => '',
    })
  } catch {
    throw new ApiError(422, 'Revisa las variables y el cierre de los bloques {{#productos}} y {{/productos}} en el Word')
  }
  const allowed = new Set(CERTIFICATE_VARIABLES.filter((v) => !v.types || v.types.includes(type)).map((v) => v.name))
  const used = new Set<string>()
  function check(parts: DXT.Part[], block?: string): void {
    for (const part of parts) {
      if (part.type !== 'placeholder') continue
      const tag = part.value
      if (part.module === 'loop') {
        if (block || !Object.hasOwn(CERTIFICATE_BLOCKS, tag) || part.inverted) throw new ApiError(422, 'La plantilla contiene un bloque no permitido')
        check(part.subparsed ?? [], tag)
      } else {
        const permitted = block ? CERTIFICATE_BLOCKS[block]!.some((v) => v.name === tag) : allowed.has(tag)
        if (part.module || !permitted) throw new ApiError(422, `Variable no permitida: ${String(tag).slice(0, 80)}. Consulta el catálogo de variables.`)
        if (!block) used.add(tag)
      }
    }
  }
  syntaxTrees.forEach((parts) => check(parts))
  const required = ['solicitud', 'fecha_expedicion', 'fecha_vencimiento', type === 'VEHICULO' ? 'vehiculo_placa' : 'negocio_nombre']
  const missing = required.filter((name) => !used.has(name))
  if (missing.length) throw new ApiError(422, `Faltan variables obligatorias: ${missing.map((name) => `{{${name}}}`).join(', ')}`)
  return doc
}

export function validateTemplate(bytes: Uint8Array, type: CertificateType): void {
  // Rendering sample data also catches structural errors that compile alone cannot detect.
  renderCertificateDocx(bytes, type, sampleCertificateData(type))
}

export function renderCertificateDocx(bytes: Uint8Array, type: CertificateType, data: CertificateData): Buffer {
  const document = compileTemplate(bytes, type)
  try {
    document.render(data)
    return document.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch {
    throw new ApiError(422, 'No fue posible completar el Word. Revisa la estructura de sus variables y bloques.')
  }
}

export function sampleCertificateData(type: CertificateType): CertificateData {
  return {
    negocio_nombre: 'NEGOCIO DE PRUEBA · SIN VALIDEZ', nit: '900.000.000-0',
    sede_nombre: 'Sede de ejemplo', sede_direccion: 'Dirección de ejemplo',
    solicitud: 'PRUEBA-SIN-VALIDEZ', fecha_expedicion: '31/01/2026', fecha_vencimiento: '31/03/2026',
    tecnico_nombre: 'Técnico de prueba', ...(type === 'VEHICULO' ? { vehiculo_placa: 'TEST-000' } : {}),
    productos: [
      { nombre: 'Producto de ejemplo A', principio_activo: 'Composición de ejemplo', registro_sanitario: 'REG-PRUEBA-A', lote: 'LOTE-A', metodo: 'Aspersión' },
      { nombre: 'Producto de ejemplo B', principio_activo: 'Composición de ejemplo', registro_sanitario: 'REG-PRUEBA-B', lote: 'LOTE-B', metodo: 'Aplicación de gel' },
    ],
    metodos: [{ nombre: 'Aspersión' }, { nombre: 'Aplicación de gel' }],
  }
}
