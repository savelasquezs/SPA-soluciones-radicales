import { describe, expect, it } from 'vitest'
import { canonicalCoverage, coverageSummary, emptyProductInput, normalizeCatalogSearch, productToInput, validateCatalogItem, validateProductInput } from '../mipCatalogs'
import type { MipCatalogItem, MipProduct } from '../../types/mipCatalogs'

const methodId = '10000000-0000-4000-8000-000000000001'
const crawler: MipCatalogItem = { id: '20000000-0000-4000-8000-000000000001', clave: 'CUCARACHA', nombre: 'Cucaracha', clasificacion: 'RASTREROS', activo: true, version: 1 }
const flyer: MipCatalogItem = { ...crawler, id: '20000000-0000-4000-8000-000000000002', clave: 'MOSCA', nombre: 'Mosca doméstica', clasificacion: 'VOLADORES' }
const input = () => ({ ...emptyProductInput(), nombre: 'Producto de prueba', principioActivo: 'Composición de prueba', dosisAplicacion: 'Según ficha de prueba', metodoIds: [methodId], plagaIds: [flyer.id] })

describe('contratos de catálogos MIP', () => {
  it('rechaza campos vacíos, métodos ausentes y cobertura vacía', () => {
    expect(Object.keys(validateProductInput(emptyProductInput()).errors)).toEqual(expect.arrayContaining(['nombre', 'principioActivo', 'dosisAplicacion', 'metodoIds', 'plagaIds']))
  })
  it('acepta categorías y plagas específicas sin expandir categorías', () => {
    const result = validateProductInput({ ...input(), categorias: ['RASTREROS'] })
    expect(result.errors).toEqual({})
    expect(result.value.categorias).toEqual(['RASTREROS'])
    expect(result.value.plagaIds).toEqual([flyer.id])
  })
  it('exige exactamente una clasificación para cada trampa y cada plaga', () => {
    for (const kind of ['traps', 'pests'] as const) {
      for (const group of [null, '', 'MIXTO', 'OTROS', ['RASTREROS', 'VOLADORES']]) expect(validateCatalogItem(kind, { nombre: 'Test', clasificacion: group }).errors.clasificacion).toBeTruthy()
      expect(validateCatalogItem(kind, { nombre: 'Test', clasificacion: 'VOLADORES' }).errors).toEqual({})
    }
    expect(validateCatalogItem('methods', { nombre: 'Punteo' }).value.clasificacion).toBeNull()
  })
  it('rechaza payloads malformados, IDs inválidos y rutas de otro tipo de archivo', () => {
    expect(validateProductInput({ ...input(), metodoIds: ['injection'] }).errors.metodoIds).toBeTruthy()
    expect(validateProductInput({ ...input(), categorias: ['MIXTO'] }).errors.categorias).toBeTruthy()
    expect(validateProductInput({ ...input(), fichaTecnicaStoragePath: 'users/certificates/file.pdf' }).errors.fichaTecnicaStoragePath).toBeTruthy()
    expect(validateProductInput({ ...input(), fichaTecnicaStoragePath: 'products/technical-sheets/../file.pdf' }).errors.fichaTecnicaStoragePath).toBeTruthy()
    expect(validateProductInput({ ...input(), nombre: 123 }).errors.nombre).toBeTruthy()
    expect(validateProductInput(null).errors.nombre).toBeTruthy()
  })
  it('no persiste lote ni vencimiento aunque un cliente los envíe', () => {
    const result = validateProductInput({ ...input(), lote: 'incorrecto', fechaVencimiento: '2030-01-01' })
    expect(result.value).not.toHaveProperty('lote')
    expect(result.value).not.toHaveProperty('fechaVencimiento')
  })
  it('elimina relaciones redundantes pero mantiene plagas del otro grupo', () => {
    expect(canonicalCoverage(['RASTREROS'], [crawler.id, flyer.id, flyer.id], [crawler, flyer])).toEqual({ categorias: ['RASTREROS'], plagaIds: [flyer.id] })
    expect(canonicalCoverage(['RASTREROS', 'VOLADORES'], [crawler.id, flyer.id], [crawler, flyer]).plagaIds).toEqual([])
    expect(coverageSummary(['RASTREROS'], [crawler, flyer])).toBe('Rastreros · Mosca doméstica')
  })
  it('edición clona el snapshot de lista sin mutarlo', () => {
    const product: MipProduct = { ...input(), id: methodId, activo: true, version: 1, categorias: ['RASTREROS'], metodos: [{ ...crawler, id: methodId, clasificacion: null }], plagas: [flyer] }
    const form = productToInput(product)
    form.categorias.push('VOLADORES'); form.metodoIds.push(flyer.id)
    expect(product.categorias).toEqual(['RASTREROS'])
    expect(product.metodos).toHaveLength(1)
  })
  it('normaliza búsqueda sin perder la clasificación operativa', () => {
    expect(normalizeCatalogSearch('  LÁMPARA UV ')).toBe('lampara uv')
  })
})
