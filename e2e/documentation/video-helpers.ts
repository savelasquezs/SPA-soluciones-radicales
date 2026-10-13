import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'

export type NarrationSegment = { id: string; text: string }
export type NarrationContent = { title: string; subtitle: string; segments: NarrationSegment[] }
export type AudioTimings = { segments?: Record<string, { durationMs?: number }> }
export type SceneClock = { durationMs: number; until: (fraction: number) => Promise<void> }

export function loadNarration(url: URL): NarrationContent {
  return JSON.parse(readFileSync(url, 'utf8')) as NarrationContent
}

export function loadAudioTimings(): AudioTimings {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), 'docs-media/audio/timings.json'), 'utf8')) as AudioTimings
  } catch {
    return {}
  }
}

export function segmentText(narration: NarrationContent, id: string): string {
  const segment = narration.segments.find(item => item.id === id)
  if (!segment) throw new Error(`No existe el segmento de narración ${id}.`)
  return segment.text
}

export function segmentDuration(narration: NarrationContent, timings: AudioTimings, id: string): number {
  const measured = timings.segments?.[id]?.durationMs
  if (typeof measured === 'number' && measured > 0) return measured
  return Math.max(2_000, Math.round(segmentText(narration, id).length * 58))
}

export async function showIntro(page: Page, narration: NarrationContent) {
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; }
          body { display: grid; place-items: center; overflow: hidden; background: #0b0f14; color: #f4f7fa; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
          main { display: grid; width: min(980px, 82vw); justify-items: center; gap: 18px; text-align: center; animation: intro 560ms cubic-bezier(.22,.8,.25,1) both; }
          .brand { width: 320px; height: 144px; object-fit: contain; margin-bottom: 4px; }
          .eyebrow { color: #aeb8c4; font-size: 14px; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; }
          .accent { width: 120px; height: 4px; border-radius: 999px; background: linear-gradient(90deg, #0877b9 0 58%, #5b8f18 58%); }
          h1 { margin: 10px 0 0; font-size: 58px; line-height: 1.05; font-weight: 680; letter-spacing: -.035em; }
          p { margin: 0; color: #c6ced8; font-size: 23px; line-height: 1.4; }
          @keyframes intro { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
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

export async function installRecordingUi(page: Page) {
  await page.evaluate(() => {
    document.getElementById('docs-demo-cursor')?.remove()
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    cursor.id = 'docs-demo-cursor'
    cursor.setAttribute('viewBox', '0 0 28 34')
    cursor.setAttribute('width', '28')
    cursor.setAttribute('height', '34')
    cursor.innerHTML = '<path d="M3 2 22 20l-9 1 5 10-5 2-5-10-6 7z" fill="#fff" stroke="#0877B9" stroke-width="2" stroke-linejoin="round"/>'
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
      transform: 'translate(960px, 540px)',
      transition: 'transform 340ms cubic-bezier(.22,.8,.25,1)',
      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.28))',
      pointerEvents: 'none',
    })
    document.body.appendChild(cursor)
  })
}

export async function promoteRecordingUi(page: Page) {
  await page.evaluate(() => {
    const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
    const host = openDialogs.at(-1) ?? document.body
    const cursor = document.getElementById('docs-demo-cursor')
    const caption = document.getElementById('docs-demo-caption')
    if (cursor && cursor.parentElement !== host) host.appendChild(cursor)
    if (caption && caption.parentElement !== host) host.appendChild(caption)
  })
}

export async function moveCursor(target: Locator) {
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
      position: 'fixed', left: `${x - 10}px`, top: `${y - 10}px`,
      width: '20px', height: '20px', zIndex: '2147483646',
      border: '2px solid rgba(8,119,185,.95)', borderRadius: '999px',
      pointerEvents: 'none', animation: 'docsRipple 480ms ease-out forwards',
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
  } catch {}
}

export async function localZoom(target: Locator, scale = 1.035) {
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

export async function resetLocalZoom(target: Locator) {
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
  } catch {}
}

export async function showCaption(page: Page, text: string) {
  await page.evaluate(({ captionText }) => {
    document.getElementById('docs-demo-caption')?.remove()
    const caption = document.createElement('div')
    caption.id = 'docs-demo-caption'
    caption.textContent = captionText
    Object.assign(caption.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
      zIndex: '2147483645', width: 'max-content', maxWidth: '1120px',
      padding: '12px 20px', border: '1px solid rgba(255,255,255,.13)',
      borderRadius: '10px', background: 'rgba(11,15,20,.92)',
      boxShadow: '0 14px 38px rgba(0,0,0,.24)', color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '18px', fontWeight: '570',
      lineHeight: '1.38', textAlign: 'center', pointerEvents: 'none', backdropFilter: 'blur(7px)',
    })
    const openDialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
    ;(openDialogs.at(-1) ?? document.body).appendChild(caption)
  }, { captionText: text })
}

export async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById('docs-demo-caption')?.remove())
}

export async function demoClick(target: Locator) {
  await moveCursor(target)
  await focusTarget(target)
  await clickRipple(target)
  await target.click()
  await promoteRecordingUi(target.page())
  await releaseTarget(target)
  await target.page().waitForTimeout(260)
}

export async function demoType(target: Locator, text: string) {
  await moveCursor(target)
  await focusTarget(target)
  await target.click()
  await target.fill('')
  await target.pressSequentially(text, { delay: 24 })
  await releaseTarget(target)
  await target.page().waitForTimeout(140)
}

export async function pointAt(target: Locator, holdMs = 720) {
  await moveCursor(target)
  await focusTarget(target)
  await target.page().waitForTimeout(holdMs)
  await releaseTarget(target)
}

export async function showOutro(page: Page) {
  await clearCaption(page)
  await page.evaluate(() => document.getElementById('docs-demo-cursor')?.remove())
  await page.evaluate(() => {
    document.getElementById('docs-demo-outro')?.remove()
    const outro = document.createElement('section')
    outro.id = 'docs-demo-outro'
    outro.innerHTML = '<img src="/logo-dark.png" alt="Soluciones Radicales" /><div class="docs-outro-line"></div><p>Manual de usuario</p>'
    Object.assign(outro.style, {
      position: 'fixed', inset: '0', zIndex: '2147483644', display: 'grid',
      placeContent: 'center', justifyItems: 'center', gap: '18px', background: '#0b0f14',
      color: '#c7d0da', opacity: '0', transition: 'opacity 520ms ease',
      pointerEvents: 'none', fontFamily: 'Inter, system-ui, sans-serif',
    })
    const image = outro.querySelector('img') as HTMLImageElement
    Object.assign(image.style, { width: '320px', height: '144px', objectFit: 'contain' })
    const line = outro.querySelector('.docs-outro-line') as HTMLElement
    Object.assign(line.style, { width: '120px', height: '4px', borderRadius: '999px', background: 'linear-gradient(90deg, #0877b9 0 58%, #5b8f18 58%)' })
    const paragraph = outro.querySelector('p') as HTMLElement
    Object.assign(paragraph.style, { margin: '0', fontSize: '15px', fontWeight: '650', letterSpacing: '.14em', textTransform: 'uppercase' })
    document.body.appendChild(outro)
    requestAnimationFrame(() => { outro.style.opacity = '1' })
  })
  await page.waitForTimeout(260)
}
