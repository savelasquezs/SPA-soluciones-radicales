import { expect, test, type Locator, type Page } from '@playwright/test'

const productId = '10000000-0000-4000-8000-000000000001'
const methodId = '20000000-0000-4000-8000-000000000001'
const pestId = '30000000-0000-4000-8000-000000000001'

const profile = {
  id: '90000000-0000-4000-8000-000000000001',
  nombreCompleto: 'Administrador de demostración',
  correoGoogle: 'demo@solucionesradicales.test',
  esAdmin: true,
  esTecnico: false,
  rolActivo: 'ADMINISTRADOR',
  requiereSeleccionRol: false,
}

const method = {
  id: methodId,
  clave: 'ASPERSION',
  nombre: 'Aspersión',
  clasificacion: null,
  categoriaProducto: null,
  activo: true,
  version: 1,
}

const pest = {
  id: pestId,
  clave: 'CUCARACHA',
  nombre: 'Cucaracha',
  clasificacion: 'RASTREROS',
  categoriaProducto: 'INSECTOS_RASTREROS',
  activo: true,
  version: 1,
}

const existingProduct = {
  id: productId,
  nombre: 'Producto de demostración existente',
  principioActivo: 'Composición de referencia',
  dosisAplicacion: 'Según ficha técnica',
  registroSanitario: null,
  gradoToxicologico: null,
  fabricante: null,
  antidoto: null,
  fichaTecnicaStoragePath: null,
  categorias: ['INSECTOS_RASTREROS'],
  metodos: [method],
  plagas: [],
  activo: true,
  version: 1,
}

async function setupDemo(page: Page) {
  const products = [structuredClone(existingProduct)]

  await page.route('**/get-session', async route => {
    await route.fulfill({
      json: {
        session: {
          id: 'demo-session',
          userId: 'demo-auth',
          token: 'demo-token',
          expiresAt: '2099-01-01T00:00:00.000Z',
          createdAt: '2026-10-07T00:00:00.000Z',
          updatedAt: '2026-10-07T00:00:00.000Z',
        },
        user: {
          id: 'demo-auth',
          name: profile.nombreCompleto,
          email: profile.correoGoogle,
          emailVerified: true,
          createdAt: '2026-10-07T00:00:00.000Z',
          updatedAt: '2026-10-07T00:00:00.000Z',
        },
      },
    })
  })

  await page.route('https://api.example.test/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const methodName = request.method()

    if (methodName === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/session') {
      await route.fulfill({ json: profile })
      return
    }

    if (path === '/api/mip/options') {
      await route.fulfill({ json: { methods: [method], pests: [pest] } })
      return
    }

    if (path === '/api/mip/products' && methodName === 'GET') {
      await route.fulfill({ json: products.filter(row => row.activo) })
      return
    }

    if (path === '/api/mip/products' && methodName === 'POST') {
      const body = request.postDataJSON() as {
        nombre: string
        principioActivo: string
        dosisAplicacion: string
        registroSanitario: string | null
        gradoToxicologico: string | null
        fabricante: string | null
        antidoto: string | null
        categoriaPlaga: string | null
        metodoIds: string[]
        plagaIds: string[]
        categorias?: string[]
      }
      const created = {
        ...existingProduct,
        ...body,
        id: '10000000-0000-4000-8000-000000000099',
        nombre: body.nombre,
        principioActivo: body.principioActivo,
        dosisAplicacion: body.dosisAplicacion,
        categorias: body.categorias ?? ['INSECTOS_RASTREROS'],
        metodos: [method],
        plagas: [],
        version: 1,
      }
      products.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    await route.fulfill({ status: 404, json: { error: `Ruta de demostración no preparada: ${path}` } })
  })
}

