import { createHash, createHmac, randomUUID } from 'node:crypto'

import { ApiError } from './auth'
import { readBounded, MAX_PDF_BYTES } from './documents/limits'

export const MASTER_FILE_KINDS = [
  'USER_CERTIFICATE',
  'CLIENT_ESTABLISHMENT_TEMPLATE',
  'SITE_PLAN',
  'SITE_VEHICLE_TEMPLATE',
  'PRODUCT_TECHNICAL_SHEET',
] as const
export type MasterFileKind = typeof MASTER_FILE_KINDS[number]
type UploadInput = { kind: MasterFileKind; fileName: string; contentType: string; size: number }
type ServicePhotoUploadInput = { serviceId: string; areaId: string; fileName: string; contentType: string; size: number }
type CriterionEvidenceUploadInput = { serviceId: string; criterionId: string; fileName: string; contentType: string; size: number }
type DeviceReviewPhotoUploadInput = { serviceId: string; serviceDeviceId: string; fileName: string; contentType: string; size: number }
type FindingEvidenceUploadInput = { serviceId: string; findingId: string; phase: FindingEvidencePhase; fileName: string; contentType: string; size: number }
type ServiceSignatureUploadInput = { serviceId: string; role: ServiceSignatureRole; fileName: string; contentType: string; size: number }
export type FindingEvidencePhase = 'OPENING' | 'CLOSURE' | 'FOLLOWUP'
export type ServiceSignatureRole = 'TECHNICIAN' | 'CLIENT'
export type UploadAuthorization = { url: string; storagePath: string; contentType: string; expiresIn: number }
const PRESIGNED_TTL_SECONDS = 300
const USER_CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024
const SERVICE_PHOTO_MAX_BYTES = 10 * 1024 * 1024
const SERVICE_PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const PREFIX_BY_KIND: Record<MasterFileKind, string> = {
  USER_CERTIFICATE: 'users/certificates',
  CLIENT_ESTABLISHMENT_TEMPLATE: 'clients/establishment-templates',
  SITE_PLAN: 'sites/plans',
  SITE_VEHICLE_TEMPLATE: 'sites/vehicle-templates',
  PRODUCT_TECHNICAL_SHEET: 'products/technical-sheets',
}
const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const EXTENSIONS_BY_KIND: Record<MasterFileKind, ReadonlySet<string>> = {
  USER_CERTIFICATE: new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  CLIENT_ESTABLISHMENT_TEMPLATE: new Set(['.pdf', '.doc', '.docx']),
  SITE_PLAN: new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  SITE_VEHICLE_TEMPLATE: new Set(['.pdf', '.doc', '.docx']),
  PRODUCT_TECHNICAL_SHEET: new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
}

export function createMasterUploadUrl(input: UploadInput): UploadAuthorization {
  const extension = extensionOf(input.fileName)
  if (!EXTENSIONS_BY_KIND[input.kind].has(extension)) throw new ApiError(422, 'El tipo de archivo no está permitido para este documento')
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new ApiError(422, 'El archivo está vacío o su tamaño no es válido')
  if (input.kind !== 'SITE_PLAN' && input.size > USER_CERTIFICATE_MAX_BYTES) {
    throw new ApiError(422, input.kind === 'PRODUCT_TECHNICAL_SHEET' ? 'La ficha técnica no puede superar 10 MB' : 'El certificado no puede superar 10 MB')
  }
  const expectedContentType = MIME_BY_EXTENSION[extension]!
  const suppliedContentType = input.contentType.trim().toLowerCase()
  const contentType = !suppliedContentType || suppliedContentType === 'application/octet-stream' ? expectedContentType : suppliedContentType
  if (contentType !== expectedContentType) throw new ApiError(422, 'El tipo MIME no corresponde a la extensión del archivo')
  const storagePath = `${PREFIX_BY_KIND[input.kind]}/${randomUUID()}-${safeFileName(input.fileName)}`
  return { url: presign('PUT', storagePath, contentType), storagePath, contentType, expiresIn: PRESIGNED_TTL_SECONDS }
}

