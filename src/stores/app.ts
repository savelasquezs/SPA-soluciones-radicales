import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ThemePreference } from '@/types/domain'

const STORAGE_KEY = 'sr-theme-preference'

export const useAppStore = defineStore('app', () => {
  const theme = ref<ThemePreference>('system')
  const systemDark = ref(false)
  let media: MediaQueryList | null = null

  const resolvedTheme = computed<'light' | 'dark'>(() => theme.value === 'system'
    ? (systemDark.value ? 'dark' : 'light')
    : theme.value)

  function initializeTheme(): void {
    const saved = localStorage.getItem(STORAGE_KEY)
    theme.value = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
    media = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = media.matches
    media.addEventListener('change', handleSystemTheme)
    applyTheme()
  }

  function setTheme(value: ThemePreference): void {
    theme.value = value
    localStorage.setItem(STORAGE_KEY, value)
    applyTheme()
  }

  function applyTheme(): void {
    document.documentElement.dataset.theme = resolvedTheme.value
  }

  function handleSystemTheme(event: MediaQueryListEvent): void {
    systemDark.value = event.matches
    if (theme.value === 'system') applyTheme()
  }

  return { theme, resolvedTheme, initializeTheme, setTheme }
})