async function caption(page: Page, text: string, duration = 1_100) {
  await page.evaluate(({ text }) => {
    document.getElementById('docs-demo-caption')?.remove()
    const caption = document.createElement('div')
    caption.id = 'docs-demo-caption'
    caption.textContent = text
    Object.assign(caption.style, {
      position: 'fixed',
      left: '50%',
      bottom: '28px',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      maxWidth: '760px',
      padding: '12px 18px',
      border: '1px solid rgba(255,255,255,.14)',
      borderRadius: '10px',
      background: 'rgba(11,12,14,.94)',
      boxShadow: '0 12px 36px rgba(0,0,0,.24)',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '16px',
      fontWeight: '600',
      lineHeight: '1.35',
      textAlign: 'center',
      pointerEvents: 'none',
    })
    document.body.appendChild(caption)
  }, { text })
  await page.waitForTimeout(duration)
}

async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById('docs-demo-caption')?.remove())
}

async function focusTarget(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  await target.evaluate(element => {
    const html = element as HTMLElement
    html.dataset.docsOriginalBoxShadow = html.style.boxShadow
    html.style.boxShadow = '0 0 0 4px rgba(8,119,185,.28)'
    html.style.transition = 'box-shadow 160ms ease'
  })
  await target.page().waitForTimeout(450)
}

async function releaseTarget(target: Locator) {
  try {
    await target.evaluate(element => {
      const html = element as HTMLElement
      html.style.boxShadow = html.dataset.docsOriginalBoxShadow ?? ''
      delete html.dataset.docsOriginalBoxShadow
    })
  } catch {
    // The target may disappear after navigation or a dialog action.
  }
}

async function demoClick(target: Locator) {
  await focusTarget(target)
  await target.click()
  await releaseTarget(target)
  await target.page().waitForTimeout(650)
}

async function demoType(target: Locator, text: string) {
  await focusTarget(target)
  await target.fill('')
  await target.pressSequentially(text, { delay: 38 })
  await releaseTarget(target)
  await target.page().waitForTimeout(450)
}

test('video: crear un producto en Catálogos MIP', async ({ page }) => {
  await setupDemo(page)
  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await page.waitForTimeout(900)

  await caption(page, 'Cómo crear un producto en Catálogos MIP', 1_700)

  const catalogsLink = page.getByRole('link', { name: /Catálogos MIP/ })
  await caption(page, '1. En Configuración, abre Catálogos MIP')
  await demoClick(catalogsLink)
  await expect(page.getByRole('button', { name: 'Nuevo producto', exact: true })).toBeVisible()

  const newProduct = page.getByRole('button', { name: 'Nuevo producto', exact: true })
  await caption(page, '2. Selecciona Nuevo producto')
  await demoClick(newProduct)

  const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true })
  await expect(dialog).toBeVisible()

  await caption(page, '3. Completa la información principal')
  await demoType(dialog.getByLabel('Nombre comercial'), 'Producto demostración')
  await demoType(dialog.getByLabel('Principio activo / composición'), 'Cipermetrina 40%')
  await demoType(dialog.getByLabel('Dosis de aplicación'), '10 ml / L')

  await caption(page, '4. Indica las plagas que controla')
  await demoClick(dialog.getByRole('button', { name: 'Plagas que controla', exact: true }))
  await demoClick(dialog.getByLabel('Todos los insectos rastreros', { exact: true }))
  await demoClick(dialog.getByRole('button', { name: 'Listo', exact: true }))

  await caption(page, '5. Selecciona el método de aplicación')
  const methodsButton = dialog.getByRole('button', { name: 'Métodos de aplicación', exact: true })
  await demoClick(methodsButton)
  await demoClick(dialog.getByRole('option', { name: 'Aspersión', exact: true }))
  await demoClick(methodsButton)

  await caption(page, '6. Crea el producto')
  await demoClick(dialog.getByRole('button', { name: 'Crear producto', exact: true }))
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Producto demostración', exact: true })).toBeVisible()

  await caption(page, 'Listo. El producto quedó disponible en el catálogo.', 1_900)
  await clearCaption(page)
  await page.waitForTimeout(700)
})
