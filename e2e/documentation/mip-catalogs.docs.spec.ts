import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

type NarrationSegment = { id: string; text: string }
type NarrationContent = { title: string; subtitle: string; segments: NarrationSegment[] }
type AudioTimings = { segments?: Record<string, { durationMs?: number }> }

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

const CAPTIONS: Record<string, string> = {
  'open-catalogs': 'Abre Configuración → Catálogos MIP',
  'new-product': 'Nuevo producto · * Campos obligatorios',
  'required-fields': 'Nombre · Principio activo · Dosis',
  'optional-details': 'Registro · Grado toxicológico · Laboratorio · Antídoto',
  'coverage-intro': 'Categorías completas o plagas específicas',
  'coverage-category': 'Una categoría incluye automáticamente sus plagas',
  'coverage-specific': 'También puedes añadir plagas individuales',
  methods: 'Uno o varios métodos de aplicación',
  'technical-sheet': 'Ficha técnica opcional · PDF o imagen',
  save: 'Revisa y crea el producto',
  done: 'Producto disponible en el catálogo',
}

const productId = '10000000-0000-4000-8000-000000000001'
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
  metodos: [methods[0]],
  plagas: [],
  activo: true,
  version: 1,
}

function segmentText(id: string): string {
  const segment = narration.segments.find(item => item.id === id)
  if (!segment) throw new Error(`No existe el segmento de narración ${id}.`)
  return segment.text
}

function segmentDuration(id: string): number {
  const measured = audioTimings.segments?.[id]?.durationMs
  if (typeof measured === 'number' && measured > 0) return measured
  return Math.max(1_800, Math.round(segmentText(id).length * 54))
}

async function setupDemo(page: Page) {
  const products = [structuredClone(existingProduct)]

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
        // Sin proceso real: solo evita comprimir archivos de demostración.
      }
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: DemoWorker,
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
        fichaTecnicaStoragePath: string | null
        metodoIds: string[]
        plagaIds: string[]
        categorias: string[]
      }

      const created = {
        ...existingProduct,
        ...body,
        id: '10000000-0000-4000-8000-000000000099',
        metodos: methods.filter(item => body.metodoIds.includes(item.id)),
        plagas: pests.filter(item => body.plagaIds.includes(item.id)),
        activo: true,
        version: 1,
      }
      products.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    await route.fulfill({ status: 404, json: { error: `Ruta de demostración no preparada: ${path}` } })
  })
}

function brandLockup(): string {
  return `
    <div class="brand-lockup">
      <img class="brand-symbol" src="http://127.0.0.1:5174/favicon.png" alt="" />
      <div class="brand-copy">
        <div class="brand-name"><span>Soluciones</span> <strong>radicales</strong></div>
        <div class="brand-tagline">CONTROL INTEGRADO DE PLAGAS</div>
      </div>
    </div>
  `
}

