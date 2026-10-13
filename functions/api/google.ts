import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'

import { ApiError } from './auth'
import { pool, transaction } from './db'
import { readBounded } from './documents/limits'
import { buildMailMessage, type MailInput } from './mailMessage'
import { writeCalendarEvent, type CalendarEventInput } from './calendarClient'

const clientId = requiredEnvironment('GOOGLE_CLIENT_ID')
const clientSecret = requiredEnvironment('GOOGLE_CLIENT_SECRET')
const redirectUri = requiredEnvironment('GOOGLE_OAUTH_REDIRECT_URI')
const integrationEmail = 'solucionesradicales1@gmail.com'
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const scopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  GOOGLE_DRIVE_FILE_SCOPE,
]

const encryptionKey = createHash('sha256')
  .update(`soluciones-radicales-google-token:${clientId}:${clientSecret}`)
  .digest()

type StoredIntegration = {
  refresh_token_ciphertext: Buffer
  refresh_token_iv: Buffer
  refresh_token_tag: Buffer
}

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function encrypt(value: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { ciphertext, iv, tag: cipher.getAuthTag() }
}

function decrypt(stored: StoredIntegration): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, stored.refresh_token_iv)
  decipher.setAuthTag(stored.refresh_token_tag)
  return Buffer.concat([
    decipher.update(stored.refresh_token_ciphertext),
    decipher.final(),
  ]).toString('utf8')
}

async function tokenRequest(params: URLSearchParams): Promise<TokenResponse> {
  const response = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  const body = (await response.json()) as TokenResponse & { error?: string; error_description?: string }

  if (!response.ok || !body.access_token) {
    // An invalid refresh token cannot be repaired by retrying the same request.
    // OAuth applications in External/Testing mode expire refresh tokens after 7 days.
    if (params.get('grant_type') === 'refresh_token' && body.error === 'invalid_grant') {
      throw new ApiError(
        409,
        'La autorización de Google venció o fue revocada. Vuelve a autorizar la cuenta empresarial en Integraciones.',
        'GOOGLE_REAUTH_REQUIRED',
      )
    }
    throw new ApiError(502, body.error_description ?? body.error ?? 'Google rechazó la autorización')
  }

  return body
}

async function getAccessToken(): Promise<string> {
  const { rows } = await pool.query<StoredIntegration>(
    `select refresh_token_ciphertext, refresh_token_iv, refresh_token_tag
     from private.google_integrations
     where singleton`,
  )
  const stored = rows[0]

  if (!stored) {
    throw new ApiError(409, 'La cuenta empresarial de Google aún no está conectada')
  }

  const token = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: decrypt(stored),
    }),
  )

  return token.access_token
}

async function enqueueGoogleDriveCleanup(fileId: string): Promise<void> {
  await pool.query(
    `insert into private.integration_jobs (job_type, idempotency_key, payload, run_after)
     values ('STORAGE_CLEANUP', $1, $2::jsonb, now() + interval '5 minutes')
     on conflict (job_type, idempotency_key) do nothing`,
    [`google-drive-temp:${fileId}`, JSON.stringify({ scope: 'GOOGLE_DRIVE_TEMP', fileId })],
  )
}

export async function deleteGoogleDriveTemporaryFile(fileId: string, accessToken?: string): Promise<void> {
  if (!fileId || fileId.length > 256) throw new ApiError(422, 'Identificador temporal de Google Drive no válido')
  const token = accessToken ?? await getAccessToken()
  const cleanup = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!cleanup.ok && cleanup.status !== 404) {
    throw new ApiError(502, 'No fue posible eliminar el archivo temporal de Google Drive')
  }
}

