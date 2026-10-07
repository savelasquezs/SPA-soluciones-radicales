import { expect, test, type Page, type Route } from '@playwright/test'
import type { TechnicianExecutionSession, TechnicianServicePackage, TechnicianServiceSummary } from '../src/types/technicianServices'

const uid = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const ids = { actor: uid(1), service: uid(2), product: uid(3), area: uid(4), criterion: uid(5), device: uid(6), lock: uid(7), area2: uid(8), criterion2: uid(9) }
const summary = (state: TechnicianServiceSummary['estado'] = 'PROGRAMADO'): TechnicianServiceSummary => ({
  id: ids.service,
  solicitud: 'SR-0201',
  tipoServicio: 'PRINCIPAL',
  estado: state,
  version: state === 'PROGRAMADO' ? 1 : 2,
  inicioProgramado: '2026-10-07T16:00:00Z',
  finProgramado: '2026-10-07T17:30:00Z',
  inicioReal: state === 'PROGRAMADO' ? null : '2026-10-07T15:30:00Z',
  clienteNombre: 'Casa Verde',
  sedeNombre: 'Laureles',
  direccion: 'Calle 10 # 20-30, Medellín',
})
const servicePackage = (state: TechnicianServiceSummary['estado'] = 'PROGRAMADO'): TechnicianServicePackage => ({
  service: summary(state),
  frozen: state !== 'PROGRAMADO',
  serverNow: '2026-10-07T15:30:00Z',
  canStart: state === 'PROGRAMADO',
  startAvailableAt: '2026-10-07T15:00:00Z',
  products: [{
    id: ids.product,
    nombre: 'Gel insecticida',
    principioActivo: 'Fipronil 0,05 %',
    registroSanitario: 'RS-123',
    dosisReferencia: '1 gota/m²',
    lote: 'L-2026-10',
    fechaFabricacion: '2026-01-10',
    fechaVencimiento: '2028-01-10',
    dosis: '1 gota/m²',
    metodoAplicacion: 'Aplicación de gel',
  }],
  areas: [{
    id: ids.area,
    areaId: ids.area,
    nombre: 'Cocina',
    esExterna: false,
    posicionInicial: 0,
    posicionRecorrido: 0,
    sinAcceso: false,
    sinAccesoDescripcion: null,
    sinAccesoFotoStoragePath: null,
    version: 1,
    criterios: [{ id: ids.criterion, criterioId: ids.criterion, nombre: 'Mantenimiento higiénico', soloAreaExterna: false, evaluacion: null, observacion: null, evidenciasStoragePaths: [], version: 1 }],
    dispositivos: [{ id: ids.device, dispositivoId: ids.device, numero: 'D-01', ubicacion: 'Bajo mesón', tipoCodigo: 'TRAMPA_ADHESIVA', estadoAnterior: 'ACTIVO', revisado: false }],
  }, {
    id: ids.area2,
    areaId: ids.area2,
    nombre: 'Bodega',
    esExterna: false,
    posicionInicial: 1,
    posicionRecorrido: 1,
    sinAcceso: false,
    sinAccesoDescripcion: null,
    sinAccesoFotoStoragePath: null,
    version: 1,
    criterios: [{ id: ids.criterion2, criterioId: ids.criterion2, nombre: 'Disposición de residuos', soloAreaExterna: false, evaluacion: null, observacion: null, evidenciasStoragePaths: [], version: 1 }],
    dispositivos: [],
  }],
})

