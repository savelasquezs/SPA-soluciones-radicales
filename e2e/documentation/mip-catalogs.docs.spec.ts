import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  createDocumentationVideo,
  type AudioTimings,
  type NarrationContent,
} from './video-harness'

const narration = JSON.parse(
  readFileSync(new URL('./mip-catalogs.narration.json', import.meta.url), 'utf8'),
) as NarrationContent

const timingFile = resolve(process.cwd(), 'docs-media/audio/timings.json')
let audioTimings: AudioTimings = {}
try {
  audioTimings = JSON.parse(readFileSync(timingFile, 'utf8')) as AudioTimings
} catch {
  audioTimings = {}
}

const createdProductId = '10000000-0000-4000-8000-000000000099'

const methods = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    clave: 'ASPERSION',
    nombre: 'Aspersión',
    clasificacion: null,
    categoriaProducto: null,
    activo: true,
    version: 1,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    clave: 'TERMONEBULIZACION',
    nombre: 'Termonebulización',
    clasificacion: null,
    categoriaProducto: null,
    activo: true,
    version: 1,
  },
]

const pests = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    clave: 'CUCARACHA',
    nombre: 'Cucaracha',
    clasificacion: 'RASTREROS',
    categoriaProducto: 'INSECTOS_RASTREROS',
    activo: true,
    version: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    clave: 'HORMIGA',
    nombre: 'Hormiga',
    clasificacion: 'RASTREROS',
    categoriaProducto: 'INSECTOS_RASTREROS',
    activo: true,
    version: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    clave: 'MOSCA_DOMESTICA',
    nombre: 'Mosca doméstica',
    clasificacion: 'VOLADORES',
    categoriaProducto: 'INSECTOS_VOLADORES',
    activo: true,
    version: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    clave: 'POLILLA',
    nombre: 'Polilla',
    clasificacion: 'VOLADORES',
    categoriaProducto: 'INSECTOS_VOLADORES',
    activo: true,
    version: 1,
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    clave: 'ROEDOR',
    nombre: 'Roedor',
    clasificacion: 'RASTREROS',
    categoriaProducto: 'ROEDORES',
    activo: true,
    version: 1,
  },
]

const profile = {
  id: '90000000-0000-4000-8000-000000000001',
  nombreCompleto: 'Administrador de demostración',
  correoGoogle: 'demo@solucionesradicales.test',
  esAdmin: true,
  esTecnico: false,
  rolActivo: 'ADMINISTRADOR',
  requiereSeleccionRol: false,
}

const existingProduct = {
  id: '10000000-0000-4000-8000-000000000001',
  nombre: 'DEMAND DUO',
  principioActivo: 'Lambdacyhalotrina - Thiamethoxam',
  dosisAplicacion: '8.5 ml / 1 litro',
  registroSanitario: null,
  gradoToxicologico: 'III',
  fabricante: 'Laboratorio de referencia',
  antidoto: 'Según ficha de seguridad',
  fichaTecnicaStoragePath: null,
  categorias: ['INSECTOS_RASTREROS', 'INSECTOS_VOLADORES'],
  metodos: [methods[0]],
  plagas: [],
  activo: true,
  version: 1,
}

type ProductInput = {
  nombre: string
  principioActivo: string
  dosisAplicacion: string
  registroSanitario: string | null
  gradoToxicologico: string | null
  fabricante: string | null
  antidoto: string | null
  fichaTecnicaStoragePath: string | null
  metodoIds: string[]
  plagaIds: string[]
  categorias: string[]
  version?: number
}

type DemoProduct = Omit<ProductInput, 'metodoIds' | 'plagaIds'> & {
  id: string
  metodos: typeof methods
  plagas: typeof pests
  activo: boolean
  version: number
}

