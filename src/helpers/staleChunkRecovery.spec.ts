import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handleVitePreloadError, isStaleChunkError, recoverStaleChunk } from './staleChunkRecovery'

const location = { href: 'https://develop.example.test/integraciones', reload: vi.fn<() => void>() }
const storage = {
  values: new Map<string, string>(),
  getItem(key: string) { return this.values.get(key) ?? null },
  setItem(key: string, value: string) { this.values.set(key, value) },
}

beforeEach(() => {
  location.href = 'https://develop.example.test/integraciones'
  location.reload.mockReset()
  storage.values.clear()
})

describe('recuperación de chunks obsoletos', () => {
  it.each([
    'Failed to fetch dynamically imported module: /assets/DashboardView-old.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'ChunkLoadError: Loading chunk dashboard failed',
    'Unable to preload CSS for /assets/view-old.css',
  ])('reconoce %s', message => {
    expect(isStaleChunkError(new TypeError(message))).toBe(true)
  })

  it('ignora errores ajenos a los assets dinámicos', () => {
    expect(recoverStaleChunk(new Error('No fue posible guardar'), { location, storage })).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('recarga una sola vez por ruta dentro de la ventana de recuperación', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/DashboardView-old.js')
    expect(recoverStaleChunk(error, { location, storage, now: () => 1_000 })).toBe(true)
    expect(recoverStaleChunk(error, { location, storage, now: () => 20_000 })).toBe(false)
    expect(location.reload).toHaveBeenCalledOnce()
  })

  it('permite recuperar otra ruta y reintentar después de la ventana', () => {
    const error = new TypeError('Failed to fetch dynamically imported module')
    expect(recoverStaleChunk(error, { location, storage, now: () => 1_000 })).toBe(true)
    location.href = 'https://develop.example.test/usuarios'
    expect(recoverStaleChunk(error, { location, storage, now: () => 2_000 })).toBe(true)
    expect(recoverStaleChunk(error, { location, storage, now: () => 63_000 })).toBe(true)
    expect(location.reload).toHaveBeenCalledTimes(3)
  })

  it('previene el error de Vite solo cuando puede iniciar la recuperación', () => {
    const first = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown }
    first.payload = new TypeError('Failed to fetch dynamically imported module')
    handleVitePreloadError(first, { location, storage, now: () => 1_000 })
    expect(first.defaultPrevented).toBe(true)

    const repeated = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown }
    repeated.payload = first.payload
    handleVitePreloadError(repeated, { location, storage, now: () => 2_000 })
    expect(repeated.defaultPrevented).toBe(false)
  })
})