async function setup(page: Page) {
  let current = servicePackage()
  let packageReads = 0
  const starts: Array<Record<string, unknown>> = []
  const orders: Array<Record<string, unknown>> = []
  await page.route('**/get-session', route => route.fulfill({ json: {
    session: { id: 'session', userId: 'auth-tech', token: 'e2e-token', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
    user: { id: 'auth-tech', name: 'Técnico de prueba', email: 'santyvan974@gmail.com', emailVerified: true, createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
  } }))
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, json: value })
  await page.route('https://api.example.test/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return }
    if (path === '/api/session') {
      await json(route, { id: ids.actor, nombreCompleto: 'Técnico de prueba', correoGoogle: 'santyvan974@gmail.com', esAdmin: false, esTecnico: true, rolActivo: 'TECNICO', requiereSeleccionRol: false })
      return
    }
    if (path === '/api/technician/services' && request.method() === 'GET') { await json(route, [current.service]); return }
    if (path === `/api/technician/services/${ids.service}/package`) { packageReads++; await json(route, current); return }
    if (path === `/api/technician/services/${ids.service}/start`) {
      starts.push(request.postDataJSON() as Record<string, unknown>)
      current = servicePackage('EN_PROCESO')
      const body = request.postDataJSON() as { deviceId: string }
      const session: TechnicianExecutionSession = { package: current, lock: { token: ids.lock, deviceId: body.deviceId, acquiredAt: current.serverNow } }
      await json(route, session)
      return
    }
    if (path === `/api/technician/services/${ids.service}/areas/order`) {
      const body = request.postDataJSON() as { areaIds: string[] }
      orders.push(request.postDataJSON() as Record<string, unknown>)
      current = { ...current, areas: body.areaIds.map((id, posicionRecorrido) => ({ ...current.areas.find(area => area.id === id)!, posicionRecorrido, version: 2 })) }
      await json(route, { areas: current.areas.map(area => ({ id: area.id, posicionRecorrido: area.posicionRecorrido, version: area.version })) })
      return
    }
    await json(route, { error: `Unexpected technician endpoint: ${path}` }, 404)
  })
  return { starts, orders, get packageReads() { return packageReads } }
}

test('technician prepares and starts the service from a mobile-first read-only surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Mis servicios' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  await page.getByRole('button', { name: 'Preparar', exact: true }).click()
  await expect(page.locator('.technician-service-card__prepared')).toContainText('Preparado en este celular')
  await page.getByRole('button', { name: 'Abrir servicio' }).click()
  await expect(page.getByRole('heading', { name: 'Productos a aplicar' })).toBeVisible()
  await expect(page.getByText('Gel insecticida')).toBeVisible()
  await expect(page.getByText('RS-123')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir Área Cocina' })).toBeVisible()
  await expect(page.locator('section[aria-labelledby="technician-products-title"] input')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await expect(page.getByText('En proceso', { exact: true })).toBeVisible()
  await expect(page.getByText('Este celular conserva el acceso de edición del servicio.')).toBeVisible()
  expect(api.starts).toHaveLength(1)
  expect(api.starts[0]).toMatchObject({ version: 1 })
  expect(api.starts[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(api.starts[0]?.deviceId).toMatch(/^[0-9a-f-]{36}$/)
  await page.getByRole('button', { name: 'Ordenar recorrido' }).click()
  await expect(page.getByRole('heading', { name: 'Ordenar recorrido' })).toBeVisible()
  await page.getByRole('button', { name: 'Bajar Cocina' }).click()
  await page.getByRole('button', { name: 'Aplicar orden' }).click()
  await expect(page.getByRole('heading', { name: 'Recorrido por áreas' })).toBeVisible()
  expect(api.orders).toHaveLength(1)
  expect(api.orders[0]).toMatchObject({ areaIds: [ids.area2, ids.area] })
  await page.getByRole('button', { name: 'Abrir Área Bodega' }).click()
  await expect(page.getByRole('heading', { name: 'Bodega', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ordenar recorrido' }).click()
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByRole('heading', { name: 'Bodega', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Siguiente: Cocina' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente: Cocina' }).click()
  await expect(page.getByRole('heading', { name: 'Cocina', exact: true })).toBeVisible()
})

test('an offline route order survives reload and stays queued on the same phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await expect(page.getByText('En proceso', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ordenar recorrido' }).click()
  await page.getByRole('button', { name: 'Bajar Cocina' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name: 'Aplicar orden' }).click()
  await expect(page.getByText('Orden guardado en este dispositivo.')).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByText('1 cambio por sincronizar')).toBeVisible()
  const areaButtons = page.locator('section[aria-labelledby="technician-areas-title"] li button')
  await expect(areaButtons.first()).toHaveAccessibleName('Abrir Área Bodega')
  expect(api.orders).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('prepared package survives reload and remains available without connection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto('/servicios')
  await page.getByRole('button', { name: 'Preparar', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir servicio' }).click()
  await expect(page.getByText('Gel insecticida')).toBeVisible()
  await expect.poll(() => api.packageReads).toBe(2)
  const readsBeforeReload = api.packageReads
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByText('Sin conexión · copia local')).toBeVisible()
  await expect(page.getByText('Gel insecticida')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar servicio' })).toBeDisabled()
  expect(api.packageReads).toBe(readsBeforeReload)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