function productFromInput(input: ProductInput, previous?: DemoProduct): DemoProduct {
  return {
    id: previous?.id ?? createdProductId,
    nombre: input.nombre,
    principioActivo: input.principioActivo,
    dosisAplicacion: input.dosisAplicacion,
    registroSanitario: input.registroSanitario,
    gradoToxicologico: input.gradoToxicologico,
    fabricante: input.fabricante,
    antidoto: input.antidoto,
    fichaTecnicaStoragePath: input.fichaTecnicaStoragePath,
    categorias: input.categorias,
    metodos: methods.filter(item => input.metodoIds.includes(item.id)),
    plagas: pests.filter(item => input.plagaIds.includes(item.id)),
    activo: previous?.activo ?? true,
    version: (previous?.version ?? 0) + 1,
  }
}

async function setupDemo(page: Page): Promise<void> {
  const products: DemoProduct[] = [structuredClone(existingProduct) as DemoProduct]

  await page.addInitScript(() => {
    class DemoWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onmessageerror: (() => void) | null = null

      postMessage(message: { file?: File }): void {
        setTimeout(() => {
          this.onmessage?.({ data: { ok: true, file: message.file } } as MessageEvent)
        }, 20)
      }

      terminate(): void {
        // La demostración conserva el archivo original para evitar procesos pesados.
      }
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: DemoWorker,
    })

    function showTechnicalSheetPreview(): void {
      document.getElementById('docs-file-preview')?.remove()
      const overlay = document.createElement('section')
      overlay.id = 'docs-file-preview'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-label', 'Vista previa de ficha técnica')
      overlay.innerHTML = `
        <div class="docs-preview-shell">
          <header class="docs-preview-toolbar">
            <div>
              <strong>Ficha técnica</strong>
              <span>ficha-tecnica-demo.pdf</span>
            </div>
            <button type="button" aria-label="Volver al detalle del producto">Volver al detalle</button>
          </header>
          <div class="docs-preview-stage">
            <article class="docs-preview-page">
              <header>
                <div class="docs-preview-brand"><span>Soluciones</span> <strong>radicales</strong></div>
                <div class="docs-preview-label">FICHA TÉCNICA</div>
              </header>
              <h1>Producto demostración</h1>
              <p class="docs-preview-lead">Producto de demostración para el manual de usuario.</p>
              <dl>
                <div><dt>Principio activo</dt><dd>Cipermetrina 40%</dd></div>
                <div><dt>Dosis de aplicación</dt><dd>10 ml / L</dd></div>
                <div><dt>Registro sanitario</dt><dd>RGSP-DEMO-001</dd></div>
                <div><dt>Grado toxicológico</dt><dd>III</dd></div>
                <div><dt>Fabricante</dt><dd>Laboratorio de demostración</dd></div>
                <div><dt>Antídoto</dt><dd>Según ficha de seguridad</dd></div>
              </dl>
              <section>
                <h2>Indicaciones</h2>
                <p>Consultar siempre la etiqueta y la documentación oficial del producto antes de utilizarlo.</p>
              </section>
            </article>
          </div>
        </div>
      `
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483644',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'rgba(3,10,16,.88)',
        fontFamily: 'Inter, system-ui, sans-serif',
      })

      const shell = overlay.querySelector('.docs-preview-shell') as HTMLElement
      Object.assign(shell.style, {
        width: 'min(1040px, 94vw)',
        height: 'min(620px, 88vh)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: '14px',
        background: '#141a20',
        boxShadow: '0 24px 70px rgba(0,0,0,.42)',
      })
      const toolbar = overlay.querySelector('.docs-preview-toolbar') as HTMLElement
      Object.assign(toolbar.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        minHeight: '64px',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,.10)',
        color: '#f7fafc',
      })
      const toolbarCopy = toolbar.querySelector('div') as HTMLElement
      Object.assign(toolbarCopy.style, { display: 'grid', gap: '3px' })
      const toolbarStrong = toolbar.querySelector('strong') as HTMLElement
      Object.assign(toolbarStrong.style, { fontSize: '15px', fontWeight: '650' })
      const toolbarSpan = toolbar.querySelector('span') as HTMLElement
      Object.assign(toolbarSpan.style, { color: '#aeb8c2', fontSize: '13px' })
      const close = toolbar.querySelector('button') as HTMLButtonElement
      Object.assign(close.style, {
        minHeight: '36px',
        padding: '7px 12px',
        border: '1px solid rgba(255,255,255,.16)',
        borderRadius: '8px',
        background: '#1e2832',
        color: '#fff',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: '13px',
        fontWeight: '620',
      })
      close.addEventListener('click', () => overlay.remove())

      const stage = overlay.querySelector('.docs-preview-stage') as HTMLElement
      Object.assign(stage.style, {
        display: 'grid',
        placeItems: 'start center',
        overflow: 'auto',
        padding: '24px',
        background: '#252d35',
      })
      const sheet = overlay.querySelector('.docs-preview-page') as HTMLElement
      Object.assign(sheet.style, {
        width: 'min(720px, 100%)',
        minHeight: '920px',
        padding: '46px 52px',
        background: '#fff',
        color: '#17212b',
        boxShadow: '0 14px 34px rgba(0,0,0,.22)',
      })
      const sheetHeader = sheet.querySelector('header') as HTMLElement
      Object.assign(sheetHeader.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        paddingBottom: '18px',
        borderBottom: '3px solid #0877B9',
      })
      const brand = sheet.querySelector('.docs-preview-brand') as HTMLElement
      Object.assign(brand.style, { fontSize: '22px', fontWeight: '680', letterSpacing: '-.02em' })
      ;(brand.querySelector('span') as HTMLElement).style.color = '#0877B9'
      const brandStrong = brand.querySelector('strong') as HTMLElement
      brandStrong.style.color = '#5B8F18'
      brandStrong.style.fontWeight = '560'
      const label = sheet.querySelector('.docs-preview-label') as HTMLElement
      Object.assign(label.style, { color: '#53606c', fontSize: '12px', fontWeight: '700', letterSpacing: '.12em' })
      const title = sheet.querySelector('h1') as HTMLElement
      Object.assign(title.style, { margin: '32px 0 8px', fontSize: '30px', letterSpacing: '-.025em' })
      const lead = sheet.querySelector('.docs-preview-lead') as HTMLElement
      Object.assign(lead.style, { margin: '0 0 30px', color: '#596674', fontSize: '14px' })
      const list = sheet.querySelector('dl') as HTMLElement
      Object.assign(list.style, { display: 'grid', margin: '0', borderTop: '1px solid #dbe1e6' })
      sheet.querySelectorAll('dl > div').forEach(row => {
        Object.assign((row as HTMLElement).style, {
          display: 'grid',
          gridTemplateColumns: '190px 1fr',
          gap: '20px',
          padding: '14px 0',
          borderBottom: '1px solid #dbe1e6',
        })
      })
      sheet.querySelectorAll('dt').forEach(term => Object.assign((term as HTMLElement).style, { color: '#5b6773', fontSize: '13px', fontWeight: '650' }))
      sheet.querySelectorAll('dd').forEach(value => Object.assign((value as HTMLElement).style, { margin: '0', fontSize: '14px' }))
      const section = sheet.querySelector('section') as HTMLElement
      Object.assign(section.style, { marginTop: '34px', padding: '20px', borderRadius: '10px', background: '#f2f7fa' })
      const sectionTitle = section.querySelector('h2') as HTMLElement
      Object.assign(sectionTitle.style, { margin: '0 0 8px', fontSize: '16px' })
      const sectionCopy = section.querySelector('p') as HTMLElement
      Object.assign(sectionCopy.style, { margin: '0', color: '#4f5d69', fontSize: '13px', lineHeight: '1.5' })
      document.body.appendChild(overlay)
    }

    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: () => {
        let href = 'about:blank'
        const location = {}
        Object.defineProperty(location, 'href', {
          configurable: true,
          get: () => href,
          set: (value: string) => {
            href = String(value)
            if (href.startsWith('https://')) showTechnicalSheetPreview()
          },
        })
        return {
          opener: null,
          location,
          close: () => document.getElementById('docs-file-preview')?.remove(),
        } as unknown as Window
      },
    })
  })

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

  await page.route('https://upload.example.test/**', async route => {
    await route.fulfill({ status: 200, body: '' })
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
      await route.fulfill({ json: { methods, pests } })
      return
    }

    if (path === '/api/files/master/upload-url' && methodName === 'POST') {
      const body = request.postDataJSON() as { contentType?: string }
      await route.fulfill({
        json: {
          url: 'https://upload.example.test/product-sheet',
          storagePath: 'products/demo/ficha-tecnica-demo.pdf',
          contentType: body.contentType || 'application/pdf',
          expiresIn: 300,
        },
      })
      return
    }

    if (path === '/api/files/master/read-url' && methodName === 'POST') {
      await route.fulfill({
        json: {
          url: 'https://files.example.test/products/demo/ficha-tecnica-demo.pdf',
        },
      })
      return
    }

    if (path === '/api/mip/products' && methodName === 'GET') {
      const active = url.searchParams.get('active') !== 'false'
      await route.fulfill({ json: products.filter(row => row.activo === active) })
      return
    }

    if (path === '/api/mip/products' && methodName === 'POST') {
      const body = request.postDataJSON() as ProductInput
      const created = productFromInput(body)
      products.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    const stateMatch = path.match(/^\/api\/mip\/products\/([^/]+)\/state$/)
    if (stateMatch && methodName === 'PATCH') {
      const id = decodeURIComponent(stateMatch[1]!)
      const body = request.postDataJSON() as { activo: boolean }
      const index = products.findIndex(item => item.id === id)
      if (index < 0) {
        await route.fulfill({ status: 404, json: { error: 'Producto no encontrado.' } })
        return
      }
      products[index] = {
        ...products[index],
        activo: body.activo,
        version: products[index].version + 1,
      }
      await route.fulfill({ json: products[index] })
      return
    }

    const productMatch = path.match(/^\/api\/mip\/products\/([^/]+)$/)
    if (productMatch && methodName === 'GET') {
      const id = decodeURIComponent(productMatch[1]!)
      const product = products.find(item => item.id === id)
      await route.fulfill(product ? { json: product } : { status: 404, json: { error: 'Producto no encontrado.' } })
      return
    }

    if (productMatch && methodName === 'PATCH') {
      const id = decodeURIComponent(productMatch[1]!)
      const body = request.postDataJSON() as ProductInput
      const index = products.findIndex(item => item.id === id)
      if (index < 0) {
        await route.fulfill({ status: 404, json: { error: 'Producto no encontrado.' } })
        return
      }
      products[index] = productFromInput(body, products[index])
      await route.fulfill({ json: products[index] })
      return
    }

    if (productMatch && methodName === 'DELETE') {
      const id = decodeURIComponent(productMatch[1]!)
      const index = products.findIndex(item => item.id === id)
      if (index >= 0) products.splice(index, 1)
      await route.fulfill({ status: 204, body: '' })
      return
    }

    await route.fulfill({ status: 404, json: { error: `Ruta de demostración no preparada: ${path}` } })
  })
}

