import { test, expect, type Page } from '@playwright/test'
import type { MonitoringPoint, MonitoringReview, SiteFinding } from '../src/types/siteInsights'
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const ids = { site: uid(1), client: uid(2), point: uid(3), review: uid(4), finding: uid(5), service: uid(6), area: uid(7), review2: uid(8) }
const date = '2026-10-08T13:00:00Z'
const service = { id: ids.service, number: 'SR-00000014', state: 'FINALIZADO' as const, date, technician: 'Técnico de prueba' }
const point: MonitoringPoint = { id: ids.point, number: 'P-01', areaId: ids.area, areaName: 'Cocina', areaActive: true, location: 'Bajo el mesón', trapCode: 'TRAMPA', trapName: 'Trampa adhesiva', classification: 'RASTREROS', condition: 'ACTIVO', enabled: true, createdAt: date, lastReview: service, inProgress: true }
const review: MonitoringReview = { id: ids.review, service, number: 'P-01', areaName: 'Cocina', location: 'Bajo el mesón original', trapName: 'Trampa adhesiva', previousCondition: 'ACTIVO', condition: 'ACTIVO', captures: [{ plagaCodigo: 'CUCARACHA', plagaNombreSnapshot: 'Cucaracha', cantidad: 3 }], consumption: null, chemical: null, antidote: null, notes: 'Sin novedades adicionales.', photos: [{ kind: 'REVIEW', recordId: ids.review, index: 0, label: 'Puesto P-01 · SR-00000014', date }], serviceProducts: [] }
const finding: SiteFinding = { id: ids.finding, areaId: ids.area, areaName: 'Cocina', state: 'ABIERTO', description: 'Grieta bajo el mesón', recommendation: 'Sellar la grieta para evitar ingreso de plagas.', responsibleName: 'Encargado de mantenimiento', responsibleEmail: null, openedAt: date, closedAt: null, closingNotes: null, openingService: service, closingService: null, photos: [{ kind: 'OPENING', recordId: ids.finding, index: 0, label: 'Apertura · SR-00000014', date }] }
async function setup(page: Page) {
  const calls: string[] = []
  await page.route('**/get-session', route => route.fulfill({ json: {
    session: { id: 'session', userId: 'auth-1', token: 'e2e-token', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: date, updatedAt: date },
    user: { id: 'auth-1', name: 'Admin de prueba', email: 'admin@example.test', emailVerified: true, createdAt: date, updatedAt: date },
  } }))
  await page.route('https://photos.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#d9e3e8"/><rect x="250" y="160" width="300" height="180" rx="12" fill="#65727b"/><text x="400" y="395" text-anchor="middle" font-family="sans-serif" font-size="24">Evidencia de prueba</text></svg>' }))
  await page.route('https://api.example.test/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return }
    calls.push(path)
    const send = (value: unknown) => route.fulfill({ json: value })
    if (path === '/api/session') { await send({ id: uid(20), nombreCompleto: 'Administrador de prueba', correoGoogle: 'admin@example.test', esAdmin: true, esTecnico: false, rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false }); return }
    if (path.endsWith('/pending-count')) { await send({ count: 0 }); return }
    if (path === `/api/clients/${ids.client}`) { await send({ id: ids.client, nombre: 'Cliente de prueba', tipoCliente: 'NEGOCIO', nit: 'CI-1', correos: [], activo: true, version: 1, vigenciaCertificadoMeses: 12, sedesCount: 1 }); return }
    if (path === `/api/sites/${ids.site}`) { await send({ id: ids.site, clientId: ids.client, nombre: 'Sede de prueba', direccion: 'Dirección sintética', tipoSede: 'NEGOCIO', activo: true, version: 1, correos: [], contactoPrincipalNombre: 'Contacto de prueba', contactoPrincipalCorreo: null, contactoPrincipalCelular: '+573000000001', valorServicio: 100000, periodicidadMeses: 1, duracionServicioMinutos: 60, areasCount: 1 }); return }
    const base = `/api/admin/sites/${ids.site}`
    const collection = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 20, areas: [{ value: ids.area, label: 'Cocina' }], traps: [{ value: 'TRAMPA', label: 'Trampa adhesiva' }] })
    if (path === `${base}/monitoring-points`) { await send(collection(url.searchParams.get('search')?.includes('inexistente') ? [] : [point])); return }
    if (path === `${base}/monitoring-points/${ids.point}/reviews`) { await send(collection([review, { ...review, id: ids.review2, service: { ...service, state: 'EN_PROCESO' }, photos: [{ ...review.photos[0], recordId: ids.review2, label: 'Revisión anterior' }] }])); return }
    if (path === `${base}/findings`) { await send(collection([finding])); return }
    if (path.includes('/photos/')) {
      await send(path.includes(ids.review2) ? { status: 'EXPIRED', url: null, expiresAt: null } : { status: 'AVAILABLE', url: 'https://photos.example.test/photo.svg', expiresAt: '2099-01-01T00:00:00Z' }); return
    }
    await route.fulfill({ status: 404, json: { error: 'Endpoint no previsto en la prueba' } })
  })
  await page.goto(`/clientes/${ids.client}/sedes/${ids.site}`)
  return calls
}
test('monitoring histories, private gallery, bounded requests and keyboard closing', async ({ page }) => {
  const calls = await setup(page)
  await page.getByRole('button', { name: 'Puestos de monitoreo', exact: true }).click()
  await page.getByRole('button', { name: 'Ver puesto P-01', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Puesto P-01', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Historial de revisiones')).toBeVisible()
  expect(calls.filter(path => path.includes('/photos/'))).toHaveLength(0)
  await drawer.getByRole('button', { name: 'Fotos (2)', exact: true }).click()
  const viewer = page.locator('dialog.evidence-dialog')
  await expect(viewer.getByRole('img')).toBeVisible()
  await viewer.getByRole('button', { name: 'Ampliar zoom' }).click()
  await expect(viewer).toContainText('150 %')
  await viewer.getByRole('button', { name: 'Foto siguiente' }).click()
  await expect(viewer).toContainText('Foto vencida')
  await page.keyboard.press('ArrowLeft')
  await expect(viewer.getByRole('img')).toBeVisible()
  expect(calls.filter(path => path.includes('/photos/'))).toHaveLength(2)
  await page.keyboard.press('Escape')
  await expect(viewer).not.toBeVisible()
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Ver puesto P-01', exact: true })).toBeFocused()
})
test('findings are readonly and reusing tabs does not reload their collections', async ({ page }) => {
  const calls = await setup(page)
  await page.getByRole('button', { name: 'Hallazgos', exact: true }).click()
  await page.getByRole('button', { name: finding.description, exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Detalle del hallazgo' })
  await expect(drawer).toContainText(finding.recommendation)
  await expect(drawer.getByRole('button', { name: /Editar|Eliminar|Cerrar hallazgo/i })).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Fotos de apertura (1)' }).click()
  await expect(page.locator('dialog.evidence-dialog').getByRole('img')).toBeVisible()
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Puestos de monitoreo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Puestos de monitoreo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hallazgos', exact: true }).click()
  expect(calls.filter(path => path.endsWith('/findings'))).toHaveLength(1)
})
for (const width of [390,1280]) for (const theme of ['light','dark']) {
  test(`site insights responsive ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 })
    await setup(page)
    await page.evaluate(value => document.documentElement.setAttribute('data-theme',value), theme)
    await page.getByRole('button', { name: 'Puestos de monitoreo', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Puestos de monitoreo', exact: true })).toBeVisible()
    await expect(page.getByText('Trampa adhesiva', { exact: true }).first()).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/site-points-${width}-${theme}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Hallazgos', exact: true }).click()
    await page.getByRole('button', { name: finding.description, exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Detalle del hallazgo' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/site-finding-${width}-${theme}.png`, fullPage: true })
  })
}

test('historial de sede usa tarjetas móviles sin desbordar y tabla en escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 860 })
  await setup(page)
  await page.route(/\/api\/sites\/[^/]+\/services\?page=/, route => route.fulfill({ json: {
    items: [{ id: ids.service, solicitud: 'SR-00000021', fecha: '2026-10-30T12:00:00Z', tipo: 'REFUERZO', tecnico: 'Técnico de prueba', estado: 'PROGRAMADO', valor: 105000 }],
    page: 1, pageSize: 20, total: 1,
  } }))
  await page.getByRole('button', { name: 'Historial de servicios', exact: true }).click()
  const mobile = page.locator('.history-mobile-card')
  await expect(mobile).toHaveCount(1)
  await expect(mobile.getByRole('link', { name: 'SR-00000021' })).toBeVisible()
  await expect(page.locator('.history-table')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.setViewportSize({ width: 1280, height: 860 })
  await expect(page.locator('.history-table')).toBeVisible()
  await expect(mobile).toBeHidden()
})
