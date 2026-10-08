import type { DeviceState, FindingState, TechnicianDeviceCapture } from './technicianServices'
import type { ServiceState } from './adminServices'

export interface InsightService {
  id: string
  number: string
  state: ServiceState
  date: string
  technician: string
}

export type EvidenceKind = 'REVIEW' | 'OPENING' | 'CLOSURE'
export interface EvidenceReference {
  kind: EvidenceKind
  recordId: string
  index: number
  label: string
  date: string
}
export type EvidenceAccess =
  | { status: 'AVAILABLE'; url: string; expiresAt: string }
  | { status: 'MISSING' | 'EXPIRED'; url: null; expiresAt: null }
export type EvidenceDisplayState = 'IDLE' | 'LOADING' | 'AVAILABLE' | 'MISSING' | 'EXPIRED' | 'ERROR'

export interface MonitoringPoint {
  id: string
  number: string
  areaId: string
  areaName: string
  areaActive: boolean
  location: string
  trapCode: string
  trapName: string
  classification: string | null
  condition: DeviceState
  enabled: boolean
  createdAt: string
  lastReview: InsightService | null
  inProgress: boolean
}

export interface ServiceProductSnapshot {
  name: string
  ingredient: string | null
  method: string | null
  dose: string | null
  batch: string | null
  expiry: string | null
}

export interface MonitoringReview {
  id: string
  service: InsightService
  number: string
  areaName: string
  location: string
  trapName: string
  previousCondition: DeviceState
  condition: DeviceState
  captures: TechnicianDeviceCapture[]
  consumption: string | null
  chemical: string | null
  antidote: string | null
  notes: string | null
  photos: EvidenceReference[]
  serviceProducts: ServiceProductSnapshot[]
}

export interface SiteFinding {
  id: string
  areaId: string
  areaName: string
  state: FindingState
  description: string
  recommendation: string
  responsibleName: string
  responsibleEmail: string | null
  openedAt: string
  closedAt: string | null
  closingNotes: string | null
  openingService: InsightService
  closingService: InsightService | null
  photos: EvidenceReference[]
}

export interface InsightPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface InsightOption { value: string; label: string }
export interface SiteCollection<T> extends InsightPage<T> {
  areas: InsightOption[]
  traps: InsightOption[]
}
export interface InsightFilters {
  search: string
  area: string
  state: string
  active: string
  trap: string
  from: string
  to: string
}
export interface InsightQuery extends InsightFilters { page: number }
