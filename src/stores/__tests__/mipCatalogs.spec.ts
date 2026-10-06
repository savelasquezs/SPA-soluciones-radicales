import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import type { MipCatalogItem } from '@/types/mipCatalogs'

const api = vi.hoisted(() => ({ listMipCatalog: vi.fn(), getMipOptions: vi.fn(), getMipRecord: vi.fn() }))
vi.mock('@/services/mipCatalogsService', () => api)
const identity = reactive({ profile: { id: 'admin' }, activeRole: 'ADMINISTRADOR' })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => identity }))
import { useMipCatalogsStore } from '../mipCatalogs'

const trap: MipCatalogItem = { id: '10000000-0000-4000-8000-000000000001', clave: 'TRAMPA', nombre: 'Trampa adhesiva', clasificacion: 'RASTREROS', activo: true, version: 1 }
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); identity.activeRole = 'ADMINISTRADOR'; api.listMipCatalog.mockResolvedValue([trap]); api.getMipOptions.mockResolvedValue({ pests: [], methods: [] }) })

describe('caché ligero de catálogos', () => {
  it('reutiliza listado y objeto al editar, sin GET por ID', async () => {
    const store = useMipCatalogsStore()
    await store.load('traps', true); await store.load('traps', true)
    const editing = store.list('traps', true)[0]
    expect(editing).toMatchObject(trap)
    expect(api.listMipCatalog).toHaveBeenCalledTimes(1)
    expect(api.getMipRecord).not.toHaveBeenCalled()
    store.upsert('traps', { ...trap, nombre: 'Adhesiva actualizada', version: 2 })
    expect(store.list('traps', true)[0]?.nombre).toBe('Adhesiva actualizada')
    expect(api.listMipCatalog).toHaveBeenCalledTimes(1)
  })
  it('mueve registros entre activos/inactivos y elimina localmente', async () => {
    const store = useMipCatalogsStore(); await store.load('traps', true)
    store.upsert('traps', { ...trap, activo: false, version: 2 })
    expect(store.list('traps', true)).toHaveLength(0)
    expect(store.list('traps', false)).toHaveLength(1)
    store.upsert('traps', { ...trap, version: 3 })
    expect(store.list('traps', false)).toHaveLength(0)
    store.remove('traps', trap.id); expect(store.list('traps', true)).toHaveLength(0)
  })
  it('un cambio de rol borra caché y descarta respuestas en vuelo', async () => {
    let finish!: (rows: MipCatalogItem[]) => void
    api.listMipCatalog.mockReturnValue(new Promise<MipCatalogItem[]>(resolve => { finish = resolve }))
    const store = useMipCatalogsStore(), pending = store.load('traps', true)
    identity.activeRole = 'TECNICO'; finish([trap]); await pending
    expect(store.list('traps', true)).toEqual([])
  })
  it('una lectura lenta no revierte una mutación confirmada', async () => {
    let finish!: (rows: MipCatalogItem[]) => void
    api.listMipCatalog.mockReturnValue(new Promise<MipCatalogItem[]>(resolve => { finish = resolve }))
    const store = useMipCatalogsStore(), pending = store.load('traps', true)
    store.upsert('traps', { ...trap, nombre: 'Cambio confirmado', version: 2 }); finish([trap]); await pending
    expect(store.list('traps', true)[0]?.nombre).toBe('Cambio confirmado')
  })
})
