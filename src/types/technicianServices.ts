import type { ServiceKind, ServiceState } from './adminServices'
import type { PestGroup } from './mipCatalogs'

export type DeviceState = 'ACTIVO' | 'FUERA_DE_USO' | 'DANADO'
export type MipEvaluation = 'C' | 'CP' | 'NC' | 'NA'
export type FindingState = 'ABIERTO' | 'EN_PROCESO' | 'CERRADO'

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
  antidoto?: string
}

export interface TechnicianBaitProductSnapshot {
  id: string
  nombre: string
  antidoto: string
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
  tipoCodigo: string | null
  tipoNombre: string | null
  clasificacion: PestGroup | null
  plagas: TechnicianPestSnapshot[]
  estadoAnterior: DeviceState | null
  productoCebo?: TechnicianBaitProductSnapshot | null
  creadoDuranteServicio: boolean
  creacionPendiente?: boolean
  revisado: boolean
  revision: TechnicianDeviceReview | null
  version?: number
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
  /** Solo para compatibilidad con borradores antiguos; el servidor asigna el correlativo. */
  numero?: string
  tipoCodigo: string | null
  productoCeboId?: string | null
  ubicacion: string
}

export type TechnicianDeviceUpdateInput = TechnicianDeviceCreationInput

export interface TechnicianDeviceCapture {
  plagaCodigo: string
  plagaNombreSnapshot: string
  cantidad: number
}

export interface TechnicianDeviceReview {
  id: string
  estadoObservado: DeviceState | null
  capturas: TechnicianDeviceCapture[]
  consumoCeboPorcentaje?: number | null
  observaciones: string
  fotosStoragePaths?: string[]
  fotosLocalIds?: string[]
  /** Campos legacy conservados mientras se migra el histórico anterior. */
  consumo: string
  productoQuimico: string
  antidoto: string
  fotoStoragePath: string | null
  fotoLocalId?: string | null
  version: number
}

export interface TechnicianDeviceReviewInput {
  estadoObservado: DeviceState | null
  capturas: Array<{ plagaCodigo: string; cantidad: number }>
  consumoCeboPorcentaje?: number | null
  observaciones: string
  /** Campos legacy; la nueva interfaz no los pide como texto libre. */
  consumo: string
  productoQuimico: string
  antidoto: string
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
  responsableNombre: string
  responsableCorreo: string
}

export interface TechnicianFindingStatusInput {
  estado: Extract<FindingState, 'EN_PROCESO' | 'CERRADO'>
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
  sinAccesoFotosStoragePaths?: string[]
  sinAccesoFotosLocalIds?: string[]
  /** Campos legacy para caches creados antes de la evidencia múltiple. */
  sinAccesoFotoStoragePath: string | null
  sinAccesoFotoLocalId?: string | null
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
  baitProducts?: TechnicianBaitProductSnapshot[]
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
  sinAccesoFotosStoragePaths?: string[]
  sinAccesoFotoStoragePath: string | null
  version: number
}

export interface TechnicianAreaAccessResult {
  area: TechnicianAreaAccessState
  removedEvidenceStoragePaths?: string[]
}

export interface TechnicianAreaEvidenceMutation {
  mediaId: string
  storagePath: string | null
}

export interface TechnicianAreaAccessMutation extends TechnicianMutationBase {
  kind: 'AREA_ACCESS'
  areaId: string
  withoutAccess: boolean
  description: string
  evidences?: TechnicianAreaEvidenceMutation[]
  retainedEvidenceStoragePaths?: string[]
  /** Campos legacy para operaciones ya guardadas en IndexedDB. */
  photoMediaId: string | null
  photoStoragePath: string | null
  version: number
  conflict: TechnicianAreaAccessState | null
}

export interface TechnicianDeviceReviewResult {
  review: TechnicianDeviceReview
  removedEvidenceStoragePaths?: string[]
}

export interface TechnicianDeviceCreationResult {
  device: TechnicianDevice
}

export interface TechnicianDeviceUpdateResult {
  device: TechnicianDevice
}

export interface TechnicianDeviceCreationMutation extends TechnicianMutationBase, TechnicianDeviceCreationInput {
  kind: 'DEVICE_CREATE'
  areaId: string
  permanentDeviceId: string
  serviceDeviceId: string
  numeroProvisional?: string
}

export interface TechnicianDeviceUpdateMutation extends TechnicianMutationBase, TechnicianDeviceUpdateInput {
  kind: 'DEVICE_UPDATE'
  areaId: string
  serviceDeviceId: string
  version: number
  conflict: TechnicianDevice | null
}

export interface TechnicianDeviceEvidenceMutation {
  mediaId: string
  storagePath: string | null
}

export interface TechnicianDeviceReviewMutation extends TechnicianMutationBase, TechnicianDeviceReviewInput {
  kind: 'DEVICE_REVIEW'
  areaId: string
  serviceDeviceId: string
  reviewId: string
  evidences?: TechnicianDeviceEvidenceMutation[]
  retainedEvidenceStoragePaths?: string[]
  /** Campos legacy para operaciones ya guardadas en IndexedDB. */
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

export type TechnicianMutation = TechnicianAreaOrderMutation | TechnicianCriterionEvaluationMutation | TechnicianAreaAccessMutation
  | TechnicianDeviceCreationMutation | TechnicianDeviceUpdateMutation | TechnicianDeviceReviewMutation
  | TechnicianFindingCreateMutation | TechnicianFindingStatusMutation | TechnicianServiceFinalizeMutation
