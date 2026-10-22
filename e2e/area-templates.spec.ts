import { expect, test, type Page } from '@playwright/test'

const uuid = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0')
const ids = { client: uuid(1), site: uuid(2), template: uuid(3), area: uuid(4), newArea: uuid(5) }
const date = '2026-10-22T12:00:00.000Z'
const client = {
  id: ids.client, nombre: 'Restaurante de prueba', tipoCliente: 'NEGOCIO', nit: '900000001',
  correos: [], activo: true, version: 1, vigenciaCertificadoMeses: 12, sedesCount: 1,
  residenciaDireccion: null, residenciaCelular: null, residenciaValorServicio: null,
}
const initialTemplate = {
  id: ids.template, nombre: 'Restaurante estándar', alcance: 'GLOBAL', clientId: null, clientName: null,
  activo: true, version: 1,
  areas: [{ nombre: 'Cocina', esExterna: false }, { nombre: 'Patio', esExterna: true }],
}
const initialSite = {
  id: ids.site, clientId: ids.client, nombre: 'Sede de prueba', direccion: 'Calle 1',
  correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: 'Contacto de prueba',
  contactoPrincipalCorreo: null, contactoPrincipalCelular: '+573001234567', valorServicio: 100000,
  periodicidadMeses: 1, manejaRefuerzo: false, tipoSede: 'NEGOCIO', planoStoragePath: null,
  manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null,
  duracionServicioMinutos: 120, activo: true, version: 1, areasCount: 1, proximoServicio: null,
}

async function setup(page: Page) {
  const templates = [{ ...initialTemplate, areas: initialTemplate.areas.map(a => ({ ...a })) }]
  let site = { ...initialSite }
  let areas = [{ id: ids.area, siteId: ids.site, nombre: 'Cocina', esExterna: false, activo: true, version: 1, dispositivosCount: 0 }]
  let applyCount = 0
  let siteCreatePayload: Record<string, unknown> | null = null
  await page.route('**/get-session', route => route.fulfill({ json: {
    session: { id: 'session', userId: 'auth-1', token: 'e2e-token', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: date, updatedAt: date },
    user: { id: 'auth-1', name: 'Admin de prueba', email: 'admin@example.test', emailVerified: true, createdAt: date, updatedAt: date },
  } }))
  await page.route('https://api.example.test/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return }
    const send = (value: unknown, status = 200) => route.fulfill({ status, json: value })
    if (path === '/api/session') {
      await send({ id: uuid(9), nombreCompleto: 'Admin de prueba', correoGoogle: 'admin@example.test', esAdmin: true, esTecnico: false, rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false }); return
    }
    if (path === '/api/clients') { await send(url.searchParams.get('active') === 'false' ? [] : [client]); return }
    if (path === '/api/clients/' + ids.client) { await send(client); return }
    if (path === '/api/clients/' + ids.client + '/sites') {
      if (method === 'POST') {
        siteCreatePayload = request.postDataJSON()
        await send({ ...site, ...siteCreatePayload, id: uuid(7), areasCount: initialTemplate.areas.length, version: 1 }, 201)
      } else await send([site])
      return
    }
    if (path === '/api/sites/' + ids.site) { await send(site); return }
    if (path === '/api/sites/' + ids.site + '/areas') { await send(areas); return }
    if (path === '/api/area-templates' && method === 'GET') {
      await send(templates.filter(item => (url.searchParams.get('active') !== 'true' || item.activo) && (url.searchParams.get('clientId') === null || item.alcance === 'GLOBAL' || item.clientId === url.searchParams.get('clientId')))); return
    }
    if (path === '/api/area-templates' && method === 'POST') {
      const data = request.postDataJSON()
      const next = { ...data, id: uuid(6), version: 1, clientName: data.clientId ? client.nombre : null }
      templates.push(next); await send(next, 201); return
    }
    if (path.startsWith('/api/area-templates/') && method === 'PATCH') {
      const template = templates.find(item => item.id === path.slice('/api/area-templates/'.length))
      if (!template) { await send({ error: 'No existe' }, 404); return }
      Object.assign(template, request.postDataJSON(), { version: template.version + 1 })
      await send(template); return
    }
    if (path === '/api/area-templates/sites/' + ids.site + '/apply' && method === 'POST') {
      applyCount += 1
      const template = templates.find(item => item.id === request.postDataJSON().templateId)!
      let created = 0
      for (const area of template.areas) {
        if (areas.some(existing => existing.nombre.toLocaleLowerCase('es-CO') === area.nombre.toLocaleLowerCase('es-CO'))) continue
        areas = [...areas, { id: ids.newArea, siteId: ids.site, nombre: area.nombre, esExterna: area.esExterna, activo: true, version: 1, dispositivosCount: 0 }]
        created += 1
      }
      site = { ...site, areasCount: areas.length }
      await send({ created, skipped: template.areas.length - created }); return
    }
    await send({ error: 'Endpoint no previsto en la prueba' }, 404)
  })
  return { getApplyCount: () => applyCount, getSiteCreatePayload: () => siteCreatePayload }
}

