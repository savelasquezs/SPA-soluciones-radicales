import { expect, test } from '@playwright/test'

const session = {
  session: {
    id: 'session-1', userId: 'auth-1', token: 'e2e-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
  },
  user: {
    id: 'auth-1', name: 'Ana Pérez', email: 'ana@gmail.com',
    image: null, emailVerified: true,
    createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
  },
}
const domain = {
  id: 'b6c25a3a-2a7a-4900-abba-d2faf8a05809',
  nombreCompleto: 'Ana Pérez', correoGoogle: 'ana@gmail.com',
  esAdmin: true, esTecnico: true, rolActivo: 'ADMINISTRADOR',
  requiereSeleccionRol: false,
}
const initial = {
  id: domain.id, nombreCompleto: domain.nombreCompleto,
  correoGoogle: domain.correoGoogle, telefono: null, fotoStoragePath: null,
  esAdmin: true, esTecnico: true,
  certificadoStoragePath: 'users/certificates/ana-old.pdf',
  certificadoFechaEmision: '2026-01-01',
  certificadoFechaVencimiento: '2027-01-01', version: 1,
}

async function setup(page: import('@playwright/test').Page, technician = true) {
  let profile = { ...initial, esTecnico: technician }
  let personalPatches = 0
  await page.route('**/get-session', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
  })
  await page.route(/\/api\/(?:session|profile)(?:\/.*)?$/, async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    let data: unknown = { error: 'No encontrado' }
    let status = 404
    if (url.pathname === '/api/session') [data, status] = [domain, 200]
    else if (url.pathname === '/api/profile/avatar-url') [data, status] = [{ url: null }, 200]
    else if ((url.pathname === '/api/profile/' || url.pathname === '/api/profile') && method === 'GET') [data, status] = [profile, 200]
    else if ((url.pathname === '/api/profile/' || url.pathname === '/api/profile') && method === 'PATCH') {
      personalPatches += 1
      profile = { ...profile, ...route.request().postDataJSON(), telefono: '+573001234567', version: profile.version + 1 }
      ;[data, status] = [profile, 200]
    } else if (url.pathname === '/api/profile/certificate' && method === 'PATCH') {
      profile = { ...profile, ...route.request().postDataJSON(), version: profile.version + 1 }
      ;[data, status] = [profile, 200]
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  })
  return {
    getProfile: () => profile,
    getPersonalPatches: () => personalPatches,
  }
}

test('el perfil permite editar datos y conserva navegación compacta en escritorio', async ({ page }, info) => {
  const state = await setup(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/perfil')

  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Credencial técnica' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar cuenta de Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar datos' })).toBeDisabled()

  await page.locator('.account-control--topbar summary').click()
  await expect(page.locator('.account-control--topbar').getByRole('link', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.locator('.account-control--topbar').getByRole('button', { name: 'Cambiar cuenta' })).toBeVisible()
  await expect(page.locator('.account-control--topbar').getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByLabel('Nombre completo').fill('Ana Pérez Correa')
  await page.getByLabel('Celular').fill('300 123 4567')
  await page.getByRole('button', { name: 'Guardar datos' }).click()
  await expect(page.getByText('Datos personales actualizados.')).toBeVisible()
  expect(state.getPersonalPatches()).toBe(1)
  expect(state.getProfile().nombreCompleto).toBe('Ana Pérez Correa')
  await expect(page.locator('.account-control--topbar summary')).toContainText('Ana Pérez Correa')

  await page.screenshot({ path: info.outputPath('profile-desktop-light.png'), fullPage: true })
  await page.getByLabel('Apariencia').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: info.outputPath('profile-desktop-dark.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('perfil y dos menús accesibles sin overflow ni botones pequeños en móvil', async ({ page }, info) => {
  await setup(page)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/perfil')
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Credencial técnica' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const topAccount = page.locator('.account-control--topbar summary')
  await expect(topAccount).toBeVisible()
  expect((await topAccount.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await topAccount.click()
  await expect(page.locator('.account-control--topbar').getByRole('link', { name: 'Mi perfil' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Abrir navegación' }).click()
  const sidebarMenu = page.locator('.account-control--sidebar summary')
  await expect(sidebarMenu).toBeVisible()
  expect((await sidebarMenu.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await sidebarMenu.click()
  await expect(page.locator('.account-control--sidebar').getByRole('link', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.locator('.account-control--sidebar').getByRole('button', { name: 'Cambiar cuenta' })).toBeVisible()
  await expect(page.locator('.account-control--sidebar').getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.screenshot({ path: info.outputPath('profile-mobile-drawer.png'), fullPage: true })
  await page.locator('.menu-button').click()
  await page.screenshot({ path: info.outputPath('profile-mobile-360.png'), fullPage: true })
})

test('el técnico puede ver su certificado y los cambios pendientes se confirman antes de Google', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/perfil')
  await expect(page.getByText('Ver certificado')).toBeVisible()
  await page.getByLabel('Nombre completo').fill('Nombre temporal')
  await page.getByRole('button', { name: 'Cambiar cuenta de Google' }).click()
  const confirm = page.getByRole('dialog', { name: 'Verificar otra cuenta' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Nombre temporal')
})

test('un usuario sin rol técnico no puede ver controles de credencial', async ({ page }) => {
  await setup(page, false)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/perfil')
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Credencial técnica' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
