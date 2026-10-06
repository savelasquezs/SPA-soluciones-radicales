import app from './app'
import { mipCatalogRoutes } from './catalogs/routes'

// The existing app owns authorization, CORS and errors for every /api route.
app.route('/api/mip', mipCatalogRoutes)

export default app
