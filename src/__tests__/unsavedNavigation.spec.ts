import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const { guards, cleanup } = vi.hoisted(() => ({
  guards: [] as Array<() => boolean | Promise<boolean>>,
  cleanup: [] as Array<() => void>,
}))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: (guard: () => boolean | Promise<boolean>) => guards.push(guard) }))
vi.mock('vue', async importOriginal => ({ ...await importOriginal<typeof import('vue')>(), onBeforeUnmount: (callback: () => void) => cleanup.push(callback) }))
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'

beforeEach(() => { guards.length = 0; cleanup.length = 0 })
afterEach(() => { cleanup.forEach(callback => callback()) })

describe('navegación sin promesas huérfanas', () => {
  it('resuelve todos los clics repetidos con una sola confirmación', async () => {
    const navigation = useUnsavedChanges(ref(true))
    const first = guards[0]!(), second = guards[0]!()
    expect(first).toBe(second)
    expect(navigation.confirmOpen.value).toBe(true)
    navigation.confirmDiscard()
    await expect(Promise.resolve(first)).resolves.toBe(true)
    await expect(Promise.resolve(second)).resolves.toBe(true)
    expect(navigation.confirmOpen.value).toBe(false)
  })

  it('conserva los cambios al cancelar y permite otro intento', async () => {
    const navigation = useUnsavedChanges(ref(true))
    const first = guards[0]!()
    navigation.cancelDiscard()
    await expect(Promise.resolve(first)).resolves.toBe(false)
    const next = guards[0]!()
    expect(next).not.toBe(first)
    navigation.confirmDiscard()
    await expect(Promise.resolve(next)).resolves.toBe(true)
  })

  it('bloquea durante el guardado, pero no después de liberar busy por error', () => {
    const busy = ref(true), dirty = ref(false)
    useUnsavedChanges(dirty, busy)
    expect(guards[0]!()).toBe(false)
    busy.value = false
    expect(guards[0]!()).toBe(true)
  })

  it('resuelve las navegaciones pendientes al desmontar', async () => {
    useUnsavedChanges(ref(true))
    const pending = guards[0]!()
    cleanup[0]!()
    await expect(Promise.resolve(pending)).resolves.toBe(false)
  })
})
