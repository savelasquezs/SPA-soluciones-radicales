/** Shared, provider-free certificate contracts. The server remains authoritative. */
export const CERTIFICATE_TYPES = ['ESTABLECIMIENTO', 'VEHICULO'] as const
export type CertificateType = typeof CERTIFICATE_TYPES[number]
export type CertificateTemplate = {
  type: CertificateType
  storagePath: string | null
  revision: string | null
  fileName: string | null
}
export type CertificateSettings = {
  templates: CertificateTemplate[]
  converterReady: boolean
}
export type CertificateVariable = { name: string; label: string; types?: CertificateType[] }
export const CERTIFICATE_VARIABLES: CertificateVariable[] = [
  { name: 'negocio_nombre', label: 'Nombre del negocio' },
  { name: 'nit', label: 'NIT del negocio' },
  { name: 'sede_nombre', label: 'Nombre de la sede' },
  { name: 'sede_direccion', label: 'Dirección de la sede' },
  { name: 'solicitud', label: 'Consecutivo del servicio' },
  { name: 'fecha_expedicion', label: 'Fecha de expedición' },
  { name: 'fecha_vencimiento', label: 'Fecha de vencimiento' },
  { name: 'tecnico_nombre', label: 'Técnico responsable' },
  { name: 'vehiculo_placa', label: 'Placa atendida', types: ['VEHICULO'] },
]
export const CERTIFICATE_BLOCKS: Record<string, CertificateVariable[]> = {
  productos: [
    { name: 'nombre', label: 'Producto aplicado' },
    { name: 'principio_activo', label: 'Principio activo' },
    { name: 'registro_sanitario', label: 'Registro sanitario' },
    { name: 'lote', label: 'Lote' },
    { name: 'metodo', label: 'Método de aplicación' },
  ],
  metodos: [{ name: 'nombre', label: 'Método de aplicación' }],
}
export type CertificateData = Record<string, string | Record<string, string>[]>
export type CertificateDocument = {
  id: string
  type: CertificateType
  vehicleId: string | null
  label: string
  storagePath: string
  issuedOn: string
  expiresOn: string
}
export type CertificateServiceOption = { id: string; solicitud: string; fecha: string }
export type CertificateContext = {
  serviceId: string
  solicitud: string
  clientName: string
  siteName: string
  recipients: string[]
  vehicles: { id: string; placa: string }[]
  documents: CertificateDocument[]
  availability: Record<CertificateType, { available: boolean; reason: string | null; templateSource: 'GLOBAL' | null }>
}
export type GenerateCertificateInput = {
  requestId: string
  serviceId: string
  type: CertificateType
  vehicleIds: string[]
  /** CAS token per target: vehicle ID or ESTABLECIMIENTO. null means no prior certificate. */
  previousPaths: Record<string, string | null>
  confirmReplace: boolean
}
export type CertificateGenerationResult = { documents: CertificateDocument[] }
export type SendCertificatesInput = {
  requestId: string
  serviceId: string
  documents: { id: string; storagePath: string }[]
  recipients: string[]
  subject: string
  text: string
}
