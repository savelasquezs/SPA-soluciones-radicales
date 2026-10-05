import { createHash, createHmac, randomUUID } from 'node:crypto'

import { ApiError } from './auth'

export const MASTER_FILE_KINDS = [
  'USER_CERTIFICATE',
  'CLIENT_ESTABLISHMENT_TEMPLATE',
  'SITE_PLAN',
  'SITE_VEHICLE_TEMPLATE',
] as const

export type MasterFileKind = typeof MASTER_FILE_KINDS[number]

type UploadInput = {
  kind: MasterFileKind
  fileName: string
  contentType: string
  size: number
}

export type UploadAuthorization = {
  url: string
  storagePath: string
  contentType: string
  expiresIn: number
}

const PRESIGNED_TTL_SECONDS = 300
const USER_CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024

const PREFIX_BY_KIND: Record<MasterFileKind, string> = {
  USER_CERTIFICATE: 'users/certificates',
  CLIENT_ESTABLISHMENT_TEMPLATE: 'clients/establishment-templates',
  SITE_PLAN: 'sites/plans',
  SITE_VEHICLE_TEMPLATE: 'sites/vehicle-templates',
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const EXTENSIONS_BY_KIND: Record<MasterFileKind, ReadonlySet<string>> = {
  USER_CERTIFICATE: new Set(['.pdf', '.jpg', '.jpeg', '.png']),
  CLIENT_ESTABLISHMENT_TEMPLATE: new Set(['.pdf', '.doc', '.docx']),
  SITE_PLAN: new Set(['.pdf', '.jpg', '.jpeg', '.png']),
  SITE_VEHICLE_TEMPLATE: new Set(['.pdf', '.doc', '.docx']),
}

export function createMasterUploadUrl(input: UploadInput): UploadAuthorization {
  const extension = extensionOf(input.fileName)
  if (!EXTENSIONS_BY_KIND[input.kind].has(extension)) {
    throw new ApiError(422, 'El tipo de archivo no está permitido para este documento')
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ApiError(422, 'El archivo está vacío o su tamaño no es válido')
  }
  if (input.kind === 'USER_CERTIFICATE' && input.size > USER_CERTIFICATE_MAX_BYTES) {
    throw new ApiError(422, 'El certificado no puede superar 10 MB')
  }

  const expectedContentType = MIME_BY_EXTENSION[extension]!
  const suppliedContentType = input.contentType.trim().toLowerCase()
  const contentType = !suppliedContentType || suppliedContentType === 'application/octet-stream'
    ? expectedContentType
    : suppliedContentType

  if (contentType !== expectedContentType) {
    throw new ApiError(422, 'El tipo MIME no corresponde a la extensión del archivo')
  }

  const storagePath = `${PREFIX_BY_KIND[input.kind]}/${randomUUID()}-${safeFileName(input.fileName)}`
  return {
    url: presign('PUT', storagePath, contentType),
    storagePath,
    contentType,
    expiresIn: PRESIGNED_TTL_SECONDS,
  }
}

export function createMasterReadUrl(storagePath: string): string {
  assertMasterStoragePath(storagePath)
  return presign('GET', storagePath)
}

export async function deleteMasterObject(storagePath: string): Promise<void> {
  assertMasterStoragePath(storagePath)
  const response = await fetch(presign('DELETE', storagePath), { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    throw new ApiError(502, 'No fue posible eliminar el archivo privado de R2')
  }
}

export function assertMasterStoragePath(storagePath: string): void {
  const normalized = storagePath.trim()
  const allowed = Object.values(PREFIX_BY_KIND).some((prefix) => normalized.startsWith(`${prefix}/`))
  if (!allowed || normalized.includes('..') || normalized.startsWith('/')) {
    throw new ApiError(422, 'La ruta del archivo privado no es válida')
  }
}

function presign(method: 'GET' | 'PUT' | 'DELETE', storagePath: string, contentType?: string): string {
  const config = r2Config()
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${awsEncode(config.bucket)}/${storagePath.split('/').map(awsEncode).join('/')}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const scope = `${date}/auto/s3/aws4_request`

  const headers: Record<string, string> = { host }
  if (contentType) headers['content-type'] = contentType
  const headerNames = Object.keys(headers).sort()
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${headers[name]!.trim().replace(/\s+/g, ' ')}\n`)
    .join('')
  const signedHeaders = headerNames.join(';')

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(PRESIGNED_TTL_SECONDS),
    'X-Amz-SignedHeaders': signedHeaders,
  }
  const canonicalQuery = canonicalQueryString(query)
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = hmac(Buffer.from(`AWS4${config.secretAccessKey}`, 'utf8'), date)
  const kRegion = hmac(kDate, 'auto')
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function r2Config(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET_MASTER_FILES?.trim() || 'sr-master-files'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new ApiError(503, 'Cloudflare R2 todavía no está configurado en el backend')
  }
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

function extensionOf(fileName: string): string {
  const clean = fileName.trim().toLowerCase()
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot) : ''
}

function safeFileName(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop()?.trim() || 'archivo'
  const normalized = leaf
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
  return (normalized || 'archivo').slice(-120)
}

function canonicalQueryString(values: Record<string, string>): string {
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
  return Object.entries(values)
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? compare(leftValue, rightValue) : compare(leftKey, rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}
