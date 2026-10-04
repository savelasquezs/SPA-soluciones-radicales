import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { AppNotification, NotificationTone } from '@/types/domain'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])

  function show(message: string, tone: NotificationTone = 'info'): void {
    const id = crypto.randomUUID()
    items.value.push({ id, message, tone })
    window.setTimeout(() => dismiss(id), 5_000)
  }

  function dismiss(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, show, dismiss }
})
