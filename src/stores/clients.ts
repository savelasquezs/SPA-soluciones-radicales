import { defineStore } from 'pinia'

import * as clientsService from '@/services/clientsService'
import { useAdminServicesStore } from '@/stores/adminServices'
import type { AreaInput, AreaRecord, ClientInput, ClientRecord, SiteInput, SiteRecord, VehicleInput, VehicleRecord } from '@/types/domain'

type ClientsState = {
  clientsById: Record<string, ClientRecord>
  activeClientIds: string[]
  inactiveClientIds: string[]
  sitesByClientId: Record<string, string[]>
  sitesById: Record<string, SiteRecord>
  areasBySiteId: Record<string, string[]>
  areasById: Record<string, AreaRecord>
  vehiclesBySiteId: Record<string, string[]>
  vehiclesById: Record<string, VehicleRecord>
  activeLoaded: boolean
  inactiveLoaded: boolean
}

export const useClientsStore = defineStore('clients', {
  state: (): ClientsState => ({
    clientsById: {},
    activeClientIds: [],
    inactiveClientIds: [],
    sitesByClientId: {},
    sitesById: {},
    areasBySiteId: {},
    areasById: {},
    vehiclesBySiteId: {},
    vehiclesById: {},
    activeLoaded: false,
    inactiveLoaded: false,
  }),
  getters: {
    activeClients: (state) => state.activeClientIds.map((id) => state.clientsById[id]).filter(Boolean) as ClientRecord[],
    inactiveClients: (state) => state.inactiveClientIds.map((id) => state.clientsById[id]).filter(Boolean) as ClientRecord[],
    sitesForClient: (state) => (clientId: string) => (state.sitesByClientId[clientId] ?? [])
      .map((id) => state.sitesById[id]).filter(Boolean) as SiteRecord[],
    areasForSite: (state) => (siteId: string) => (state.areasBySiteId[siteId] ?? [])
      .map((id) => state.areasById[id]).filter(Boolean) as AreaRecord[],
    vehiclesForSite: (state) => (siteId: string) => (state.vehiclesBySiteId[siteId] ?? [])
      .map((id) => state.vehiclesById[id]).filter(Boolean) as VehicleRecord[],
  },
  actions: {
    async loadClients(active: boolean, force = false): Promise<ClientRecord[]> {
      const loaded = active ? this.activeLoaded : this.inactiveLoaded
      if (loaded && !force) return active ? this.activeClients : this.inactiveClients
      const clients = await clientsService.listClients(active)
      clients.forEach((client) => { this.clientsById[client.id] = client })
      const ids = clients.map((client) => client.id)
      if (active) {
        this.activeClientIds = ids
        this.activeLoaded = true
      } else {
        this.inactiveClientIds = ids
        this.inactiveLoaded = true
      }
      return clients
    },
    async ensureClient(id: string): Promise<ClientRecord> {
      const cached = this.clientsById[id]
      if (cached) return cached
      const client = await clientsService.getClient(id)
      this.upsertClient(client)
      return client
    },
    async createClient(input: ClientInput): Promise<ClientRecord> {
      const client = await clientsService.createClient(input)
      this.upsertClient(client)
      if (client.tipoCliente === 'RESIDENCIAL') useAdminServicesStore().invalidateOptions()
      return client
    },
    async updateClient(id: string, input: ClientInput): Promise<ClientRecord> {
      const client = await clientsService.updateClient(id, input)
      this.upsertClient(client)
      if (client.tipoCliente === 'RESIDENCIAL') useAdminServicesStore().invalidateOptions()
      return client
    },
    async removeClient(id: string, version: number): Promise<void> {
      await clientsService.deleteClient(id, version)
      this.activeClientIds = this.activeClientIds.filter((current) => current !== id)
      this.inactiveClientIds = this.inactiveClientIds.filter((current) => current !== id)
      delete this.clientsById[id]
    },
    upsertClient(client: ClientRecord): void {
      this.clientsById[client.id] = client
      this.activeClientIds = this.activeClientIds.filter((id) => id !== client.id)
      this.inactiveClientIds = this.inactiveClientIds.filter((id) => id !== client.id)
      const target = client.activo ? this.activeClientIds : this.inactiveClientIds
      target.push(client.id)
      target.sort((left, right) => this.clientsById[left]!.nombre.localeCompare(this.clientsById[right]!.nombre, 'es'))
    },
    async loadSites(clientId: string, force = false): Promise<SiteRecord[]> {
      if (!force && this.sitesByClientId[clientId]) return this.sitesForClient(clientId)
      const sites = await clientsService.listSites(clientId)
      sites.forEach((site) => { this.sitesById[site.id] = site })
      this.sitesByClientId[clientId] = sites.map((site) => site.id)
      return sites
    },
    async ensureSite(id: string): Promise<SiteRecord> {
      const cached = this.sitesById[id]
      if (cached) return cached
      const site = await clientsService.getSite(id)
      this.upsertSite(site)
      return site
    },
    async createSite(clientId: string, input: SiteInput): Promise<SiteRecord> {
      const site = await clientsService.createSite(clientId, input)
      this.upsertSite(site)
      return site
    },
    async updateSite(id: string, input: SiteInput): Promise<SiteRecord> {
      const site = await clientsService.updateSite(id, input)
      this.upsertSite(site)
      return site
    },
    async removeSite(site: SiteRecord): Promise<void> {
      await clientsService.deleteSite(site.id, site.version)
      this.sitesByClientId[site.clientId] = (this.sitesByClientId[site.clientId] ?? []).filter((id) => id !== site.id)
      delete this.sitesById[site.id]
    },
    upsertSite(site: SiteRecord): void {
      this.sitesById[site.id] = site
      const ids = this.sitesByClientId[site.clientId] ?? []
      if (!ids.includes(site.id)) ids.push(site.id)
      this.sitesByClientId[site.clientId] = ids
    },
    async loadAreas(siteId: string, force = false): Promise<AreaRecord[]> {
      if (!force && this.areasBySiteId[siteId]) return this.areasForSite(siteId)
      const areas = await clientsService.listAreas(siteId)
      areas.forEach((area) => { this.areasById[area.id] = area })
      this.areasBySiteId[siteId] = areas.map((area) => area.id)
      return areas
    },
    async createArea(siteId: string, input: AreaInput): Promise<AreaRecord> {
      const area = await clientsService.createArea(siteId, input)
      this.upsertArea(area)
      return area
    },
    async updateArea(id: string, input: AreaInput): Promise<AreaRecord> {
      const area = await clientsService.updateArea(id, input)
      this.upsertArea(area)
      return area
    },
    async removeArea(area: AreaRecord): Promise<void> {
      await clientsService.deleteArea(area.id, area.version)
      this.areasBySiteId[area.siteId] = (this.areasBySiteId[area.siteId] ?? []).filter((id) => id !== area.id)
      delete this.areasById[area.id]
    },

    async loadVehicles(siteId: string, force = false): Promise<VehicleRecord[]> {
      if (!force && this.vehiclesBySiteId[siteId]) return this.vehiclesForSite(siteId)
      const rows = await clientsService.listVehicles(siteId)
      rows.forEach((vehicle) => { this.vehiclesById[vehicle.id] = vehicle })
      this.vehiclesBySiteId[siteId] = rows.map((vehicle) => vehicle.id)
      return rows
    },
    async createVehicle(siteId: string, input: VehicleInput): Promise<VehicleRecord> {
      const saved = await clientsService.createVehicle(siteId, input)
      this.upsertVehicle(saved)
      return saved
    },
    async updateVehicle(id: string, input: VehicleInput): Promise<VehicleRecord> {
      const saved = await clientsService.updateVehicle(id, input)
      this.upsertVehicle(saved)
      return saved
    },
    async removeVehicle(vehicle: VehicleRecord): Promise<void> {
      await clientsService.deleteVehicle(vehicle.id, vehicle.version)
      this.vehiclesBySiteId[vehicle.siteId] = (this.vehiclesBySiteId[vehicle.siteId] ?? []).filter(id => id !== vehicle.id)
      delete this.vehiclesById[vehicle.id]
    },
    upsertVehicle(vehicle: VehicleRecord): void {
      this.vehiclesById[vehicle.id] = vehicle
      const ids = this.vehiclesBySiteId[vehicle.siteId] ?? []
      if (!ids.includes(vehicle.id)) ids.push(vehicle.id)
      this.vehiclesBySiteId[vehicle.siteId] = ids
    },
    upsertArea(area: AreaRecord): void {
      this.areasById[area.id] = area
      const ids = this.areasBySiteId[area.siteId] ?? []
      if (!ids.includes(area.id)) ids.push(area.id)
      this.areasBySiteId[area.siteId] = ids
    },
  },
})
