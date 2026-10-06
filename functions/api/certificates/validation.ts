import { ApiError } from '../auth'
import { CERTIFICATE_TYPES, type CertificateType, type GenerateCertificateInput, type SendCertificatesInput } from '../../../src/types/certificates'
import { assertMasterStoragePath } from '../r2'

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(422, 'El identificador no es válido')
  return value.toLowerCase()
}
export function certificateType(value: unknown): CertificateType {
  if (!CERTIFICATE_TYPES.includes(value as CertificateType)) throw new ApiError(422, 'Selecciona el tipo de certificado')
  return value as CertificateType
}
export function assertTemplatePath(value: unknown, type: CertificateType): asserts value is string {
  if (typeof value !== 'string') throw new ApiError(422, 'Selecciona una plantilla Word')
  assertMasterStoragePath(value)
  const prefix = type === 'ESTABLECIMIENTO' ? 'clients/establishment-templates/' : 'sites/vehicle-templates/'
  if (!value.startsWith(prefix) || !value.toLowerCase().endsWith('.docx')) throw new ApiError(422, 'La generación requiere una plantilla .docx del tipo seleccionado; PDF y .doc no son plantillas editables')
}
export async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > 32_000) throw new ApiError(413, 'La solicitud supera el tamaño permitido')
  try {
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid object')
    return data as Record<string, unknown>
  } catch { throw new ApiError(422, 'Revisa los datos de la solicitud') }
}
export function generationInput(body: Record<string, unknown>): GenerateCertificateInput {
  const type = certificateType(body.type)
  if (!Array.isArray(body.vehicleIds) || body.vehicleIds.length > 10) throw new ApiError(422, 'Selecciona hasta 10 vehículos por operación')
  const vehicleIds = [...new Set(body.vehicleIds.map(uuid))].sort()
  if ((type === 'VEHICULO' && !vehicleIds.length) || (type === 'ESTABLECIMIENTO' && vehicleIds.length)) throw new ApiError(422, 'La selección de vehículos no corresponde al tipo de certificado')
  if (!body.previousPaths || typeof body.previousPaths !== 'object' || Array.isArray(body.previousPaths)) throw new ApiError(422, 'Actualiza los certificados antes de generar')
  const raw = body.previousPaths as Record<string, unknown>
  const targets = type === 'VEHICULO' ? vehicleIds : ['ESTABLECIMIENTO']
  const previousPaths: Record<string, string | null> = {}
  for (const target of targets) {
    const path = raw[target]
    if (!Object.hasOwn(raw, target) || (path !== null && (typeof path !== 'string' || path.length > 500))) throw new ApiError(422, 'Actualiza los certificados antes de generar')
    previousPaths[target] = path as string | null
  }
  return { requestId: uuid(body.requestId), serviceId: uuid(body.serviceId), type, vehicleIds, previousPaths, confirmReplace: body.confirmReplace === true }
}
export function sendInput(body: Record<string, unknown>): SendCertificatesInput {
  if (!Array.isArray(body.documents) || !body.documents.length || body.documents.length > 10) throw new ApiError(422, 'Selecciona entre 1 y 10 certificados')
  const documents = body.documents.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || !('storagePath' in item) || typeof item.storagePath !== 'string' || item.storagePath.length > 500) throw new ApiError(422, 'El certificado seleccionado no es válido')
    return { id: uuid(item.id), storagePath: item.storagePath }
  }).sort((a, b) => a.id.localeCompare(b.id))
  if (new Set(documents.map((doc) => doc.id)).size !== documents.length) throw new ApiError(422, 'Hay certificados repetidos')
  if (!Array.isArray(body.recipients) || !body.recipients.length || body.recipients.length > 20 || !body.recipients.every((email) => typeof email === 'string' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))) throw new ApiError(422, 'Selecciona entre 1 y 20 correos válidos')
  if (typeof body.subject !== 'string' || !body.subject.trim() || body.subject.length > 200 || /[\r\n]/.test(body.subject) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 10_000) throw new ApiError(422, 'Revisa el asunto y el mensaje')
  return { requestId: uuid(body.requestId), serviceId: uuid(body.serviceId), documents, recipients: [...new Set(body.recipients.map((email: string) => email.toLowerCase()))].sort(), subject: body.subject.trim(), text: body.text.trim() }
}
