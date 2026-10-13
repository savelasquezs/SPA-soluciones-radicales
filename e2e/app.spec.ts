import { expect, test } from '@playwright/test'

const session = {
  session: {
    id: 'session-1',
    userId: 'auth-1',
    token: 'e2e-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  user: {
    id: 'auth-1',
    name: 'Ana Pérez',
    email: 'admin@example.com',
    emailVerified: true,
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
}

const adminProfile = {
  id: 'user-1',
  nombreCompleto: 'Ana Pérez',
  correoGoogle: 'admin@example.com',
  esAdmin: true,
  esTecnico: true,
  rolActivo: 'ADMINISTRADOR',
  requiereSeleccionRol: false,
}

const initialUser = {
  id: 'user-1',
  authUserId: 'auth-1',
  nombreCompleto: 'Ana Pérez',
  correoGoogle: 'admin@example.com',
  esAdmin: true,
  esTecnico: true,
  activo: true,
  certificadoStoragePath: 'certificados/ana/certificado.pdf',
  certificadoFechaEmision: '2026-01-01',
  certificadoFechaVencimiento: '2027-01-01',
  certificadoObservaciones: null,
  version: 1,
}

test.beforeEach(async ({ page }) => {
  await page.route('**/get-session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
})

test('redirige una sesión anónima al acceso', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/acceso\?redirect=%2F|\/acceso\?redirect=\/$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Gestión MIP en un solo lugar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
})

test('resuelve rutas SPA desconocidas tras una carga directa', async ({ page }) => {
  const response = await page.goto('/ruta-inexistente')

  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible()
})

test('mantiene el acceso utilizable en un teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/acceso')

  const button = page.getByRole('button', { name: 'Continuar con Google' })
  await expect(button).toBeVisible()
  expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('opera Usuarios en claro, oscuro y responsive', async ({ page }, testInfo) => {
  const users = [initialUser]
  await page.route('**/get-session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
  })
  await page.route(/\/api\/(?:session|users)(?:\/.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/session') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adminProfile) })
      return
    }
    if (url.pathname === '/api/users' && route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(users) })
      return
    }
    if (url.pathname === '/api/users' && route.request().method() === 'POST') {
      const input = route.request().postDataJSON()
      const created = { ...initialUser, ...input, id: 'user-2', authUserId: null, version: 1 }
      users.push(created)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No encontrado' }) })
  })

  await page.goto('/usuarios')
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible()
  await expect(page.getByText('Vigente').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('u01-light-desktop.png'), fullPage: true })

  await page.getByLabel('Apariencia').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: testInfo.outputPath('u01-dark-desktop.png'), fullPage: true })
  await page.getByLabel('Apariencia').selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Editar Ana Pérez' }).click()
  await expect(page.getByRole('dialog', { name: 'Editar usuario' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('u03-light-desktop.png'), fullPage: true })
  await page.getByRole('dialog', { name: 'Editar usuario' }).getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('button', { name: 'Agregar usuario' }).first().click()
  let createDialog = page.getByRole('dialog', { name: 'Agregar usuario' })
  await createDialog.getByLabel('Nombre completo').fill('Luis Mora')
  await createDialog.getByLabel('Correo Google').fill('luis@example.com')
  await createDialog.getByLabel('Técnico', { exact: true }).selectOption('NO')
  await createDialog.getByLabel('Administrador', { exact: true }).selectOption('SI')
  await expect(createDialog.getByText('Certificado técnico', { exact: true })).toHaveCount(0)
  await createDialog.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible()
  await expect(page.getByText('Luis Mora').first()).toBeVisible()

  await page.getByRole('button', { name: 'Agregar usuario' }).first().click()
  createDialog = page.getByRole('dialog', { name: 'Agregar usuario' })
  await createDialog.getByLabel('Técnico', { exact: true }).selectOption('NO')
  await expect(createDialog.locator('#user-certificate')).toHaveCount(0)
  await createDialog.getByLabel('Técnico', { exact: true }).selectOption('SI')
  await expect(createDialog.locator('#user-certificate')).toHaveCount(1)
  await createDialog.locator('#user-certificate').setInputFiles({ name: 'certificado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') })
  await expect(createDialog.locator('#user-issued')).toHaveAttribute('required', '')
  await expect(createDialog.locator('#user-expiry')).toHaveAttribute('required', '')

  await page.setViewportSize({ width: 360, height: 740 })
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('u02-light-mobile.png'), fullPage: true })
})

