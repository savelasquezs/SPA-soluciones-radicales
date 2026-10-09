import { expect, test, type Page, type Route } from '@playwright/test'
import type { TechnicianExecutionSession, TechnicianServicePackage, TechnicianServiceSummary } from '../src/types/technicianServices'

const uid = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const ids = { actor: uid(1), service: uid(2), product: uid(3), area: uid(4), criterion: uid(5), device: uid(6), lock: uid(7), area2: uid(8), criterion2: uid(9), finding: uid(10), priorService: uid(11) }
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

async function setup(page: Page, withPriorFinding = false, failFirstPackage = false, initialState: TechnicianServiceSummary['estado'] = 'PROGRAMADO') {
  let current = servicePackage(initialState, withPriorFinding)
  let packageReads = 0
  const starts: Array<Record<string, unknown>> = []
  const orders: Array<Record<string, unknown>> = []
  const evaluations: Array<Record<string, unknown>> = []
  const deviceCreations: Array<Record<string, unknown>> = []
  const reportSends: Array<Record<string, unknown>> = []
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
      if (failFirstPackage && packageReads === 1) await json(route, { error: 'Falla sintética de descarga' }, 503)
      else await json(route, current)
      return
    }
    if (path === `/api/technician/services/${ids.service}/start`) {
      starts.push(request.postDataJSON() as Record<string, unknown>)
      current = servicePackage('EN_PROCESO', withPriorFinding)
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
  return { starts, orders, evaluations, deviceCreations, reportSends, get packageReads() { return packageReads } }
}

test('technician prepares and starts the service from a mobile-first read-only surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await setup(page)
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Mis servicios' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  await page.getByRole('button', { name: 'Ver servicio' }).click()
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

test('automatic preparation fails without blocking the list and offers one retry', async ({ page }) => {
  const api = await setup(page, false, true)
  await page.goto('/servicios')
  await expect(page.getByRole('heading', { name: 'Casa Verde' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar descarga' })).toBeVisible()
  expect(api.packageReads).toBe(1)
  await page.getByRole('button', { name: 'Reintentar descarga' }).click()
  await expect(page.locator('[aria-label="Preparado en este celular"]')).toBeVisible()
  expect(api.packageReads).toBe(2)
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
  await page.getByRole('button', { name: 'No fue posible acceder' }).click()
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
  const findings = page.locator('.workspace-panel[aria-labelledby="findings-title"]')
  await page.locator('.area-tabs').getByRole('button', { name: /Hallazgos/ }).click()
  await findings.getByRole('button', { name: 'Agregar hallazgo' }).click()
  await findings.getByLabel('Descripción').fill('Abertura junto al muro')
  await findings.getByLabel('Recomendación o acción correctiva').fill('Sellar el paso')
  await expect(findings.locator('input[name^="finding-responsible"]')).toHaveCount(0)
  await findings.locator('input[type="file"]:not([capture])').setInputFiles([
    { name: 'hallazgo-1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-finding-photo-1') },
    { name: 'hallazgo-2.png', mimeType: 'image/png', buffer: Buffer.from('synthetic-finding-photo-2') },
  ])
  await findings.getByRole('button', { name: 'Registrar Hallazgo' }).click()
  await expect(findings.getByRole('button', { name: /Abertura junto al muro/ })).toBeVisible()
  await expect(findings.getByText('1 registrados · 1 abiertos')).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Hallazgos/ }).click()
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await expect(findings.getByText('2 evidencias de apertura')).toBeVisible()
  await expect(findings.getByText('Contacto Laureles')).toBeVisible()
  await expect(findings.getByText('Guardado en este dispositivo · pendiente de sincronizar')).toBeVisible()
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
  const findings = page.locator('.workspace-panel[aria-labelledby="findings-title"]')
  await page.locator('.area-tabs').getByRole('button', { name: /Hallazgos/ }).click()
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await findings.getByRole('button', { name: 'Cerrar Hallazgo' }).click()
  await findings.getByRole('button', { name: 'Confirmar cierre' }).click()
  await expect(findings.getByText('Adjunta al menos una evidencia de cierre.')).toBeVisible()
  await findings.getByLabel('Observación de cierre').fill('Paso sellado')
  await findings.locator('input[type="file"][capture="environment"]').setInputFiles({ name: 'cierre.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic-closure-photo') })
  await findings.getByRole('button', { name: 'Confirmar cierre' }).click()
  await expect(findings.getByText('Cerrado', { exact: true })).toBeVisible()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.reload()
  await page.locator('.area-tabs').getByRole('button', { name: /Hallazgos/ }).click()
  await findings.getByRole('button', { name: /Abertura junto al muro/ }).click()
  await expect(findings.getByText(/1 evidencias/)).toBeVisible()
  await expect(findings.getByText('Paso sellado')).toBeVisible()
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
  await page.locator('.service-navigation').getByRole('button', { name: 'Cierre' }).click()
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
