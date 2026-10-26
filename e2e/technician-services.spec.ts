import { expect, test, type Page, type Route } from '@playwright/test'
import type { TechnicianExecutionSession, TechnicianServicePackage, TechnicianServiceSummary } from '../src/types/technicianServices'

const uid = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const ids = { actor: uid(1), service: uid(2), product: uid(3), area: uid(4), criterion: uid(5), device: uid(6), lock: uid(7), area2: uid(8), criterion2: uid(9), finding: uid(10), priorService: uid(11) }
const fleet = Array.from({ length: 150 }, (_, index) => ({
  id: uid(100 + index), placa: `ABC${String(index + 1).padStart(3, '0')}`, activo: true,
}))
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
  contactoPrincipalNombre: 'Contacto Laureles',
  contactoPrincipalCorreo: 'contacto@example.invalid',
  contactoPrincipalCelular: '+573001112233',
  contactEmails: ['contacto@example.invalid','gerencia@example.invalid'],
  direccion: 'Calle 10 # 20-30, Medellín',
  autoPrepareEligible: true,
})
const servicePackage = (state: TechnicianServiceSummary['estado'] = 'PROGRAMADO', withPriorFinding = false): TechnicianServicePackage => ({
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
    fichaTecnicaDisponible: true,
  }],
  deviceTypes: [{ codigo: 'TRAMPA_ADHESIVA', nombre: 'Trampa adhesiva', clasificacion: 'RASTREROS', plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }] }],
  vehiclesEnabled: false,
  vehicles: [],
  attendedVehicleIds: null,
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
    dispositivos: [{
      id: ids.device, dispositivoId: ids.device, numero: 'D-01', ubicacion: 'Bajo mesón', tipoCodigo: 'TRAMPA_ADHESIVA',
      tipoNombre: 'Trampa adhesiva', clasificacion: 'RASTREROS', plagas: [{ codigo: 'CUCARACHA', nombre: 'Cucaracha' }],
      estadoAnterior: 'ACTIVO', creadoDuranteServicio: false, revisado: false, revision: null,
    }],
    hallazgos: withPriorFinding ? [{
      id: ids.finding, servicioAperturaId: ids.priorService, fechaApertura: '2026-09-07T14:00:00Z',
      descripcion: 'Abertura junto al muro', recomendacionAccion: 'Sellar el paso', evidenciasAperturaStoragePaths: [],
      estado: 'ABIERTO', responsableNombre: 'Mantenimiento', responsableCorreo: null, servicioCierreId: null,
      fechaCierre: null, evidenciasCierreStoragePaths: [], observacionCierre: null, version: 1,
      historialSeguimientos: [{
        id: uid(12), servicioId: uid(13), solicitud: 'SR-0001',
        fecha: '2026-09-08T14:00:00Z', resultado: 'SIN_CAMBIOS',
        observacion: 'Sin novedades', evidenciasStoragePaths: [`services/${uid(13)}/findings/${ids.finding}/followup/revision.jpg`],
      }],
    }] : [],
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
    hallazgos: [],
  }],
  signatures: { technicianStoragePath: null, technicianUserId: null, clientStoragePath: null, clientName: null, clientSignedAt: null },
})

