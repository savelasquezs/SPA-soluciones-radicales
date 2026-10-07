import type { ServiceKind, ServiceState } from './adminServices'

export type DeviceState = 'ACTIVO' | 'FUERA_DE_USO' | 'DANADO'
export type MipEvaluation = 'C' | 'CP' | 'NC' | 'NA'

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
}

export interface TechnicianProduct {
  id: string
  nombre: string
  principioActivo: string
  lote: string
  fechaFabricacion: string | null
  fechaVencimiento: string | null
  dosis: string
  metodoAplicacion: string
}

export interface TechnicianCriterion {
  id: string
  criterioId: string
  nombre: string
  soloAreaExterna: boolean
  evaluacion: MipEvaluation | null
  observacion: string | null
  evidenciasStoragePaths: string[]
  version: number
}

export interface TechnicianDevice {
  id: string
  dispositivoId: string
  numero: string
  ubicacion: string
  tipoCodigo: string
  estadoAnterior: DeviceState
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
  version: number
  criterios: TechnicianCriterion[]
  dispositivos: TechnicianDevice[]
}

export interface TechnicianServicePackage {
  service: TechnicianServiceSummary
  frozen: boolean
  serverNow: string
  canStart: boolean
  startAvailableAt: string
  products: TechnicianProduct[]
  areas: TechnicianArea[]
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
