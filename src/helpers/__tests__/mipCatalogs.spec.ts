import { describe, expect, it } from 'vitest'
import {
  canonicalCoverage,
  coverageSummary,
  emptyProductInput,
  normalizeCatalogSearch,
  productToInput,
  validateCatalogItem,
  validateProductInput,
} from '../mipCatalogs'
import type { MipCatalogItem, MipProduct } from '../../types/mipCatalogs'

const methodId = '10000000-0000-4000-8000-000000000001'
const crawler: MipCatalogItem = {
  id: '20000000-0000-4000-8000-000000000001',
  clave: 'CUCARACHA',
  nombre: 'Cucaracha',
  clasificacion: 'RASTREROS',
  categoriaProducto: 'INSECTOS_RASTREROS',
  activo: true,
  version: 1,
}
const rodent: MipCatalogItem = {
  ...crawler,
  id: '20000000-0000-4000-8000-000000000003',
  clave: 'ROEDOR',
  nombre: 'Roedor',
  categoriaProducto: 'ROEDORES',
}
const flyer: MipCatalogItem = {
  ...crawler,
  id: '20000000-0000-4000-8000-000000000002',
  clave: 'MOSCA',
  nombre: 'Mosca doméstica',
  clasificacion: 'VOLADORES',
  categoriaProducto: 'INSECTOS_VOLADORES',
}
const input = () => ({
  ...emptyProductInput(),
  nombre: 'Producto de prueba',
  principioActivo: 'Composición de prueba',
  dosisAplicacion: 'Según ficha de prueba',
  metodoIds: [methodId],
  plagaIds: [flyer.id],
})

describe('contratos de catálogos MIP', () => {
  it('rechaza campos vacíos, métodos ausentes y cobertura vacía', () => {
    expect(Object.keys(validateProductInput(emptyProductInput()).errors))
      .toEqual(expect.arrayContaining(['nombre', 'principioActivo', 'dosisAplicacion', 'metodoIds', 'plagaIds']))
  })

  it('acepta categorías de producto y plagas específicas sin expandir categorías', () => {
    const result = validateProductInput({ ...input(), categorias: ['INSECTOS_RASTREROS'] })
    expect(result.errors).toEqual({})
    expect(result.value.categorias).toEqual(['INSECTOS_RASTREROS'])
    expect(result.value.plagaIds).toEqual([flyer.id])
  })

  it('separa monitoreo de categoría para productos en plagas', () => {
    expect(validateCatalogItem('traps', { nombre: 'Adhesiva', clasificacion: 'RASTREROS' }).errors).toEqual({})
    expect(validateCatalogItem('pests', {
      nombre: 'Cucaracha',
      clasificacion: 'RASTREROS',
      categoriaProducto: 'INSECTOS_RASTREROS',
    }).errors).toEqual({})
    expect(validateCatalogItem('pests', {
      nombre: 'Roedor',
      clasificacion: 'RASTREROS',
      categoriaProducto: 'ROEDORES',
    }).errors).toEqual({})
    expect(validateCatalogItem('pests', {
      nombre: 'Mosca',
      clasificacion: 'VOLADORES',
      categoriaProducto: 'ROEDORES',
    }).errors.categoriaProducto).toBeTruthy()
    expect(validateCatalogItem('pests', {
      nombre: 'Mosca',
      clasificacion: 'VOLADORES',
      categoriaProducto: 'INSECTOS_VOLADORES',
    }).errors).toEqual({})
    expect(validateCatalogItem('methods', { nombre: 'Punteo' }).value).toMatchObject({
      clasificacion: null,
      categoriaProducto: null,
    })
  })

  it('rechaza payloads malformados, IDs inválidos y rutas de otro tipo de archivo', () => {
    expect(validateProductInput({ ...input(), metodoIds: ['injection'] }).errors.metodoIds).toBeTruthy()
    expect(validateProductInput({ ...input(), categorias: ['RASTREROS'] }).errors.categorias).toBeTruthy()
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

  it('elimina relaciones redundantes por categoría de producto, sin confundir roedores con rastreros', () => {
    expect(canonicalCoverage(
      ['INSECTOS_RASTREROS'],
      [crawler.id, rodent.id, flyer.id, flyer.id],
      [crawler, rodent, flyer],
    )).toEqual({
      categorias: ['INSECTOS_RASTREROS'],
      plagaIds: [rodent.id, flyer.id],
    })

    expect(canonicalCoverage(
      ['INSECTOS_RASTREROS', 'INSECTOS_VOLADORES', 'ROEDORES'],
      [crawler.id, rodent.id, flyer.id],
      [crawler, rodent, flyer],
    ).plagaIds).toEqual([])

    expect(coverageSummary(['INSECTOS_RASTREROS'], [crawler, rodent, flyer]))
      .toBe('Insectos rastreros · Roedor · Mosca doméstica')
  })

  it('edición clona el snapshot de lista sin mutarlo', () => {
    const product: MipProduct = {
      ...input(),
      id: methodId,
      activo: true,
      version: 1,
      categorias: ['INSECTOS_RASTREROS'],
      metodos: [{ ...crawler, id: methodId, clasificacion: null, categoriaProducto: null }],
      plagas: [flyer],
    }
    const form = productToInput(product)
    form.categorias.push('INSECTOS_VOLADORES')
    form.metodoIds.push(flyer.id)
    expect(product.categorias).toEqual(['INSECTOS_RASTREROS'])
    expect(product.metodos).toHaveLength(1)
  })

  it('normaliza búsqueda sin perder la clasificación operativa', () => {
    expect(normalizeCatalogSearch('  LÁMPARA UV ')).toBe('lampara uv')
  })
})
