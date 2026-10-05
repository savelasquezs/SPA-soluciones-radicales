export type ActiveRole = 'ADMINISTRADOR' | 'TECNICO'

export type ThemePreference = 'light' | 'dark' | 'system'
export type DateOnly = string
export type TimeOnly = string
export type LocalDateTime = string

export type SessionProfile = {
  id: string
  nombreCompleto: string
  correoGoogle: string
  esAdmin: boolean
  esTecnico: boolean
  rolActivo: ActiveRole | null
  requiereSeleccionRol: boolean
}

export type UserRecord = {
  id: string
  authUserId: string | null
  nombreCompleto: string
  correoGoogle: string
  esAdmin: boolean
  esTecnico: boolean
  activo: boolean
  certificadoStoragePath: string | null
  certificadoFechaEmision: DateOnly | null
  certificadoFechaVencimiento: DateOnly | null
  certificadoObservaciones: string | null
  version: number
}

export type UserInput = Omit<UserRecord, 'id' | 'authUserId' | 'version'> & { version?: number }

export type Technician = {
  id: string
  nombreCompleto: string
  correoGoogle: string
}

export type ClientSite = {
  negocioId: string
  nit: string
  negocioNombre: string
  sedeId: string
  sedeNombre: string
  direccion: string
  valorServicio: number
  duracionServicioMinutos: number
}

export type ServiceRecord = {
  id: string
  solicitud: string
  negocioNombre?: string
  sedeNombre?: string
  tecnicoNombre?: string
  inicioProgramado?: string
  finProgramado?: string
  estado?: string
  calendarSyncEstado: 'NO_APLICA' | 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR'
  calendarSyncError?: string | null
  calendarEventId?: string
  warning?: string
}

export type ServiceDraft = {
  sedeId: string
  tecnicoResponsableId: string
  tecnicosColaboradoresIds: string[]
  inicioProgramado: string
  duracionMinutos: string
  observaciones: string
}

export type NotificationTone = 'success' | 'error' | 'warning' | 'info'

export type AppNotification = {
  id: string
  message: string
  tone: NotificationTone
}
