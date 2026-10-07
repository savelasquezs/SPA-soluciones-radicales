import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Locator, Page } from '@playwright/test'

export type NarrationSegment = { id: string; text: string }
export type NarrationContent = { title: string; subtitle: string; segments: NarrationSegment[] }
export type AudioTimings = { segments?: Record<string, { durationMs?: number }> }

type DocumentationVideoOptions = {
  page: Page
  narration: NarrationContent
  audioTimings: AudioTimings
}

type Timeline = {
  narration: Array<{ id: string; startMs: number }>
}

const logoUrl = 'http://127.0.0.1:5174/logo-light.png'

export function createDocumentationVideo({ page, narration, audioTimings }: DocumentationVideoOptions) {
  const startedAt = Date.now()
  const timeline: Timeline = { narration: [] }

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

  async function showIntro(): Promise<void> {
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
              background: #07131d;
              color: #f7fafc;
              font-family: Inter, ui-sans-serif, system-ui, sans-serif;
            }
            body::before,
            body::after {
              content: '';
              position: fixed;
              pointer-events: none;
            }
            body::before {
              inset: 28px;
              border: 1px solid rgba(255,255,255,.08);
              border-radius: 20px;
            }
            body::after {
              width: 168px;
              height: 8px;
              left: 50%;
              bottom: 48px;
              transform: translateX(-50%);
              border-radius: 999px;
              background: linear-gradient(90deg, #0877B9 0 62%, #5B8F18 62% 100%);
            }
            main {
              display: grid;
              width: min(900px, 84vw);
              justify-items: center;
              gap: 18px;
              text-align: center;
              animation: intro 540ms cubic-bezier(.22,.8,.25,1) both;
            }
            .brand {
              width: min(430px, 64vw);
              max-height: 116px;
              object-fit: contain;
              margin-bottom: 12px;
            }
            .eyebrow {
              color: #9eabb8;
              font-size: 13px;
              font-weight: 650;
              letter-spacing: .14em;
              text-transform: uppercase;
            }
            h1 {
              max-width: 860px;
              margin: 0;
              font-size: 52px;
              line-height: 1.05;
              font-weight: 690;
              letter-spacing: -.035em;
            }
            p {
              margin: 0;
              color: #c9d2db;
              font-size: 21px;
              line-height: 1.35;
            }
            @keyframes intro {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
          </style>
        </head>
        <body>
          <main>
            <img class="brand" src="${logoUrl}" alt="Soluciones Radicales" />
            <div class="eyebrow">Manual de usuario · Catálogos MIP</div>
            <h1>${narration.title}</h1>
            <p>${narration.subtitle}</p>
          </main>
        </body>
      </html>
    `)
    await page.waitForTimeout(2_600)
  }

  async function installRecordingUi(): Promise<void> {
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

  async function moveCursor(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded()
    const box = await target.boundingBox()
    if (!box) return
    const x = box.x + Math.min(box.width * 0.58, Math.max(10, box.width - 10))
    const y = box.y + Math.min(box.height * 0.56, Math.max(10, box.height - 10))
    await page.evaluate(({ x, y }) => {
      const cursor = document.getElementById('docs-demo-cursor')
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
    }, { x, y })
    await page.waitForTimeout(380)
  }

  async function clickRipple(target: Locator): Promise<void> {
    const box = await target.boundingBox()
    if (!box) return
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.evaluate(({ x, y }) => {
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

  async function focusTarget(target: Locator): Promise<void> {
    await target.evaluate(element => {
      const html = element as HTMLElement
      html.dataset.docsOriginalBoxShadow = html.style.boxShadow
      html.style.boxShadow = '0 0 0 4px rgba(8,119,185,.25)'
      html.style.transition = 'box-shadow 150ms ease'
    })
  }

  async function releaseTarget(target: Locator): Promise<void> {
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

  async function zoom(target: Locator, scale = 1.035): Promise<void> {
    await target.evaluate((element, factor) => {
      const html = element as HTMLElement
      html.dataset.docsOriginalTransform = html.style.transform
      html.dataset.docsOriginalZIndex = html.style.zIndex
      html.dataset.docsOriginalPosition = html.style.position
      html.style.position = html.style.position || 'relative'
      html.style.zIndex = '20'
      html.style.transformOrigin = 'center center'
      html.style.transition = 'transform 260ms cubic-bezier(.22,.8,.25,1)'
      html.style.transform = `scale(${factor})`
    }, scale)
    await page.waitForTimeout(320)
  }

  async function resetZoom(target: Locator): Promise<void> {
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
      await page.waitForTimeout(260)
    } catch {
      // El elemento puede desaparecer al cerrar una sección.
    }
  }

  async function showCaption(text: string): Promise<void> {
    await page.evaluate(({ text }) => {
      document.getElementById('docs-demo-caption')?.remove()
      const caption = document.createElement('div')
      caption.id = 'docs-demo-caption'
      caption.textContent = text
      Object.assign(caption.style, {
        position: 'fixed',
        left: '50%',
        bottom: '20px',
        transform: 'translateX(-50%)',
        zIndex: '2147483645',
        width: 'min(900px, calc(100vw - 64px))',
        padding: '11px 18px',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '10px',
        background: 'rgba(7,19,29,.94)',
        boxShadow: '0 12px 30px rgba(0,0,0,.22)',
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '15px',
        fontWeight: '560',
        lineHeight: '1.42',
        textAlign: 'center',
        pointerEvents: 'none',
        backdropFilter: 'blur(6px)',
      })
      document.body.appendChild(caption)
    }, { text })
  }

  async function clearCaption(): Promise<void> {
    await page.evaluate(() => document.getElementById('docs-demo-caption')?.remove())
  }

  async function narrate(id: string, action: () => Promise<void> = async () => {}): Promise<void> {
    const startMs = Date.now() - startedAt
    timeline.narration.push({ id, startMs })
    await showCaption(segmentText(id))
    await page.waitForTimeout(120)
    await action()
    const elapsed = Date.now() - startedAt - startMs
    const minimum = segmentDuration(id) + 140
    if (elapsed < minimum) await page.waitForTimeout(minimum - elapsed)
    await clearCaption()
    await page.waitForTimeout(90)
  }

  async function click(target: Locator): Promise<void> {
    await moveCursor(target)
    await focusTarget(target)
    await clickRipple(target)
    await target.click()
    await releaseTarget(target)
    await page.waitForTimeout(260)
  }

  async function type(target: Locator, text: string): Promise<void> {
    await moveCursor(target)
    await focusTarget(target)
    await target.click()
    await target.fill('')
    await target.pressSequentially(text, { delay: 18 })
    await releaseTarget(target)
    await page.waitForTimeout(100)
  }

  async function uploadFile(button: Locator, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await moveCursor(button)
    await focusTarget(button)
    const chooserPromise = page.waitForEvent('filechooser')
    await clickRipple(button)
    await button.click()
    const chooser = await chooserPromise
    await chooser.setFiles(file)
    await releaseTarget(button)
    await page.waitForTimeout(280)
  }

  async function showOutro(): Promise<void> {
    await clearCaption()
    await page.evaluate(() => document.getElementById('docs-demo-cursor')?.remove())
    await page.evaluate(() => {
      const app = document.getElementById('app')
      if (app) {
        app.style.transition = 'opacity 700ms ease'
        app.style.opacity = '0'
      }

      const outro = document.createElement('div')
      outro.id = 'docs-demo-outro'
      outro.innerHTML = `
        <div class="outro-frame"></div>
        <main>
          <img src="/logo-light.png" alt="Soluciones Radicales" />
          <div class="outro-rule"></div>
          <p>Manual de usuario</p>
        </main>
      `
      Object.assign(outro.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        display: 'grid',
        placeItems: 'center',
        background: '#07131d',
        opacity: '0',
        transition: 'opacity 800ms ease',
        pointerEvents: 'none',
        fontFamily: 'Inter, system-ui, sans-serif',
      })
      const frame = outro.querySelector('.outro-frame') as HTMLElement
      Object.assign(frame.style, {
        position: 'absolute',
        inset: '28px',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: '20px',
      })
      const main = outro.querySelector('main') as HTMLElement
      Object.assign(main.style, {
        display: 'grid',
        justifyItems: 'center',
        gap: '18px',
        opacity: '0',
        transform: 'translateY(8px)',
        transition: 'opacity 850ms ease 120ms, transform 850ms cubic-bezier(.22,.8,.25,1) 120ms',
      })
      const image = outro.querySelector('img') as HTMLImageElement
      Object.assign(image.style, { width: '430px', maxWidth: '64vw', maxHeight: '116px', objectFit: 'contain' })
      const rule = outro.querySelector('.outro-rule') as HTMLElement
      Object.assign(rule.style, {
        width: '168px',
        height: '8px',
        borderRadius: '999px',
        background: 'linear-gradient(90deg, #0877B9 0 62%, #5B8F18 62% 100%)',
      })
      const copy = outro.querySelector('p') as HTMLElement
      Object.assign(copy.style, {
        margin: '0',
        color: '#c9d2db',
        fontSize: '15px',
        fontWeight: '650',
        letterSpacing: '.12em',
        textTransform: 'uppercase',
      })
      document.body.appendChild(outro)

      requestAnimationFrame(() => {
        outro.style.opacity = '1'
        main.style.opacity = '1'
        main.style.transform = 'translateY(0)'
      })
    })
    await page.waitForTimeout(2_600)
  }

  function saveTimeline(): void {
    const expected = narration.segments.map(segment => segment.id)
    const recorded = timeline.narration.map(segment => segment.id)
    if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
      throw new Error(
        `La línea de tiempo no coincide con el guion. Esperado: ${expected.join(', ')}. Grabado: ${recorded.join(', ')}.`,
      )
    }

    mkdirSync(resolve(process.cwd(), 'docs-media'), { recursive: true })
    writeFileSync(
      resolve(process.cwd(), 'docs-media/timeline.json'),
      JSON.stringify({ ...timeline, durationMs: Date.now() - startedAt }, null, 2) + '\n',
    )
  }

  return {
    click,
    installRecordingUi,
    narrate,
    resetZoom,
    saveTimeline,
    showIntro,
    showOutro,
    type,
    uploadFile,
    zoom,
  }
}