export function createMasterReadUrl(storagePath: string): string { assertMasterStoragePath(storagePath); return presign('GET', storagePath) }
export async function deleteMasterObject(storagePath: string): Promise<void> {
  assertMasterStoragePath(storagePath)
  const response = await fetch(presign('DELETE', storagePath), { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw new ApiError(502, 'No fue posible eliminar el archivo privado de R2')
}
export function assertMasterStoragePath(storagePath: string): void {
  const normalized = storagePath.trim()
  const allowed = Object.values(PREFIX_BY_KIND).some(prefix => normalized.startsWith(`${prefix}/`))
  if (!allowed || normalized.includes('..') || normalized.startsWith('/')) throw new ApiError(422, 'La ruta del archivo privado no es válida')
}

function serviceMediaBucket(): string { return process.env.R2_BUCKET_SERVICE_MEDIA?.trim() || 'sr-service-media' }

export function createAreaNoAccessUploadUrl(input: ServicePhotoUploadInput): UploadAuthorization {
  return createServicePhotoUploadUrl(input, `services/${input.serviceId}/areas/${input.areaId}/no-access`)
}

export function createDeviceReviewUploadUrl(input: DeviceReviewPhotoUploadInput): UploadAuthorization {
  return createServicePhotoUploadUrl(input, `services/${input.serviceId}/devices/${input.serviceDeviceId}/review`)
}

export function createCriterionEvidenceUploadUrl(input: CriterionEvidenceUploadInput): UploadAuthorization {
  return createServicePhotoUploadUrl(input, `services/${input.serviceId}/criteria/${input.criterionId}/evidence`)
}

export function createFindingEvidenceUploadUrl(input: FindingEvidenceUploadInput): UploadAuthorization {
  const folder = input.phase.toLowerCase()
  return createServicePhotoUploadUrl(input, `services/${input.serviceId}/findings/${input.findingId}/${folder}`)
}

export function createServiceSignatureUploadUrl(input: ServiceSignatureUploadInput): UploadAuthorization {
  return createServicePhotoUploadUrl(input, `services/${input.serviceId}/signatures/${input.role.toLowerCase()}`)
}

function createServicePhotoUploadUrl(input: Pick<ServicePhotoUploadInput, 'fileName' | 'contentType' | 'size'>, prefix: string): UploadAuthorization {
  const extension = extensionOf(input.fileName)
  if (!SERVICE_PHOTO_EXTENSIONS.has(extension)) throw new ApiError(422, 'La evidencia debe ser una imagen JPG, PNG o WebP')
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > SERVICE_PHOTO_MAX_BYTES) {
    throw new ApiError(422, 'La fotografía no puede superar 10 MB')
  }
  const expectedContentType = MIME_BY_EXTENSION[extension]!
  const suppliedContentType = input.contentType.trim().toLowerCase()
  const contentType = !suppliedContentType || suppliedContentType === 'application/octet-stream' ? expectedContentType : suppliedContentType
  if (contentType !== expectedContentType) throw new ApiError(422, 'El tipo MIME no corresponde a la extensión de la fotografía')
  const storagePath = `${prefix}/${randomUUID()}-${safeFileName(input.fileName)}`
  return { url: presign('PUT', storagePath, contentType, serviceMediaBucket()), storagePath, contentType, expiresIn: PRESIGNED_TTL_SECONDS }
}

export function assertAreaNoAccessStoragePath(storagePath: string, serviceId: string, areaId: string): void {
  assertServiceMediaStoragePath(storagePath, `services/${serviceId}/areas/${areaId}/no-access/`)
}

export function assertDeviceReviewStoragePath(storagePath: string, serviceId: string, serviceDeviceId: string): void {
  assertServiceMediaStoragePath(storagePath, `services/${serviceId}/devices/${serviceDeviceId}/review/`)
}

export function assertCriterionEvidenceStoragePath(storagePath: string, serviceId: string, criterionId: string): void {
  assertServiceMediaStoragePath(storagePath, `services/${serviceId}/criteria/${criterionId}/evidence/`)
}

export function assertFindingEvidenceStoragePath(storagePath: string, serviceId: string, findingId: string, phase: FindingEvidencePhase): void {
  const folder = phase.toLowerCase()
  assertServiceMediaStoragePath(storagePath, `services/${serviceId}/findings/${findingId}/${folder}/`)
}

export function assertServiceSignatureStoragePath(storagePath: string, serviceId: string, role: ServiceSignatureRole): void {
  assertServiceMediaStoragePath(storagePath, `services/${serviceId}/signatures/${role.toLowerCase()}/`)
}

function assertServiceMediaStoragePath(storagePath: string, prefix: string): void {
  const normalized = storagePath.trim()
  if (!normalized.startsWith(prefix) || normalized.length <= prefix.length || normalized.includes('..') || normalized.startsWith('/')) {
    throw new ApiError(422, 'La ruta de la fotografía no es válida')
  }
}

export async function serviceMediaObjectExists(storagePath: string, serviceId: string, areaId: string): Promise<boolean> {
  assertAreaNoAccessStoragePath(storagePath, serviceId, areaId)
  return privateServiceMediaObjectExists(storagePath)
}

export async function deviceReviewMediaObjectExists(storagePath: string, serviceId: string, serviceDeviceId: string): Promise<boolean> {
  assertDeviceReviewStoragePath(storagePath, serviceId, serviceDeviceId)
  return privateServiceMediaObjectExists(storagePath)
}

export async function criterionEvidenceObjectExists(storagePath: string, serviceId: string, criterionId: string): Promise<boolean> {
  assertCriterionEvidenceStoragePath(storagePath, serviceId, criterionId)
  return privateServiceMediaObjectExists(storagePath)
}

export async function findingEvidenceObjectExists(storagePath: string, serviceId: string, findingId: string, phase: FindingEvidencePhase): Promise<boolean> {
  assertFindingEvidenceStoragePath(storagePath, serviceId, findingId, phase)
  return privateServiceMediaObjectExists(storagePath)
}

export async function serviceSignatureObjectExists(storagePath: string, serviceId: string, role: ServiceSignatureRole): Promise<boolean> {
  assertServiceSignatureStoragePath(storagePath, serviceId, role)
  return privateServiceMediaObjectExists(storagePath)
}

async function privateServiceMediaObjectExists(storagePath: string): Promise<boolean> {
  const response = await fetch(presign('HEAD', storagePath, undefined, serviceMediaBucket()), {
    method: 'HEAD', signal: AbortSignal.timeout(20_000), redirect: 'error',
  })
  if (response.status === 404) return false
  if (!response.ok) throw new ApiError(502, 'No fue posible validar la fotografía privada')
  return true
}

/** Call only after resolving the reference and authorizing its owner in PostgreSQL. */
export function createServiceMediaReadUrl(storagePath: string, serviceId: string, ownerId: string, kind: 'REVIEW' | FindingEvidencePhase): { url: string; expiresAt: string } {
  if (kind === 'REVIEW') assertDeviceReviewStoragePath(storagePath, serviceId, ownerId)
  else assertFindingEvidenceStoragePath(storagePath, serviceId, ownerId, kind)
  return {
    url: presign('GET', storagePath, undefined, serviceMediaBucket(), { 'response-cache-control': 'private, no-store' }),
    expiresAt: new Date(Date.now() + PRESIGNED_TTL_SECONDS * 1000).toISOString(),
  }
}

export async function deleteAreaNoAccessObject(storagePath: string, serviceId: string, areaId: string): Promise<void> {
  assertAreaNoAccessStoragePath(storagePath, serviceId, areaId)
  await deleteServiceMediaObject(storagePath)
}

export async function deleteDeviceReviewObject(storagePath: string, serviceId: string, serviceDeviceId: string): Promise<void> {
  assertDeviceReviewStoragePath(storagePath, serviceId, serviceDeviceId)
  await deleteServiceMediaObject(storagePath)
}

export async function deleteCriterionEvidenceObject(storagePath: string, serviceId: string, criterionId: string): Promise<void> {
  assertCriterionEvidenceStoragePath(storagePath, serviceId, criterionId)
  await deleteServiceMediaObject(storagePath)
}

export async function deleteFindingEvidenceObject(storagePath: string, serviceId: string, findingId: string, phase: FindingEvidencePhase): Promise<void> {
  assertFindingEvidenceStoragePath(storagePath, serviceId, findingId, phase)
  await deleteServiceMediaObject(storagePath)
}

async function deleteServiceMediaObject(storagePath: string): Promise<void> {
  const response = await fetch(presign('DELETE', storagePath, undefined, serviceMediaBucket()), {
    method: 'DELETE', signal: AbortSignal.timeout(20_000), redirect: 'error',
  })
  if (!response.ok && response.status !== 404) throw new ApiError(502, 'No fue posible limpiar la fotografía privada')
}

function presign(method: 'GET' | 'PUT' | 'DELETE' | 'HEAD', storagePath: string, contentType?: string, bucket?: string, responseHeaders: Record<string, string> = {}): string {
  const config = r2Config()
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${awsEncode(bucket ?? config.bucket)}/${storagePath.split('/').map(awsEncode).join('/')}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const scope = `${date}/auto/s3/aws4_request`
  const headers: Record<string, string> = { host }
  if (contentType) headers['content-type'] = contentType
  const headerNames = Object.keys(headers).sort()
  const canonicalHeaders = headerNames.map(name => `${name}:${headers[name]!.trim().replace(/\s+/g, ' ')}\n`).join('')
  const signedHeaders = headerNames.join(';')
  const query: Record<string, string> = {
    ...responseHeaders, 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate, 'X-Amz-Expires': String(PRESIGNED_TTL_SECONDS), 'X-Amz-SignedHeaders': signedHeaders,
  }
  const canonicalQuery = canonicalQueryString(query)
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmac(Buffer.from(`AWS4${config.secretAccessKey}`, 'utf8'), date)
  const kRegion = hmac(kDate, 'auto'), kService = hmac(kRegion, 's3'), kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
function r2Config(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID?.trim(), accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim(), secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET_MASTER_FILES?.trim() || 'sr-master-files'
  if (!accountId || !accessKeyId || !secretAccessKey) throw new ApiError(503, 'Cloudflare R2 todavía no está configurado en el backend')
  return { accountId, accessKeyId, secretAccessKey, bucket }
}
function extensionOf(fileName: string): string { const clean = fileName.trim().toLowerCase(), dot = clean.lastIndexOf('.'); return dot >= 0 ? clean.slice(dot) : '' }
function safeFileName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop()?.trim() || 'archivo'
  const normalized = leaf.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[.-]+/, '')
  return (normalized || 'archivo').slice(-120)
}
function canonicalQueryString(values: Record<string, string>): string {
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
  return Object.entries(values).map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([lk, lv], [rk, rv]) => lk === rk ? compare(lv, rv) : compare(lk, rk)).map(([key, value]) => `${key}=${value}`).join('&')
}
function awsEncode(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`) }
function sha256Hex(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function hmac(key: Buffer, value: string): Buffer { return createHmac('sha256', key).update(value, 'utf8').digest() }

function generatedBucket(): string { return process.env.R2_BUCKET_GENERATED_DOCUMENTS?.trim() || 'sr-generated-documents' }
function assertGeneratedPath(path: string): void {
  if (!/^certificates\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.pdf$/.test(path)) throw new ApiError(422, 'La ruta del certificado no es válida')
}
export function createCertificateReadUrl(storagePath: string, fileName?: string): string {
  assertGeneratedPath(storagePath)
  return presign('GET', storagePath, undefined, generatedBucket(), fileName ? { 'response-content-disposition': `attachment; filename="${safeFileName(fileName)}"` } : {})
}
export async function readMasterObject(storagePath: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(createMasterReadUrl(storagePath), { signal: AbortSignal.timeout(20_000), redirect: 'error' })
  if (!response.ok) throw new ApiError(502, 'No fue posible leer la plantilla privada')
  return readBounded(response, maxBytes)
}
export async function readCertificateObject(storagePath: string): Promise<Buffer> {
  const response = await fetch(createCertificateReadUrl(storagePath), { signal: AbortSignal.timeout(20_000), redirect: 'error' })
  if (!response.ok) throw new ApiError(502, 'No fue posible leer el certificado privado')
  return readBounded(response, MAX_PDF_BYTES)
}
export async function putCertificateObject(storagePath: string, bytes: Uint8Array): Promise<void> {
  assertGeneratedPath(storagePath)
  const response = await fetch(presign('PUT', storagePath, 'application/pdf', generatedBucket()), {
    method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(30_000), redirect: 'error',
  })
  if (!response.ok) throw new ApiError(502, 'No fue posible guardar el certificado privado')
}
export async function deleteCertificateObject(storagePath: string): Promise<void> {
  assertGeneratedPath(storagePath)
  const response = await fetch(presign('DELETE', storagePath, undefined, generatedBucket()), { method: 'DELETE', signal: AbortSignal.timeout(20_000), redirect: 'error' })
  if (!response.ok && response.status !== 404) throw new ApiError(502, 'No fue posible limpiar el documento temporal')
}

/**
 * Vencimientos aprobados: SOLO fotografías operativas de servicios.
 * Nunca admitir firmas ni otros objetos de la misma carpeta services/.
 */
export async function deleteRetainedServicePhoto(storagePath: string): Promise<void> {
  const pattern = /^services\/[0-9a-f-]{36}\/(?:areas\/[0-9a-f-]{36}\/no-access|devices\/[0-9a-f-]{36}\/review|criteria\/[0-9a-f-]{36}\/evidence|findings\/[0-9a-f-]{36}\/(?:opening|closure))\/[^/]+$/i
  if (!pattern.test(storagePath) || storagePath.includes('..')) throw new ApiError(422, 'Ruta de fotografía no permitida para retención')
  await deleteServiceMediaObject(storagePath)
}

/** Only call for a path proven to be referenced by this finalized service. */
export function createServiceResultMediaReadUrl(storagePath:string,serviceId:string):string{
  if(!/^[0-9a-f-]{36}$/i.test(serviceId) ||
    !storagePath.startsWith('services/'+serviceId+'/') ||
    !/^services\/[0-9a-f-]{36}\/(?:areas\/[0-9a-f-]{36}\/no-access|criteria\/[0-9a-f-]{36}\/evidence|devices\/[0-9a-f-]{36}\/review|findings\/[0-9a-f-]{36}\/(?:opening|closure)|signatures\/(?:client|technician))\/[^/]+\.(?:png|jpe?g|webp)$/i.test(storagePath) ||
    storagePath.includes('..')) throw new ApiError(422,'Ruta no válida')
  return presign('GET',storagePath,undefined,serviceMediaBucket(),{'response-cache-control':'private, no-store'})
}
