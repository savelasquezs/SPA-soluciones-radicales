import { parseTriggerDelivery } from '@neon/functions/triggers'
import app from './app'
import { mipCatalogRoutes } from './catalogs/routes'
import { adminServiceRoutes } from './services/routes'
import { drainServiceJobs } from './services/jobs'
import { technicianServiceRoutes } from './technician-services/routes'
import { runRetentionBatch, verifyRetentionToken } from './retention/cleanup'
import { siteInsightsRoutes } from './site-insights/routes'

// The existing app owns authorization, CORS and errors for every /api route.
app.route('/api/mip', mipCatalogRoutes)
app.route('/api/admin/services', adminServiceRoutes)
app.route('/api/technician/services', technicianServiceRoutes)
app.route('/api/admin/sites', siteInsightsRoutes)

// Neon strips spoofed x-neon-* headers. The trigger parser verifies header/body
// identity; this internal delivery path is deliberately outside browser JWT CORS.
app.post('/jobs/services', async context => {
  const parsed = await parseTriggerDelivery(context.req.raw)
  if (!parsed.ok) return context.json({ error: 'Invocación no válida' }, parsed.error === 'invalid_body' ? 400 : 401)
  if (parsed.invocation.type !== 'schedule' || parsed.invocation.trigger.name !== 'services-outbox') return context.json({ error: 'Trigger no permitido' }, 403)
  return context.json(await drainServiceJobs(10))
})

// Machine-to-machine route. Cloudflare owns the schedule; Neon runs only on request.
// There is no Neon scheduled trigger for retention. Fail closed without a valid secret.
app.post('/jobs/retention', async context => {
  const bearer = context.req.header('Authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{32,256})$/)?.[1]
  if (!await verifyRetentionToken(bearer)) return context.json({ error: 'No autorizado' }, 401)
  const payload = await context.req.json().catch(() => ({})) as { mode?: unknown }
  const mode = payload.mode === 'delete' ? 'delete' : 'dry-run'
  return context.json(await runRetentionBatch(mode))
})

export default app