async function setup(page: Page, withPriorFinding = false, failFirstPackage: boolean | number = false, initialState: TechnicianServiceSummary['estado'] = 'PROGRAMADO', kind: 'PRINCIPAL' | 'REFUERZO' = 'PRINCIPAL', vehicleMode = false, residential = false) {
  const asVisit = (value: TechnicianServicePackage): TechnicianServicePackage => kind === 'REFUERZO' || residential
    ? { ...value, service: { ...value.service, tipoServicio: kind, tipoSede: residential ? 'RESIDENCIAL' : 'NEGOCIO' }, areas: [], deviceTypes: [] }
    : vehicleMode ? { ...value, vehiclesEnabled: true, vehicles: fleet, attendedVehicleIds: null } : value
  let current = asVisit(servicePackage(initialState, withPriorFinding))
  let packageReads = 0
  const starts: Array<Record<string, unknown>> = []
  const orders: Array<Record<string, unknown>> = []
  const evaluations: Array<Record<string, unknown>> = []
  const deviceCreations: Array<Record<string, unknown>> = []
  const reportSends: Array<Record<string, unknown>> = []
  const vehicleCreations: Array<Record<string, unknown>> = []
  const vehicleSelections: Array<string[]> = []
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
    if (path.startsWith('/api/technician/services/' + ids.service + '/photos/FOLLOWUP/')) {
      await json(route, { status: 'EXPIRED', url: null, expiresAt: null })
      return
    }
    if (path === '/api/technician/services/' + ids.service + '/products/' + ids.product + '/technical-sheet') {
      await json(route,{url:'https://r2.example.test/producto.pdf'})
      return
    }
    if (path === '/api/technician/services/' + ids.service + '/report-sharing' && request.method() === 'GET') {
      await json(route,{registeredEmails:['contacto@example.invalid','gerencia@example.invalid'],
        certificates:[],activeLinks:0,lastSharedAt:null,gmailConnected:true})
      return
    }
    if (path === '/api/technician/services/' + ids.service + '/report-sharing/send') {
      const input = request.postDataJSON() as Record<string, unknown>
      reportSends.push(input)
      if (current.service.estado !== 'FINALIZADO') { await json(route,{error:'Servicio no finalizado'},409); return }
      await json(route,{sent:true,linkExpiresAt:'2027-01-09T15:00:00.000Z',attachmentCount:0})
      return
    }
    if (path === '/api/technician/services' && request.method() === 'GET') { await json(route, [current.service]); return }
    if (path === `/api/technician/services/${ids.service}/package`) {
      packageReads++
      if (packageReads <= Number(failFirstPackage)) await json(route, { error: 'Falla sintética de descarga' }, 503)
      else await json(route, current)
      return
    }
    if (path === `/api/technician/services/${ids.service}/start`) {
      starts.push(request.postDataJSON() as Record<string, unknown>)
      current = asVisit(servicePackage('EN_PROCESO', withPriorFinding))
      const body = request.postDataJSON() as { deviceId: string }
      const session: TechnicianExecutionSession = { package: current, lock: { token: ids.lock, deviceId: body.deviceId, acquiredAt: current.serverNow } }
      await json(route, session)
      return
    }
    if (path === `/api/technician/services/${ids.service}/vehicles` && request.method() === 'POST') {
      const body = request.postDataJSON() as { vehicleId: string; placa: string }
      vehicleCreations.push(body as unknown as Record<string, unknown>)
      const existing = current.vehicles.find(vehicle => vehicle.placa === body.placa)
      const vehicle = existing ?? { id: body.vehicleId, placa: body.placa, activo: true }
      if (!existing) current = { ...current, vehicles: [...current.vehicles, vehicle] }
      await json(route, { vehicle, created: !existing })
      return
    }
    if (path === `/api/technician/services/${ids.service}/vehicles/selection` && request.method() === 'POST') {
      const body = request.postDataJSON() as { selectedIds: string[] }
      vehicleSelections.push(body.selectedIds)
      current = { ...current, attendedVehicleIds: body.selectedIds }
      await json(route, { attendedVehicleIds: body.selectedIds })
      return
    }
    if (path === `/api/technician/services/${ids.service}/areas/order`) {
      const body = request.postDataJSON() as { areaIds: string[] }
      orders.push(request.postDataJSON() as Record<string, unknown>)
      current = { ...current, areas: body.areaIds.map((id, posicionRecorrido) => ({ ...current.areas.find(area => area.id === id)!, posicionRecorrido, version: 2 })) }
      await json(route, { areas: current.areas.map(area => ({ id: area.id, posicionRecorrido: area.posicionRecorrido, version: area.version })) })
      return
    }
    if ([ids.criterion, ids.criterion2].some(criterionId => path === `/api/technician/services/${ids.service}/criteria/${criterionId}`)) {
      const body = request.postDataJSON() as { evaluation: 'C' | 'CP' | 'NC' | 'NA'; observation: string }
      evaluations.push(body)
      const selectedCriterionId = path.endsWith(ids.criterion2) ? ids.criterion2 : ids.criterion
      const selectedAreaId = selectedCriterionId === ids.criterion2 ? ids.area2 : ids.area
      const area = current.areas.find(item => item.id === selectedAreaId)!
      const criterion = { ...area.criterios[0]!, evaluacion: body.evaluation, observacion: body.observation || null, version: area.criterios[0]!.version + 1 }
      current = { ...current, areas: current.areas.map(item => item.id === selectedAreaId ? { ...item, criterios: [criterion] } : item) }
      await json(route, { criterion, removedEvidenceStoragePaths: [] })
      return
    }
    if (path === `/api/technician/services/${ids.service}/devices/${ids.device}/review`) {
      const body = request.postDataJSON() as Record<string, unknown>
      const review = { id: body.reviewId as string, estadoObservado: body.estadoObservado as 'ACTIVO', capturas: [],
        consumo: '', productoQuimico: '', antidoto: '', observaciones: '', fotoStoragePath: null, version: 1 }
      current = { ...current, areas: current.areas.map(item => item.id === ids.area
        ? { ...item, dispositivos: item.dispositivos.map(device => device.id === ids.device ? { ...device, revisado: true, revision: review } : device) }
        : item) }
      await json(route, { review })
      return
    }
    if (path === `/api/technician/services/${ids.service}/areas/${ids.area}/devices`) {
      const body = request.postDataJSON() as Record<string, string>
      deviceCreations.push(body)
      const type = current.deviceTypes.find(item => item.codigo === body.tipoCodigo)!
      const device = {
        id: body.serviceDeviceId!, dispositivoId: body.permanentDeviceId!, numero: body.numero!, ubicacion: body.ubicacion!,
        tipoCodigo: type.codigo, tipoNombre: type.nombre, clasificacion: type.clasificacion, plagas: type.plagas,
        estadoAnterior: 'ACTIVO' as const, creadoDuranteServicio: true, revisado: false, revision: null,
      }
      current = { ...current, areas: current.areas.map(item => item.id === ids.area
        ? { ...item, dispositivos: [...item.dispositivos, device] }
        : item) }
      await json(route, { device })
      return
    }
    await json(route, { error: `Unexpected technician endpoint: ${path}` }, 404)
  })
  return { starts, orders, evaluations, deviceCreations, reportSends, vehicleCreations, vehicleSelections,
    get packageReads() { return packageReads } }
}

