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

function segmentText(id: string): string {
  const segment = narration.segments.find(item => item.id === id)
  if (!segment) throw new Error(`No existe el segmento de narración ${id}.`)
  return segment.text
}

function segmentDuration(id: string): number {
  const measured = audioTimings.segments?.[id]?.durationMs
  if (typeof measured === 'number' && measured > 0) return measured
  return Math.max(2_000, Math.round(segmentText(id).length * 58))
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
              radial-gradient(circle at 24% 20%, rgba(8,119,185,.22), transparent 34rem),
              radial-gradient(circle at 78% 78%, rgba(91,143,24,.16), transparent 30rem),
              #0b0c0e;
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
            color: #f5f6f8;
          }
          main {
            display: grid;
            width: min(760px, 82vw);
            justify-items: center;
            gap: 18px;
            text-align: center;
            animation: intro 700ms ease both;
          }
          img { width: 300px; max-width: 62vw; height: auto; }
          .eyebrow { margin: 8px 0 0; color: #aab2bd; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; }
          h1 { margin: 0; font-size: 46px; line-height: 1.08; font-weight: 650; letter-spacing: -.025em; }
          p { margin: 0; color: #c9ced6; font-size: 22px; }
          @keyframes intro {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
      </head>
      <body>
        <main>
          <img src="http://127.0.0.1:5174/logo-dark.png" alt="Soluciones Radicales" />
          <div class="eyebrow">Manual de usuario</div>
          <h1>${narration.title}</h1>
          <p>${narration.subtitle}</p>
        </main>
      </body>
    </html>
  `)
  await page.waitForTimeout(2_800)
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
      transition: 'transform 520ms cubic-bezier(.22,.8,.25,1)',
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
  const x = box.x + Math.min(box.width * 0.55, Math.max(10, box.width - 10))
  const y = box.y + Math.min(box.height * 0.55, Math.max(10, box.height - 10))
  await target.page().evaluate(({ x, y }) => {
    const cursor = document.getElementById('docs-demo-cursor')
    if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
  }, { x, y })
  await target.page().waitForTimeout(540)
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
      animation: 'docsRipple 560ms ease-out forwards',
    })
    if (!document.getElementById('docs-ripple-style')) {
      const style = document.createElement('style')
      style.id = 'docs-ripple-style'
      style.textContent = '@keyframes docsRipple { from { opacity: 1; transform: scale(.6); } to { opacity: 0; transform: scale(2.5); } }'
      document.head.appendChild(style)
    }
    document.body.appendChild(ring)
    setTimeout(() => ring.remove(), 650)
  }, { x, y })
}

async function focusTarget(target: Locator) {
  await target.evaluate(element => {
    const html = element as HTMLElement
    html.dataset.docsOriginalBoxShadow = html.style.boxShadow
    html.style.boxShadow = '0 0 0 4px rgba(8,119,185,.26)'
    html.style.transition = 'box-shadow 180ms ease'
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

async function zoomTarget(target: Locator) {
  const box = await target.boundingBox()
  if (!box) return
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await target.page().evaluate(({ x, y }) => {
    const app = document.getElementById('app')
    if (!app) return
    app.style.transformOrigin = `${x}px ${y}px`
    app.style.transition = 'transform 340ms cubic-bezier(.22,.8,.25,1)'
    app.style.willChange = 'transform'
    app.style.transform = 'scale(1.14)'
  }, { x, y })
  await target.page().waitForTimeout(360)
}

async function resetZoom(page: Page) {
  await page.evaluate(() => {
    const app = document.getElementById('app')
    if (app) app.style.transform = 'scale(1)'
  })
  await page.waitForTimeout(360)
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
      bottom: '26px',
      transform: 'translateX(-50%)',
      zIndex: '2147483645',
      maxWidth: '780px',
      padding: '11px 18px',
      border: '1px solid rgba(255,255,255,.12)',
      borderRadius: '9px',
      background: 'rgba(11,12,14,.90)',
      boxShadow: '0 12px 36px rgba(0,0,0,.20)',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '16px',
      fontWeight: '560',
      lineHeight: '1.4',
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

async function demoClick(target: Locator, zoom = false) {
  await moveCursor(target)
  await focusTarget(target)
  if (zoom) await zoomTarget(target)
  await clickRipple(target)
  await target.click()
  await releaseTarget(target)
  await target.page().waitForTimeout(420)
  if (zoom) await resetZoom(target.page())
}

async function demoType(target: Locator, text: string) {
  await moveCursor(target)
  await focusTarget(target)
  await target.click()
  await target.fill('')
  await target.pressSequentially(text, { delay: 24 })
  await releaseTarget(target)
  await target.page().waitForTimeout(180)
}

async function showOutro(page: Page) {
  await clearCaption(page)
  await page.evaluate(() => document.getElementById('docs-demo-cursor')?.remove())
  await page.evaluate(() => {
    const app = document.getElementById('app')
    if (app) {
      app.style.transition = 'opacity 2.2s ease'
      app.style.opacity = '0'
    }

    const outro = document.createElement('div')
    outro.id = 'docs-demo-outro'
    outro.innerHTML = '<img src="/logo-dark.png" alt="Soluciones Radicales" />'
    Object.assign(outro.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'grid',
      placeItems: 'center',
      background: 'radial-gradient(circle at center, rgba(8,119,185,.13), transparent 35rem), #0b0c0e',
      opacity: '0',
      transition: 'opacity 2.4s ease',
      pointerEvents: 'none',
    })
    const image = outro.querySelector('img') as HTMLImageElement
    Object.assign(image.style, {
      width: '320px',
      maxWidth: '58vw',
      opacity: '0',
      transform: 'scale(.94)',
      transition: 'opacity 2.4s ease, transform 2.4s ease',
    })
    document.body.appendChild(outro)

    requestAnimationFrame(() => {
      outro.style.opacity = '1'
      image.style.opacity = '1'
      image.style.transform = 'scale(1)'
    })
  })
  await page.waitForTimeout(3_000)
}

test('video: crear un producto en Catálogos MIP', async ({ page }) => {
  await setupDemo(page)
  const startedAt = Date.now()
  const timeline: { narration: Array<{ id: string; startMs: number }> } = { narration: [] }

  await showIntro(page)

  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await installRecordingUi(page)
  await page.waitForTimeout(500)

  async function narrate(id: string, action: () => Promise<void>) {
    const startMs = Date.now() - startedAt
    timeline.narration.push({ id, startMs })
    await showCaption(page, segmentText(id))
    await page.waitForTimeout(320)
    await action()
    const elapsed = Date.now() - startedAt - startMs
    const minimum = segmentDuration(id) + 260
    if (elapsed < minimum) await page.waitForTimeout(minimum - elapsed)
    await clearCaption(page)
    await page.waitForTimeout(160)
  }

  const catalogsLink = page.getByRole('link', { name: /Catálogos MIP/ })
  await narrate('open-catalogs', async () => {
    await demoClick(catalogsLink, true)
    await expect(page.getByRole('button', { name: 'Nuevo producto', exact: true })).toBeVisible()
  })

  const newProduct = page.getByRole('button', { name: 'Nuevo producto', exact: true })
  await narrate('new-product', async () => {
    await demoClick(newProduct, true)
  })

  const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true })
  await expect(dialog).toBeVisible()

  await narrate('basic-info', async () => {
    await demoType(dialog.getByLabel('Nombre comercial'), 'Producto demostración')
    await demoType(dialog.getByLabel('Principio activo / composición'), 'Cipermetrina 40%')
    await demoType(dialog.getByLabel('Dosis de aplicación'), '10 ml / L')
  })

  await narrate('pests', async () => {
    await demoClick(dialog.getByRole('button', { name: 'Plagas que controla', exact: true }), true)
    await demoClick(dialog.getByLabel('Todos los insectos rastreros', { exact: true }))
    await demoClick(dialog.getByRole('button', { name: 'Listo', exact: true }))
  })

  await narrate('method', async () => {
    const methodsButton = dialog.getByRole('button', { name: 'Métodos de aplicación', exact: true })
    await demoClick(methodsButton, true)
    await demoClick(dialog.getByRole('option', { name: 'Aspersión', exact: true }))
    await demoClick(methodsButton)
  })

  await narrate('save', async () => {
    await demoClick(dialog.getByRole('button', { name: 'Crear producto', exact: true }), true)
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Producto demostración', exact: true })).toBeVisible()
  })

  await narrate('done', async () => {
    await page.waitForTimeout(500)
  })

  await showOutro(page)

  mkdirSync(resolve(process.cwd(), 'docs-media'), { recursive: true })
  writeFileSync(
    resolve(process.cwd(), 'docs-media/timeline.json'),
    JSON.stringify({ ...timeline, durationMs: Date.now() - startedAt }, null, 2) + '\n',
  )
})
