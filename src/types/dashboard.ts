export type DashboardPeriod = '7d' | '30d' | '90d' | '12m' | '24m' | '5y' | 'custom'

export interface DashboardSiteOption { id: string; clientId: string; name: string }
export interface DashboardClientOption { id: string; name: string }
export interface DashboardServiceRow {
  id: string
  reference: string
  clientName: string
  siteName: string
  clientId: string
  siteId: string
  date: string
  technician: string
  status: 'PROGRAMADO' | 'EN_PROCESO' | 'FINALIZADO'
  value: number
  payment: string
}
export interface DashboardFindingRow {
  id: string
  clientId: string
  siteId: string
  clientName: string
  siteName: string
  area: string
  description: string
  openedAt: string
  status: 'ABIERTO' | 'EN_PROCESO' | 'CERRADO'
}
export interface DashboardSnapshot {
  generatedAt: string
  period: { id: DashboardPeriod; from: string; to: string }
  filters: { clients: DashboardClientOption[]; sites: DashboardSiteOption[] }
  kpis: {
    today: { scheduled: number; ongoing: number; completed: number }
    delayed: number
    upcoming: number
    upcomingOverdue: number
    performedValue: number
    performedDelta: number | null
    outstandingValue: number
    outstandingPayments: number
    findings: { open: number; ongoing: number }
  }
  alerts: { expiringCertificates: number; calendarErrors: number }
  charts: {
    services: Array<{ date: string; scheduled: number; ongoing: number; completed: number; cancelled: number }>
    value: Array<{ date: string; value: number }>
    compliance: Array<{ date: string; percentage: number | null; visits: number }>
  }
  tables: {
    upcoming: DashboardServiceRow[]
    latest: DashboardServiceRow[]
    findings: DashboardFindingRow[]
  }
}
