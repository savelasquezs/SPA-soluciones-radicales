import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInsightList } from '@/composables/useInsightList'
import type { InsightQuery, SiteCollection } from '@/types/siteInsights'
const mocks = vi.hoisted(() => ({ show: vi.fn<(message: string, tone: string) => void>() }))
vi.mock('@/stores/notifications', () => ({ useNotificationsStore: () => ({ show: mocks.show }) }))
type Item = { id: string }
const result = (page = 1): SiteCollection<Item> => ({ items: [{ id: String(page) }], total: 40, page, pageSize: 20, areas: [], traps: [] })
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('route-local insight lists', () => {
  it('preserves tab data and resets a changed filter to page one with one request', async () => {
    const scope = effectScope(), active = ref(true)
    const loader = vi.fn<(query: InsightQuery, signal: AbortSignal) => Promise<SiteCollection<Item>>>().mockImplementation(async query => result(query.page))
    const list = scope.run(() => useInsightList(() => 'site', () => active.value, loader))!
    await flushPromises()
    expect(loader).toHaveBeenCalledTimes(1)
    list.page.value = 2
    await flushPromises()
    expect(loader).toHaveBeenCalledTimes(2)
    list.filters.state = 'ACTIVO'
    await flushPromises()
    expect(list.page.value).toBe(1)
    expect(loader).toHaveBeenCalledTimes(3)
    active.value = false
    await nextTick()
    active.value = true
    await flushPromises()
    expect(loader).toHaveBeenCalledTimes(3)
    scope.stop()
  })
  it('debounces search and aborts stale work when changing the site', async () => {
    vi.useFakeTimers()
    const scope = effectScope(), site = ref('one')
    const loader = vi.fn<(query: InsightQuery, signal: AbortSignal) => Promise<SiteCollection<Item>>>().mockResolvedValue(result())
    const list = scope.run(() => useInsightList(() => site.value, () => true, loader))!
    await flushPromises()
    list.filters.search = 'a'
    await nextTick()
    list.filters.search = 'abc'
    await nextTick()
    expect(loader).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(250)
    expect(loader).toHaveBeenCalledTimes(2)
    site.value = 'two'
    await flushPromises()
    expect(list.filters.search).toBe('')
    expect(list.page.value).toBe(1)
    expect(loader).toHaveBeenCalledTimes(3)
    scope.stop()
  })
  it('keeps content on refresh errors and exposes retry', async () => {
    const scope = effectScope()
    const loader = vi.fn<(query: InsightQuery, signal: AbortSignal) => Promise<SiteCollection<Item>>>().mockResolvedValue(result())
    const list = scope.run(() => useInsightList(() => 'site', () => true, loader))!
    await flushPromises()
    loader.mockRejectedValueOnce(new Error('network'))
    await list.load()
    expect(list.items.value).toHaveLength(1)
    expect(list.error.value).toContain('Revisa la conexión')
    expect(mocks.show).toHaveBeenCalledTimes(1)
    await list.load()
    expect(list.error.value).toBeNull()
    scope.stop()
  })
})