test('technician can open and start a reinforcement without a full MIP route or report', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page, false, false, 'PROGRAMADO', 'REFUERZO')
  await page.goto('/servicios')
  await expect(page.getByText('Refuerzo')).toBeVisible()
  await page.getByRole('button', { name: 'Ver servicio' }).click()
  await expect(page.getByText('SR-0201 · Refuerzo')).toBeVisible()
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await expect(page.getByRole('heading', { name: 'Revisión y cierre' })).toBeVisible()
  await expect(page.getByText('Servicio de refuerzo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Estado por Área' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar informe' })).toHaveCount(0)
  expect(api.starts).toHaveLength(1)
})

for (const residential of [true, false]) {
  test(`el cierre ${residential ? 'residencial' : 'de refuerzo'} muestra solo las acciones disponibles`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const api = await setup(page, false, false, 'FINALIZADO', residential ? 'PRINCIPAL' : 'REFUERZO', false, residential)
    await page.goto('/servicios/' + ids.service + '/trabajo/revision')
    const completion = page.getByRole('region', { name: 'Trabajo completado' })
    await expect(completion).toBeVisible()
    await expect(completion.getByText('Firmas confirmadas', { exact: true })).toBeVisible()
    await expect(completion).not.toContainText(/certificados|documentos/i)
    await expect(page.getByRole('button', { name: 'Enviar informe' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Informe y certificados' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reportar cobro' })).toHaveCount(residential ? 1 : 0)
    await expect(completion).toContainText(residential
      ? 'Ahora puedes reportar el cobro.' : 'El cierre y las firmas están confirmados.')
    await expect(page.getByRole('button', { name: 'Volver al servicio' })).toBeVisible()
    expect(api.reportSends).toHaveLength(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/closure-${residential ? 'residential' : 'reinforcement'}-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(completion).toBeVisible()
    await page.screenshot({ path: `test-results/closure-${residential ? 'residential' : 'reinforcement'}-desktop.png`, fullPage: true })
  })
}