test('video: gestión completa de productos en Catálogos MIP', async ({ page }) => {
  await setupDemo(page)
  const video = createDocumentationVideo({ page, narration, audioTimings })

  await video.showIntro()

  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await video.installRecordingUi()
  await page.waitForTimeout(260)

  await video.narrate('open-catalogs', async () => {
    await page.waitForTimeout(500)
    await video.click(page.getByRole('link', { name: /Catálogos MIP/ }))
    await expect(page.getByRole('button', { name: 'Nuevo producto', exact: true })).toBeVisible()
  })

  await video.narrate('catalog-overview', async () => {
    const toolbar = page.getByRole('navigation', { name: 'Estado de los registros' })
    await video.zoom(toolbar)
    await page.waitForTimeout(550)
    await video.resetZoom(toolbar)
  })

  await video.narrate('new-product', async () => {
    await page.waitForTimeout(500)
    await video.click(page.getByRole('button', { name: 'Nuevo producto', exact: true }))
  })

  const createDialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true })
  await expect(createDialog).toBeVisible()

  await video.narrate('required-fields', async () => {
    await video.type(createDialog.getByLabel('Nombre comercial'), 'Producto demostración')
    await video.type(createDialog.getByLabel('Principio activo / composición'), 'Cipermetrina 40%')
    await video.type(createDialog.getByLabel('Dosis de aplicación'), '10 ml / L')
  })

  await video.narrate('optional-fields', async () => {
    await video.type(createDialog.getByLabel('Registro sanitario'), 'RGSP-DEMO-001')
    await video.type(createDialog.getByLabel('Grado toxicológico'), 'III')
    await video.type(createDialog.getByLabel('Laboratorio / fabricante'), 'Laboratorio de demostración')
    await video.type(createDialog.getByLabel('Antídoto'), 'Según ficha de seguridad')
  })

  const coverageButton = createDialog.getByRole('button', { name: 'Plagas que controla', exact: true })
  await video.narrate('coverage-intro', async () => {
    await page.waitForTimeout(550)
    await video.click(coverageButton)
    const panel = createDialog.locator('#product-coverage-options')
    await expect(panel).toBeVisible()
    await video.zoom(panel)
    await page.waitForTimeout(500)
    await video.resetZoom(panel)
  })

  await video.narrate('coverage-category', async () => {
    await page.waitForTimeout(800)
    await video.click(createDialog.getByLabel('Todos los insectos rastreros', { exact: true }))
    await expect(createDialog.getByText('Incluida por categoría').first()).toBeVisible()
  })

  await video.narrate('coverage-specific', async () => {
    await page.waitForTimeout(850)
    await video.click(createDialog.getByLabel('Mosca doméstica', { exact: true }))
    await expect(createDialog.locator('#product-coverage-options')).toBeVisible()
  })

  await video.narrate('coverage-close', async () => {
    await page.waitForTimeout(700)
    await video.click(createDialog.getByRole('button', { name: 'Listo', exact: true }))
    await expect(createDialog.locator('#product-coverage-options')).toBeHidden()
  })

  await video.narrate('methods', async () => {
    const methodsButton = createDialog.getByRole('button', { name: 'Métodos de aplicación', exact: true })
    await page.waitForTimeout(500)
    await video.click(methodsButton)
    await video.click(createDialog.getByRole('option', { name: 'Aspersión', exact: true }))
    await video.click(createDialog.getByRole('option', { name: 'Termonebulización', exact: true }))
    await page.waitForTimeout(420)
    await video.click(methodsButton)
  })

  await video.narrate('technical-sheet', async () => {
    await page.waitForTimeout(500)
    const uploadButton = createDialog.getByRole('button', { name: 'Adjuntar archivo', exact: true })
    await video.uploadFile(uploadButton, {
      name: 'ficha-tecnica-demo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% Demo Soluciones Radicales\n1 0 obj\n<<>>\nendobj\n%%EOF'),
    })
    await expect(createDialog.getByRole('button', { name: 'ficha-tecnica-demo.pdf', exact: true })).toBeVisible()
  })

  await video.narrate('save-product', async () => {
    await page.waitForTimeout(750)
    await video.click(createDialog.getByRole('button', { name: 'Crear producto', exact: true }))
    await expect(createDialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Producto demostración', exact: true })).toBeVisible()
  })

  await video.narrate('open-detail', async () => {
    await page.waitForTimeout(650)
    await video.click(page.getByRole('button', { name: 'Producto demostración', exact: true }))
  })

  const detailDialog = page.getByRole('dialog', { name: 'Producto demostración', exact: true })
  await expect(detailDialog).toBeVisible()

  await video.narrate('detail-overview', async () => {
    const detail = detailDialog.locator('.mip-detail')
    await video.zoom(detail)
    await page.waitForTimeout(700)
    await video.resetZoom(detail)
  })

  await video.narrate('open-sheet', async () => {
    await page.waitForTimeout(650)
    await video.click(detailDialog.getByRole('button', { name: 'Ver ficha técnica', exact: true }))
    await expect(page.getByRole('dialog', { name: 'Vista previa de ficha técnica' })).toBeVisible()
  })

  await video.narrate('close-sheet', async () => {
    await page.waitForTimeout(900)
    await video.click(page.getByRole('button', { name: 'Volver al detalle del producto', exact: true }))
    await expect(page.getByRole('dialog', { name: 'Vista previa de ficha técnica' })).toBeHidden()
    await expect(detailDialog).toBeVisible()
  })

  await video.narrate('open-edit', async () => {
    await page.waitForTimeout(650)
    await video.click(detailDialog.getByRole('button', { name: 'Editar', exact: true }))
  })

  const editDialog = page.getByRole('dialog', { name: 'Editar producto', exact: true })
  await expect(editDialog).toBeVisible()

  await video.narrate('save-edit', async () => {
    await video.type(editDialog.getByLabel('Dosis de aplicación'), '12 ml / L')
    await page.waitForTimeout(550)
    await video.click(editDialog.getByRole('button', { name: 'Guardar cambios', exact: true }))
    await expect(editDialog).toBeHidden()
  })

  await video.narrate('edit-result', async () => {
    await expect(page.getByRole('cell', { name: '12 ml / L', exact: true })).toBeVisible()
    const productRow = page.getByRole('row').filter({
      has: page.getByRole('button', { name: 'Producto demostración', exact: true }),
    })
    await video.zoom(productRow)
    await page.waitForTimeout(650)
    await video.resetZoom(productRow)
  })

  await video.narrate('delete-action', async () => {
    await page.waitForTimeout(650)
    await video.click(page.getByRole('button', { name: 'Eliminar Producto demostración', exact: true }))
    await expect(page.getByRole('dialog', { name: 'Eliminar producto', exact: true })).toBeVisible()
  })

  const deleteDialog = page.getByRole('dialog', { name: 'Eliminar producto', exact: true })
  await video.narrate('delete-restriction', async () => {
    const message = deleteDialog.locator('.confirm-dialog__message')
    await video.zoom(message)
    await page.waitForTimeout(900)
    await video.resetZoom(message)
    await page.waitForTimeout(600)
    await video.click(deleteDialog.getByRole('button', { name: 'Cancelar', exact: true }))
    await expect(deleteDialog).toBeHidden()
  })

  await video.narrate('deactivate-action', async () => {
    await page.waitForTimeout(650)
    await video.click(page.getByRole('button', { name: 'Desactivar Producto demostración', exact: true }))
    await expect(page.getByRole('dialog', { name: 'Desactivar producto', exact: true })).toBeVisible()
  })

  const deactivateDialog = page.getByRole('dialog', { name: 'Desactivar producto', exact: true })
  await video.narrate('confirm-deactivate', async () => {
    await page.waitForTimeout(750)
    await video.click(deactivateDialog.getByRole('button', { name: 'Desactivar', exact: true }))
    await expect(deactivateDialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Producto demostración', exact: true })).toBeHidden()
  })

  await video.narrate('inactive-tab', async () => {
    await page.waitForTimeout(600)
    const stateNav = page.getByRole('navigation', { name: 'Estado de los registros' })
    await video.click(stateNav.getByRole('button', { name: 'Inactivos', exact: true }))
    await expect(page.getByRole('button', { name: 'Producto demostración', exact: true })).toBeVisible()
  })

  await video.narrate('reactivate-note', async () => {
    const inactiveRow = page.getByRole('row').filter({
      has: page.getByRole('button', { name: 'Producto demostración', exact: true }),
    })
    await video.zoom(inactiveRow)
    await page.waitForTimeout(850)
    await video.resetZoom(inactiveRow)
    await expect(page.getByRole('button', { name: 'Reactivar Producto demostración', exact: true })).toBeVisible()
  })

  await video.narrate('done', async () => {
    await page.waitForTimeout(600)
  })

  await video.showOutro()
  video.saveTimeline()
})
