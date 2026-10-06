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

export type ClientType = 'NEGOCIO' | 'RESIDENCIAL'

export type ClientRecord = {
  id: string
  tipoCliente: ClientType
  nombre: string
  nit: string | null
  correos: string[]
  activo: boolean
  version: number
  vigenciaCertificadoMeses: number | null
  residenciaDireccion: string | null
  residenciaCelular: string | null
  sedesCount: number
}

export type ClientInput = Pick<
  ClientRecord,
  | 'tipoCliente'
  | 'nombre'
  | 'nit'
  | 'correos'
  | 'activo'
  | 'vigenciaCertificadoMeses'
  | 'residenciaDireccion'
  | 'residenciaCelular'
> & { version?: number }

export type SiteRecord = {
  id: string
  clientId: string
  nombre: string
  direccion: string
  correos: string[]
  heredaCorreosCliente: boolean
  contactoPrincipalNombre: string
  contactoPrincipalCorreo: string | null
  contactoPrincipalCelular: string
  valorServicio: number
  periodicidadMeses: number
  manejaRefuerzo: boolean
  tipoSede: 'NEGOCIO' | 'RESIDENCIAL'
  formulariosAplicablesIds: string[]
  planoStoragePath: string | null
  manejaVehiculos: boolean
  generaCertificadoVehiculo: boolean
  vigenciaCertificadoVehiculoMeses: number | null
  duracionServicioMinutos: number
  activo: boolean
  version: number
  areasCount: number
  formulariosCount: number
  proximoServicio: string | null
}

export type SiteInput = Pick<
  SiteRecord,
  | 'nombre'
  | 'direccion'
  | 'correos'
  | 'heredaCorreosCliente'
  | 'contactoPrincipalNombre'
  | 'contactoPrincipalCorreo'
  | 'contactoPrincipalCelular'
  | 'valorServicio'
  | 'periodicidadMeses'
  | 'manejaRefuerzo'
  | 'formulariosAplicablesIds'
  | 'planoStoragePath'
  | 'manejaVehiculos'
  | 'generaCertificadoVehiculo'
  | 'vigenciaCertificadoVehiculoMeses'
  | 'duracionServicioMinutos'
  | 'activo'
> & { version?: number }

export type AreaRecord = {
  id: string
  siteId: string
  nombre: string
  esExterna: boolean
  activo: boolean
  version: number
  dispositivosCount: number
  ultimoServicio: string | null
}

export type AreaInput = Pick<AreaRecord, 'nombre' | 'esExterna' | 'activo'> & { version?: number }

export type FormOption = {
  id: string
  codigo: string
  nombre: string
  version: string
}

export type ServiceHistoryItem = {
  id: string
  solicitud: string
  fecha: string
  tipo: string
  tecnico: string
  estado: string
  valor: number
}

export type PaginatedResult<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
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
