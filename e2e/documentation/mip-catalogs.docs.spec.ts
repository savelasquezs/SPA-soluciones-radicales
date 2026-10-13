import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

type NarrationSegment = { id: string; text: string }
type NarrationContent = { title: string; subtitle: string; segments: NarrationSegment[] }
type AudioTimings = { segments?: Record<string, { durationMs?: number }> }
type SceneClock = { durationMs: number; until: (fraction: number) => Promise<void> }
type DemoController = {
  finishCreate: () => void
  waitForCreateStarted: () => Promise<void>
}
type DemoCatalogItem = {
  id: string
  clave: string
  nombre: string
  clasificacion: string | null
  categoriaProducto: string | null
  activo: boolean
  version: number
}
type DemoProduct = {
  id: string
  nombre: string
  principioActivo: string
  dosisAplicacion: string
  registroSanitario: string | null
  gradoToxicologico: string | null
  fabricante: string | null
  antidoto: string | null
  fichaTecnicaStoragePath: string | null
  categorias: string[]
  metodos: DemoCatalogItem[]
  plagas: DemoCatalogItem[]
  activo: boolean
  version: number
}

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
const createdProductId = '10000000-0000-4000-8000-000000000099'

const methods: DemoCatalogItem[] = [
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

const pests: DemoCatalogItem[] = [
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

const existingProduct: DemoProduct = {
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
  return Math.max(2_000, Math.round(segmentText(id).length * 58))
}

async function setupDemo(page: Page): Promise<DemoController> {
  const products: DemoProduct[] = [structuredClone(existingProduct)]
  let releaseCreate: (() => void) | null = null
  let markCreateStarted: (() => void) | null = null
  let createReleased = false
  const createGate = new Promise<void>(resolve => { releaseCreate = resolve })
  const createStarted = new Promise<void>(resolve => { markCreateStarted = resolve })

  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark')

    class DemoWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onmessageerror: (() => void) | null = null

      postMessage(message: { file?: File }): void {
        setTimeout(() => {
          this.onmessage?.({ data: { ok: true, file: message.file } } as MessageEvent)
        }, 40)
      }

      terminate(): void {
        // La demostración conserva el archivo sin ejecutar compresión real.
      }
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: DemoWorker,
    })

    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: () => {
        const location: Record<string, unknown> = {}
        Object.defineProperty(location, 'href', {
          configurable: true,
          set: () => {
            document.getElementById('docs-technical-sheet')?.remove()
            const overlay = document.createElement('dialog')
            overlay.id = 'docs-technical-sheet'
            overlay.setAttribute('aria-label', 'Ficha técnica abierta en una nueva pestaña')
            overlay.innerHTML = `
              <header class="docs-sheet-browser">
                <div class="docs-sheet-tab"><span></span> ficha-tecnica-demo.pdf</div>
                <div class="docs-sheet-address">Archivo privado · vista autorizada</div>
              </header>
              <main class="docs-sheet-stage">
                <article class="docs-sheet-page">
                  <p class="docs-sheet-kicker">FICHA TÉCNICA</p>
                  <h1>Producto demostración</h1>
                  <div class="docs-sheet-rule"></div>
                  <dl>
                    <div><dt>Principio activo</dt><dd>Cipermetrina 40%</dd></div>
                    <div><dt>Registro sanitario</dt><dd>RGSP-DEMO-001</dd></div>
                    <div><dt>Fabricante</dt><dd>Laboratorio de demostración</dd></div>
                    <div><dt>Dosis de aplicación</dt><dd>10 ml / L</dd></div>
                  </dl>
                  <p class="docs-sheet-note">Documento ficticio preparado para el manual de usuario.</p>
                </article>
              </main>
              <footer>Archivo abierto en una nueva pestaña</footer>
            `
            const style = document.createElement('style')
            style.id = 'docs-technical-sheet-style'
            style.textContent = `
              #docs-technical-sheet { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; display: grid; grid-template-rows: auto 1fr auto; background: #11151b; color: #15202b; font-family: Inter, ui-sans-serif, system-ui, sans-serif; animation: docsSheetIn 260ms ease both; }
              #docs-technical-sheet::backdrop { background: #0b0f14; }
              .docs-sheet-browser { display: grid; gap: 10px; padding: 12px 18px; background: #1b2129; color: #e8edf3; border-bottom: 1px solid rgba(255,255,255,.08); }
              .docs-sheet-tab { display: inline-flex; align-items: center; width: fit-content; gap: 9px; padding: 8px 14px; border-radius: 9px 9px 0 0; background: #282f38; font-size: 14px; }
              .docs-sheet-tab span { width: 9px; height: 9px; border-radius: 50%; background: #5b8f18; }
              .docs-sheet-address { max-width: 920px; padding: 9px 14px; border-radius: 8px; background: #10141a; color: #aeb8c4; font-size: 13px; }
              .docs-sheet-stage { display: grid; place-items: center; overflow: hidden; padding: 34px; background: #242b34; }
              .docs-sheet-page { width: min(820px, 76vw); min-height: 660px; padding: 64px 72px; border-radius: 4px; background: #fff; box-shadow: 0 24px 65px rgba(0,0,0,.34); }
              .docs-sheet-kicker { margin: 0 0 14px; color: #0877b9; font-size: 15px; font-weight: 750; letter-spacing: .14em; }
              .docs-sheet-page h1 { margin: 0; font-size: 38px; line-height: 1.12; letter-spacing: -.025em; }
              .docs-sheet-rule { width: 96px; height: 4px; margin: 24px 0 36px; border-radius: 999px; background: linear-gradient(90deg, #0877b9 0 58%, #5b8f18 58%); }
              .docs-sheet-page dl { display: grid; gap: 24px; margin: 0; }
              .docs-sheet-page dl > div { display: grid; grid-template-columns: 190px 1fr; gap: 28px; padding-bottom: 18px; border-bottom: 1px solid #e5e9ee; }
              .docs-sheet-page dt { color: #66717e; font-size: 15px; }
              .docs-sheet-page dd { margin: 0; font-size: 17px; font-weight: 650; }
              .docs-sheet-note { margin: 44px 0 0; color: #7b8590; font-size: 14px; }
              #docs-technical-sheet > footer { padding: 11px 18px; background: #1b2129; color: #cbd3dc; font-size: 13px; text-align: center; }
              @keyframes docsSheetIn { from { opacity: 0; transform: scale(.995); } to { opacity: 1; transform: scale(1); } }
            `
            document.getElementById(style.id)?.remove()
            document.head.appendChild(style)
            document.body.appendChild(overlay)
            overlay.showModal()
          },
        })
        return {
          opener: null,
          location,
          close: () => {
            const sheet = document.getElementById('docs-technical-sheet') as HTMLDialogElement | null
            if (sheet?.open) sheet.close()
            sheet?.remove()
          },
        }
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
    await new Promise(resolve => setTimeout(resolve, 650))
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
      await route.fulfill({ json: { url: 'https://documents.example.test/ficha-tecnica-demo.pdf' } })
      return
    }

    if (path === '/api/mip/products' && methodName === 'GET') {
      const active = url.searchParams.get('active') !== 'false'
      await route.fulfill({ json: products.filter(row => row.activo === active) })
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

      markCreateStarted?.()
      await createGate
      const created: DemoProduct = {
        id: createdProductId,
        nombre: body.nombre,
        principioActivo: body.principioActivo,
        dosisAplicacion: body.dosisAplicacion,
        registroSanitario: body.registroSanitario,
        gradoToxicologico: body.gradoToxicologico,
        fabricante: body.fabricante,
        antidoto: body.antidoto,
        fichaTecnicaStoragePath: body.fichaTecnicaStoragePath,
        categorias: body.categorias,
        metodos: methods.filter(item => body.metodoIds.includes(item.id)),
        plagas: pests.filter(item => body.plagaIds.includes(item.id)),
        activo: true,
        version: 1,
      }
      products.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    const stateMatch = path.match(/^\/api\/mip\/products\/([^/]+)\/state$/)
    if (stateMatch && methodName === 'PATCH') {
      const body = request.postDataJSON() as { activo: boolean }
      const product = products.find(item => item.id === decodeURIComponent(stateMatch[1]))
      if (!product) {
        await route.fulfill({ status: 404, json: { error: 'Producto no encontrado.' } })
        return
      }
      await new Promise(resolve => setTimeout(resolve, 480))
      product.activo = body.activo
      product.version += 1
      await route.fulfill({ json: product })
      return
    }

    await route.fulfill({ status: 404, json: { error: `Ruta de demostración no preparada: ${path}` } })
  })

  return {
    finishCreate: () => {
      if (createReleased) return
      createReleased = true
      releaseCreate?.()
    },
    waitForCreateStarted: () => createStarted,
  }
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
            background: #0b0f14;
            color: #f4f7fa;
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          }
          main {
            display: grid;
            width: min(980px, 82vw);
            justify-items: center;
            gap: 18px;
            text-align: center;
            animation: intro 560ms cubic-bezier(.22,.8,.25,1) both;
          }
          .brand { width: 320px; height: 144px; object-fit: contain; margin-bottom: 4px; }
          .eyebrow { color: #aeb8c4; font-size: 14px; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; }
          .accent { width: 120px; height: 4px; border-radius: 999px; background: linear-gradient(90deg, #0877b9 0 58%, #5b8f18 58%); }
          h1 { margin: 10px 0 0; font-size: 58px; line-height: 1.05; font-weight: 680; letter-spacing: -.035em; }
          p { margin: 0; color: #c6ced8; font-size: 23px; line-height: 1.4; }
          @keyframes intro {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
      </head>
      <body>
        <main>
          <img class="brand" src="http://127.0.0.1:5174/logo-dark.png" alt="Soluciones Radicales" />
          <div class="eyebrow">Manual de usuario</div>
          <div class="accent"></div>
          <h1>${narration.title}</h1>
          <p>${narration.subtitle}</p>
        </main>
      </body>
    </html>
  `)
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
      transform: 'translate(960px, 540px)',
      transition: 'transform 340ms cubic-bezier(.22,.8,.25,1)',
      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.28))',
      pointerEvents: 'none',
    })
    document.body.appendChild(cursor)
  })
}

async function promoteRecordingUi(page: Page) {
  await page.evaluate(() => {
    const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
    const host = openDialogs.at(-1) ?? document.body
    const cursor = document.getElementById('docs-demo-cursor')
    const caption = document.getElementById('docs-demo-caption')
    if (cursor && cursor.parentElement !== host) host.appendChild(cursor)
    if (caption && caption.parentElement !== host) host.appendChild(caption)
  })
}

async function moveCursor(target: Locator) {
  await promoteRecordingUi(target.page())
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) return
  const x = box.x + Math.min(box.width * 0.58, Math.max(10, box.width - 10))
  const y = box.y + Math.min(box.height * 0.56, Math.max(10, box.height - 10))
  await target.page().evaluate(({ x, y }) => {
    const cursor = document.getElementById('docs-demo-cursor')
    if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
  }, { x, y })
  await target.page().waitForTimeout(360)
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
      border: '2px solid rgba(8,119,185,.95)',
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
    const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
    ;(openDialogs.at(-1) ?? document.body).appendChild(ring)
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
    if (await target.count() === 0) return
    await target.evaluate(element => {
      const html = element as HTMLElement
      html.style.boxShadow = html.dataset.docsOriginalBoxShadow ?? ''
      delete html.dataset.docsOriginalBoxShadow
    })
  } catch {
    // El elemento puede desaparecer después de navegar o confirmar un diálogo.
  }
}

async function localZoom(target: Locator, scale = 1.035) {
  await target.evaluate((element, scaleValue) => {
    const html = element as HTMLElement
    html.dataset.docsOriginalTransform = html.style.transform
    html.dataset.docsOriginalZIndex = html.style.zIndex
    html.dataset.docsOriginalPosition = html.style.position
    html.style.position = html.style.position || 'relative'
    html.style.zIndex = '20'
    html.style.transformOrigin = 'center center'
    html.style.transition = 'transform 240ms cubic-bezier(.22,.8,.25,1)'
    html.style.transform = `scale(${scaleValue})`
  }, scale)
  await target.page().waitForTimeout(260)
}

async function resetLocalZoom(target: Locator) {
  try {
    if (await target.count() === 0) return
    await target.evaluate(element => {
      const html = element as HTMLElement
      html.style.transform = html.dataset.docsOriginalTransform ?? ''
      html.style.zIndex = html.dataset.docsOriginalZIndex ?? ''
      html.style.position = html.dataset.docsOriginalPosition ?? ''
      delete html.dataset.docsOriginalTransform
      delete html.dataset.docsOriginalZIndex
      delete html.dataset.docsOriginalPosition
    })
    await target.page().waitForTimeout(240)
  } catch {
    // El elemento puede desaparecer al cerrar una sección.
  }
}

async function highlightRequiredMarks(dialog: Locator) {
  const marks = dialog.locator('.base-field__required')
  await marks.evaluateAll(elements => {
    for (const element of elements) {
      const html = element as HTMLElement
      html.style.transition = 'filter 160ms ease, transform 160ms ease'
      html.style.filter = 'drop-shadow(0 0 5px rgba(220,38,38,.55))'
      html.style.transform = 'scale(1.18)'
    }
  })
  await dialog.page().waitForTimeout(520)
  await marks.evaluateAll(elements => {
    for (const element of elements) {
      const html = element as HTMLElement
      html.style.filter = ''
      html.style.transform = ''
    }
  })
}

async function showCaption(page: Page, text: string) {
  await page.evaluate(({ captionText }) => {
    document.getElementById('docs-demo-caption')?.remove()
    const caption = document.createElement('div')
    caption.id = 'docs-demo-caption'
    caption.textContent = captionText
    Object.assign(caption.style, {
      position: 'fixed',
      left: '50%',
      bottom: '28px',
      transform: 'translateX(-50%)',
      zIndex: '2147483645',
      width: 'max-content',
      maxWidth: '1120px',
      padding: '12px 20px',
      border: '1px solid rgba(255,255,255,.13)',
      borderRadius: '10px',
      background: 'rgba(11,15,20,.92)',
      boxShadow: '0 14px 38px rgba(0,0,0,.24)',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '18px',
      fontWeight: '570',
      lineHeight: '1.38',
      textAlign: 'center',
      pointerEvents: 'none',
      backdropFilter: 'blur(7px)',
    })
    const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
    ;(openDialogs.at(-1) ?? document.body).appendChild(caption)
  }, { captionText: text })
}

async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById('docs-demo-caption')?.remove())
}

async function demoClick(target: Locator) {
  await moveCursor(target)
  await focusTarget(target)
  await clickRipple(target)
  await target.click()
  await promoteRecordingUi(target.page())
  await releaseTarget(target)
  await target.page().waitForTimeout(260)
}

async function demoType(target: Locator, text: string) {
  await moveCursor(target)
  await focusTarget(target)
  await target.click()
  await target.fill('')
  await target.pressSequentially(text, { delay: 20 })
  await releaseTarget(target)
  await target.page().waitForTimeout(120)
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
    buffer: Buffer.from('%PDF-1.4\n% Ficha técnica ficticia\n1 0 obj\n<<>>\nendobj\n%%EOF'),
  })
  await releaseTarget(button)
  await page.waitForTimeout(300)
}

async function pointAt(target: Locator, holdMs = 720) {
  await moveCursor(target)
  await focusTarget(target)
  await target.page().waitForTimeout(holdMs)
  await releaseTarget(target)
}

async function showOutro(page: Page) {
  await clearCaption(page)
  await page.evaluate(() => document.getElementById('docs-demo-cursor')?.remove())
  await page.evaluate(() => {
    document.getElementById('docs-demo-outro')?.remove()
    const outro = document.createElement('section')
    outro.id = 'docs-demo-outro'
    outro.innerHTML = `
      <img src="/logo-dark.png" alt="Soluciones Radicales" />
      <div class="docs-outro-line"></div>
      <p>Manual de usuario</p>
    `
    Object.assign(outro.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483644',
      display: 'grid',
      placeContent: 'center',
      justifyItems: 'center',
      gap: '18px',
      background: '#0b0f14',
      color: '#c7d0da',
      opacity: '0',
      transition: 'opacity 520ms ease',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, sans-serif',
    })
    const image = outro.querySelector('img') as HTMLImageElement
    Object.assign(image.style, { width: '320px', height: '144px', objectFit: 'contain' })
    const line = outro.querySelector('.docs-outro-line') as HTMLElement
    Object.assign(line.style, {
      width: '120px',
      height: '4px',
      borderRadius: '999px',
      background: 'linear-gradient(90deg, #0877b9 0 58%, #5b8f18 58%)',
    })
    const paragraph = outro.querySelector('p') as HTMLElement
    Object.assign(paragraph.style, {
      margin: '0',
      fontSize: '15px',
      fontWeight: '650',
      letterSpacing: '.14em',
      textTransform: 'uppercase',
    })
    document.body.appendChild(outro)
    requestAnimationFrame(() => { outro.style.opacity = '1' })
  })
  await page.waitForTimeout(260)
}

test('video: gestionar productos en Catálogos MIP', async ({ page }) => {
  const demo = await setupDemo(page)
  const startedAt = Date.now()
  const timeline: { narration: Array<{ id: string; startMs: number }> } = { narration: [] }

  async function narrate(id: string, action: (clock: SceneClock) => Promise<void>) {
    const startMs = Date.now() - startedAt
    const durationMs = segmentDuration(id)
    const sceneStartedAt = Date.now()
    timeline.narration.push({ id, startMs })
    await showCaption(page, segmentText(id))

    const clock: SceneClock = {
      durationMs,
      until: async (fraction: number) => {
        const target = sceneStartedAt + Math.max(0, Math.min(1, fraction)) * durationMs
        const remaining = target - Date.now()
        if (remaining > 0) await page.waitForTimeout(remaining)
      },
    }

    await action(clock)
    const minimumEnd = sceneStartedAt + durationMs + 180
    const remaining = minimumEnd - Date.now()
    if (remaining > 0) await page.waitForTimeout(remaining)
    await clearCaption(page)
    await page.waitForTimeout(110)
  }

  await showIntro(page)
  await narrate('intro', async clock => {
    await clock.until(1)
  })

  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await installRecordingUi(page)
  await page.waitForTimeout(320)

  const catalogsLink = page.getByRole('link', { name: /Catálogos MIP/ })
  await narrate('open-catalogs', async clock => {
    await clock.until(0.34)
    await demoClick(catalogsLink)
    await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nuevo producto', exact: true })).toBeVisible()
  })

  await narrate('catalog-overview', async clock => {
    const search = page.getByRole('searchbox', { name: 'Buscar productos' })
    const activeTab = page.getByRole('button', { name: 'Activos', exact: true })
    const inactiveTab = page.getByRole('button', { name: 'Inactivos', exact: true })
    await clock.until(0.18)
    await pointAt(search, 520)
    await clock.until(0.55)
    await pointAt(activeTab, 430)
    await pointAt(inactiveTab, 430)
  })

  const newProduct = page.getByRole('button', { name: 'Nuevo producto', exact: true })
  await narrate('new-product', async clock => {
    await clock.until(0.56)
    await demoClick(newProduct)
  })

  const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true })
  await expect(dialog).toBeVisible()

  await narrate('required-fields', async clock => {
    await clock.until(0.22)
    await highlightRequiredMarks(dialog)
    await clock.until(0.84)
  })

  await narrate('product-identity', async clock => {
    await clock.until(0.12)
    await demoType(dialog.getByLabel('Nombre comercial'), 'Producto demostración')
    await clock.until(0.50)
    await demoType(dialog.getByLabel('Principio activo / composición'), 'Cipermetrina 40%')
  })

  await narrate('product-dose', async clock => {
    await clock.until(0.42)
    await demoType(dialog.getByLabel('Dosis de aplicación'), '10 ml / L')
  })

  await narrate('optional-details', async clock => {
    await clock.until(0.10)
    await demoType(dialog.getByLabel('Registro sanitario'), 'RGSP-DEMO-001')
    await clock.until(0.42)
    await demoType(dialog.getByLabel('Grado toxicológico'), 'III')
    await clock.until(0.69)
    await demoType(dialog.getByLabel('Laboratorio / fabricante'), 'Laboratorio de demostración')
  })

  await narrate('antidote', async clock => {
    await clock.until(0.34)
    await demoType(dialog.getByLabel('Antídoto'), 'Según ficha de seguridad')
  })

  const coverageButton = dialog.getByRole('button', { name: 'Plagas que controla', exact: true })
  await narrate('coverage-open', async clock => {
    await clock.until(0.28)
    await demoClick(coverageButton)
    await expect(dialog.locator('#product-coverage-options')).toBeVisible()
  })

  await narrate('coverage-category', async clock => {
    await clock.until(0.55)
    await demoClick(dialog.getByLabel('Todos los insectos rastreros', { exact: true }))
    await expect(dialog.getByText('Incluida por categoría').first()).toBeVisible()
  })

  await narrate('coverage-included', async clock => {
    const included = dialog.getByText('Incluida por categoría').first()
    await clock.until(0.24)
    await pointAt(included, 760)
    await expect(dialog.locator('#product-coverage-options')).toBeVisible()
  })

  await narrate('coverage-individual', async clock => {
    await clock.until(0.68)
    await demoClick(dialog.getByLabel('Mosca doméstica', { exact: true }))
    await expect(dialog.locator('#product-coverage-options')).toBeVisible()
  })

  await narrate('coverage-done', async clock => {
    await clock.until(0.72)
    await demoClick(dialog.getByRole('button', { name: 'Listo', exact: true }))
    await expect(dialog.locator('#product-coverage-options')).toBeHidden()
  })

  const methodsButton = dialog.getByRole('button', { name: 'Métodos de aplicación', exact: true })
  await narrate('methods-open', async clock => {
    await clock.until(0.38)
    await demoClick(methodsButton)
    await expect(dialog.getByRole('listbox', { name: 'Métodos de aplicación' })).toBeVisible()
  })

  await narrate('methods-example', async clock => {
    await clock.until(0.28)
    await demoClick(dialog.getByRole('option', { name: 'Aspersión', exact: true }))
    await clock.until(0.70)
    await demoClick(dialog.getByRole('option', { name: 'Termonebulización', exact: true }))
    await clock.until(0.96)
    await demoClick(methodsButton)
    await expect(dialog.getByRole('listbox', { name: 'Métodos de aplicación' })).toBeHidden()
  })

  const uploadButton = dialog.getByRole('button', { name: 'Adjuntar archivo', exact: true })
  await narrate('technical-sheet-intro', async clock => {
    await clock.until(0.28)
    await pointAt(uploadButton, Math.min(1_100, Math.round(clock.durationMs * 0.44)))
  })

  await narrate('technical-sheet-attach', async clock => {
    await clock.until(0.34)
    await demoFileUpload(uploadButton, page)
    await expect(dialog.getByRole('button', { name: 'ficha-tecnica-demo.pdf', exact: true })).toBeVisible()
    await clock.until(0.92)
  })

  const createButton = dialog.locator('button[form="mip-product-form"]')
  await narrate('save-product', async clock => {
    await clock.until(0.46)
    await moveCursor(createButton)
    await focusTarget(createButton)
    await clock.until(0.77)
    await clickRipple(createButton)
    await createButton.click()
    await releaseTarget(createButton)
    await demo.waitForCreateStarted()
    await expect(dialog).toBeVisible()
  })

  await narrate('saving-product', async clock => {
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('form[aria-busy="true"]')).toBeVisible()
    await clock.until(0.74)
    demo.finishCreate()
    await expect(dialog).toBeHidden()
  })

  const createdProduct = page.getByRole('button', { name: 'Producto demostración', exact: true })
  await narrate('created-product', async clock => {
    await expect(createdProduct).toBeVisible()
    await clock.until(0.18)
    await localZoom(createdProduct, 1.025)
    await clock.until(0.82)
    await resetLocalZoom(createdProduct)
  })

  await narrate('open-detail', async clock => {
    await clock.until(0.50)
    await demoClick(createdProduct)
  })

  const detailDialog = page.getByRole('dialog', { name: 'Producto demostración', exact: true })
  await expect(detailDialog).toBeVisible()
  await narrate('product-detail', async clock => {
    const details = detailDialog.locator('.mip-detail')
    await clock.until(0.18)
    await localZoom(details, 1.02)
    await clock.until(0.78)
    await resetLocalZoom(details)
  })

  const viewSheet = detailDialog.getByRole('button', { name: 'Ver ficha técnica', exact: true })
  await narrate('open-technical-sheet', async clock => {
    await clock.until(0.46)
    await demoClick(viewSheet)
    await expect(page.locator('#docs-technical-sheet')).toBeVisible()
    await promoteRecordingUi(page)
    await clock.until(1)
  })

  await narrate('row-actions', async clock => {
    await clock.until(0.14)
    await page.evaluate(() => {
      const sheet = document.getElementById('docs-technical-sheet') as HTMLDialogElement | null
      if (sheet?.open) sheet.close()
      sheet?.remove()
    })
    await promoteRecordingUi(page)
    await page.keyboard.press('Escape')
    await promoteRecordingUi(page)
    await expect(detailDialog).toBeHidden()

    const edit = page.getByRole('button', { name: 'Editar Producto demostración', exact: true })
    const deactivate = page.getByRole('button', { name: 'Desactivar Producto demostración', exact: true })
    const remove = page.getByRole('button', { name: 'Eliminar Producto demostración', exact: true })
    await clock.until(0.40)
    await pointAt(edit, 430)
    await clock.until(0.61)
    await pointAt(deactivate, 430)
    await clock.until(0.82)
    await pointAt(remove, 430)
  })

  const deactivate = page.getByRole('button', { name: 'Desactivar Producto demostración', exact: true })
  await narrate('deactivate-product', async clock => {
    await clock.until(0.18)
    await demoClick(deactivate)
    await expect(page.getByRole('dialog', { name: 'Desactivar producto', exact: true })).toBeVisible()
  })

  const confirmation = page.getByRole('dialog', { name: 'Desactivar producto', exact: true })
  await narrate('confirm-deactivation', async clock => {
    await clock.until(0.42)
    await demoClick(confirmation.getByRole('button', { name: 'Desactivar', exact: true }))
    await expect(confirmation).toBeHidden()
    await expect(createdProduct).toBeHidden()
  })

  await narrate('inactive-product', async clock => {
    const inactiveTab = page.getByRole('button', { name: 'Inactivos', exact: true })
    await clock.until(0.46)
    await demoClick(inactiveTab)
    const inactiveProduct = page.getByRole('button', { name: 'Producto demostración', exact: true })
    await expect(inactiveProduct).toBeVisible()
    await clock.until(0.76)
    await localZoom(inactiveProduct, 1.025)
    await clock.until(0.95)
    await resetLocalZoom(inactiveProduct)
  })

  await showOutro(page)
  await narrate('outro', async clock => {
    await clock.until(1)
  })
  await page.waitForTimeout(650)

  mkdirSync(resolve(process.cwd(), 'docs-media'), { recursive: true })
  writeFileSync(
    resolve(process.cwd(), 'docs-media/timeline.json'),
    JSON.stringify({ ...timeline, durationMs: Date.now() - startedAt }, null, 2) + '\n',
  )
})
