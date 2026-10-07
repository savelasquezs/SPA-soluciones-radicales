import {
  PEST_GROUPS,
  PRODUCT_PEST_CATEGORIES,
  type CatalogErrors,
  type CatalogValidation,
  type MipCatalogItem,
  type MipCriterionInput,
  type MipItemInput,
  type MipItemKind,
  type MipProduct,
  type MipProductInput,
  type PestGroup,
  type ProductPestCategory,
} from '../types/mipCatalogs'

export const PEST_GROUP_LABELS: Record<PestGroup, string> = {
  RASTREROS: 'Rastreros',
  VOLADORES: 'Voladores',
}

export const PRODUCT_PEST_CATEGORY_LABELS: Record<ProductPestCategory, string> = {
  INSECTOS_RASTREROS: 'Insectos rastreros',
  INSECTOS_VOLADORES: 'Insectos voladores',
  ROEDORES: 'Roedores',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCatalogId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function isPestGroup(value: unknown): value is PestGroup {
  return typeof value === 'string' && PEST_GROUPS.includes(value as PestGroup)
}

export function isProductPestCategory(value: unknown): value is ProductPestCategory {
  return typeof value === 'string' && PRODUCT_PEST_CATEGORIES.includes(value as ProductPestCategory)
}

export function normalizeCatalogSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es')
}

export function emptyProductInput(): MipProductInput {
  return {
    nombre: '',
    principioActivo: '',
    dosisAplicacion: '',
    registroSanitario: null,
    gradoToxicologico: null,
    fabricante: null,
    antidoto: null,
    fichaTecnicaStoragePath: null,
    metodoIds: [],
    categorias: [],
    plagaIds: [],
  }
}

export function productToInput(product: MipProduct): MipProductInput {
  return {
    nombre: product.nombre,
    principioActivo: product.principioActivo,
    dosisAplicacion: product.dosisAplicacion ?? '',
    registroSanitario: product.registroSanitario,
    gradoToxicologico: product.gradoToxicologico,
    fabricante: product.fabricante,
    antidoto: product.antidoto,
    fichaTecnicaStoragePath: product.fichaTecnicaStoragePath,
    metodoIds: product.metodos.map(method => method.id),
    categorias: [...product.categorias],
    plagaIds: product.plagas.map(pest => pest.id),
  }
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(
  source: Record<string, unknown>,
  key: keyof MipProductInput,
  label: string,
  errors: CatalogErrors,
  required = false,
  max = 240,
): string | null {
  const raw = source[key]
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    errors[key] = `${label}: ingresa un texto válido.`
    return null
  }
  const result = typeof raw === 'string' ? raw.trim() : ''
  if (required && !result) errors[key] = `${label} es obligatorio.`
  else if (result.length > max) errors[key] = `${label} admite hasta ${max} caracteres.`
  return result || null
}

function ids(
  source: Record<string, unknown>,
  key: 'metodoIds' | 'plagaIds',
  errors: CatalogErrors,
): string[] {
  const raw = source[key]
  if (!Array.isArray(raw) || raw.length > 200 || raw.some(id => !isCatalogId(id))) {
    errors[key] = 'Selecciona opciones válidas del catálogo.'
    return []
  }
  return [...new Set(raw as string[])]
}

/** The same parser is used in forms and the authorized API; no framework or provider dependency. */
export function validateProductInput(input: unknown): CatalogValidation<MipProductInput> {
  const source = object(input)
  const errors: CatalogErrors = {}
  const value: MipProductInput = {
    nombre: text(source, 'nombre', 'El nombre comercial', errors, true, 160) ?? '',
    principioActivo: text(source, 'principioActivo', 'El principio activo', errors, true, 1000) ?? '',
    dosisAplicacion: text(source, 'dosisAplicacion', 'La dosis de aplicación', errors, true, 240) ?? '',
    registroSanitario: text(source, 'registroSanitario', 'El registro sanitario', errors),
    gradoToxicologico: text(source, 'gradoToxicologico', 'El grado toxicológico', errors, false, 80),
    fabricante: text(source, 'fabricante', 'El laboratorio', errors),
    antidoto: text(source, 'antidoto', 'El antídoto', errors, false, 1000),
    fichaTecnicaStoragePath: text(source, 'fichaTecnicaStoragePath', 'La ficha técnica', errors, false, 500),
    metodoIds: ids(source, 'metodoIds', errors),
    categorias: [],
    plagaIds: ids(source, 'plagaIds', errors),
  }

  if (!Array.isArray(source.categorias) || source.categorias.some(category => !isProductPestCategory(category))) {
    errors.categorias = 'Selecciona Insectos rastreros, Insectos voladores o Roedores.'
  } else {
    value.categorias = [...new Set(source.categorias as ProductPestCategory[])]
  }

  if (!value.metodoIds.length) errors.metodoIds ??= 'Selecciona al menos un método de aplicación.'
  if (!value.categorias.length && !value.plagaIds.length) {
    errors.plagaIds ??= 'Selecciona una categoría completa o una plaga específica.'
  }

  if (
    value.fichaTecnicaStoragePath
    && !/^products\/technical-sheets\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(pdf|jpe?g|png|webp)$/i.test(value.fichaTecnicaStoragePath)
  ) {
    errors.fichaTecnicaStoragePath = 'Selecciona una ficha técnica válida.'
  }
  if (value.fichaTecnicaStoragePath?.includes('..')) {
    errors.fichaTecnicaStoragePath = 'Selecciona una ficha técnica válida.'
  }

  return { value, errors }
}

