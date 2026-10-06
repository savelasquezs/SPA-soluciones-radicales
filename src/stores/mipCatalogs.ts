import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

import { getMipOptions, getMipRecord, listMipCatalog } from '@/services/mipCatalogsService'
import { useAuthStore } from '@/stores/auth'
import type { MipCatalogItem, MipCatalogKind, MipOptions, MipProduct, MipRecord } from '@/types/mipCatalogs'

const TTL = 5 * 60 * 1000
const KINDS: MipCatalogKind[] = ['products', 'traps', 'pests', 'methods']

/** Small shared master catalogs. In-memory only; logout/role change invalidates the entire scope. */
export const useMipCatalogsStore = defineStore('mip-catalogs', () => {
  const records = reactive<Record<MipCatalogKind, Record<string, MipRecord>>>({ products: {}, traps: {}, pests: {}, methods: {} })
  const loadedAt = reactive<Record<string, number>>({})
  const loading = reactive<Record<string, boolean>>({})
  const errors = reactive<Record<string, string>>({})
  const options = ref<MipOptions>({ pests: [], methods: [] })
  const optionsLoaded = ref(false)
  const changed: Record<MipCatalogKind, Map<string, number>> = {
    products: new Map(), traps: new Map(), pests: new Map(), methods: new Map(),
  }
  let optionsAt = 0
  let epoch = 0
  let mutation = 0
  const pending = new Map<string, Promise<void>>()
  const auth = useAuthStore()

  function reset(): void {
    epoch++
    mutation++
    for (const kind of KINDS) { records[kind] = {}; changed[kind].clear() }
    for (const target of [loadedAt, loading, errors]) for (const key of Object.keys(target)) delete target[key]
    pending.clear()
    options.value = { pests: [], methods: [] }
    optionsLoaded.value = false
    optionsAt = 0
  }
  watch(() => `${auth.profile?.id ?? ''}:${auth.activeRole ?? ''}`, reset, { flush: 'sync' })

  function list(kind: MipCatalogKind, active: boolean): MipRecord[] {
    return Object.values(records[kind]).filter(record => record.activo === active).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }

  function synchronizeOptions(): void {
    options.value = {
      methods: (Object.values(records.methods) as MipCatalogItem[]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      pests: (Object.values(records.pests) as MipCatalogItem[]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }
    // Master labels/states may change while a product list is loading. Preserve product relationships.
    for (const product of Object.values(records.products) as MipProduct[]) {
      product.metodos = product.metodos.map(item => records.methods[item.id] as MipCatalogItem ?? item)
      product.plagas = product.plagas.map(item => records.pests[item.id] as MipCatalogItem ?? item)
    }
  }

  function upsert(kind: MipCatalogKind, record: MipRecord): void {
    changed[kind].set(record.id, ++mutation)
    records[kind][record.id] = record
    synchronizeOptions()
  }
  function remove(kind: MipCatalogKind, id: string): void {
    // Keep a tombstone until reset so an older in-flight read cannot resurrect this record.
    changed[kind].set(id, ++mutation)
    delete records[kind][id]
    synchronizeOptions()
  }

  function mergeRead(kind: MipCatalogKind, active: boolean | null, rows: MipRecord[], startedAt: number): void {
    const current = records[kind]
    const next: Record<string, MipRecord> = {}
    const incoming = new Map(rows.map(row => [row.id, row]))
    for (const row of Object.values(current)) {
      const fetched = incoming.get(row.id)
      if ((active !== null && row.activo !== active) || (changed[kind].get(row.id) ?? 0) > startedAt || (fetched && row.version > fetched.version)) {
        next[row.id] = row
      }
    }
    for (const row of rows) {
      if ((changed[kind].get(row.id) ?? 0) > startedAt) continue
      const cached = current[row.id]
      next[row.id] = cached && cached.version > row.version ? cached : row
    }
    records[kind] = next
    synchronizeOptions()
  }

  async function load(kind: MipCatalogKind, active: boolean, force = false): Promise<void> {
    const key = `${kind}:${active}`
    if (!force && loadedAt[key] !== undefined && Date.now() - loadedAt[key] < TTL) return
    if (pending.has(key)) return pending.get(key)!
    const requestEpoch = epoch, requestMutation = mutation
    loading[key] = true
    delete errors[key]
    const job = (async () => {
      try {
        const rows = await listMipCatalog(kind, active)
        if (epoch !== requestEpoch) return
        // Merge only affected records; an unrelated edit must not discard the rest of a page.
        mergeRead(kind, active, rows, requestMutation)
        loadedAt[key] = Date.now()
      } catch (error) {
        if (epoch === requestEpoch) errors[key] = error instanceof Error ? error.message : 'No fue posible cargar el catálogo.'
      } finally {
        if (epoch === requestEpoch) { loading[key] = false; pending.delete(key) }
      }
    })()
    pending.set(key, job)
    return job
  }

  async function loadOptions(force = false): Promise<void> {
    const key = 'options'
    if (!force && optionsLoaded.value && Date.now() - optionsAt < TTL) return
    if (pending.has(key)) return pending.get(key)!
    const requestEpoch = epoch, requestMutation = mutation
    loading[key] = true
    delete errors[key]
    const job = (async () => {
      try {
        const value = await getMipOptions()
        if (epoch !== requestEpoch) return
        mergeRead('methods', null, value.methods, requestMutation)
        mergeRead('pests', null, value.pests, requestMutation)
        optionsLoaded.value = true
        optionsAt = Date.now()
        // The options endpoint contains both states; reuse it when opening their admin lists.
        for (const kind of ['methods', 'pests']) for (const state of [true, false]) {
          loadedAt[`${kind}:${state}`] = optionsAt
          delete errors[`${kind}:${state}`]
        }
      } catch (error) {
        if (epoch === requestEpoch) errors[key] = error instanceof Error ? error.message : 'No fue posible cargar las opciones.'
      } finally {
        if (epoch === requestEpoch) { loading[key] = false; pending.delete(key) }
      }
    })()
    pending.set(key, job)
    return job
  }

  async function refreshRecord(kind: MipCatalogKind, id: string): Promise<MipRecord | null> {
    const requestEpoch = epoch, requestMutation = mutation
    const record = await getMipRecord(kind, id)
    if (requestEpoch !== epoch) return null
    const current = records[kind][id]
    if ((changed[kind].get(id) ?? 0) > requestMutation || (current && current.version > record.version)) return current ?? null
    upsert(kind, record)
    return record
  }
  const products = computed(() => Object.values(records.products) as MipProduct[])
  return { records, products, options, optionsLoaded, loading, errors, loadedAt, list, load, loadOptions, upsert, remove, refreshRecord, reset }
})
