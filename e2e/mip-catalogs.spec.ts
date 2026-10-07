import { expect, test, type Page } from '@playwright/test'
import type { MipCatalogItem, MipCatalogKind, MipCriterion, MipProduct, MipProductInput, MipRecord } from '../src/types/mipCatalogs'

const id = '10000000-0000-4000-8000-000000000001'
const method: MipCatalogItem = { id: '20000000-0000-4000-8000-000000000001', clave: 'ASPERSION', nombre: 'Aspersión', clasificacion: null, categoriaProducto: null, activo: true, version: 1 }
const pest: MipCatalogItem = { id: '30000000-0000-4000-8000-000000000001', clave: 'CUCARACHA', nombre: 'Cucaracha', clasificacion: 'RASTREROS', categoriaProducto: 'INSECTOS_RASTREROS', activo: true, version: 1 }
const fly: MipCatalogItem = { ...pest, id: '30000000-0000-4000-8000-000000000002', clave: 'MOSCA', nombre: 'Mosca doméstica', clasificacion: 'VOLADORES', categoriaProducto: 'INSECTOS_VOLADORES' }
const product: MipProduct = { id, nombre: 'Producto de prueba', principioActivo: 'Composición de prueba', dosisAplicacion: 'Según ficha de prueba', registroSanitario: null, gradoToxicologico: null, fabricante: null, antidoto: null, fichaTecnicaStoragePath: null, categorias: ['INSECTOS_RASTREROS'], metodos: [method], plagas: [fly], activo: true, version: 1 }
const trap: MipCatalogItem = { id: '40000000-0000-4000-8000-000000000001', clave: 'TRAMPA_ADHESIVA', nombre: 'Trampa adhesiva', clasificacion: 'RASTREROS', categoriaProducto: null, activo: true, version: 1 }
const criterion: MipCriterion = { id: '50000000-0000-4000-8000-000000000001', nombre: 'Mantenimiento de zonas verdes', soloAreaExterna: true, activo: true }
const profile = { id, nombreCompleto: 'Admin de prueba', correoGoogle: 'admin@example.test', esAdmin: true, esTecnico: false, rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false }