test('un modal permite crear, editar y desactivar plantillas en la vista compacta', async ({ page }) => {
  await setup(page)
  await page.goto('/configuracion/plantillas-areas')
  await expect(page.getByRole('heading', { name: 'Plantillas de áreas' })).toBeVisible()
  await page.getByRole('button', { name: 'Nueva plantilla' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva plantilla' })
  await dialog.getByLabel('Nombre de la plantilla').fill('Nueva distribución')
  await dialog.locator('input[name="template-area-0"]').fill('Recepción')
  await dialog.getByRole('button', { name: 'Crear plantilla' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva distribución', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Editar Nueva distribución' }).click()
  const edit = page.getByRole('dialog', { name: 'Editar plantilla' })
  await edit.getByLabel('Nombre de la plantilla').fill('Distribución revisada')
  await edit.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('button', { name: 'Distribución revisada', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Desactivar Distribución revisada' }).click()
  await page.getByRole('dialog', { name: 'Desactivar plantilla' }).getByRole('button', { name: 'Desactivar' }).click()
  await page.getByRole('button', { name: 'Inactivas' }).click()
  await expect(page.getByRole('button', { name: 'Distribución revisada', exact: true })).toBeVisible()
})

test('aplicar dos veces conserva áreas existentes y no duplica las nuevas', async ({ page }) => {
  const track = await setup(page)
  await page.goto('/clientes/' + ids.client + '/sedes/' + ids.site)
  await page.getByRole('navigation', { name: 'Detalle de Sede' }).getByRole('button', { name: 'Áreas' }).click()
  await expect(page.getByRole('button', { name: 'Cocina', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Aplicar plantilla' }).click()
  const dialog = page.getByRole('dialog', { name: 'Aplicar plantilla' })
  await dialog.getByLabel('Plantilla').selectOption(ids.template)
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Patio', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Aplicar plantilla' }).click()
  await page.getByRole('dialog', { name: 'Aplicar plantilla' }).getByLabel('Plantilla').selectOption(ids.template)
  await page.getByRole('dialog', { name: 'Aplicar plantilla' }).getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect.poll(() => track.getApplyCount()).toBe(2)
  await expect(page.getByRole('button', { name: 'Patio', exact: true })).toHaveCount(1)
})

test('crear una Sede permite escoger plantilla sin alterar el formulario compartido', async ({ page }) => {
  const track = await setup(page)
  await page.goto('/clientes/' + ids.client)
  await page.getByRole('button', { name: 'Agregar Sede' }).click()
  const dialog = page.getByRole('dialog', { name: 'Crear Sede' })
  await dialog.locator('input[name="site-name"]').fill('Nueva Sede')
  await dialog.getByLabel('Dirección').fill('Carrera 1 # 20-30')
  await dialog.getByLabel('Contacto principal').fill('Contacto nuevo')
  await dialog.getByLabel('Celular').fill('3001234567')
  await dialog.getByLabel('Plantilla de áreas').selectOption(ids.template)
  await dialog.getByRole('button', { name: 'Crear Sede' }).click()
  await expect(dialog).not.toBeVisible()
  expect(track.getSiteCreatePayload()).toMatchObject({
    nombre: 'Nueva Sede', areaTemplateId: ids.template,
  })
})
