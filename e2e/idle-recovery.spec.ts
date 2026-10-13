import { expect, test } from '@playwright/test'

const start = new Date('2026-10-10T15:00:00.000Z')
const jwt = (expires: number) => `header.${Buffer.from(JSON.stringify({ exp: expires })).toString('base64url')}.signature`
const profile = {
  id: 'user-1', nombreCompleto: 'Ana Pérez', correoGoogle: 'admin@example.com',
  esAdmin: true, esTecnico: false, rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false,
}
const session = (token: string) => ({
  session: { id: 'session-1', userId: 'auth-1', token, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: start.toISOString(), updatedAt: start.toISOString() },
  user: { id: 'auth-1', name: 'Ana Pérez', email: 'admin@example.com', emailVerified: true, createdAt: start.toISOString(), updatedAt: start.toISOString() },
})

for (const minutes of [5, 10, 20]) {
  test(`navega tras ${minutes} minutos, renueva sesión y recupera una lectura`, async ({ page }, testInfo) => {
    let coldRead = false, userReads = 0, renewals = 0
    const stale = jwt(start.getTime() / 1000 + 60)
    const fresh = jwt(start.getTime() / 1000 + 7200)
    await page.clock.install({ time: start })
    await page.route(/\/get-session(?:\?.*)?$/, async route => {
      const force = new URL(route.request().url()).searchParams.get('disableCookieCache') === 'true'
      if (force) renewals++
      await route.fulfill({ json: session(force ? fresh : stale) })
    })
    await page.route('**/api/session', route => route.fulfill({ json: profile }))
    await page.route('**/api/users', async route => {
      userReads++
      if (coldRead) {
        coldRead = false
        await route.fulfill({ status: 503, json: { error: 'Arrancando' } })
      } else await route.fulfill({ json: [] })
    })
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    coldRead = true
    await page.clock.fastForward(minutes * 60_000)
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Usuarios', exact: true }).click()
    await expect(page).toHaveURL(/\/usuarios$/)
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar usuario' }).first()).toBeEnabled()
    await expect.poll(() => userReads).toBe(2)
    expect(renewals).toBeGreaterThan(0)
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Resumen', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.screenshot({ path: testInfo.outputPath(`idle-${minutes}-desktop.png`), fullPage: true })
    await page.setViewportSize({ width: 360, height: 740 })
    await page.getByRole('button', { name: 'Abrir navegación' }).click()
    await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Usuarios', exact: true }).click()
    await expect(page).toHaveURL(/\/usuarios$/)
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`idle-${minutes}-mobile.png`), fullPage: true })
  })
}

test('un guardado fallido conserva el formulario y no se reenvía', async ({ page }) => {
  let writes = 0
  await page.route(/\/get-session(?:\?.*)?$/, route => route.fulfill({ json: session('e2e-token') }))
  await page.route('**/api/session', route => route.fulfill({ json: profile }))
  await page.route('**/api/users', async route => {
    if (route.request().method() === 'POST') { writes++; await route.abort('failed') }
    else await route.fulfill({ json: [] })
  })
  await page.goto('/usuarios')
  await page.getByRole('button', { name: 'Agregar usuario' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Agregar usuario' })
  await dialog.getByLabel('Nombre completo').fill('Borrador conservado')
  await dialog.getByLabel('Correo Google').fill('borrador@gmail.com')
  await dialog.getByLabel('Administrador', { exact: true }).selectOption('SI')
  await dialog.getByLabel('Técnico', { exact: true }).selectOption('NO')
  await dialog.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByText(/No pudimos confirmar si se guardó la operación/).first()).toBeVisible()
  await expect(dialog.getByLabel('Nombre completo')).toHaveValue('Borrador conservado')
  await expect(dialog.getByLabel('Correo Google')).toHaveValue('borrador@gmail.com')
  await expect(dialog.getByRole('button', { name: 'Crear usuario' })).toBeEnabled()
  expect(writes).toBe(1)
})

test('recarga una sola vez cuando un despliegue retiró un chunk de una ruta', async ({ page }) => {
  let chunkRequests = 0
  await page.route(/\/get-session(?:\?.*)?$/, route => route.fulfill({ json: session('e2e-token') }))
  await page.route('**/api/session', route => route.fulfill({ json: profile }))
  await page.route(/\/assets\/DashboardView-[^/]+\.js$/, async route => {
    chunkRequests++
    if (chunkRequests === 1) await route.fulfill({ status: 404, body: 'Not found' })
    else await route.continue()
  })

  await page.goto('/integraciones')
  const reloaded = page.waitForEvent('framenavigated')
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Resumen', exact: true }).click()
  await reloaded

  await expect(page).toHaveURL(/\/integraciones$/)
  expect(chunkRequests).toBe(1)
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Resumen', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  expect(chunkRequests).toBe(2)
})
