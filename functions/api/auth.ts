import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { PoolClient } from 'pg'

const jwksUrl = process.env.NEON_AUTH_JWKS_URL
const authBaseUrl = process.env.NEON_AUTH_BASE_URL

if (!jwksUrl || !authBaseUrl) {
  throw new Error('NEON_AUTH_JWKS_URL and NEON_AUTH_BASE_URL are required')
}

const jwks = createRemoteJWKSet(new URL(jwksUrl))
const issuer = new URL(authBaseUrl).origin

export type Identity = {
  authUserId: string
  session: JWTPayload
}

export type DomainProfile = {
  id: string
  nombreCompleto: string
  correoGoogle: string
  esAdmin: boolean
  esTecnico: boolean
  rolActivo: 'ADMINISTRADOR' | 'TECNICO' | null
  requiereSeleccionRol: boolean
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function verifyAuthorization(header: string | undefined): Promise<Identity> {
  if (!header?.toLowerCase().startsWith('bearer ')) {
    throw new ApiError(401, 'Debes iniciar sesión')
  }

  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, { issuer })

    if (!payload.sub) {
      throw new Error('JWT without sub')
    }

    return { authUserId: payload.sub, session: payload }
  } catch {
    throw new ApiError(401, 'La sesión no es válida o venció')
  }
}

export async function bootstrapProfile(
  client: PoolClient,
  identity: Identity,
): Promise<DomainProfile> {
  try {
    const { rows } = await client.query<{ profile: DomainProfile }>(
      'select private.bootstrap_current_user($1, $2::jsonb) as profile',
      [identity.authUserId, JSON.stringify(identity.session)],
    )
    const profile = rows[0]?.profile

    if (!profile) {
      throw new ApiError(403, 'La cuenta no está autorizada')
    }

    return profile
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(403, error instanceof Error ? error.message : 'La cuenta no está autorizada')
  }
}

export async function requireAdmin(
  client: PoolClient,
  identity: Identity,
): Promise<DomainProfile> {
  const profile = await bootstrapProfile(client, identity)

  if (!profile.esAdmin || profile.rolActivo !== 'ADMINISTRADOR') {
    throw new ApiError(403, 'Se requiere el rol Administrador')
  }

  return profile
}
