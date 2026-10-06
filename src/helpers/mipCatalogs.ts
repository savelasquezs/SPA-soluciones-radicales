import { PEST_GROUPS, type CatalogErrors, type CatalogValidation, type MipCatalogItem, type MipItemInput, type MipItemKind, type MipProduct, type MipProductInput, type PestGroup } from '../types/mipCatalogs'

export const PEST_GROUP_LABELS: Record<PestGroup, string> = { RASTREROS: 'Rastreros', VOLADORES: 'Voladores' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isCatalogId(value: unknown): value is string { return typeof value === 'string' && UUID.test(value) }
export function isPestGroup(value: unknown): value is PestGroup { return typeof value === 'string' && PEST_GROUPS.includes(value as PestGroup) }
export function normalizeCatalogSearch(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es') }

export function emptyProductInput(): MipProductInput {
  return { nombre: '', principioActivo: '', dosisAplicacion: '', registroSanitario: null, gradoToxicologico: null, fabricante: null, antidoto: null, fichaTecnicaStoragePath: null, metodoIds: [], categorias: [], plagaIds: [] }
}
export function productToInput(product: MipProduct): MipProductInput {
  return { nombre: product.nombre, principioActivo: product.principioActivo, dosisAplicacion: product.dosisAplicacion ?? '', registroSanitario: product.registroSanitario, gradoToxicologico: product.gradoToxicologico, fabricante: product.fabricante, antidoto: product.antidoto, fichaTecnicaStoragePath: product.fichaTecnicaStoragePath, metodoIds: product.metodos.map(m => m.id), categorias: [...product.categorias], plagaIds: product.plagas.map(p => p.id) }
}

function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function text(source: Record<string, unknown>, key: keyof MipProductInput, label: string, errors: CatalogErrors, required = false, max = 240): string | null {
  const raw = source[key]
  if (raw !== undefined && raw !== null && typeof raw !== 'string') { errors[key] = `${label}: ingresa un texto válido.`; return null }
  const result = typeof raw === 'string' ? raw.trim() : ''
  if (required && !result) errors[key] = `${label} es obligatorio.`
  else if (result.length > max) errors[key] = `${label} admite hasta ${max} caracteres.`
  return result || null
}
function ids(source: Record<string, unknown>, key: 'metodoIds' | 'plagaIds', errors: CatalogErrors): string[] {
  const raw = source[key]
  if (!Array.isArray(raw) || raw.length > 200 || raw.some(id => !isCatalogId(id))) { errors[key] = 'Selecciona opciones válidas del catálogo.'; return [] }
  return [...new Set(raw as string[])]
}

/** The same parser is used in forms and the authorized API; no framework or provider dependency. */
export function validateProductInput(input: unknown): CatalogValidation<MipProductInput> {
  const source = object(input), errors: CatalogErrors = {}
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
  if (!Array.isArray(source.categorias) || source.categorias.some(c => !isPestGroup(c))) errors.categorias = 'Selecciona Rastreros o Voladores.'
  else value.categorias = [...new Set(source.categorias as PestGroup[])]
  if (!value.metodoIds.length) errors.metodoIds ??= 'Selecciona al menos un método de aplicación.'
  if (!value.categorias.length && !value.plagaIds.length) errors.plagaIds ??= 'Selecciona una categoría completa o una plaga específica.'
  if (value.fichaTecnicaStoragePath && !/^products\/technical-sheets\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(pdf|jpe?g|png|webp)$/i.test(value.fichaTecnicaStoragePath)) errors.fichaTecnicaStoragePath = 'Selecciona una ficha técnica válida.'
  if (value.fichaTecnicaStoragePath?.includes('..')) errors.fichaTecnicaStoragePath = 'Selecciona una ficha técnica válida.'
  return { value, errors }
}

export function validateCatalogItem(kind: MipItemKind, input: unknown): CatalogValidation<MipItemInput> {
  const source = object(input), errors: CatalogErrors = {}
  const nombre = text(source, 'nombre', 'El nombre', errors, true, 160) ?? ''
  const clasificacion = kind === 'methods' ? null : isPestGroup(source.clasificacion) ? source.clasificacion : null
  if (kind !== 'methods' && !clasificacion) errors.clasificacion = 'Selecciona Rastreros o Voladores.'
  return { value: { nombre, clasificacion }, errors }
}

/** Whole categories stay symbolic. Never expand a category into a persisted list of pests. */
export function canonicalCoverage(categories: PestGroup[], pestIds: string[], pests: MipCatalogItem[]): { categorias: PestGroup[]; plagaIds: string[] } {
  const categorias = [...new Set(categories)]
  const byId = new Map(pests.map(pest => [pest.id, pest]))
  return { categorias, plagaIds: [...new Set(pestIds)].filter(id => { const group = byId.get(id)?.clasificacion; return !group || !categorias.includes(group) }) }
}
export function coverageSummary(categories: PestGroup[], pests: Pick<MipCatalogItem, 'nombre' | 'clasificacion'>[]): string {
  const names = categories.length === 2 ? ['Rastreros y voladores'] : categories.map(group => PEST_GROUP_LABELS[group])
  names.push(...pests.filter(pest => !pest.clasificacion || !categories.includes(pest.clasificacion)).map(pest => pest.nombre))
  return names.join(' · ') || 'Sin definir'
}
