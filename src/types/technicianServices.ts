import type { ServiceKind, ServiceState } from './adminServices'
import type { PestGroup } from './mipCatalogs'

export type DeviceState = 'ACTIVO' | 'FUERA_DE_USO' | 'DANADO'
export type MipEvaluation = 'C' | 'CP' | 'NC' | 'NA'
export type FindingState = 'ABIERTO' | 'EN_PROCESO' | 'CERRADO'
export type FindingReview = 'SIN_CAMBIOS' | 'EN_PROCESO' | 'CERRADO'

export interface TechnicianServiceSummary {
  id: string
  solicitud: string
  tipoServicio: ServiceKind
  estado: ServiceState
  version: number
  inicioProgramado: string
  finProgramado: string
  inicioReal: string | null
  clienteNombre: string
  sedeNombre: string
  // Datos para el borrador local; el backend decide el contacto al persistir.
  contactoPrincipalNombre?: string
  contactoPrincipalCorreo?: string | null
  /** Registered client/site emails cached for offline report delivery choices. */
  contactEmails?: string[]
  direccion: string
  autoPrepareEligible: boolean
}

export interface TechnicianProduct {
  id: string
  nombre: string
  principioActivo: string
  registroSanitario: string
  dosisReferencia: string
  lote: string
  fechaFabricacion: string | null
  fechaVencimiento: string | null
  dosis: string
  metodoAplicacion: string
  fichaTecnicaDisponible?: boolean
}

export interface TechnicianCriterion {
  id: string
  criterioId: string
  nombre: string
  soloAreaExterna: boolean
  evaluacion: MipEvaluation | null
  observacion: string | null
  evidenciasStoragePaths: string[]
  evidenciasLocalIds?: string[]
  version: number
}

export interface TechnicianDevice {
  id: string
  dispositivoId: string
  numero: string
  ubicacion: string
  tipoCodigo: string
  tipoNombre: string
  clasificacion: PestGroup | null
  plagas: TechnicianPestSnapshot[]
  estadoAnterior: DeviceState
  creadoDuranteServicio: boolean
  creacionPendiente?: boolean
  revisado: boolean
  revision: TechnicianDeviceReview | null
}

export interface TechnicianPestSnapshot {
  codigo: string
  nombre: string
}

export interface TechnicianDeviceTypeSnapshot {
  codigo: string
  nombre: string
  clasificacion: PestGroup
  plagas: TechnicianPestSnapshot[]
}

export interface TechnicianDeviceCreationInput {
  numero: string
  tipoCodigo: string
  ubicacion: string
}

export interface TechnicianDeviceCapture {
  plagaCodigo: string
  plagaNombreSnapshot: string
  cantidad: number
}

export interface TechnicianDeviceReview {
  id: string
  estadoObservado: DeviceState
  capturas: TechnicianDeviceCapture[]
  consumo: string
  productoQuimico: string
  antidoto: string
  observaciones: string
  fotoStoragePath: string | null
  fotoLocalId?: string | null
  version: number
}

export interface TechnicianDeviceReviewInput {
  estadoObservado: DeviceState
  capturas: Array<{ plagaCodigo: string; cantidad: number }>
  consumo: string
  productoQuimico: string
  antidoto: string
  observaciones: string
}

export interface TechnicianFindingVisit {
  id: string
  servicioId: string
  solicitud: string
  fecha: string
  resultado: FindingReview
  observacion: string | null
  evidenciasStoragePaths: string[]
}

export interface TechnicianFinding {
  id: string
  servicioAperturaId: string
  fechaApertura: string
  descripcion: string
  recomendacionAccion: string
  evidenciasAperturaStoragePaths: string[]
  evidenciasAperturaLocalIds?: string[]
  estado: FindingState
  /** Resultado de la revisión en el servicio actual, no el estado histórico del hallazgo. */
  resultadoSeguimiento?: FindingReview | null
  estadoAnteriorSeguimiento?: FindingState | null
  observacionSeguimiento?: string | null
  evidenciasSeguimientoStoragePaths?: string[]
  evidenciasSeguimientoLocalIds?: string[]
  historialSeguimientos?: TechnicianFindingVisit[]
  responsableNombre: string
  responsableCorreo: string | null
  servicioCierreId: string | null
  fechaCierre: string | null
  evidenciasCierreStoragePaths: string[]
  evidenciasCierreLocalIds?: string[]
  observacionCierre: string | null
  version: number
}

export interface TechnicianFindingCreateInput {
  descripcion: string
  recomendacionAccion: string
}

export interface TechnicianFindingStatusInput {
  estado: FindingReview
  observacionCierre: string
}

export interface TechnicianArea {
  id: string
  areaId: string
  nombre: string
  esExterna: boolean
  posicionInicial: number
  posicionRecorrido: number
  sinAcceso: boolean
  sinAccesoDescripcion: string | null
  sinAccesoFotoStoragePath: string | null
  sinAccesoFotoLocalId?: string | null
  sinAccesoEvidenciasStoragePaths?: string[]
  sinAccesoEvidenciasLocalIds?: string[]
  version: number
  criterios: TechnicianCriterion[]
  dispositivos: TechnicianDevice[]
  hallazgos: TechnicianFinding[]
}

export interface TechnicianServicePackage {
  service: TechnicianServiceSummary
  frozen: boolean
  serverNow: string
  canStart: boolean
  startAvailableAt: string
  products: TechnicianProduct[]
  deviceTypes: TechnicianDeviceTypeSnapshot[]
  areas: TechnicianArea[]
  signatures: TechnicianServiceSignatures
}

