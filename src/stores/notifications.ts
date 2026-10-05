import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import type { AppNotification, NotificationTone } from '@/types/domain'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const timers = new Map<string, number>()

  function show(message: string, tone: NotificationTone = 'info'): void {
    const id = crypto.randomUUID()
    items.value.push({ id, message, tone })
    timers.set(id, window.setTimeout(() => dismiss(id), 5_000))
  }

  function dismiss(id: string): void {
    const timer = timers.get(id)
    if (timer) window.clearTimeout(timer)
    timers.delete(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  onScopeDispose(() => timers.forEach((timer) => window.clearTimeout(timer)))

  return { items, show, dismiss }
})