export function validateCriterionInput(input: unknown): CatalogValidation<MipCriterionInput> {
  const source = object(input)
  const errors: CatalogErrors = {}
  const nombre = text(source, 'nombre', 'El nombre', errors, true, 160) ?? ''
  const soloAreaExterna = typeof source.soloAreaExterna === 'boolean' ? source.soloAreaExterna : false
  if (typeof source.soloAreaExterna !== 'boolean') errors.soloAreaExterna = 'Selecciona dónde aplica el criterio.'
  return { value: { nombre, soloAreaExterna }, errors }
}

export function validateCatalogItem(kind: MipItemKind, input: unknown): CatalogValidation<MipItemInput> {
  const source = object(input)
  const errors: CatalogErrors = {}
  const nombre = text(source, 'nombre', 'El nombre', errors, true, 160) ?? ''

  if (kind === 'methods') {
    return { value: { nombre, clasificacion: null, categoriaProducto: null }, errors }
  }

  const clasificacion = isPestGroup(source.clasificacion) ? source.clasificacion : null
  if (!clasificacion) errors.clasificacion = 'Selecciona Rastreros o Voladores.'

  if (kind === 'traps') {
    return { value: { nombre, clasificacion, categoriaProducto: null }, errors }
  }

  const categoriaProducto = isProductPestCategory(source.categoriaProducto)
    ? source.categoriaProducto
    : null

  if (!categoriaProducto) {
    errors.categoriaProducto = 'Selecciona la categoría usada para productos.'
  } else if (
    clasificacion === 'VOLADORES'
    && categoriaProducto !== 'INSECTOS_VOLADORES'
  ) {
    errors.categoriaProducto = 'Las plagas voladoras pertenecen a Insectos voladores.'
  } else if (
    clasificacion === 'RASTREROS'
    && !['INSECTOS_RASTREROS', 'ROEDORES'].includes(categoriaProducto)
  ) {
    errors.categoriaProducto = 'Las plagas rastreras deben ser Insectos rastreros o Roedores.'
  }

  return { value: { nombre, clasificacion, categoriaProducto }, errors }
}

/** Whole product categories stay symbolic. Never expand a category into a persisted list of pests. */
export function canonicalCoverage(
  categories: ProductPestCategory[],
  pestIds: string[],
  pests: MipCatalogItem[],
): { categorias: ProductPestCategory[]; plagaIds: string[] } {
  const categorias = [...new Set(categories)]
  const byId = new Map(pests.map(pest => [pest.id, pest]))
  return {
    categorias,
    plagaIds: [...new Set(pestIds)].filter(id => {
      const category = byId.get(id)?.categoriaProducto
      return !category || !categorias.includes(category)
    }),
  }
}

export function coverageSummary(
  categories: ProductPestCategory[],
  pests: Pick<MipCatalogItem, 'nombre' | 'categoriaProducto'>[],
): string {
  const names: string[] = []
  const categorySet = new Set(categories)
  if (categorySet.has('INSECTOS_RASTREROS') && categorySet.has('INSECTOS_VOLADORES')) {
    names.push('Insectos rastreros y voladores')
  } else {
    if (categorySet.has('INSECTOS_RASTREROS')) names.push(PRODUCT_PEST_CATEGORY_LABELS.INSECTOS_RASTREROS)
    if (categorySet.has('INSECTOS_VOLADORES')) names.push(PRODUCT_PEST_CATEGORY_LABELS.INSECTOS_VOLADORES)
  }
  if (categorySet.has('ROEDORES')) names.push(PRODUCT_PEST_CATEGORY_LABELS.ROEDORES)
  names.push(
    ...pests
      .filter(pest => !pest.categoriaProducto || !categorySet.has(pest.categoriaProducto))
      .map(pest => pest.nombre),
  )
  return names.join(' · ') || 'Sin definir'
}
