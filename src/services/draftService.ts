import { openDB } from 'idb'

import type { ServiceDraft } from '@/types/domain'

const database = openDB('soluciones-radicales-offline', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('drafts')) {
      db.createObjectStore('drafts')
    }
  },
})

const serviceDraftKey = 'service-programming'

export async function loadServiceDraft(): Promise<ServiceDraft | undefined> {
  return (await database).get('drafts', serviceDraftKey)
}

export async function saveServiceDraft(draft: ServiceDraft): Promise<void> {
  await (await database).put('drafts', draft, serviceDraftKey)
}

export async function clearServiceDraft(): Promise<void> {
  await (await database).delete('drafts', serviceDraftKey)
}