async function setup(page: Page, options: { conflict?: boolean; unavailable?: boolean; technician?: boolean } = {}) {
  const calls: { path: string; method: string }[] = []
  const records: Record<MipCatalogKind, MipRecord[]> = { products: [structuredClone(product)], traps: [structuredClone(trap)], pests: [structuredClone(pest), structuredClone(fly)], methods: [structuredClone(method)], criteria: [structuredClone(criterion)] }
  let conflict = options.conflict ?? false
  await page.route('**/get-session', async route => route.fulfill({ json: {
    session: { id: 'session', userId: 'auth-1', token: 'e2e-token', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
    user: { id: 'auth-1', name: 'Admin de prueba', email: 'admin@example.test', emailVerified: true, createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
  } }))
  await page.route('https://api.example.test/api/**', async route => {
    const url = new URL(route.request().url()), verb = route.request().method(), path = url.pathname
    if (verb === 'OPTIONS') return route.fulfill({ status: 204 })
    calls.push({ path, method: verb })
    if (path === '/api/session') return route.fulfill({ json: options.technician ? { ...profile, esTecnico: true, rolActivo: 'TECNICO' } : profile })
    if (path === '/api/mip/options') return route.fulfill({ json: { methods: records.methods, pests: records.pests } })
    const match = path.match(/^\/api\/mip\/(products|traps|pests|methods|criteria)(?:\/([^/]+))?(?:\/(state))?$/)
    if (!match) return route.fulfill({ status: 404, json: { error: `Unhandled test path: ${path}` } })
    const kind = match[1] as MipCatalogKind, targetId = match[2]
    if (verb === 'GET') {
      if (options.unavailable && !targetId) return route.fulfill({ status: 503, json: { error: 'Servicio temporalmente no disponible' } })
      if (targetId) return route.fulfill({ json: records[kind].find(row => row.id === targetId) })
      return route.fulfill({ json: records[kind].filter(row => row.activo === (url.searchParams.get('active') !== 'false')) })
    }
    if (conflict && verb === 'PATCH' && !match[3]) { conflict = false; return route.fulfill({ status: 409, json: { error: 'El registro cambió en otra sesión. Tus datos se conservan.', code: 'VERSION_CONFLICT' } }) }
    const body = route.request().postDataJSON() as MipProductInput & { nombre: string; soloAreaExterna?: boolean; activo?: boolean; version?: number }
    const previous = records[kind].find(row => row.id === targetId)
    if (verb === 'DELETE') { records[kind] = records[kind].filter(row => row.id !== targetId); return route.fulfill({ status: 204 }) }
    let result: MipRecord
    if (match[3]) {
      result = kind === 'criteria'
        ? { ...(previous as MipCriterion), activo: body.activo! }
        : { ...previous!, activo: body.activo!, version: ('version' in previous! ? previous!.version : 0) + 1 }
    } else if (kind === 'products') {
      result = { ...product, ...body, id: targetId ?? '10000000-0000-4000-8000-000000000099', activo: previous?.activo ?? true, version: ('version' in (previous ?? {}) ? (previous as MipProduct).version : 0) + 1, metodos: records.methods.filter(row => body.metodoIds.includes(row.id)) as MipCatalogItem[], plagas: records.pests.filter(row => body.plagaIds.includes(row.id)) as MipCatalogItem[] }
    } else if (kind === 'criteria') {
      result = { ...(previous as MipCriterion | undefined ?? criterion), ...body, id: targetId ?? '50000000-0000-4000-8000-000000000099', activo: previous?.activo ?? true } as MipCriterion
    } else {
      result = { ...trap, ...body, id: targetId ?? '40000000-0000-4000-8000-000000000099', activo: previous?.activo ?? true, version: ('version' in (previous ?? {}) ? (previous as MipCatalogItem).version : 0) + 1 }
    }
    records[kind] = [...records[kind].filter(row => row.id !== result.id), result]
    return route.fulfill({ status: verb === 'POST' ? 201 : 200, json: result })
  })
  await page.goto('/configuracion/catalogos')
  return { calls, records }
}

test('edita el snapshot sin GET redundante y actualiza solo el producto devuelto', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('button', { name: 'Editar Producto de prueba', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar producto', exact: true })
  await expect(dialog.getByLabel('Nombre comercial')).toHaveValue('Producto de prueba')
  await expect(dialog.getByLabel('Dosis de aplicación')).toHaveValue('Según ficha de prueba')
  expect(calls.filter(call => call.path === `/api/mip/products/${id}` && call.method === 'GET')).toHaveLength(0)
  await dialog.getByLabel('Nombre comercial').fill('Producto actualizado')
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Producto actualizado', exact: true })).toBeVisible()
  expect(calls.filter(call => call.path === '/api/mip/products' && call.method === 'GET')).toHaveLength(1)
})

test('crear: valida campos y combina categoría completa con una plaga específica', async ({ page }) => {
  const { records } = await setup(page)
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true })
  await expect(dialog.locator('.base-field__error')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Crear producto', exact: true }).click()
  await expect(dialog.locator('.base-field__error').first()).toBeVisible()
  await dialog.getByLabel('Nombre comercial').fill('Nuevo producto de prueba')
  await dialog.getByLabel('Principio activo / composición').fill('Composición sintética')
  await dialog.getByLabel('Dosis de aplicación').fill('Dosis sintética')
  await dialog.getByRole('button', { name: 'Plagas que controla', exact: true }).click()
  await dialog.getByLabel('Todos los insectos rastreros', { exact: true }).check()
  await dialog.getByLabel('Mosca doméstica', { exact: true }).check()
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click()
  await dialog.getByRole('button', { name: 'Métodos de aplicación', exact: true }).click()
  await dialog.getByRole('option', { name: 'Aspersión', exact: true }).click()
  await dialog.getByRole('button', { name: 'Métodos de aplicación', exact: true }).click()
  await dialog.getByRole('button', { name: 'Crear producto', exact: true }).click()
  await expect(dialog).toBeHidden()
  const result = records.products[records.products.length - 1] as MipProduct
  expect(result.categorias).toEqual(['INSECTOS_RASTREROS'])
  expect(result.plagas.map(row => row.id)).toEqual([fly.id])
})

test('trampas: CRUD compartido y movimiento entre Activas/Inactivas sin recargas', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('button', { name: 'Trampas', exact: true }).click()
  await page.getByRole('button', { name: 'Editar Trampa adhesiva', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar trampa', exact: true })
  await expect(dialog.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('Trampa adhesiva')
  await expect(dialog.getByRole('radio', { name: 'Rastreros', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('button', { name: 'Desactivar Trampa adhesiva', exact: true }).click()
  await page.getByRole('dialog', { name: 'Desactivar trampa', exact: true }).getByRole('button', { name: 'Desactivar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Trampa adhesiva', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Inactivas', exact: true }).click()
  await page.getByRole('button', { name: 'Reactivar Trampa adhesiva', exact: true }).click()
  await page.getByRole('dialog', { name: 'Reactivar trampa', exact: true }).getByRole('button', { name: 'Reactivar', exact: true }).click()
  await page.getByRole('button', { name: 'Activas', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Trampa adhesiva', exact: true })).toBeVisible()
  expect(calls.filter(call => call.path === `/api/mip/traps/${trap.id}` && call.method === 'GET')).toHaveLength(0)
  expect(calls.filter(call => call.path === '/api/mip/traps' && call.method === 'GET')).toHaveLength(2)
})

test('criterios: replica CRUD, modal compartido y edición sin GET adicional', async ({ page }) => {
  const { calls, records } = await setup(page)
  await page.getByRole('button', { name: 'Criterios', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mantenimiento de zonas verdes', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Editar Mantenimiento de zonas verdes', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Editar criterio', exact: true })
  await expect(edit.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('Mantenimiento de zonas verdes')
  await expect(edit.getByRole('radio', { name: 'Solo exterior / perímetro', exact: true })).toBeChecked()
  expect(calls.filter(call => call.path === `/api/mip/criteria/${criterion.id}` && call.method === 'GET')).toHaveLength(0)

  await edit.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Mantenimiento de zonas verdes actualizado')
  await edit.getByRole('radio', { name: 'Todas las áreas', exact: true }).check()
  await edit.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByRole('button', { name: 'Mantenimiento de zonas verdes actualizado', exact: true })).toBeVisible()
  expect(calls.filter(call => call.path === '/api/mip/criteria' && call.method === 'GET')).toHaveLength(1)

  const saved = records.criteria.find(row => row.nombre === 'Mantenimiento de zonas verdes actualizado') as MipCriterion
  expect(saved.soloAreaExterna).toBe(false)

  await page.getByRole('button', { name: 'Nuevo criterio', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Nuevo criterio', exact: true })
  await create.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Criterio sintético')
  await expect(create.getByRole('radio', { name: 'Todas las áreas', exact: true })).toBeChecked()
  await create.getByRole('button', { name: 'Crear criterio', exact: true }).click()
  await expect(create).toBeHidden()
  await expect(page.getByRole('button', { name: 'Criterio sintético', exact: true })).toBeVisible()
})

test('conflicto conserva el borrador y exige confirmar su reemplazo', async ({ page }) => {
  const { calls } = await setup(page, { conflict: true })
  await page.getByRole('button', { name: 'Editar Producto de prueba', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar producto', exact: true })
  await dialog.getByLabel('Nombre comercial').fill('Borrador sin perder')
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(dialog.getByLabel('Nombre comercial')).toHaveValue('Borrador sin perder')
  await expect(dialog.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
  expect(calls.filter(call => call.path === `/api/mip/products/${id}` && call.method === 'GET')).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Descartar borrador y actualizar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Descartar cambios' }).getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(dialog.getByLabel('Nombre comercial')).toHaveValue('Producto de prueba')
  expect(calls.filter(call => call.path === `/api/mip/products/${id}` && call.method === 'GET')).toHaveLength(1)
})

test('configuración compacta, ambos temas y móvil sin overflow', async ({ page }, info) => {
  await setup(page)
  await expect(page.getByRole('button', { name: 'Producto de prueba', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('catalogs-light-desktop.png'), fullPage: true })
  await page.getByLabel('Apariencia').selectOption('dark')
  await page.screenshot({ path: info.outputPath('catalogs-dark-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Editar Producto de prueba', exact: true }).click()
  await page.screenshot({ path: info.outputPath('product-dark-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('product-dark-mobile.png'), fullPage: true })
  const dialog = page.getByRole('dialog', { name: 'Editar producto', exact: true })
  await dialog.getByRole('button', { name: 'Plagas que controla', exact: true }).click()
  await expect(dialog.getByRole('searchbox', { name: 'Buscar plaga' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('coverage-dark-mobile.png'), fullPage: true })
  await dialog.getByRole('searchbox', { name: 'Buscar plaga' }).press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: /Catálogos MIP/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('settings-dark-mobile.png'), fullPage: true })
})

test('móvil claro conserva navegación, búsqueda y selector sin desbordamiento a 320 px', async ({ page }, info) => {
  await setup(page)
  await page.getByLabel('Apariencia').selectOption('light')
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await expect(page.getByRole('link', { name: /Catálogos MIP/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath('settings-light-small-mobile.png'), fullPage: true })
  await page.getByRole('link', { name: /Catálogos MIP/ }).click()
  await expect(page.getByRole('button', { name: 'Producto de prueba', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('catalogs-light-small-mobile.png'), fullPage: true })
})

test('plagas: clasificación exclusiva, formulario reutilizado y búsqueda local', async ({ page }) => {
  const { calls, records } = await setup(page)
  await page.getByRole('button', { name: 'Plagas', exact: true }).click()
  await page.getByRole('button', { name: 'Nueva plaga', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Nueva plaga', exact: true })
  await create.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Plaga sintética')
  await create.getByRole('radio', { name: 'Voladores', exact: true }).check()
  await create.getByRole('button', { name: 'Crear plaga', exact: true }).click()
  await expect(create).toBeHidden()
  await page.getByRole('button', { name: 'Editar Plaga sintética', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Editar plaga', exact: true })
  await expect(edit.getByRole('radio', { name: 'Voladores', exact: true })).toBeChecked()
  await edit.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Plaga renombrada')
  await edit.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(edit).toBeHidden()
  const savedPest = records.pests.find(row => row.nombre === 'Plaga renombrada') as MipCatalogItem
  expect(savedPest.clasificacion).toBe('VOLADORES')
  expect(savedPest.categoriaProducto).toBe('INSECTOS_VOLADORES')
  expect(calls.filter(call => call.method === 'GET' && /^\/api\/mip\/pests\//.test(call.path))).toHaveLength(0)
  await page.getByRole('searchbox', { name: 'Buscar plagas', exact: true }).fill('sin coincidencias')
  await expect(page.getByRole('heading', { name: 'No hay coincidencias' })).toBeVisible()
})

test('métodos auxiliares: editar actualiza productos relacionados sin otra consulta', async ({ page }) => {
  const { calls } = await setup(page)
  await page.getByRole('button', { name: 'Producto de prueba', exact: true }).click()
  await page.getByRole('dialog', { name: 'Producto de prueba', exact: true }).getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Métodos de aplicación', exact: true }).click()
  const methods = page.getByRole('dialog', { name: 'Métodos de aplicación', exact: true })
  await methods.getByRole('button', { name: 'Editar Aspersión', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Editar método', exact: true })
  await expect(edit.getByRole('radio')).toHaveCount(0)
  await edit.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Método actualizado')
  await edit.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(methods.getByRole('button', { name: 'Método actualizado', exact: true })).toBeVisible()
  await methods.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Método actualizado', exact: true })).toBeVisible()
  expect(calls.filter(call => call.path === `/api/mip/methods/${method.id}` && call.method === 'GET')).toHaveLength(0)
  expect(calls.filter(call => call.path === '/api/mip/products' && call.method === 'GET')).toHaveLength(1)
})

test('error de carga conserva el shell y permite reintentar', async ({ page }) => {
  const availability = { unavailable: true }
  await setup(page, availability)
  await expect(page.getByRole('heading', { name: 'No se pudo cargar el catálogo' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
  availability.unavailable = false
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Producto de prueba', exact: true })).toBeVisible()
})

test('Técnico con rol activo no puede entrar al catálogo administrativo', async ({ page }) => {
  await setup(page, { technician: true })
  await expect(page).not.toHaveURL(/configuracion\/catalogos/)
})