export async function convertDocumentToPdfWithGoogleDrive(docx: Uint8Array, maxBytes: number): Promise<Buffer> {
  const accessToken = await getAccessToken()
  const boundary = `sr-${randomBytes(18).toString('hex')}`
  const metadata = JSON.stringify({
    name: `documento-temporal-${randomBytes(12).toString('hex')}.docx`,
    mimeType: 'application/vnd.google-apps.document',
  })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`),
    Buffer.from(docx),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  let fileId: string | null = null
  let result: Buffer | null = null
  let failure: unknown = null

  try {
    const upload = await googleFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(60_000),
    })
    const uploaded = (await upload.json()) as { id?: string; error?: { message?: string } }
    if (!upload.ok || !uploaded.id) throw new ApiError(502, uploaded.error?.message ?? 'Google Drive no pudo importar el Word')
    fileId = uploaded.id

    const exported = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(60_000) },
    )
    if (!exported.ok || !exported.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
      await exported.body?.cancel()
      throw new ApiError(502, 'Google Drive no pudo exportar el documento como PDF')
    }
    result = await readBounded(exported, maxBytes)
    if (result.subarray(0, 5).toString() !== '%PDF-') throw new ApiError(502, 'Google Drive devolvió un PDF no válido')
  } catch (error) {
    failure = error
  }

  if (fileId) {
    try {
      await deleteGoogleDriveTemporaryFile(fileId, accessToken)
    } catch {
      await enqueueGoogleDriveCleanup(fileId).catch(() => undefined)
      if (!failure) failure = new ApiError(502, 'El PDF fue creado, pero no fue posible eliminar el archivo temporal de Google Drive')
    }
  }

  if (failure) {
    if (failure instanceof ApiError) throw failure
    throw new ApiError(502, 'No fue posible convertir el documento Word a PDF mediante Google Drive')
  }
  return result!
}

export async function createGoogleAuthorization(
  client: PoolClient,
  requestedById: string,
  returnUrl: string,
): Promise<string> {
  const state = randomBytes(32).toString('base64url')

  await client.query('delete from private.google_oauth_states where expires_at <= now()')
  await client.query(
    `insert into private.google_oauth_states (state_hash, requested_by_id, return_url, expires_at)
     values ($1, $2, $3, now() + interval '10 minutes')`,
    [sha256(state), requestedById, returnUrl],
  )

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    include_granted_scopes: 'true',
    login_hint: integrationEmail,
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  }).toString()

  return url.toString()
}

export async function completeGoogleAuthorization(code: string, state: string): Promise<string> {
  const claimed = await pool.query<{ requested_by_id: string; return_url: string }>(
    `update private.google_oauth_states
     set consumed_at = now()
     where state_hash = $1
       and consumed_at is null
       and expires_at > now()
     returning requested_by_id, return_url`,
    [sha256(state)],
  )
  const request = claimed.rows[0]

  if (!request) {
    throw new ApiError(400, 'La autorización de Google venció o ya fue utilizada')
  }

  const token = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  )

  if (!token.refresh_token) {
    throw new ApiError(409, 'Google no entregó un refresh token; vuelve a autorizar la cuenta')
  }

  const userInfoResponse = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const userInfo = (await userInfoResponse.json()) as { email?: string }

  if (!userInfoResponse.ok || userInfo.email?.toLowerCase() !== integrationEmail) {
    throw new ApiError(403, `Debes autorizar ${integrationEmail}`)
  }

  const encrypted = encrypt(token.refresh_token)

  await transaction(async (client) => {
    await client.query(
      `insert into private.google_integrations (
         singleton, cuenta_correo, refresh_token_ciphertext, refresh_token_iv,
         refresh_token_tag, scopes, connected_by_id
       ) values (true, $1, $2, $3, $4, $5, $6)
       on conflict (singleton) do update
       set cuenta_correo = excluded.cuenta_correo,
           refresh_token_ciphertext = excluded.refresh_token_ciphertext,
           refresh_token_iv = excluded.refresh_token_iv,
           refresh_token_tag = excluded.refresh_token_tag,
           scopes = excluded.scopes,
           connected_by_id = excluded.connected_by_id,
           connected_at = now()`,
      [
        integrationEmail,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        (token.scope ?? scopes.join(' ')).split(' '),
        request.requested_by_id,
      ],
    )
    await client.query(
      `insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
       values ($1, 'GOOGLE_INTEGRACION_CONECTADA', 'Integraciones', $1, $2::jsonb)`,
      [request.requested_by_id, JSON.stringify({ cuenta: integrationEmail })],
    )
  })

  return request.return_url
}

export async function getGoogleStatus(): Promise<{
  connected: boolean
  email: string | null
  needsReauthorization: boolean
}> {
  const { rows } = await pool.query<{ cuenta_correo: string }>(
    'select cuenta_correo from private.google_integrations where singleton',
  )
  const email = rows[0]?.cuenta_correo ?? null
  if (!email) return { connected: false, email: null, needsReauthorization: false }

  // A stored refresh token is not proof that the Google connection still works.
  // Verify it when checking integrations and before enabling report sharing.
  try {
    await getAccessToken()
    return { connected: true, email, needsReauthorization: false }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'GOOGLE_REAUTH_REQUIRED') {
      return { connected: false, email, needsReauthorization: true }
    }
    throw error
  }
}

export async function sendGmailMessage(input: MailInput): Promise<string> {
  const mime = buildMailMessage(input, integrationEmail)
  const accessToken = await getAccessToken()
  await input.onDispatch?.()
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', signal: AbortSignal.timeout(20_000), redirect: 'error',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
    })
    if (response.status >= 400 && response.status < 500) {
      throw new ApiError(502, 'Google rechazó el envío. Revisa la conexión de Gmail y los destinatarios.', 'EMAIL_REJECTED')
    }
    const result = (await response.json()) as { id?: string }
    if (!response.ok || !result.id) throw new Error('Unknown delivery')
    return result.id
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'No fue posible confirmar la entrega. Revisa Enviados en Gmail antes de iniciar otro envío.', 'EMAIL_DELIVERY_UNKNOWN')
  }
}

export async function upsertCalendarEvent(input: CalendarEventInput): Promise<string> {
  return writeCalendarEvent(input, await getAccessToken())
}

async function googleFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) })
  } catch {
    throw new ApiError(502, 'No fue posible comunicarse con Google')
  }
}