async function showIntro(page: Page) {
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; }
          body {
            display: grid;
            place-items: center;
            overflow: hidden;
            background:
              radial-gradient(circle at 20% 18%, rgba(8,119,185,.19), transparent 34rem),
              radial-gradient(circle at 82% 80%, rgba(91,143,24,.14), transparent 31rem),
              #0b0c0e;
            color: #f5f6f8;
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          }
          main {
            display: grid;
            width: min(820px, 84vw);
            justify-items: center;
            gap: 16px;
            text-align: center;
            animation: intro 620ms ease both;
          }
          .brand-lockup { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 12px; }
          .brand-symbol { width: 100px; height: 100px; object-fit: contain; }
          .brand-copy { text-align: left; }
          .brand-name { font-size: 31px; font-weight: 650; line-height: 1; letter-spacing: -.025em; }
          .brand-name span { color: #1797da; }
          .brand-name strong { color: #7ebc3d; font-weight: 520; }
          .brand-tagline { margin-top: 7px; color: #cfd5dd; font-size: 12px; letter-spacing: .12em; }
          .eyebrow { margin: 10px 0 0; color: #aab2bd; font-size: 14px; letter-spacing: .10em; text-transform: uppercase; }
          h1 { margin: 0; font-size: 47px; line-height: 1.07; font-weight: 670; letter-spacing: -.03em; }
          p { margin: 0; color: #c9ced6; font-size: 21px; }
          @keyframes intro {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
      </head>
      <body>
        <main>
          ${brandLockup()}
          <div class="eyebrow">Manual de usuario</div>
          <h1>${narration.title}</h1>
          <p>${narration.subtitle}</p>
        </main>
      </body>
    </html>
  `)
  await page.waitForTimeout(2_350)
}

async function installRecordingUi(page: Page) {
  await page.evaluate(() => {
    document.getElementById('docs-demo-cursor')?.remove()
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    cursor.id = 'docs-demo-cursor'
    cursor.setAttribute('viewBox', '0 0 28 34')
    cursor.setAttribute('width', '28')
    cursor.setAttribute('height', '34')
    cursor.innerHTML = '<path d="M3 2 22 20l-9 1 5 10-5 2-5-10-6 7z" fill="#fff" stroke="#0877B9" stroke-width="2" stroke-linejoin="round"/>'
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '2147483647',
      transform: 'translate(640px, 360px)',
      transition: 'transform 360ms cubic-bezier(.22,.8,.25,1)',
      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.28))',
      pointerEvents: 'none',
    })
    document.body.appendChild(cursor)
  })
}

async function moveCursor(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) return
  const x = box.x + Math.min(box.width * 0.58, Math.max(10, box.width - 10))
  const y = box.y + Math.min(box.height * 0.56, Math.max(10, box.height - 10))
  await target.page().evaluate(({ x, y }) => {
    const cursor = document.getElementById('docs-demo-cursor')
    if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
  }, { x, y })
  await target.page().waitForTimeout(380)
}

async function clickRipple(target: Locator) {
  const box = await target.boundingBox()
  if (!box) return
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await target.page().evaluate(({ x, y }) => {
    const ring = document.createElement('div')
    Object.assign(ring.style, {
      position: 'fixed',
      left: `${x - 10}px`,
      top: `${y - 10}px`,
      width: '20px',
      height: '20px',
      zIndex: '2147483646',
      border: '2px solid rgba(8,119,185,.9)',
      borderRadius: '999px',
      pointerEvents: 'none',
      animation: 'docsRipple 480ms ease-out forwards',
    })
    if (!document.getElementById('docs-ripple-style')) {
      const style = document.createElement('style')
      style.id = 'docs-ripple-style'
      style.textContent = '@keyframes docsRipple { from { opacity: 1; transform: scale(.6); } to { opacity: 0; transform: scale(2.4); } }'
      document.head.appendChild(style)
    }
    document.body.appendChild(ring)
    setTimeout(() => ring.remove(), 560)
  }, { x, y })
}

async function focusTarget(target: Locator) {
  await target.evaluate(element => {
    const html = element as HTMLElement
    html.dataset.docsOriginalBoxShadow = html.style.boxShadow
    html.style.boxShadow = '0 0 0 4px rgba(8,119,185,.25)'
    html.style.transition = 'box-shadow 150ms ease'
  })
}

async function releaseTarget(target: Locator) {
  try {
    await target.evaluate(element => {
      const html = element as HTMLElement
      html.style.boxShadow = html.dataset.docsOriginalBoxShadow ?? ''
      delete html.dataset.docsOriginalBoxShadow
    })
  } catch {
    // El elemento puede desaparecer después de navegar o confirmar un diálogo.
  }
}

async function localZoom(target: Locator, scale = 1.045) {
  await target.evaluate((element, scale) => {
    const html = element as HTMLElement
    html.dataset.docsOriginalTransform = html.style.transform
    html.dataset.docsOriginalZIndex = html.style.zIndex
    html.dataset.docsOriginalPosition = html.style.position
    html.style.position = html.style.position || 'relative'
    html.style.zIndex = '20'
    html.style.transformOrigin = 'center center'
    html.style.transition = 'transform 260ms cubic-bezier(.22,.8,.25,1)'
    html.style.transform = `scale(${scale})`
  }, scale)
  await target.page().waitForTimeout(300)
}

async function resetLocalZoom(target: Locator) {
  try {
    await target.evaluate(element => {
      const html = element as HTMLElement
      html.style.transform = html.dataset.docsOriginalTransform ?? ''
      html.style.zIndex = html.dataset.docsOriginalZIndex ?? ''
      html.style.position = html.dataset.docsOriginalPosition ?? ''
      delete html.dataset.docsOriginalTransform
      delete html.dataset.docsOriginalZIndex
      delete html.dataset.docsOriginalPosition
    })
    await target.page().waitForTimeout(260)
  } catch {
    // El elemento puede desaparecer al cerrar una sección.
  }
}

async function showCaption(page: Page, text: string) {
  await page.evaluate(({ text }) => {
    document.getElementById('docs-demo-caption')?.remove()
    const caption = document.createElement('div')
    caption.id = 'docs-demo-caption'
    caption.textContent = text
    Object.assign(caption.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      zIndex: '2147483645',
      maxWidth: '760px',
      padding: '10px 17px',
      border: '1px solid rgba(255,255,255,.12)',
      borderRadius: '9px',
      background: 'rgba(11,12,14,.90)',
      boxShadow: '0 12px 36px rgba(0,0,0,.20)',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '15px',
      fontWeight: '560',
      lineHeight: '1.35',
      textAlign: 'center',
      pointerEvents: 'none',
      backdropFilter: 'blur(6px)',
    })
    document.body.appendChild(caption)
  }, { text })
}

async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById('docs-demo-caption')?.remove())
}

async function demoClick(target: Locator) {
  await moveCursor(target)
  await focusTarget(target)
  await clickRipple(target)
  await target.click()
  await releaseTarget(target)
  await target.page().waitForTimeout(230)
}

async function demoType(target: Locator, text: string) {
  await moveCursor(target)
  await focusTarget(target)
  await target.click()
  await target.fill('')
  await target.pressSequentially(text, { delay: 18 })
  await releaseTarget(target)
  await target.page().waitForTimeout(90)
}

async function demoFileUpload(button: Locator, page: Page) {
  await moveCursor(button)
  await focusTarget(button)
  const chooserPromise = page.waitForEvent('filechooser')
  await clickRipple(button)
  await button.click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'ficha-tecnica-demo.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% Demo Soluciones Radicales\n1 0 obj\n<<>>\nendobj\n%%EOF'),
  })
  await releaseTarget(button)
  await page.waitForTimeout(250)
}

async function showOutro(page: Page) {
  await clearCaption(page)
  await page.evaluate(() => document.getElementById('docs-demo-cursor')?.remove())
  await page.evaluate(() => {
    const app = document.getElementById('app')
    if (app) {
      app.style.transition = 'opacity 2.05s ease'
      app.style.opacity = '0'
    }

    const outro = document.createElement('div')
    outro.id = 'docs-demo-outro'
    outro.innerHTML = `
      <div class="outro-brand">
        <img src="/favicon.png" alt="" />
        <div>
          <div class="outro-name"><span>Soluciones</span> <strong>radicales</strong></div>
          <div class="outro-tagline">CONTROL INTEGRADO DE PLAGAS</div>
        </div>
      </div>
    `
    Object.assign(outro.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'grid',
      placeItems: 'center',
      background: 'radial-gradient(circle at center, rgba(8,119,185,.12), transparent 34rem), #0b0c0e',
      opacity: '0',
      transition: 'opacity 2.25s ease',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, sans-serif',
    })
    const brand = outro.querySelector('.outro-brand') as HTMLElement
    Object.assign(brand.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      opacity: '0',
      transform: 'scale(.96)',
      transition: 'opacity 2.25s ease, transform 2.25s ease',
    })
    const image = outro.querySelector('img') as HTMLImageElement
    Object.assign(image.style, { width: '118px', height: '118px', objectFit: 'contain' })
    const name = outro.querySelector('.outro-name') as HTMLElement
    Object.assign(name.style, { fontSize: '38px', fontWeight: '650', letterSpacing: '-.025em' })
    ;(name.querySelector('span') as HTMLElement).style.color = '#1797da'
    const strong = name.querySelector('strong') as HTMLElement
    strong.style.color = '#7ebc3d'
    strong.style.fontWeight = '520'
    const tagline = outro.querySelector('.outro-tagline') as HTMLElement
    Object.assign(tagline.style, {
      marginTop: '8px',
      color: '#cfd5dd',
      fontSize: '13px',
      letterSpacing: '.13em',
    })
    document.body.appendChild(outro)

    requestAnimationFrame(() => {
      outro.style.opacity = '1'
      brand.style.opacity = '1'
      brand.style.transform = 'scale(1)'
    })
  })
  await page.waitForTimeout(2_700)
}

test('video: crear un producto en Catálogos MIP', async ({ page }) => {
  await setupDemo(page)
  const startedAt = Date.now()
  const timeline: { narration: Array<{ id: string; startMs: number }> } = { narration: [] }

  await showIntro(page)

  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await installRecordingUi(page)
  await page.waitForTimeout(260)

  async function narrate(id: string, action: () => Promise<void>) {
    const startMs = Date.now() - startedAt
    timeline.narration.push({ id, startMs })
    await showCaption(page, CAPTIONS[id] ?? segmentText(id))
    await page.waitForTimeout(110)
    await action()
    const elapsed = Date.now() - startedAt - startMs
    const minimum = segmentDuration(id) + 80
    if (elapsed < minimum) await page.waitForTimeout(minimum - elapsed)
    await clearCaption(page)
    await page.waitForTimeout(70)
  }

  const catalogsLink = page.getByRole('link', { name: /Catálogos MIP/ })
  await narrate('open-catalogs', async () => {
    await demoClick(catalogsLink)
    await expect(page.getByRole('button', { name: 'Nuevo producto', exact: true })).toBeVisible()
  })

  const newProduct = page.getByRole('button', { name: 'Nuevo producto', exact: true })
  await narrate('new-product', async () => {
    await demoClick(newProduct)
  })

  const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true })
  await expect(dialog).toBeVisible()

  await narrate('required-fields', async () => {
    await demoType(dialog.getByLabel('Nombre comercial'), 'Producto demostración')
    await demoType(dialog.getByLabel('Principio activo / composición'), 'Cipermetrina 40%')
    await demoType(dialog.getByLabel('Dosis de aplicación'), '10 ml / L')
  })

  await narrate('optional-details', async () => {
    await demoType(dialog.getByLabel('Registro sanitario'), 'RGSP-DEMO-001')
    await demoType(dialog.getByLabel('Grado toxicológico'), 'III')
    await demoType(dialog.getByLabel('Laboratorio / fabricante'), 'Laboratorio de demostración')
    await demoType(dialog.getByLabel('Antídoto'), 'Según ficha de seguridad')
  })

  const coverageButton = dialog.getByRole('button', { name: 'Plagas que controla', exact: true })
  await narrate('coverage-intro', async () => {
    await demoClick(coverageButton)
    const panel = dialog.locator('#product-coverage-options')
    await expect(panel).toBeVisible()
    await localZoom(panel)
    await page.waitForTimeout(300)
    await resetLocalZoom(panel)
  })

  await narrate('coverage-category', async () => {
    await demoClick(dialog.getByLabel('Todos los insectos rastreros', { exact: true }))
    await expect(dialog.getByText('Incluida por categoría').first()).toBeVisible()
  })

  await narrate('coverage-specific', async () => {
    await demoClick(dialog.getByLabel('Mosca doméstica', { exact: true }))
    await demoClick(dialog.getByRole('button', { name: 'Listo', exact: true }))
  })

  await narrate('methods', async () => {
    const methodsButton = dialog.getByRole('button', { name: 'Métodos de aplicación', exact: true })
    await demoClick(methodsButton)
    await demoClick(dialog.getByRole('option', { name: 'Aspersión', exact: true }))
    await demoClick(dialog.getByRole('option', { name: 'Termonebulización', exact: true }))
    await demoClick(methodsButton)
  })

  await narrate('technical-sheet', async () => {
    const uploadButton = dialog.getByRole('button', { name: 'Adjuntar archivo', exact: true })
    await demoFileUpload(uploadButton, page)
    await expect(dialog.getByRole('button', { name: 'ficha-tecnica-demo.pdf', exact: true })).toBeVisible()
  })

  await narrate('save', async () => {
    await demoClick(dialog.getByRole('button', { name: 'Crear producto', exact: true }))
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Producto demostración', exact: true })).toBeVisible()
  })

  await narrate('done', async () => {
    await page.waitForTimeout(240)
  })

  await showOutro(page)

  mkdirSync(resolve(process.cwd(), 'docs-media'), { recursive: true })
  writeFileSync(
    resolve(process.cwd(), 'docs-media/timeline.json'),
    JSON.stringify({ ...timeline, durationMs: Date.now() - startedAt }, null, 2) + '\n',
  )
})
