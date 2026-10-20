import type { DashboardPeriod } from './dashboard'

export interface TechnicianDashboardService {
  id: string
  reference: string
  clientName: string
  siteName: string
  scheduledAt: string
  completedAt: string | null
  status: 'PROGRAMADO' | 'EN_PROCESO' | 'FINALIZADO'
  role: 'RESPONSABLE' | 'COLABORADOR'
}

export interface TechnicianDashboardSnapshot {
  generatedAt: string
  period: { id: DashboardPeriod; from: string; to: string }
  kpis: {
    completed: number
    scheduled: number
    ongoing: number
    overdue: number
    sites: number
    clients: number
    onTime: number
    started: number
    punctuality: number | null
    /** Elapsed calendar minutes, not active work time. */
    avgMinutes: number | null
  }
  charts: { completed: Array<{ date: string; count: number }> }
  activity: {
    /** Findings opened in assigned services (not necessarily authored by this person). */
    findings: number
    /** Follow-ups explicitly authored by this technician. */
    followUps: number
    findingsClosed: number
    /** Service-level actions from visits shared by responsible/collaborators. */
    reviewedDevices: number
    installedDevices: number
    appliedProducts: number
    /** Observed at client sites; this does not rate the technician. */
    mipCompliance: number | null
  }
  tables: { upcoming: TechnicianDashboardService[]; recent: TechnicianDashboardService[] }
}
