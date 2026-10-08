import { computed, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import { blankInsightFilters } from '@/helpers/siteInsights'
import { ApiClientError } from '@/services/apiService'
import { useNotificationsStore } from '@/stores/notifications'
import type { InsightFilters, InsightQuery, SiteCollection } from '@/types/siteInsights'

/** Route-local collection state. No polling or hidden cross-session cache. */
export function useInsightList<T>(
  scope: () => string,
  active: () => boolean,
  loader: (query: InsightQuery, signal: AbortSignal) => Promise<SiteCollection<T>>,
  defaults: Partial<InsightFilters> = {},
) {
  const filters = reactive<InsightFilters>({ ...blankInsightFilters(), ...defaults })
  const page = ref(1)
  const data = shallowRef<SiteCollection<T> | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notifications = useNotificationsStore()
  const query = computed<InsightQuery>(() => ({ ...filters, page: page.value }))
  const items = computed(() => data.value?.items ?? [])
  let request = 0
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let loadedAt = 0
  let loadedKey = ''
  let inFlightKey = ''
  let previousScope = scope()
  let requestedSearch = filters.search
  let disposed = false
  function currentKey(): string { return `${scope()}:${JSON.stringify(query.value)}` }
  function cancel(): void {
    ++request
    controller?.abort()
    clearTimeout(timer)
    inFlightKey = ''
    loading.value = false
  }
  async function load(): Promise<void> {
    clearTimeout(timer)
    if (disposed || !active() || !scope()) return
    const key = currentKey()
    if (loading.value && inFlightKey === key) return
    const currentRequest = ++request
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    inFlightKey = key
    requestedSearch = filters.search
    loading.value = true
    error.value = null
    try {
      const result = await loader(query.value, requestController.signal)
      if (currentRequest !== request) return
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
      if (page.value > lastPage) { page.value = lastPage; return }
      data.value = result
      loadedKey = key
      loadedAt = Date.now()
    } catch (cause) {
      if (currentRequest !== request || requestController.signal.aborted) return
      error.value = cause instanceof ApiClientError && cause.status < 500
        ? cause.message : 'No fue posible cargar la información. Revisa la conexión y vuelve a intentarlo.'
      notifications.show(error.value, 'error')
    } finally {
      if (currentRequest === request) { loading.value = false; inFlightKey = '' }
    }
  }
  // A single watcher coalesces a filter change and its pagination reset.
  watch([scope, active, () => JSON.stringify(filters), page], ([key, visible, filterKey], previous) => {
    const scopeChanged = key !== previousScope
    if (scopeChanged) {
      previousScope = key
      cancel()
      data.value = null
      error.value = null
      loadedAt = 0
      loadedKey = ''
      page.value = 1
      Object.assign(filters, blankInsightFilters(), defaults)
      requestedSearch = filters.search
    }
    if (!visible || !key) { cancel(); return }
    if (!scopeChanged && previous && filterKey !== previous[2] && page.value !== 1) {
      cancel()
      page.value = 1
      return
    }
    if (loading.value && inFlightKey === currentKey()) return
    if (data.value && loadedKey === currentKey() && Date.now() - loadedAt < 60_000) return
    if (requestedSearch !== filters.search) {
      cancel()
      timer = setTimeout(() => { void load() }, 250)
    } else void load()
  }, { immediate: true })
  onScopeDispose(() => { disposed = true; cancel() })
  function changeFilters(value: InsightFilters): void { Object.assign(filters, value) }
  function resetFilters(): void { Object.assign(filters, blankInsightFilters(), defaults) }
  return { filters, page, data, items, loading, error, load, changeFilters, resetFilters }
}