test('technician prepares and starts the service from a mobile-first read-only surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Mis servicios' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  await page.getByRole('button', { name: 'Ver servicio' }).click()
  await expect(page.getByText('Contacto Laureles')).toBeVisible()
  await expect(page.getByRole('link',{name:/Hablar por WhatsApp con/})).toHaveAttribute('href','https://wa.me/573001112233')
  await expect(page.getByRole('link',{name:'Llamar'})).toHaveAttribute('href','tel:+573001112233')
  await expect(page.getByRole('link',{name:'contacto@example.invalid'})).toHaveAttribute('href','mailto:contacto%40example.invalid')
  await expect(page.getByRole('button', { name: 'Abrir Área Cocina' })).toHaveCount(0)
  await page.getByText('Productos previstos (1)').click()
  await expect(page.getByRole('heading', { name: 'Productos a aplicar' })).toBeVisible()
  await expect(page.getByText('Gel insecticida')).toBeVisible()
  await expect(page.getByText('RS-123')).toBeVisible()
  await expect(page.locator('section[aria-labelledby="technician-products-title"] input')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await expect(page.locator('#technician-area-selector')).toBeVisible()
  expect(api.starts).toHaveLength(1)
  expect(api.starts[0]).toMatchObject({ version: 1 })
  expect(api.starts[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(api.starts[0]?.deviceId).toMatch(/^[0-9a-f-]{36}$/)
  await page.getByRole('button', { name: 'Ordenar Áreas' }).click()
  await expect(page.getByRole('heading', { name: 'Ordenar recorrido' })).toBeVisible()
  await page.getByRole('button', { name: 'Bajar Cocina' }).click()
  await page.getByRole('button', { name: 'Aplicar orden' }).click()
  await expect(page.locator('#technician-area-selector')).toBeVisible()
  expect(api.orders).toHaveLength(1)
  expect(api.orders[0]).toMatchObject({ areaIds: [ids.area2, ids.area] })
  await page.getByLabel('Área', { exact: true }).selectOption(ids.area2)
  await expect(page.locator('#technician-area-selector')).toBeVisible()
  await page.getByRole('button', { name: 'Ordenar Áreas' }).click()
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.locator('#technician-area-selector')).toBeVisible()
  await page.getByLabel('Área', { exact: true }).selectOption(ids.area)
  await expect(page.locator('#technician-area-selector')).toBeVisible()
  await page.getByRole('button', { name: /Observación/ }).click()
  await page.getByLabel('Observación').fill('Limpieza parcial')
  await page.getByRole('button', { name: 'Cumple parcialmente' }).click()
  await expect(page.locator('[aria-label="Guardado"]')).toBeVisible()
  expect(api.evaluations).toHaveLength(1)
  expect(api.evaluations[0]).toMatchObject({ evaluation: 'CP', observation: 'Limpieza parcial', version: 1 })
  await page.getByLabel('Observación').fill('Limpieza parcial actualizada')
  await page.getByLabel('Área', { exact: true }).selectOption(ids.area2)
  await expect(page.locator('#technician-area-selector')).toHaveValue(ids.area2)
  await expect.poll(() => api.evaluations.length).toBe(2)
  expect(api.evaluations[1]).toMatchObject({ evaluation: 'CP', observation: 'Limpieza parcial actualizada', version: 2 })
})

test('criterion controls remain touchable in one row at 320 px and the list scales to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  const controls = ['Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica'].map(name => page.getByRole('button', { name, exact: true }))
  const boxes = await Promise.all(controls.map(control => control.boundingBox()))
  expect(boxes.every(box => box && box.height >= 44)).toBe(true)
  expect(new Set(boxes.map(box => Math.round(box!.y))).size).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('automatic preparation offers manual retry after both automatic attempts fail', async ({ page }) => {
  const api = await setup(page, false, 2)
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar descarga' })).toBeVisible()
  expect(api.packageReads).toBe(2)
  await page.getByRole('button', { name: 'Reintentar descarga' }).click()
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  expect(api.packageReads).toBe(3)
})

test('automatic preparation recovers a transient read failure without starting a service', async ({ page }) => {
  const api = await setup(page, false, true)
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  expect(api.packageReads).toBe(2)
  await expect(page.getByRole('button', { name: 'Reintentar descarga' })).toHaveCount(0)
  expect(api.starts).toHaveLength(0)
})

test('an offline route order survives reload and stays queued on the same phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await expect(page.locator('#technician-area-selector')).toBeVisible()
  await page.getByRole('button', { name: 'Ordenar Áreas' }).click()
  await page.getByRole('button', { name: 'Bajar Cocina' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name: 'Aplicar orden' }).click()
  await expect(page.getByText('Orden guardado en este dispositivo.')).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByLabel('Área', { exact: true }).locator('option').first()).toContainText('Bodega')
  expect(api.orders).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('an offline criterion evaluation survives reload in the shared outbox', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name: /Observación/ }).click()
  await page.getByLabel('Observación').fill('Requiere limpieza')
  await page.getByRole('button', { name: 'No cumple' }).click()
  await expect(page.getByText('Guardado local', { exact: true })).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByRole('button', { name: 'No cumple' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Observación')).toHaveValue('Requiere limpieza')
  expect(api.evaluations).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a no-access Area and its required photo survive an offline reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name: 'Registrar área sin acceso' }).click()
  const dialog = page.getByRole('dialog', { name: 'No fue posible acceder al Área' })
  await expect(dialog.getByRole('button', { name: 'Habilitar Área' })).toBeVisible()
  await dialog.getByLabel('Motivo').fill('Puerta cerrada por el cliente')
  await dialog.locator('input[type="file"]:not([capture])').setInputFiles([
    { name: 'area-1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-1') },
    { name: 'area-2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-2') },
  ])
  await expect(dialog.getByRole('button', { name: 'Ver fotografía 1' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Ver fotografía 2' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Guardar Área sin acceso' }).click()
  await expect(page.getByRole('dialog', { name: 'Área registrada sin acceso' })).toBeVisible()
  await page.getByRole('button', { name: 'Permanecer en esta Área' }).click()
  await expect(page.getByText('Área sin acceso', { exact: true })).toBeVisible()
  await expect(page.getByText('2 fotografía(s) guardada(s)')).toBeVisible()
  await expect(page.locator('.area-tabs')).toBeHidden()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByText('Puerta cerrada por el cliente')).toBeVisible()
  await expect(page.getByText('2 fotografía(s) guardada(s)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Habilitar acceso' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a device review and its condition photo survive an offline reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.locator('.area-tabs').getByRole('button', { name: /Puestos/ }).click()
  await page.getByRole('button', { name: /D-01/ }).click()
  await page.getByLabel('Estado observado').selectOption('DANADO')
  await page.getByRole('button', { name: 'Cucaracha' }).click()
  await page.getByLabel('Cantidad · Cucaracha').fill('4')
  await page.locator('details.device-notes > summary').click()
  await page.getByLabel('Observaciones del puesto').fill('Base desprendida')
  await page.locator('.workspace-panel[aria-labelledby="points-title"] input[type="file"][capture="environment"]').setInputFiles({ name: 'dispositivo-danado.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-device-photo') })
  await page.getByRole('button', { name: 'Guardar puesto de monitoreo' }).click()
  await expect(page.getByText('Guardado local', { exact: true })).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Puestos/ }).click()
  await page.getByRole('button', { name: /D-01/ }).click()
  await expect(page.getByLabel('Estado observado')).toHaveValue('DANADO')
  await expect(page.getByRole('button', { name: /Cucaracha\s*4/ })).toBeVisible()
  await expect(page.getByText('Ya hay una fotografía guardada. Si eliges otra, la reemplazará.')).toBeVisible()
  await expect(page.getByText('Guardado local', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a new permanent device survives an offline reload before synchronization', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  const devices = page.locator('.workspace-panel[aria-labelledby="points-title"]')
  await page.locator('.area-tabs').getByRole('button', { name: /Puestos/ }).click()
  await devices.getByRole('button', { name: 'Agregar puesto' }).click()
  await page.getByLabel('Número').fill('D-02')
  await page.getByLabel('Ubicación').fill('Junto a la puerta')
  await page.locator('form').getByRole('button', { name: 'Agregar puesto' }).click()
  await expect(page.getByRole('button', { name: /D-02/ })).toContainText('Creación local')
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Puestos/ }).click()
  await expect(page.getByRole('button', { name: /D-02/ })).toContainText('Creación local')
  expect(api.deviceCreations).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a finding with several evidence photos survives an offline reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  const findings = page.locator('.workspace-panel[aria-labelledby="criteria-title"]')
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await findings.getByRole('button', { name: 'Agregar', exact: true }).click()
  await findings.getByLabel('Descripción').fill('Abertura junto al muro')
  await findings.getByLabel('Recomendación o acción correctiva').fill('Sellar el paso')
  await expect(findings.locator('input[name^="finding-responsible"]')).toHaveCount(0)
  await findings.locator('input[type="file"]:not([capture])').setInputFiles([
    { name: 'hallazgo-1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-finding-photo-1') },
    { name: 'hallazgo-2.png', mimeType: 'image/png', buffer: Buffer.from('synthetic-finding-photo-2') },
  ])
  await findings.locator('.finding-create').getByRole('button', { name: 'Registrar hallazgo', exact: true }).click()
  await expect(findings.getByRole('button', { name: /Abertura junto al muro/ })).toBeVisible()
  await expect(findings.locator('.finding-card')).toHaveCount(1)
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await expect(findings.getByRole('button', {name:'Apertura · 2 fotos'})).toBeVisible()
  await expect(findings.getByText('Contacto Laureles')).toBeVisible()
  await expect(findings.getByText('Revisión guardada en este celular')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a prior finding can be closed only with evidence and survives offline reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  const findings = page.locator('.workspace-panel[aria-labelledby="criteria-title"]')
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await findings.getByRole('button', { name: 'Cerrado', exact: true }).click()
  await findings.getByRole('button', { name: 'Guardar revisión' }).click()
  await expect(findings.getByText('Para cerrar el hallazgo debes adjuntar una fotografía.')).toBeVisible()
  await findings.locator('.finding-review').getByRole('button', { name: /Observación/ }).click()
  await findings.getByLabel('Observación de la visita').fill('Paso sellado')
  await findings.locator('.finding-review input[type="file"][capture="environment"]').setInputFiles({ name: 'cierre.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-closure-photo') })
  await findings.getByRole('button', { name: 'Guardar revisión' }).click()
  await expect(findings.getByText('Revisado en esta visita · Cerrado')).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await expect(findings.getByText('Revisado en esta visita · Cerrado')).toBeVisible()
  await expect(findings.getByLabel('Observación de la visita')).toHaveValue('Paso sellado')
})

