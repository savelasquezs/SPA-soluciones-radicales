export const PEST_GROUPS = ['RASTREROS', 'VOLADORES'] as const
export type PestGroup = typeof PEST_GROUPS[number]

export const PRODUCT_PEST_CATEGORIES = ['INSECTOS_RASTREROS', 'INSECTOS_VOLADORES', 'ROEDORES'] as const
export type ProductPestCategory = typeof PRODUCT_PEST_CATEGORIES[number]

export type MipCatalogKind = 'products' | 'traps' | 'pests' | 'methods' | 'criteria'
export type MipItemKind = 'traps' | 'pests' | 'methods'

export type MipCatalogItem = {
  id: string
  clave: string
  nombre: string
  /** Monitoring classification. Null only for methods or an unclassified legacy record. */
  clasificacion: PestGroup | null
  /** Product-control category. Only pests use it; legacy pests may still be null during transition. */
  categoriaProducto: ProductPestCategory | null
  activo: boolean
  version: number
}

export type MipItemInput = {
  nombre: string
  clasificacion: PestGroup | null
  categoriaProducto: ProductPestCategory | null
}

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
  categorias: ProductPestCategory[]
  plagaIds: string[]
}

export type MipCriterion = {
  id: string
  nombre: string
  soloAreaExterna: boolean
  activo: boolean
}

export type MipCriterionInput = {
  nombre: string
  soloAreaExterna: boolean
}

export type MipProduct = Omit<MipProductInput, 'metodoIds' | 'plagaIds' | 'dosisAplicacion'> & {
  id: string
  activo: boolean
  version: number
  dosisAplicacion: string | null
  metodos: MipCatalogItem[]
  plagas: MipCatalogItem[]
}

export type MipRecord = MipProduct | MipCatalogItem | MipCriterion
export type MipRecordByKind = {
  products: MipProduct
  traps: MipCatalogItem
  pests: MipCatalogItem
  methods: MipCatalogItem
  criteria: MipCriterion
}
export type MipOptions = { pests: MipCatalogItem[]; methods: MipCatalogItem[] }
export type CatalogErrors = Partial<Record<keyof MipProductInput | keyof MipItemInput | keyof MipCriterionInput, string>>
export type CatalogValidation<T> = { value: T; errors: CatalogErrors }
