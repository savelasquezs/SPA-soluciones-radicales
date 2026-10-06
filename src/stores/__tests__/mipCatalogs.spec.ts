import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import type { MipCatalogItem, MipOptions } from '@/types/mipCatalogs'
import type * as Service from '@/services/mipCatalogsService'

const api = vi.hoisted(() => ({
  listMipCatalog: vi.fn<typeof Service.listMipCatalog>(),
  getMipOptions: vi.fn<typeof Service.getMipOptions>(),
  getMipRecord: vi.fn<typeof Service.getMipRecord>(),
}))
vi.mock('@/services/mipCatalogsService', () => api)
const identity = reactive({ profile: { id: 'admin' }, activeRole: 'ADMINISTRADOR' })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => identity }))
import { useMipCatalogsStore } from '../mipCatalogs'

const trap: MipCatalogItem = { id: '10000000-0000-4000-8000-000000000001', clave: 'TRAMPA', nombre: 'Trampa adhesiva', clasificacion: 'RASTREROS', activo: true, version: 1 }
const lamp: MipCatalogItem = { ...trap, id: '10000000-0000-4000-8000-000000000002', clave: 'UV', nombre: 'Lámpara UV', clasificacion: 'VOLADORES' }
const method: MipCatalogItem = { ...trap, id: '20000000-0000-4000-8000-000000000001', clave: 'ASPERSION', nombre: 'Aspersión', clasificacion: null }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  identity.activeRole = 'ADMINISTRADOR'
  api.listMipCatalog.mockResolvedValue([trap])
  api.getMipOptions.mockResolvedValue({ pests: [], methods: [] })
})

describe('caché ligero de catálogos', () => {
  it('reutiliza listado y objeto al editar, sin GET por ID', async () => {
    const store = useMipCatalogsStore()
    await store.load('traps', true)
    await store.load('traps', true)
    expect(store.list('traps', true)[0]).toMatchObject(trap)
    expect(api.listMipCatalog).toHaveBeenCalledTimes(1)
    expect(api.getMipRecord).not.toHaveBeenCalled()
    store.upsert('traps', { ...trap, nombre: 'Adhesiva actualizada', version: 2 })
    expect(store.list('traps', true)[0]?.nombre).toBe('Adhesiva actualizada')
    expect(api.listMipCatalog).toHaveBeenCalledTimes(1)
  })
  it('mueve registros entre activos/inactivos y elimina localmente', async () => {
    const store = useMipCatalogsStore()
    await store.load('traps', true)
    store.upsert('traps', { ...trap, activo: false, version: 2 })
    expect(store.list('traps', true)).toHaveLength(0)
    expect(store.list('traps', false)).toHaveLength(1)
    store.upsert('traps', { ...trap, version: 3 })
    expect(store.list('traps', false)).toHaveLength(0)
    store.remove('traps', trap.id)
    expect(store.list('traps', true)).toHaveLength(0)
  })
  it('un cambio de rol borra caché y descarta respuestas en vuelo', async () => {
    const read = deferred<MipCatalogItem[]>()
    api.listMipCatalog.mockReturnValue(read.promise)
    const store = useMipCatalogsStore()
    const pending = store.load('traps', true)
    identity.activeRole = 'TECNICO'
    read.resolve([trap])
    await pending
    expect(store.list('traps', true)).toEqual([])
  })
  it('una lectura lenta conserva la edición y también el resto del listado', async () => {
    const read = deferred<MipCatalogItem[]>()
    api.listMipCatalog.mockReturnValue(read.promise)
    const store = useMipCatalogsStore()
    const pending = store.load('traps', true)
    store.upsert('traps', { ...trap, nombre: 'Cambio confirmado', version: 2 })
    read.resolve([trap, lamp])
    await pending
    expect(store.records.traps[trap.id]?.nombre).toBe('Cambio confirmado')
    expect(store.records.traps[lamp.id]).toMatchObject(lamp)
    await store.load('traps', true)
    expect(api.listMipCatalog).toHaveBeenCalledTimes(1)
  })
  it('una eliminación en vuelo no resucita y una desactivación conserva el tab correcto', async () => {
    const read = deferred<MipCatalogItem[]>()
    api.listMipCatalog.mockReturnValue(read.promise)
    const store = useMipCatalogsStore()
    const pending = store.load('traps', true)
    store.remove('traps', trap.id)
    store.upsert('traps', { ...lamp, activo: false, version: 2 })
    read.resolve([trap, lamp])
    await pending
    expect(store.records.traps[trap.id]).toBeUndefined()
    expect(store.list('traps', true)).toEqual([])
    expect(store.list('traps', false)).toEqual([{ ...lamp, activo: false, version: 2 }])
  })
  it('editar otro catálogo no descarta opciones ni obliga a reconsultarlas', async () => {
    const read = deferred<MipOptions>()
    api.getMipOptions.mockReturnValue(read.promise)
    const store = useMipCatalogsStore()
    const pending = store.loadOptions()
    store.upsert('traps', { ...trap, version: 2 })
    read.resolve({ pests: [], methods: [method] })
    await pending
    expect(store.optionsLoaded).toBe(true)
    expect(store.options.methods).toEqual([method])
    await store.load('methods', true)
    await store.load('methods', false)
    expect(api.listMipCatalog).not.toHaveBeenCalled()
    expect(store.list('methods', true)).toEqual([method])
  })
  it('opciones lentas respetan un método editado y una plaga eliminada', async () => {
    const read = deferred<MipOptions>()
    api.getMipOptions.mockReturnValue(read.promise)
    const store = useMipCatalogsStore()
    const pending = store.loadOptions()
    store.upsert('methods', { ...method, nombre: 'Método actualizado', version: 2 })
    store.remove('pests', trap.id)
    read.resolve({ pests: [trap], methods: [method] })
    await pending
    expect(store.options.methods[0]?.nombre).toBe('Método actualizado')
    expect(store.options.pests).toEqual([])
    expect(store.optionsLoaded).toBe(true)
  })
  it('la recuperación explícita de conflicto tampoco pisa una mutación posterior', async () => {
    const read = deferred<MipCatalogItem>()
    api.getMipRecord.mockReturnValue(read.promise)
    const store = useMipCatalogsStore()
    const pending = store.refreshRecord('traps', trap.id)
    store.upsert('traps', { ...trap, version: 3, nombre: 'Más reciente' })
    read.resolve({ ...trap, version: 2 })
    expect(await pending).toMatchObject({ version: 3, nombre: 'Más reciente' })
  })
})
