import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'

import { ApiError } from './auth'
import { pool, transaction } from './db'

const clientId = requiredEnvironment('GOOGLE_CLIENT_ID')
const clientSecret = requiredEnvironment('GOOGLE_CLIENT_SECRET')
const redirectUri = requiredEnvironment('GOOGLE_OAUTH_REDIRECT_URI')
const integrationEmail = 'solucionesradicales1@gmail.com'
const scopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
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

export async function getGoogleStatus(): Promise<{ connected: boolean; email: string | null }> {
  const { rows } = await pool.query<{ cuenta_correo: string }>(
    'select cuenta_correo from private.google_integrations where singleton',
  )
  return { connected: Boolean(rows[0]), email: rows[0]?.cuenta_correo ?? null }
}

export async function sendGmailMessage(input: {
  to: string
  subject: string
  text: string
}): Promise<string> {
  const accessToken = await getAccessToken()
  const mime = [
    `From: Soluciones Radicales <${integrationEmail}>`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    input.text,
  ].join('\r\n')
  const raw = Buffer.from(mime).toString('base64url')
  const response = await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  const result = (await response.json()) as { id?: string; error?: { message?: string } }

  if (!response.ok || !result.id) {
    throw new ApiError(502, result.error?.message ?? 'No fue posible enviar el correo')
  }

  return result.id
}

export async function upsertCalendarEvent(input: {
  serviceId: string
  summary: string
  description: string
  location: string
  start: string
  end: string
}): Promise<string> {
  const accessToken = await getAccessToken()
  const eventId = `sr${input.serviceId.replaceAll('-', '')}`
  const event = {
    id: eventId,
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start, timeZone: 'America/Bogota' },
    end: { dateTime: input.end, timeZone: 'America/Bogota' },
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  let response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: 'PUT', headers, body: JSON.stringify(event) },
  )

  if (response.status === 404) {
    response = await googleFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    })
  }

  const result = (await response.json()) as { id?: string; error?: { message?: string } }

  if (!response.ok || !result.id) {
    throw new ApiError(502, result.error?.message ?? 'No fue posible sincronizar Calendar')
  }

  return result.id
}

async function googleFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new ApiError(502, 'No fue posible comunicarse con Google')
  }
}