export interface TechnicianServiceSignatures {
  technicianStoragePath: string | null
  technicianUserId: string | null
  technicianLocalId?: string | null
  clientStoragePath: string | null
  clientName: string | null
  clientSignedAt: string | null
  clientLocalId?: string | null
}

export interface TechnicianExecutionLock {
  token: string
  deviceId: string
  acquiredAt: string
}

export interface TechnicianExecutionSession {
  package: TechnicianServicePackage
  lock: TechnicianExecutionLock
}

export interface TechnicianPendingOperation {
  kind: 'START' | 'CLAIM'
  requestId: string
  version: number | null
}

export interface TechnicianPackageCache {
  schemaVersion: 1
  actorId: string
  serviceId: string
  deviceId: string
  savedAt: string
  package: TechnicianServicePackage
  lock: TechnicianExecutionLock | null
  pendingOperation: TechnicianPendingOperation | null
}

export interface TechnicianAreaOrderVersion {
  id: string
  version: number
}

export interface TechnicianAreaOrderResult {
  areas: Array<TechnicianAreaOrderVersion & { posicionRecorrido: number }>
}

export interface TechnicianAreaOrderConflict {
  areaIds: string[]
  versions: TechnicianAreaOrderVersion[]
}

interface TechnicianMutationBase {
  schemaVersion: 1
  requestId: string
  actorId: string
  serviceId: string
  deviceId: string
  lockToken: string
  status: 'PENDING' | 'SENDING' | 'CONFLICT'
  createdAt: string
  updatedAt: string
  error: string | null
}

export interface TechnicianAreaOrderMutation extends TechnicianMutationBase {
  kind: 'AREA_ORDER'
  areaIds: string[]
  versions: TechnicianAreaOrderVersion[]
  conflict: TechnicianAreaOrderConflict | null
}

export interface TechnicianCriterionEvaluationResult {
  criterion: TechnicianCriterion
  removedEvidenceStoragePaths: string[]
}

export interface TechnicianCriterionEvaluationMutation extends TechnicianMutationBase {
  kind: 'CRITERION_EVALUATION'
  areaId: string
  criterionId: string
  evaluation: MipEvaluation
  observation: string
  evidences: TechnicianCriterionEvidenceMutation[]
  retainedEvidenceStoragePaths: string[]
  version: number
  conflict: TechnicianCriterion | null
}

export interface TechnicianCriterionEvidenceMutation {
  mediaId: string
  storagePath: string | null
}

export interface TechnicianAreaAccessState {
  id: string
  sinAcceso: boolean
  sinAccesoDescripcion: string | null
  sinAccesoFotoStoragePath: string | null
  sinAccesoEvidenciasStoragePaths?: string[]
  version: number
}

export interface TechnicianAreaAccessResult {
  area: TechnicianAreaAccessState
}

export interface TechnicianAreaAccessMutation extends TechnicianMutationBase {
  kind: 'AREA_ACCESS'
  areaId: string
  withoutAccess: boolean
  description: string
  photoMediaId: string | null
  photoStoragePath: string | null
  evidences?: TechnicianCriterionEvidenceMutation[]
  retainedEvidenceStoragePaths?: string[]
  version: number
  conflict: TechnicianAreaAccessState | null
}

export interface TechnicianDeviceReviewResult {
  review: TechnicianDeviceReview
}

export interface TechnicianDeviceCreationResult {
  device: TechnicianDevice
}

export interface TechnicianDeviceCreationMutation extends TechnicianMutationBase, TechnicianDeviceCreationInput {
  kind: 'DEVICE_CREATE'
  areaId: string
  permanentDeviceId: string
  serviceDeviceId: string
}

export interface TechnicianDeviceReviewMutation extends TechnicianMutationBase, TechnicianDeviceReviewInput {
  kind: 'DEVICE_REVIEW'
  areaId: string
  serviceDeviceId: string
  reviewId: string
  photoMediaId: string | null
  photoStoragePath: string | null
  version: number
  conflict: TechnicianDeviceReview | null
}

export interface TechnicianFindingEvidenceMutation {
  mediaId: string
  storagePath: string | null
}

export interface TechnicianFindingResult {
  finding: TechnicianFinding
}

export interface TechnicianFindingCreateMutation extends TechnicianMutationBase, TechnicianFindingCreateInput {
  kind: 'FINDING_CREATE'
  areaId: string
  findingId: string
  evidences: TechnicianFindingEvidenceMutation[]
}

export interface TechnicianFindingStatusMutation extends TechnicianMutationBase, TechnicianFindingStatusInput {
  kind: 'FINDING_STATUS'
  areaId: string
  findingId: string
  version: number
  evidences: TechnicianFindingEvidenceMutation[]
  conflict: TechnicianFinding | null
}

export interface TechnicianServiceFinalizeMutation extends TechnicianMutationBase {
  kind: 'SERVICE_FINALIZE'
  technicianMediaId: string
  clientMediaId: string
  technicianStoragePath: string | null
  clientStoragePath: string | null
  clientName: string
}

export interface TechnicianMediaDraft {
  schemaVersion: 1
  id: string
  actorId: string
  serviceId: string
  areaId?: string
  criterionId?: string
  serviceDeviceId?: string
  fileName: string
  contentType: string
  size: number
  lastModified: number
  bytes: ArrayBuffer
  savedAt: string
}

export type TechnicianMutation = TechnicianAreaOrderMutation | TechnicianCriterionEvaluationMutation | TechnicianAreaAccessMutation | TechnicianDeviceCreationMutation | TechnicianDeviceReviewMutation | TechnicianFindingCreateMutation | TechnicianFindingStatusMutation | TechnicianServiceFinalizeMutation