test('prepared package survives reload and remains available without connection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto('/servicios')
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  await page.getByRole('button', { name: 'Ver servicio' }).click()
  await page.getByText('Productos previstos (1)').click()
  await expect(page.getByText('Gel insecticida')).toBeVisible()
  await expect.poll(() => api.packageReads).toBe(2)
  const readsBeforeReload = api.packageReads
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByText('Sin conexión · copia local')).toBeVisible()
  await page.getByText('Productos previstos (1)').click()
  await expect(page.getByText('Gel insecticida')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar servicio' })).toBeDisabled()
  expect(api.packageReads).toBe(readsBeforeReload)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('assigned service contact remains available from its offline prepared package', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await setup(page)
  await page.goto('/servicios')
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  await page.getByRole('button',{name:'Ver servicio'}).click()
  await expect(page.getByRole('link',{name:'Llamar'})).toHaveAttribute('href','tel:+573001112233')
  await page.addInitScript(() => Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}))
  await page.reload()
  await expect(page.getByRole('link',{name:'Llamar'})).toHaveAttribute('href','tel:+573001112233')
  await expect(page.getByRole('link',{name:/Hablar por WhatsApp con/})).toHaveAttribute('href','https://wa.me/573001112233')
})

test('both full-screen signatures and the closure intention survive offline reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.getByRole('button', { name: 'Cumple', exact: true }).click()
  await expect(page.locator('[aria-label="Guardado"]')).toBeVisible()
  await page.locator('.area-tabs').getByRole('button', { name: /Puestos/ }).click()
  await page.getByRole('button', { name: /D-01/ }).click()
  await page.getByRole('button', { name: 'Guardar puesto de monitoreo' }).click()
  await page.getByLabel('Área', { exact: true }).selectOption(ids.area2)
  await expect(page.locator('#technician-area-selector')).toHaveValue(ids.area2)
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await page.getByRole('button', { name: 'Cumple', exact: true }).click()
  await expect(page.locator('[aria-label="Guardado"]')).toBeVisible()
  await page.locator('.tech-stages').getByRole('link', { name: 'Cierre' }).click()
  for (const label of ['Técnico', 'Responsable del cliente']) {
    await page.getByRole('article').filter({ hasText: label }).getByRole('button', { name: 'Firmar', exact: true }).click()
    await expect(page.getByRole('dialog', { name: `Firma del ${label}` })).toBeVisible()
    const canvas = page.getByLabel('Lienzo para firma')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const rect = box!
    await page.mouse.move(rect.x + 30, rect.y + 60)
    await page.mouse.down()
    await page.mouse.move(rect.x + rect.width - 40, rect.y + rect.height - 60, { steps: 5 })
    await page.mouse.up()
    await page.getByRole('button', { name: 'Aceptar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await expect(page.getByLabel('Nombre de quien firma por el cliente')).toHaveValue('Contacto Laureles')
  await page.getByLabel('Nombre de quien firma por el cliente').fill('Responsable local')
  await expect(page.getByRole('button', { name: 'Finalizar servicio' })).toBeEnabled()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name: 'Finalizar servicio' }).click()
  await expect(page.getByText('Cierre guardado. Se finalizará al recuperar conexión.')).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByText('Firma guardada')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Cierre pendiente' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})


test('técnico guarda correo offline y lo envía una sola vez al reconectar', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 })
  const api = await setup(page,false,false,'FINALIZADO')
  await page.goto('/servicios/' + ids.service + '/trabajo/revision')
  await expect(page.getByRole('heading',{name:'Trabajo completado'})).toBeVisible()
  await expect(page.getByText('Certificados automáticos', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Trabajo completado' })).toContainText('Ahora puedes enviar los documentos y reportar el cobro.')
  await page.screenshot({path:'test-results/service-completed-mobile.png',fullPage:true})
  await expect(page.getByRole('button', { name:'Enviar informe' })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator,'onLine',{configurable:true,get:() => false})
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name:'Enviar informe' }).click()
  const dialog = page.getByRole('dialog',{name:'Enviar informe'})
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('gerencia@example.invalid')).toBeVisible()
  await dialog.getByLabel('contacto@example.invalid').check()
  await dialog.getByLabel('Agregar otro correo').fill('adicional@example.invalid')
  await dialog.getByRole('button',{name:'Añadir'}).click()
  await dialog.getByRole('button',{name:'Guardar envío'}).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Envío pendiente')).toBeVisible()
  expect(api.reportSends).toHaveLength(0)
  await page.addInitScript(() => Object.defineProperty(navigator,'onLine',{configurable:true,get:() => false}))
  await page.reload()
  await expect(page.getByText('Envío pendiente')).toBeVisible()
  expect(api.reportSends).toHaveLength(0)
  await page.evaluate(() => {
    Object.defineProperty(navigator,'onLine',{configurable:true,get:() => true})
    window.dispatchEvent(new Event('online'))
  })
  await expect.poll(() => api.reportSends.length).toBe(1)
  expect(api.reportSends[0]).toMatchObject({
    recipients:['adicional@example.invalid','contacto@example.invalid'],
    certificateIds:[],
  })
  expect(api.reportSends[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByText('Envío pendiente')).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => api.reportSends.length).toBe(1)
})


