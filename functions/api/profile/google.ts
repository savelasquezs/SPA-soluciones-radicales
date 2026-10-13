import { createHash, randomBytes } from 'node:crypto'
import { Hono } from 'hono'

import { ApiError, type Identity } from '../auth'
import { transaction } from '../db'
import { auditProfile, readProfileBody, self } from './identity'

type Env = { Variables: { identity: Identity } }
type HandoffRow = { user_id: string; old_auth_user_id: string; expires_at: Date | string; consumed_at: Date | string | null }
const googleChangeRoutes = new Hono<Env>()

googleChangeRoutes.post('/start', async context => {
  const identity = context.get('identity')
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  await transaction(async client => {
    const record = await self(client, identity)
    await client.query(
      "delete from private.user_google_change_requests where expires_at < now() - interval '1 day'",
    )
    // A new attempt invalidates pending handoffs for the same user.
    await client.query(
      'delete from private.user_google_change_requests where user_id=$1 and consumed_at is null',
      [record.id],
    )
    await client.query(
      "insert into private.user_google_change_requests (state_hash,user_id,old_auth_user_id,expires_at) values ($1,$2,$3,now()+interval '10 minutes')",
      [hash, record.id, identity.authUserId],
    )
    await auditProfile(client, record.id, 'PERFIL_CAMBIO_GOOGLE_INICIADO', {})
  })
  return context.json({ token, expiresInSeconds: 600 })
})

/**
 * The callback uses a fresh Google-authenticated session. It cannot bootstrap
 * the original user's domain profile until the handoff commits.
 */
googleChangeRoutes.post('/finish', async context => {
  const body = await readProfileBody(context.req.raw)
  if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    throw new ApiError(422, 'Solicitud de cambio no válida')
  }
  const hash = createHash('sha256').update(body.token).digest('hex')
  const identity = context.get('identity')

  const result = await transaction(async client => {
    const { rows } = await client.query<HandoffRow>(
      'select user_id,old_auth_user_id,expires_at,consumed_at from private.user_google_change_requests where state_hash=$1 for update',
      [hash],
    )
    const state = rows[0]
    if (!state || state.consumed_at || new Date(state.expires_at).getTime() <= Date.now()) {
      throw new ApiError(409, 'El cambio expiró o ya fue usado. Inicia nuevamente el proceso.')
    }
    if (identity.authUserId === state.old_auth_user_id) throw new ApiError(409, 'Seleccionaste la misma cuenta de Google')

    // Never accept a client-provided email. Confirm it server-side in Neon Auth.
    const account = await client.query<{ email: string; verified: boolean }>(
      'select lower(btrim(u.email)) as email,u."emailVerified" as verified from neon_auth."user" u where u.id::text=$1',
      [identity.authUserId],
    )
    const target = account.rows[0]
    const google = await client.query<{ allowed: boolean }>(
      'select private.has_google_identity($1) as allowed', [identity.authUserId],
    )
    if (!target?.verified || !google.rows[0]?.allowed) {
      throw new ApiError(403, 'Debes autenticar una cuenta Google verificada')
    }
    const current = await client.query<{ auth_user_id: string; activo: boolean }>(
      'select auth_user_id,activo from public.usuarios where id=$1 for update', [state.user_id],
    )
    if (!current.rows[0]?.activo || current.rows[0].auth_user_id !== state.old_auth_user_id) {
      throw new ApiError(409, 'La identidad original cambió. No se modificó tu perfil.')
    }

    const duplicate = await client.query(
      'select 1 from public.usuarios where id<>$3 and (auth_user_id=$1 or correo_google=$2) limit 1',
      [identity.authUserId, target.email, state.user_id],
    )
    if (duplicate.rowCount) throw new ApiError(409, 'La cuenta Google ya está vinculada a otro usuario')

    await client.query(
      'update public.usuarios set auth_user_id=$1,correo_google=$2 where id=$3',
      [identity.authUserId, target.email, state.user_id],
    )
    // Domain sessions for the previous Google identity no longer grant a role.
    await client.query('delete from private.user_sessions where auth_user_id=$1', [state.old_auth_user_id])
    await client.query('update private.user_google_change_requests set consumed_at=now() where state_hash=$1', [hash])
    await auditProfile(client, state.user_id, 'PERFIL_GOOGLE_CAMBIADO', { correoNuevo: target.email })
    return { correoGoogle: target.email }
  })
  return context.json(result)
})

export { googleChangeRoutes }
