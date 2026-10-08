import { parseTriggerDelivery } from '@neon/functions/triggers'
import app from './app'
import { mipCatalogRoutes } from './catalogs/routes'
import { adminServiceRoutes } from './services/routes'
import { drainServiceJobs } from './services/jobs'
import { technicianServiceRoutes } from './technician-services/routes'
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

export default app
