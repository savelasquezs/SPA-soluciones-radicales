export const PEST_GROUPS = ['RASTREROS', 'VOLADORES'] as const
export type PestGroup = typeof PEST_GROUPS[number]
export type MipCatalogKind = 'products' | 'traps' | 'pests' | 'methods'
export type MipItemKind = Exclude<MipCatalogKind, 'products'>

export type MipCatalogItem = {
  id: string
  clave: string
  nombre: string
  /** Null only for methods or an unclassified record predating this module. */
  clasificacion: PestGroup | null
  activo: boolean
  version: number
}

export type MipItemInput = { nombre: string; clasificacion: PestGroup | null }

export type MipProductInput = {
  nombre: string
  principioActivo: string
  dosisAplicacion: string
  registroSanitario: string | null
  gradoToxicologico: string | null
  fabricante: string | null
  antidoto: string | null
  fichaTecnicaStoragePath: string | null
  metodoIds: string[]
  categorias: PestGroup[]
  plagaIds: string[]
}

export type MipProduct = Omit<MipProductInput, 'metodoIds' | 'plagaIds' | 'dosisAplicacion'> & {
  id: string
  activo: boolean
  version: number
  dosisAplicacion: string | null
  metodos: MipCatalogItem[]
  plagas: MipCatalogItem[]
}

export type MipRecord = MipProduct | MipCatalogItem
export type MipRecordByKind = {
  products: MipProduct
  traps: MipCatalogItem
  pests: MipCatalogItem
  methods: MipCatalogItem
}
export type MipOptions = { pests: MipCatalogItem[]; methods: MipCatalogItem[] }
export type CatalogErrors = Partial<Record<keyof MipProductInput | keyof MipItemInput, string>>
export type CatalogValidation<T> = { value: T; errors: CatalogErrors }