test('el técnico puede abrir la ficha técnica del producto asignado sin exponer su ruta R2',async({page})=>{
  await setup(page)
  await page.context().route('https://r2.example.test/**', route=>route.fulfill({status:200,contentType:'text/html',body:'Ficha técnica de prueba'}))
  await page.goto('/servicios/'+ids.service+'/trabajo')
  await page.getByText('Productos previstos (1)').click()
  const sheet=page.getByRole('button',{name:'Ver ficha técnica de Gel insecticida'})
  await expect(sheet).toBeVisible()
  const pending=page.waitForEvent('popup')
  await sheet.click()
  const popup=await pending
  await expect.poll(()=>popup.url()).toContain('r2.example.test/producto.pdf')
  await popup.close()
})

test('the mobile guided flow highlights pending criteria and points without restricting tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  const criteria = page.locator('.workspace-panel[aria-labelledby="criteria-title"]')
  await criteria.getByRole('button', { name: /Observación/ }).click()
  await criteria.getByLabel('Observación').fill('Requiere revisar')
  await criteria.getByRole('button', { name: 'Siguiente: Puestos' }).click()
  await expect(criteria.getByText('Debes evaluar este criterio para continuar.')).toBeVisible()
  await page.locator('.area-tabs').getByRole('button', { name: /Puestos/ }).click()
  const points = page.locator('.workspace-panel[aria-labelledby="points-title"]')
  await points.getByRole('button', { name: 'Siguiente área' }).click()
  await expect(points.getByText('Revisa este puesto antes de continuar.')).toBeVisible()
  await expect(points.getByRole('button', { name: /D-01/ })).toHaveAttribute('aria-expanded', 'true')
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await expect(criteria.getByLabel('Observación')).toHaveValue('Requiere revisar')
  await criteria.getByRole('button', { name: /Marcar pendientes como C/ }).click()
  await expect.poll(() => api.evaluations.length).toBe(1)
  expect(api.evaluations[0]).toMatchObject({ evaluation: 'C', observation: 'Requiere revisar' })
  await criteria.getByRole('button', { name: 'Siguiente: Puestos' }).click()
  await expect(points.getByRole('button', { name: 'Anterior' })).toBeVisible()
  await points.getByRole('button', { name: 'Anterior' }).click()
  await expect(criteria.getByRole('button', { name: 'Siguiente: Puestos' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('an open finding requires one review per visit; sigue igual preserves its state offline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  const section = page.locator('.workspace-panel[aria-labelledby="criteria-title"]')
  await section.getByRole('button', { name: 'Siguiente: Puestos' }).click()
  await expect(page.locator('.workspace-panel[aria-labelledby="criteria-title"]').getByText('Debes evaluar este criterio para continuar.')).toBeVisible()
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')) })
  await section.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await section.getByRole('button', { name: 'Sigue igual' }).click()
  await section.getByRole('button', { name: 'Guardar revisión' }).click()
  await expect(section.getByText('Revisado en esta visita · Sigue igual')).toBeVisible()
  await expect(section.getByText('Abierto', { exact: true })).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  await section.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await expect(section.getByText('Revisado en esta visita · Sigue igual')).toBeVisible()
  await section.getByRole('button', { name: 'En proceso', exact: true }).click()
  await section.getByRole('button', { name: 'Actualizar revisión' }).click()
  await expect(section.getByText('Revisado en esta visita · En proceso')).toBeVisible()
  await section.getByRole('button', { name: 'Sigue igual' }).click()
  await section.getByRole('button', { name: 'Actualizar revisión' }).click()
  await expect(section.getByText('Revisado en esta visita · Sigue igual')).toBeVisible()
})


test('a prior visit photo opens the protected viewer and gracefully reports expired media', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.locator('.area-tabs').getByRole('button', { name: /Criterios/ }).click()
  const findings = page.locator('.workspace-panel[aria-labelledby="criteria-title"]')
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await findings.getByText(/Historial de revisiones/).click()
  await findings.getByRole('button', { name: 'Ver fotos (1)' }).click()
  await expect(page.locator('.evidence-viewer__message').getByText('Sin fotos disponibles', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar visor' }).click()
})

test('a technician can crop and draw on a photo in the mobile preview before saving it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  const criteria = page.locator('.workspace-panel[aria-labelledby="criteria-title"]')
  await criteria.getByRole('button', { name: /Fotos/ }).click()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 240
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 240, 240)
    return canvas.toDataURL('image/png').split(',')[1]!
  })
  await criteria.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
  })
  await criteria.getByRole('button', { name: 'Ver fotografía 1' }).click()
  await page.getByRole('button', { name: 'Dibujar o recortar' }).click()
  const canvas = page.getByLabel('Fotografía para editar')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  await page.getByRole('button', { name: 'Recortar' }).click()
  await page.mouse.move(bounds!.x + bounds!.width * 0.15, bounds!.y + bounds!.height * 0.15)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * 0.8, bounds!.y + bounds!.height * 0.8, { steps: 4 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Aplicar recorte' }).click()
  await page.getByRole('button', { name: 'Dibujar' }).click()
  const reduced = await canvas.boundingBox()
  expect(reduced).not.toBeNull()
  await page.mouse.move(reduced!.x + reduced!.width * 0.2, reduced!.y + reduced!.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(reduced!.x + reduced!.width * 0.7, reduced!.y + reduced!.height * 0.7, { steps: 4 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Guardar foto' }).click()
  await expect(page.getByRole('button', { name: 'Dibujar o recortar' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('vehicle fleet: mobile search, selective attention and confirmation before closing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page, false, false, 'PROGRAMADO', 'PRINCIPAL', true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.getByRole('link', { name: 'Vehículos' }).click()
  await expect(page.getByText('150 registrados')).toBeVisible()
  await page.getByRole('button', { name: 'ABC001' }).click()
  await page.getByLabel('Buscar placa').fill('ABC145')
  await page.getByRole('button', { name: 'ABC145' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar 2 atendidos' })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirmar 2 atendidos' }).click()
  await expect(page).toHaveURL(/\/trabajo\/revision$/)
  expect(api.vehicleSelections).toEqual([[fleet[0]!.id, fleet[144]!.id]])
  await expect(page.getByRole('heading', { name: 'Vehículos atendidos' })).toBeVisible()
  await expect(page.getByText('2 atendidos')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('vehicle fleet: confirming zero is different from skipping the vehicle step', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const api = await setup(page, false, false, 'PROGRAMADO', 'PRINCIPAL', true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.getByRole('link', { name: 'Cierre' }).click()
  await expect(page.getByText('Áreas y vehículos pendientes')).toBeVisible()
  await expect(page.getByText('Sin confirmar', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finalizar servicio' })).toBeDisabled()
  await page.getByRole('button', { name: /Sin confirmar/ }).click()
  await page.getByRole('button', { name: 'Confirmar 0 atendidos' }).click()
  await expect(page).toHaveURL(/\/trabajo\/revision$/)
  expect(api.vehicleSelections).toEqual([[]])
  await expect(page.getByText('0 atendidos')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('vehicle fleet: a drafted plate persists offline across reload and syncs when back online', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page, false, false, 'PROGRAMADO', 'PRINCIPAL', true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.getByRole('link', { name: 'Vehículos' }).click()
  await page.getByRole('button', { name: 'ABC001' }).click()
  // The checkbox is durably saved in IndexedDB before the technician leaves.
  await expect(page.getByText('Selección guardada en este celular.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ABC001' })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(page.getByRole('button', { name: 'ABC001' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Confirmar 1 atendido' }).click()
  expect(api.vehicleSelections).toHaveLength(0)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    window.dispatchEvent(new Event('online'))
  })
  await expect.poll(() => api.vehicleSelections.length).toBe(1)
  expect(api.vehicleSelections[0]).toEqual([fleet[0]!.id])
})


test('criterion finding reuses one durable photo and preserves its draft and history after offline reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, true)
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button', { name: 'Iniciar servicio' }).click()
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')) })
  const criterion = page.locator('.criterion-card').first()
  await criterion.getByRole('button', { name: 'No cumple', exact: true }).click()
  await criterion.getByLabel('Observación', { exact: true }).fill('Grieta junto al muro')
  await criterion.getByRole('button', { name: /Fotos/ }).click()
  await criterion.locator('input[type="file"]:not([capture])').setInputFiles({
    name: 'grieta.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),
  })
  await expect(criterion.getByRole('button', { name: 'Fotos · 1/5' })).toBeVisible()
  await criterion.getByRole('button', { name: 'Registrar hallazgo', exact: true }).click()
  await expect(criterion.getByRole('textbox', { name: 'Descripción', exact: true })).toHaveValue('Grieta junto al muro')
  await criterion.getByLabel('Recomendación o acción correctiva').fill('Sellar la abertura')
  await page.getByRole('link', { name: 'Cierre', exact: true }).click()
  await page.getByRole('link', { name: 'Áreas', exact: true }).click()
  await expect(criterion.getByLabel('Recomendación o acción correctiva')).toHaveValue('Sellar la abertura')
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await expect(criterion.getByRole('textbox', { name: 'Descripción', exact: true })).toHaveValue('Grieta junto al muro')
  await expect(criterion.getByLabel('Recomendación o acción correctiva')).toHaveValue('Sellar la abertura')
  await expect(criterion.getByLabel('Usar las fotos de este criterio (1)')).toBeChecked()
  await criterion.getByRole('button', { name: 'Registrar hallazgo', exact: true }).click()
  await expect(criterion.locator('.finding-card')).toHaveCount(1)
  const captured = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => { const request = indexedDB.open('soluciones-radicales-offline'); request.onsuccess = () => resolve(request.result); request.onerror=() => reject(request.error) })
    const transaction = db.transaction(['technicianMedia','technicianMutations'],'readonly')
    const records = await Promise.all(['technicianMedia','technicianMutations'].map(store => new Promise<unknown[]>((resolve,reject) => { const request = transaction.objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error) })))
    db.close()
    return { photos:records[0]!.length, mutations:records[1] }
  })
  expect(captured.photos).toBe(1)
  expect(captured.mutations).toEqual(expect.arrayContaining([expect.objectContaining({kind:'FINDING_CREATE',criterionId:ids.criterion})]))
  await expect(page.getByRole('heading', { name: 'Otros hallazgos del Área' })).toBeVisible()
  await expect(page.locator('.area-tabs button')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0,0))
  await page.screenshot({ path: 'test-results/criterion-findings-mobile.png', fullPage: true })
  await page.setViewportSize({width:1440,height:900})
  await page.screenshot({ path: 'test-results/criterion-findings-desktop.png', fullPage: true })
  await criterion.locator('.finding-card__summary').click()
  await criterion.getByRole('button', {name:'Apertura · 1 fotos'}).click()
  await expect(page.getByRole('dialog', {name:'Fotos de apertura'})).toBeVisible()
  await expect(page.getByRole('dialog').locator('img')).toHaveAttribute('src', /^blob:/)
})

test('retrying a finding conflict replaces the IndexedDB request and unblocks synchronization', async ({ page }) => {
  await setup(page)
  const requests: string[] = []
  await page.route(`**/api/technician/services/${ids.service}/areas/${ids.area}/findings`, async route => {
    if (route.request().method()==='OPTIONS') { await route.fulfill({status:204}); return }
    const input = route.request().postDataJSON() as {requestId:string;findingId:string;descripcion:string;recomendacionAccion:string}
    requests.push(input.requestId)
    if (requests.length===1) { await route.fulfill({status:409,json:{code:'SITE_CONTACT_INVALID',error:'Contacto pendiente de corregir'}}); return }
    await route.fulfill({json:{finding:{id:input.findingId,servicioAperturaId:ids.service,fechaApertura:'2026-10-26T14:00:00Z',
      descripcion:input.descripcion,recomendacionAccion:input.recomendacionAccion,evidenciasAperturaStoragePaths:[],estado:'ABIERTO',
      responsableNombre:'Contacto Laureles',responsableCorreo:null,servicioCierreId:null,fechaCierre:null,
      evidenciasCierreStoragePaths:[],observacionCierre:null,version:1}}})
  })
  await page.goto(`/servicios/${ids.service}/trabajo`)
  await page.getByRole('button',{name:'Iniciar servicio'}).click()
  const general = page.locator('.general-findings')
  await general.getByRole('button',{name:'Agregar',exact:true}).click()
  await general.getByRole('textbox',{name:'Descripción',exact:true}).fill('Grieta pendiente')
  await general.getByLabel('Recomendación o acción correctiva').fill('Sellar')
  await general.getByRole('button',{name:'Registrar hallazgo',exact:true}).click()
  await general.locator('.finding-card__summary').click()
  await expect(general.locator('.finding-card__conflict')).toBeVisible()
  await general.getByRole('button',{name:'Reintentar',exact:true}).click()
  await expect(general.locator('.finding-card__conflict')).toHaveCount(0)
  await expect.poll(()=>requests.length).toBe(2)
  expect(requests[1]).not.toBe(requests[0])
  await expect.poll(async()=>page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open('soluciones-radicales-offline');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)})
    const count=await new Promise<number>((resolve,reject)=>{const request=db.transaction('technicianMutations','readonly').objectStore('technicianMutations').count();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
    db.close()
    return count
  })).toBe(0)
})
