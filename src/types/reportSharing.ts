export interface ServiceReportCertificateOption {
  id: string
  label: string
  type: 'ESTABLECIMIENTO' | 'VEHICULO'
  expiresOn: string
}
export interface ServiceReportShareOptions {
  registeredEmails: string[]
  certificates: ServiceReportCertificateOption[]
  activeLinks: number
  lastSharedAt: string | null
  gmailConnected: boolean
  gmailNeedsReauthorization?: boolean
}
export interface SendServiceReportInput {
  requestId: string
  recipients: string[]
  certificateIds: string[]
  /** Exact SPA origin; validated against ALLOWED_ORIGINS on the server. */
  origin: string
  /** Editable message; null uses backend defaults for existing clients. */
  subject: string | null
  message: string | null
}
export interface SendServiceReportResult {
  sent: boolean
  linkExpiresAt: string
  attachmentCount: number
}
