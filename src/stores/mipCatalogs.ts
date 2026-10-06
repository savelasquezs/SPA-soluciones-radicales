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
  let optionsAt = 0
  let epoch = 0
  let mutation = 0
  const pending = new Map<string, Promise<void>>()
  const auth = useAuthStore()

  function reset(): void {
    epoch++; mutation++
    for (const kind of KINDS) records[kind] = {}
    for (const target of [loadedAt, loading, errors]) for (const key of Object.keys(target)) delete target[key]
    pending.clear(); options.value = { pests: [], methods: [] }; optionsLoaded.value = false; optionsAt = 0
  }
  watch(() => `${auth.profile?.id ?? ''}:${auth.activeRole ?? ''}`, reset, { flush: 'sync' })

  function list(kind: MipCatalogKind, active: boolean): MipRecord[] {
    return Object.values(records[kind]).filter(record => record.activo === active).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
  function upsert(kind: MipCatalogKind, record: MipRecord): void {
    mutation++
    records[kind][record.id] = record
    if (kind === 'methods' || kind === 'pests') {
      const key = kind === 'methods' ? 'methods' : 'pests'
      const current = options.value[key].filter(item => item.id !== record.id)
      options.value = { ...options.value, [key]: [...current, record as MipCatalogItem].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }
      // Refresh labels/states in already-loaded product snapshots, without a collection refetch.
      for (const product of Object.values(records.products) as MipProduct[]) {
        const field = kind === 'methods' ? 'metodos' : 'plagas'
        product[field] = product[field].map(item => item.id === record.id ? record as MipCatalogItem : item)
      }
    }
  }
  function remove(kind: MipCatalogKind, id: string): void {
    mutation++; delete records[kind][id]
    if (kind === 'pests' || kind === 'methods') options.value = { ...options.value, [kind]: options.value[kind].filter(item => item.id !== id) }
  }
  async function load(kind: MipCatalogKind, active: boolean, force = false): Promise<void> {
    const key = `${kind}:${active}`
    if (!force && Date.now() - (loadedAt[key] ?? 0) < TTL) return
    if (pending.has(key)) return pending.get(key)!
    const requestEpoch = epoch, requestMutation = mutation
    loading[key] = true; delete errors[key]
    const job = (async () => {
      try {
        const rows = await listMipCatalog(kind, active)
        if (epoch !== requestEpoch) return
        // A slower read cannot overwrite a newer acknowledged edit/delete.
        if (mutation !== requestMutation) return
        const next = Object.fromEntries(Object.entries(records[kind]).filter(([, row]) => row.activo !== active))
        for (const row of rows) next[row.id] = row
        records[kind] = next
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
    loading[key] = true; delete errors[key]
    const job = (async () => {
      try {
        const value = await getMipOptions()
        if (epoch !== requestEpoch || requestMutation !== mutation) return
        options.value = value; optionsLoaded.value = true; optionsAt = Date.now()
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
    const requestEpoch = epoch
    const record = await getMipRecord(kind, id)
    if (requestEpoch !== epoch) return null
    upsert(kind, record)
    return record
  }
  const products = computed(() => Object.values(records.products) as MipProduct[])
  return { records, products, options, optionsLoaded, loading, errors, loadedAt, list, load, loadOptions, upsert, remove, refreshRecord, reset }
})
