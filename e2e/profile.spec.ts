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
    else if (url.pathname === '/api/profile' && method === 'GET') [data, status] = [profile, 200]
    else if (url.pathname === '/api/profile' && method === 'PATCH') {
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
  await expect(page.getByRole('button', { name: 'Guardar fotografía' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar certificado' })).toBeVisible()
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
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/perfil')
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Credencial técnica' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const topAccount = page.locator('.account-control--topbar summary')
  await expect(topAccount).toBeVisible()
  expect((await topAccount.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await topAccount.click()
  const topMenu = page.locator('.account-control--topbar')
  await expect(topMenu.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
  const topAppearance = topMenu.getByRole('group', { name: 'Tema de la aplicación' })
  await expect(topAppearance).toBeVisible()
  await expect(topAppearance.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true')

  await topAppearance.getByRole('button', { name: 'Oscuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(topAppearance.getByRole('button', { name: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('sr-theme-preference'))).toBe('dark')

  await topAppearance.getByRole('button', { name: 'Claro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await topAppearance.getByRole('button', { name: 'Sistema' }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('sr-theme-preference'))).toBe('system')
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
  const sidebarAppearance = page.locator('.account-control--sidebar').getByRole('group', { name: 'Tema de la aplicación' })
  await expect(sidebarAppearance).toBeVisible()
  await expect(sidebarAppearance.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true')
  await sidebarAppearance.getByRole('button', { name: 'Oscuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(topMenu.locator('.account-control__appearance button').filter({ hasText: 'Oscuro' })).toHaveAttribute('aria-pressed', 'true')
  await sidebarAppearance.getByRole('button', { name: 'Claro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
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


/** Model the real OAuth edge case: a verified new Google identity has no SPA
 * record until /api/profile/google/finish transfers the existing user. */
async function setupNewGoogleAccount(page: import('@playwright/test').Page, withHandoff = true) {
  const token = 'A'.repeat(43)
  let transferred = false
  let attempts = 0
  let deniedBeforeTransfer = 0
  const newIdentity = {
    ...session,
    session: { ...session.session, userId: 'fresh-google-auth' },
    user: { ...session.user, id: 'fresh-google-auth', email: 'otra-cuenta@gmail.com' },
  }

  // Forced Neon Auth refresh appends ?disableCookieCache=true. The mock must
  // cover both the ordinary and forced session endpoint.
  await page.route(/\/get-session(?:\?.*)?$/, route => route.fulfill({ json: newIdentity }))
  await page.route('https://api.example.test/api/**', async route => {
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }
    if (pathname === '/api/session' && !transferred) {
      deniedBeforeTransfer += 1
      await route.fulfill({ status: 403, json: { error: 'La cuenta no está autorizada' } })
      return
    }
    if (pathname === '/api/profile/google/finish' && method === 'POST') {
      attempts += 1
      const body = route.request().postDataJSON() as { token: string }
      const authorized = route.request().headers().authorization
      expect(body.token).toBe(token)
      expect(authorized).toMatch(/^Bearer /)
      transferred = true
      await route.fulfill({ json: { correoGoogle: 'otra-cuenta@gmail.com' } })
      return
    }
    if (pathname === '/api/session') {
      await route.fulfill({ json: { ...domain, correoGoogle: 'otra-cuenta@gmail.com' } })
      return
    }
    if (pathname === '/api/profile') {
      await route.fulfill({ json: { ...initial, correoGoogle: 'otra-cuenta@gmail.com' } })
      return
    }
    await route.fulfill({ status: 404, json: { error: 'Ruta no encontrada' } })
  })

  if (withHandoff) await page.addInitScript((state: { token: string; expiresAt: number }) => {
    window.sessionStorage.setItem('sr:google-profile-handoff', JSON.stringify(state))
  }, { token, expiresAt: Date.now() + 600_000 })

  return {
    transferred: () => transferred,
    attempts: () => attempts,
    deniedBeforeTransfer: () => deniedBeforeTransfer,
  }
}

test('OAuth de una cuenta Google nueva se transfiere antes de evaluar el perfil', async ({ page }) => {
  const state = await setupNewGoogleAccount(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/cuenta/cambiar-google')

  await expect(page).toHaveURL(/\/perfil\?googleActualizado=1/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.getByLabel('Correo vinculado')).toHaveValue('otra-cuenta@gmail.com')
  expect(state.transferred()).toBe(true)
  expect(state.attempts()).toBe(1)
  expect(state.deniedBeforeTransfer()).toBe(0)
  expect(await page.evaluate(() => sessionStorage.getItem('sr:google-profile-handoff'))).toBeNull()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('si Neon devuelve al inicio, la cuenta nueva sin acceso reanuda la transferencia pendiente', async ({ page }) => {
  const state = await setupNewGoogleAccount(page)
  await page.setViewportSize({ width: 360, height: 740 })
  // Regression: the previous OAuth flow returned new Google users to "/",
  // which triggered /api/session 403 and the "Acceso restringido" page.
  await page.goto('/')

  await expect(page).toHaveURL(/\/perfil\?googleActualizado=1/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toHaveCount(0)
  expect(state.deniedBeforeTransfer()).toBeGreaterThanOrEqual(1)
  expect(state.attempts()).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('una nueva cuenta sin transferencia válida conserva el bloqueo de acceso', async ({ page }) => {
  const state = await setupNewGoogleAccount(page, false)
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')

  await expect(page).toHaveURL(/\/sin-acceso/)
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible()
  await expect(page.getByText('Cuenta: otra-cuenta@gmail.com')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar de cuenta' })).toBeVisible()
  expect(state.transferred()).toBe(false)
  expect(state.attempts()).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})


test('cambio de cuenta Google desde perfil cierra la sesión anterior antes del primer OAuth', async ({ page }) => {
  const token = 'A'.repeat(43)
  const sequence: string[] = []
  let signedOut = false
  let transferred = false
  const newEmail = 'nuevo-google@example.com'

  await page.route('https://auth.example.test/**', async route => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/get-session')) {
      const loggedIn = signedOut
        ? {
          ...session,
          session: { ...session.session, userId: 'new-google-auth', token: 'new-google-jwt' },
          user: { ...session.user, id: 'new-google-auth', email: newEmail },
        }
        : session
      await route.fulfill({ json: loggedIn })
      return
    }
    if (pathname.endsWith('/sign-out')) {
      sequence.push('sign-out')
      signedOut = true
      await route.fulfill({ json: { success: true } })
      return
    }
    if (pathname.endsWith('/sign-in/social')) {
      sequence.push('google-oauth')
      // Fail the test if the browser starts OAuth with the old Better Auth cookie.
      if (!signedOut) {
        await route.fulfill({ status: 409, json: { error: 'La cuenta anterior continúa activa' } })
        return
      }
      const request = route.request().postDataJSON() as { callbackURL?: string; newUserCallbackURL?: string }
      expect(request.callbackURL).toContain('/cuenta/cambiar-google')
      expect(request.newUserCallbackURL).toContain('/cuenta/cambiar-google')
      await route.fulfill({ json: { url: new URL('/cuenta/cambiar-google', page.url()).toString() } })
      return
    }
    await route.fulfill({ status: 404, json: { error: 'Ruta Auth no simulada' } })
  })

  await page.route('https://api.example.test/api/**', async route => {
    const { pathname } = new URL(route.request().url())
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }
    if (pathname === '/api/session') {
      if (signedOut && !transferred) {
        await route.fulfill({ status: 403, json: { error: 'Cuenta sin acceso previo' } })
        return
      }
      await route.fulfill({ json: {
        ...domain, correoGoogle: transferred ? newEmail : domain.correoGoogle,
      } })
      return
    }
    if (pathname === '/api/profile') {
      await route.fulfill({ json: {
        ...initial, correoGoogle: transferred ? newEmail : domain.correoGoogle,
      } })
      return
    }
    if (pathname === '/api/profile/google/start') {
      expect(signedOut).toBe(false)
      sequence.push('start-handoff')
      await route.fulfill({ json: { token, expiresInSeconds: 600 } })
      return
    }
    if (pathname === '/api/profile/google/finish') {
      sequence.push('finish-handoff')
      expect(signedOut).toBe(true)
      expect(route.request().headers().authorization).toBe('Bearer new-google-jwt')
      expect(route.request().postDataJSON()).toEqual({ token })
      transferred = true
      await route.fulfill({ json: { correoGoogle: newEmail } })
      return
    }
    await route.fulfill({ status: 404, json: { error: 'Ruta API no simulada' } })
  })

  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/perfil')
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()

  await page.getByRole('button', { name: 'Cambiar cuenta de Google' }).click()

  await expect(page).toHaveURL(/\/perfil\?googleActualizado=1/)
  await expect(page.getByLabel('Correo vinculado')).toHaveValue(newEmail)
  expect(transferred).toBe(true)
  expect(sequence).toEqual(['start-handoff', 'sign-out', 'google-oauth', 'finish-handoff'])
  expect(await page.evaluate(() => sessionStorage.getItem('sr:google-profile-handoff'))).toBeNull()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})


/** Regression observed on Android: immediately after Google consent the
 * first Neon Auth session read can still contain the previous Google identity. */
async function setupGoogleSessionRace(
  page: import('@playwright/test').Page,
  sessionOrder: 'old-first' | 'stale-on-finish',
) {
  const token = 'A'.repeat(43)
  const oldAuth = 'original-google-auth'
  const newAuth = 'fresh-google-auth'
  let reads = 0
  let confirmations = 0
  let transferred = false
  const oldSession = {
    ...session,
    session: { ...session.session, userId: oldAuth, token: 'old-google-jwt' },
    user: { ...session.user, id: oldAuth, email: 'original@example.com' },
  }
  const newSession = {
    ...session,
    session: { ...session.session, userId: newAuth, token: 'new-google-jwt' },
    user: { ...session.user, id: newAuth, email: 'nueva@example.com' },
  }

  await page.addInitScript((value: { token: string; expiresAt: number; originalAuthUserId: string }) => {
    sessionStorage.setItem('sr:google-profile-handoff', JSON.stringify(value))
  }, { token, expiresAt: Date.now() + 600_000, originalAuthUserId: oldAuth })

  await page.route(/\/get-session(?:\?.*)?$/, async route => {
    reads++
    // The second mode simulates an SDK that briefly serves a cached older
    // bearer token *after* the callback has observed the new session.
    const stale = sessionOrder === 'old-first' ? reads === 1 : reads === 2
    await route.fulfill({ json: stale ? oldSession : newSession })
  })

  await page.route('https://api.example.test/api/**', async route => {
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }
    if (pathname === '/api/profile/google/finish') {
      confirmations++
      expect(method).toBe('POST')
      expect(route.request().postDataJSON()).toEqual({ token })
      if (route.request().headers().authorization !== 'Bearer new-google-jwt') {
        await route.fulfill({ status: 409, json: { error: 'Seleccionaste la misma cuenta de Google' } })
        return
      }
      transferred = true
      await route.fulfill({ json: { correoGoogle: 'nueva@example.com' } })
      return
    }
    if (pathname === '/api/session') {
      await route.fulfill(transferred
        ? { json: { ...domain, correoGoogle: 'nueva@example.com' } }
        : { status: 403, json: { error: 'La cuenta no está autorizada' } })
      return
    }
    if (pathname === '/api/profile') {
      await route.fulfill({ json: { ...initial, correoGoogle: 'nueva@example.com' } })
      return
    }
    await route.fulfill({ status: 404, json: { error: 'Ruta no encontrada' } })
  })
  return { getReads: () => reads, getConfirmations: () => confirmations, transferred: () => transferred }
}

test('OAuth espera una sesión nueva y no muestra el falso error de cuenta igual en móvil', async ({ page }) => {
  const state = await setupGoogleSessionRace(page, 'old-first')
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/cuenta/cambiar-google')
  await expect(page).toHaveURL(/\/perfil\?googleActualizado=1/)
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
  expect(state.transferred()).toBe(true)
  expect(state.getReads()).toBeGreaterThanOrEqual(3)
  expect(state.getConfirmations()).toBe(1)
  await expect(page.getByText('Seleccionaste la misma cuenta de Google')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('OAuth recupera un único 409 de JWT viejo sin necesitar tocar Reintentar', async ({ page }) => {
  const state = await setupGoogleSessionRace(page, 'stale-on-finish')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/cuenta/cambiar-google')
  await expect(page).toHaveURL(/\/perfil\?googleActualizado=1/)
  expect(state.transferred()).toBe(true)
  expect(state.getConfirmations()).toBe(2)
  await expect(page.getByRole('heading', { name: 'No se completó la verificación' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
