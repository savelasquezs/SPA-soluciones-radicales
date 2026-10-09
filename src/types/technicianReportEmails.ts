import type { SendServiceReportInput } from './reportSharing'

/** Local, actor-scoped email intention. Kept separate from the service-mutation queue. */
export interface TechnicianReportEmailIntent {
  schemaVersion: 1
  actorId: string
  serviceId: string
  requestId: string
  input: SendServiceReportInput
  status: 'PENDING' | 'SENDING' | 'NEEDS_REVIEW'
  attempts: number
  nextRetryAt: string | null
  createdAt: string
  updatedAt: string
  error: string | null
}
