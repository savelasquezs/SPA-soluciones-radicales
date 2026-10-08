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
  let request = 0
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let loadedAt = 0
  let previousScope = scope()
  let previousSearch = filters.search
  const query = computed<InsightQuery>(() => ({ ...filters, page: page.value }))
  const items = computed(() => data.value?.items ?? [])

  async function load(): Promise<void> {
    clearTimeout(timer)
    if (!active() || !scope()) return
    const currentRequest = ++request
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    error.value = null
    try {
      const result = await loader(query.value, controller.signal)
      if (currentRequest !== request) return
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
      if (page.value > lastPage) { page.value = lastPage; return }
      data.value = result
      loadedAt = Date.now()
    } catch (cause) {
      if (currentRequest !== request || controller.signal.aborted) return
      error.value = cause instanceof ApiClientError && cause.status < 500
        ? cause.message : 'No fue posible cargar la información. Revisa la conexión y vuelve a intentarlo.'
      notifications.show(error.value, 'error')
    } finally {
      if (currentRequest === request) loading.value = false
    }
  }
  watch(filters, () => {
    page.value = 1
    clearTimeout(timer)
    const searchChanged = previousSearch !== filters.search
    previousSearch = filters.search
    if (searchChanged) timer = setTimeout(() => { void load() }, 250)
    else void load()
  })
  watch(page, () => { void load() })
  watch([scope, active], ([key, visible]) => {
    if (key !== previousScope) {
      previousScope = key
      ++request
      controller?.abort()
      clearTimeout(timer)
      data.value = null
      error.value = null
      loading.value = false
      loadedAt = 0
      page.value = 1
      Object.assign(filters, blankInsightFilters(), defaults)
    }
    if (!visible) { ++request; controller?.abort(); clearTimeout(timer); loading.value = false; return }
    if (!data.value || Date.now() - loadedAt > 60_000) void load()
  }, { immediate: true })
  onScopeDispose(() => { ++request; controller?.abort(); clearTimeout(timer) })
  function changeFilters(value: InsightFilters): void { Object.assign(filters, value) }
  function resetFilters(): void { Object.assign(filters, blankInsightFilters(), defaults) }
  return { filters, page, data, items, loading, error, load, changeFilters, resetFilters }
}
