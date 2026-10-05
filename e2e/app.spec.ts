import { expect, test } from '@playwright/test'

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