test('opera Clientes sin fetch redundante en claro, oscuro y responsive', async ({ page }, testInfo) => {
  let client = {
    id: 'client-1',
    tipoCliente: 'NEGOCIO',
    nombre: 'Acme SAS',
    nit: '900123456',
    correos: ['admin@acme.co'],
    activo: true,
    version: 1,
    vigenciaCertificadoMeses: 12,
    residenciaDireccion: null,
    residenciaCelular: null,
    sedesCount: 2,
  }
  let listGets = 0
  let detailGets = 0
  let patches = 0

  await page.route('**/get-session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
  })
  await page.route(/\/api\/(?:session|clients)(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/session') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adminProfile) })
      return
    }
    if (url.pathname === '/api/clients' && route.request().method() === 'GET') {
      listGets += 1
      const rows = url.searchParams.get('active') === 'false' ? [] : [client]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
      return
    }
    if (url.pathname === '/api/clients/client-1' && route.request().method() === 'GET') {
      detailGets += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(client) })
      return
    }
    if (url.pathname === '/api/clients/client-1' && route.request().method() === 'PATCH') {
      patches += 1
      client = { ...client, ...route.request().postDataJSON(), version: 2, sedesCount: 2 }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(client) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No encontrado' }) })
  })

  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()
  await expect(page.getByText('Acme SAS').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('cl01-light-desktop.png'), fullPage: true })

  await page.getByRole('button', { name: 'Editar Acme SAS' }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar cliente' })
  await expect(dialog.getByLabel('Nombre / razón social')).toHaveValue('Acme SAS')
  await dialog.getByLabel('Nombre / razón social').fill('Acme Editado')
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Acme Editado').first()).toBeVisible()
  expect({ listGets, detailGets, patches }).toEqual({ listGets: 1, detailGets: 0, patches: 1 })

  await page.getByLabel('Apariencia').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: testInfo.outputPath('cl01-dark-desktop.png'), fullPage: true })

  await page.getByRole('tab', { name: 'Inactivos' }).click()
  await expect(page.getByText('No hay clientes para mostrar')).toBeVisible()
  expect(listGets).toBe(2)

  await page.setViewportSize({ width: 360, height: 740 })
  await page.getByRole('tab', { name: 'Activos', exact: true }).click()
  await expect(page.getByText('Acme Editado').last()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('cl01-dark-mobile.png'), fullPage: true })
  await page.getByLabel('Apariencia').evaluate((element) => {
    const select = element as HTMLSelectElement
    select.value = 'light'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.screenshot({ path: testInfo.outputPath('cl01-light-mobile.png'), fullPage: true })
})

test('navega Cliente, Sede y Área reutilizando snapshots cargados', async ({ page }, testInfo) => {
  const client = {
    id: 'client-1', tipoCliente: 'NEGOCIO', nombre: 'Acme SAS', nit: '900123456', correos: ['admin@acme.co'], activo: true,
    version: 1, vigenciaCertificadoMeses: 12, residenciaDireccion: null,
    residenciaCelular: null, sedesCount: 1,
  }
  const site = {
    id: 'site-1', clientId: 'client-1', nombre: 'Principal', direccion: 'Calle 1', correos: [], heredaCorreosCliente: true,
    contactoPrincipalNombre: 'Ana', contactoPrincipalCorreo: 'ana@acme.co', contactoPrincipalCelular: '+573001234567',
    valorServicio: 100000, periodicidadMeses: 1, manejaRefuerzo: false, tipoSede: 'NEGOCIO',
    planoStoragePath: 'plans/principal.pdf', manejaVehiculos: false, generaCertificadoVehiculo: false,
    vigenciaCertificadoVehiculoMeses: null, duracionServicioMinutos: 120,
    activo: true, version: 1, areasCount: 1, proximoServicio: '2026-10-20T15:00:00.000Z',
  }
  let area = { id: 'area-1', siteId: 'site-1', nombre: 'Cocina', esExterna: false, activo: true, version: 1, dispositivosCount: 2 }
  let siteGets = 0
  let areaPatches = 0

  await page.route('**/get-session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
  })
  await page.route(/\/api\/(?:session|clients|sites|areas|catalogs)(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    let body: unknown = { error: 'No encontrado' }
    let status = 404
    if (url.pathname === '/api/session') [body, status] = [adminProfile, 200]
    else if (url.pathname === '/api/clients/client-1') [body, status] = [client, 200]
    else if (url.pathname === '/api/clients/client-1/sites') [body, status] = [[site], 200]
    else if (url.pathname === '/api/sites/site-1' && method === 'GET') {
      siteGets += 1
      ;[body, status] = [site, 200]
    } else if (url.pathname === '/api/sites/site-1/areas') [body, status] = [[area], 200]
    else if (url.pathname === '/api/sites/site-1/services') [body, status] = [{ items: [{ id: 'service-1', solicitud: 'SR-0001', fecha: '2026-10-01T15:00:00.000Z', tipo: 'ORDINARIO', tecnico: 'Luis', estado: 'FINALIZADO', valor: 100000 }], page: 1, pageSize: 20, total: 1 }, 200]
    else if (url.pathname === '/api/areas/area-1' && method === 'PATCH') {
      areaPatches += 1
      area = { ...area, ...route.request().postDataJSON(), version: 2 }
      ;[body, status] = [area, 200]
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto('/clientes/client-1')
  await expect(page.getByRole('heading', { name: 'Acme SAS' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Principal' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('cl07-business-detail.png'), fullPage: true })
  await page.getByRole('button', { name: 'Principal' }).click()
  await expect(page.getByRole('heading', { name: 'Principal', exact: true })).toBeVisible()
  expect(siteGets).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('cl12-site-summary.png'), fullPage: true })

  await page.getByRole('button', { name: 'Áreas', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cocina', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cocina', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Detalle del Área' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('cl11-cl15-areas-drawer.png'), fullPage: true })
  await page.getByRole('complementary', { name: 'Detalle del Área' }).getByRole('button', { name: 'Editar Área' }).click()
  const areaDialog = page.getByRole('dialog', { name: 'Editar Área' })
  await areaDialog.getByLabel('Nombre del Área').fill('Cocina industrial')
  await areaDialog.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('button', { name: 'Cocina industrial', exact: true })).toBeVisible()
  expect(areaPatches).toBe(1)

  await page.getByRole('button', { name: 'Historial de servicios', exact: true }).click()
  await expect(page.getByRole('button', { name: 'SR-0001' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('cl13-site-history.png'), fullPage: true })

  await page.setViewportSize({ width: 360, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('cl13-site-history-mobile.png'), fullPage: true })
})
