export type ServiceState = 'PROGRAMADO' | 'EN_PROCESO' | 'FINALIZADO' | 'CANCELADO'
export type ServiceKind = 'PRINCIPAL' | 'REFUERZO'
export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA'
export type PaymentState = 'SIN_REGISTRAR' | 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO'
export type FollowUpState = 'PENDIENTE' | 'CONTACTADO' | 'CONFIRMADO' | 'POSPUESTO' | 'NO_DESEA'
export type MailState = 'SIN_ENVIAR' | 'PENDIENTE' | 'ENVIADO' | 'ERROR' | 'INCIERTO'
export type ServiceErrors = Record<string, string>

export interface ServiceTechnician {
  id: string
  nombreCompleto: string
  correoGoogle: string
  activo: boolean
  tieneCertificado: boolean
  certificadoFechaVencimiento: string | null
}
export interface ServiceContact {
  nombre: string | null
  celular: string | null
  correos: string[]
}
export interface ServiceSite {
  id: string
  clientId: string
  clienteNombre: string
  nombre: string
  direccion: string
  valorServicio: number
  periodicidadMeses: number
  duracionServicioMinutos: number
  manejaRefuerzo: boolean
  contacto: ServiceContact
}
export interface ServiceProductOption {
  id: string
  nombre: string
  principioActivo: string
  dosisAplicacion: string | null
  metodos: ServiceProductMethodOption[]
  activo: boolean
}
export interface ServiceProductMethodOption {
  codigo: string
  nombre: string
}
export interface ServiceProductInput {
  productoId: string
  lote: string
  fechaFabricacion: string | null
  fechaVencimiento: string | null
  dosis: string
  metodoAplicacionCodigo: string
}
export interface ServiceProductRecord extends ServiceProductInput {
  id: string
  nombre: string
  metodoAplicacionNombre: string | null
  aplicado: boolean
  activo: boolean
}
/** Instants on the wire always include a timezone. Editors use Bogota wall time. */
export interface ServiceSchedule {
  inicioProgramado: string
  duracionMinutos: number
  tecnicoResponsableId: string
  tecnicosColaboradoresIds: string[]
}
export interface ServiceScheduleDraft extends Omit<ServiceSchedule, 'duracionMinutos'> {
  duracionMinutos: string
}
export interface ServiceCollectionPlan {
  metodoPago: PaymentMethod | null
  tecnicoRecaudoPrevistoId: string | null
}
export interface ServiceInput {
  sedeId: string
  programacion: ServiceSchedule
  refuerzo: ServiceSchedule | null
  productos: ServiceProductInput[]
  cobro: ServiceCollectionPlan
  observaciones: string
}
export interface ServiceEditorDraft extends Omit<ServiceInput, 'programacion' | 'refuerzo'> {
  programacion: ServiceScheduleDraft
  refuerzo: ServiceScheduleDraft | null
}
export interface ServiceLink {
  id: string
  solicitud: string
  tipoServicio: ServiceKind
  estado: ServiceState
  version: number
  inicioProgramado: string
  finProgramado: string
  tecnicoResponsableId: string
  tecnicosColaboradoresIds: string[]
}
export interface ServicePayment {
  metodoPago: PaymentMethod | null
  estadoPago: PaymentState
  tecnicoRecaudoPrevistoId: string | null
  recaudadoPorId: string | null
  recaudadoPorNombre: string | null
  pagoFecha: string | null
  confirmadoAt: string | null
  confirmadoPor: string | null
  comprobanteStoragePath: string | null
}
export interface ServiceCalendar {
  estado: 'NO_APLICA' | 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR'
  ultimaSyncAt: string | null
  error: string | null
}
export interface ServiceExecutionLock {
  userId: string
  userName: string
  acquiredAt: string
}
export interface AdminService extends ServiceLink {
  clientId: string
  clienteNombre: string
  sedeId: string
  sedeNombre: string
  direccion: string
  servicioPrincipalId: string | null
  inicioReal: string | null
  finReal: string | null
  responsable: ServiceTechnician
  colaboradores: ServiceTechnician[]
  contacto: ServiceContact
  valorServicio: number
  observaciones: string
  productos: ServiceProductRecord[]
  refuerzo: ServiceLink | null
  principal: ServiceLink | null
  pago: ServicePayment
  calendar: ServiceCalendar
  executionLock: ServiceExecutionLock | null
  motivoCancelacion: string | null
  canceladoAt: string | null
}
export interface UpcomingService {
  id: string
  clientId: string
  clienteNombre: string
  sedeId: string
  sedeNombre: string
  direccion: string
  contacto: ServiceContact
  principalAnteriorId: string
  principalAnteriorSolicitud: string
  ultimoServicioAt: string
  periodicidadMeses: number
  fechaSugerida: string
  estado: FollowUpState
  ultimoContactoAt: string | null
  canalUltimoContacto: 'WHATSAPP' | 'CORREO' | null
  fechaRecontacto: string | null
  nota: string
  version: number
  servicioAgendadoId: string | null
  correoEstado: MailState
  correoError: string | null
}
export interface ServiceWorkspace {
  sedes: ServiceSite[]
  tecnicos: ServiceTechnician[]
  productos: ServiceProductOption[]
}
export interface ServiceFilter {
  from: string
  to: string
  tab: 'agenda' | 'history'
  estado: ServiceState | ''
  tipo: ServiceKind | ''
  tecnicoId: string
  query: string
  page: number
  pageSize: number
}
export interface UpcomingFilter {
  from: string
  to: string
  estado: FollowUpState | ''
  query: string
  page: number
  pageSize: number
}
export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pendingCount: number
}
export interface ServiceMutation {
  services: AdminService[]
  upcoming: UpcomingService | null
  pendingCount: number
}
export interface ScheduleConflict {
  id: string
  solicitud: string
  clienteNombre: string
  sedeNombre: string
  inicioProgramado: string
  finProgramado: string
  tecnicos: string[]
}
export interface UpcomingPatch {
  estado: FollowUpState
  fechaRecontacto: string | null
  nota: string
  contactoRealizado: 'WHATSAPP' | 'CORREO' | null
}
export interface ServicePaymentInput {
  metodoPago: PaymentMethod
  estadoPago: Exclude<PaymentState, 'SIN_REGISTRAR'>
  recaudadoPorId: string | null
  motivo: string
}
export interface ConfirmationEmail {
  to: string
  subject: string
  text: string
}
