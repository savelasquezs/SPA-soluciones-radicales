import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '@/stores/app'

describe('preferencia de tema', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('matchMedia', vi.fn<(query: string) => MediaQueryList>(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>(),
      removeEventListener: vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>(),
      addListener: vi.fn<(callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null) => void>(),
      removeListener: vi.fn<(callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null) => void>(),
      dispatchEvent: vi.fn<(event: Event) => boolean>(),
    })))
  })

  it('persiste claro, oscuro y sistema en el elemento raíz', () => {
    const app = useAppStore()
    app.initializeTheme()
    expect(document.documentElement.dataset.theme).toBe('light')

    app.setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('sr-theme-preference')).toBe('dark')

    app.setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
