import { openDB, type DBSchema } from 'idb'

interface OfflineDatabase extends DBSchema {
  drafts: { key: string; value: unknown }
  technicianPackages: { key: string; value: unknown }
}

export const offlineDatabase = openDB<OfflineDatabase>('soluciones-radicales-offline', 2, {
  upgrade(database) {
    if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts')
    if (!database.objectStoreNames.contains('technicianPackages')) database.createObjectStore('technicianPackages')
  },
})
