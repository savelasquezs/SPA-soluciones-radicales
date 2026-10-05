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

  await page.getByRole('button', { name: 'Actualizar certificado' }).click()
  await expect(page.getByRole('dialog', { name: 'Actualizar certificado' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('u03-light-desktop.png'), fullPage: true })
  await page.getByRole('dialog', { name: 'Actualizar certificado' }).getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: 'Agregar usuario' }).first().click()
  let createDialog = page.getByRole('dialog', { name: 'Agregar usuario' })
  await createDialog.getByLabel('Nombre completo').fill('Luis Mora')
  await createDialog.getByLabel('Correo Google').fill('luis@example.com')
  await createDialog.getByLabel('Rol técnico').selectOption('NO')
  await createDialog.getByLabel('Rol administrador').selectOption('SI')
  await expect(createDialog.getByText('Certificado técnico', { exact: true })).toHaveCount(0)
  await createDialog.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible()
  await expect(page.getByText('Luis Mora').first()).toBeVisible()

  await page.getByRole('button', { name: 'Agregar usuario' }).first().click()
  createDialog = page.getByRole('dialog', { name: 'Agregar usuario' })
  await createDialog.getByLabel('Rol técnico').selectOption('NO')
  await expect(createDialog.locator('#create-certificate')).toHaveCount(0)
  await createDialog.getByLabel('Rol técnico').selectOption('SI')
  await expect(createDialog.locator('#create-certificate')).toHaveCount(1)
  await createDialog.locator('#create-certificate').setInputFiles({ name: 'certificado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') })
  await expect(createDialog.locator('#create-issued')).toHaveAttribute('required', '')
  await expect(createDialog.locator('#create-expiry')).toHaveAttribute('required', '')

  await page.setViewportSize({ width: 360, height: 740 })
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('u02-light-mobile.png'), fullPage: true })
})
