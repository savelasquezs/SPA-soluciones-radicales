import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import {
  clearCaption,
  demoClick,
  demoType,
  installRecordingUi,
  loadAudioTimings,
  loadNarration,
  localZoom,
  moveCursor,
  pointAt,
  resetLocalZoom,
  segmentDuration,
  segmentText,
  showCaption,
  showIntro,
  showOutro,
  type SceneClock,
} from './video-helpers'

type DemoTrap = {
  id: string
  clave: string
  nombre: string
  clasificacion: 'RASTREROS' | 'VOLADORES'
  categoriaProducto: null
  activo: boolean
  version: number
}

const narration = loadNarration(new URL('./mip-traps.narration.json', import.meta.url))
const audioTimings = loadAudioTimings()

const createdTrapId = '41000000-0000-4000-8000-000000000099'
const traps: DemoTrap[] = [
  {
    id: '41000000-0000-4000-8000-000000000001',
    clave: 'TRAMPA_ADHESIVA',
    nombre: 'Trampa adhesiva',
    clasificacion: 'RASTREROS',
    categoriaProducto: null,
    activo: true,
    version: 1,
  },
  {
    id: '41000000-0000-4000-8000-000000000002',
    clave: 'LAMPARA_UV',
    nombre: 'Lámpara UV',
    clasificacion: 'VOLADORES',
    categoriaProducto: null,
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

async function setupDemo(page: Page) {
  const records = traps.map(item => structuredClone(item))

  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark')
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

  await page.route('https://api.example.test/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }

    if (path === '/api/session') {
      await route.fulfill({ json: profile })
      return
    }

    if (path === '/api/mip/options') {
      await route.fulfill({ json: { methods: [], pests: [] } })
      return
    }

    if (path === '/api/mip/products' && method === 'GET') {
      await route.fulfill({ json: [] })
      return
    }

    if (path === '/api/mip/traps' && method === 'GET') {
      const active = url.searchParams.get('active') !== 'false'
      await route.fulfill({ json: records.filter(row => row.activo === active) })
      return
    }

    if (path === '/api/mip/traps' && method === 'POST') {
      const body = request.postDataJSON() as {
        nombre: string
        clasificacion: 'RASTREROS' | 'VOLADORES'
      }
      await new Promise(resolve => setTimeout(resolve, 520))
      const created: DemoTrap = {
        id: createdTrapId,
        clave: 'TRAMPA_DEMO',
        nombre: body.nombre,
        clasificacion: body.clasificacion,
        categoriaProducto: null,
        activo: true,
        version: 1,
      }
      records.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    const itemMatch = path.match(/^\/api\/mip\/traps\/([^/]+)$/)
    if (itemMatch && method === 'PATCH') {
      const id = decodeURIComponent(itemMatch[1])
      const body = request.postDataJSON() as {
        nombre: string
        clasificacion: 'RASTREROS' | 'VOLADORES'
      }
      const trap = records.find(row => row.id === id)
      if (!trap) {
        await route.fulfill({ status: 404, json: { error: 'Trampa no encontrada.' } })
        return
      }
      await new Promise(resolve => setTimeout(resolve, 480))
      trap.nombre = body.nombre
      trap.clasificacion = body.clasificacion
      trap.version += 1
      await route.fulfill({ json: trap })
      return
    }

    const stateMatch = path.match(/^\/api\/mip\/traps\/([^/]+)\/state$/)
    if (stateMatch && method === 'PATCH') {
      const id = decodeURIComponent(stateMatch[1])
      const body = request.postDataJSON() as { activo: boolean }
      const trap = records.find(row => row.id === id)
      if (!trap) {
        await route.fulfill({ status: 404, json: { error: 'Trampa no encontrada.' } })
        return
      }
      await new Promise(resolve => setTimeout(resolve, 460))
      trap.activo = body.activo
      trap.version += 1
      await route.fulfill({ json: trap })
      return
    }

    if (itemMatch && method === 'DELETE') {
      const id = decodeURIComponent(itemMatch[1])
      const index = records.findIndex(row => row.id === id)
      if (index < 0) {
        await route.fulfill({ status: 404, json: { error: 'Trampa no encontrada.' } })
        return
      }
      await new Promise(resolve => setTimeout(resolve, 420))
      records.splice(index, 1)
      await route.fulfill({ status: 204, body: '' })
      return
    }

    await route.fulfill({ status: 404, json: { error: `Ruta de demostración no preparada: ${path}` } })
  })
}

test('video: gestionar trampas en Catálogos MIP', async ({ page }) => {
  await setupDemo(page)
  const startedAt = Date.now()
  const timeline: { narration: Array<{ id: string; startMs: number }> } = { narration: [] }

  async function narrate(id: string, action: (clock: SceneClock) => Promise<void>) {
    const startMs = Date.now() - startedAt
    const durationMs = segmentDuration(narration, audioTimings, id)
    const sceneStartedAt = Date.now()
    timeline.narration.push({ id, startMs })
    await showCaption(page, segmentText(narration, id))

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

  await showIntro(page, narration)
  await narrate('intro', async clock => {
    await clock.until(1)
  })

  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await installRecordingUi(page)
  await page.waitForTimeout(320)

  const catalogsLink = page.getByRole('link', { name: /Catálogos MIP/ })
  await narrate('open-catalogs', async clock => {
    await clock.until(0.38)
    await demoClick(catalogsLink)
    await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible()
  })

  const trapsTab = page.getByRole('button', { name: 'Trampas', exact: true })
  await narrate('open-traps', async clock => {
    await clock.until(0.42)
    await demoClick(trapsTab)
    await expect(page.getByRole('heading', { name: 'Trampas', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nueva trampa', exact: true })).toBeVisible()
  })

  await narrate('trap-list', async clock => {
    const activeTab = page.getByRole('button', { name: 'Activas', exact: true })
    const inactiveTab = page.getByRole('button', { name: 'Inactivas', exact: true })
    const existing = page.getByRole('button', { name: 'Trampa adhesiva', exact: true })
    await clock.until(0.12)
    await pointAt(activeTab, 420)
    await pointAt(inactiveTab, 420)
    await clock.until(0.54)
    await pointAt(existing, 520)
    const actions = page.getByRole('button', { name: 'Editar Trampa adhesiva', exact: true })
    await clock.until(0.78)
    await pointAt(actions, 420)
  })

  const search = page.getByRole('searchbox', { name: 'Buscar trampas', exact: true })
  const monitoring = page.locator('.mip-filter select')
  await narrate('trap-search-filter', async clock => {
    await clock.until(0.18)
    await pointAt(search, 460)
    await clock.until(0.50)
    await moveCursor(monitoring)
    await monitoring.selectOption('RASTREROS')
    await expect(page.getByRole('button', { name: 'Trampa adhesiva', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lámpara UV', exact: true })).toBeHidden()
    await clock.until(0.83)
    await monitoring.selectOption('')
    await expect(page.getByRole('button', { name: 'Lámpara UV', exact: true })).toBeVisible()
  })

  await narrate('new-trap', async clock => {
    const button = page.getByRole('button', { name: 'Nueva trampa', exact: true })
    await clock.until(0.48)
    await demoClick(button)
  })

  const createDialog = page.getByRole('dialog', { name: 'Nueva trampa', exact: true })
  await expect(createDialog).toBeVisible()

  await narrate('trap-name', async clock => {
    await clock.until(0.32)
    await demoType(createDialog.getByRole('textbox', { name: 'Nombre', exact: true }), 'Trampa de demostración')
  })

  const rastreros = createDialog.getByRole('radio', { name: 'Rastreros', exact: true })
  const voladores = createDialog.getByRole('radio', { name: 'Voladores', exact: true })
  await narrate('monitoring-intro', async clock => {
    await clock.until(0.18)
    await pointAt(rastreros, 520)
    await clock.until(0.58)
    await pointAt(voladores, 520)
  })

  const fieldset = createDialog.locator('fieldset').first()
  await narrate('monitoring-meaning', async clock => {
    await clock.until(0.16)
    await localZoom(fieldset, 1.025)
    await clock.until(0.82)
    await resetLocalZoom(fieldset)
  })

  await narrate('choose-monitoring', async clock => {
    await clock.until(0.58)
    await demoClick(voladores)
    await expect(voladores).toBeChecked()
  })

  await narrate('create-trap', async clock => {
    const create = createDialog.locator('button[form="mip-item-form"]')
    await clock.until(0.48)
    await demoClick(create)
    await expect(createDialog).toBeHidden()
  })

  const created = page.getByRole('button', { name: 'Trampa de demostración', exact: true })
  await narrate('created-trap', async clock => {
    await expect(created).toBeVisible()
    await clock.until(0.22)
    await localZoom(created, 1.025)
    await clock.until(0.82)
    await resetLocalZoom(created)
  })

  await narrate('open-detail', async clock => {
    await clock.until(0.48)
    await demoClick(created)
  })

  const detail = page.getByRole('dialog', { name: 'Trampa de demostración', exact: true })
  await expect(detail).toBeVisible()
  await narrate('trap-detail', async clock => {
    const details = detail.locator('.mip-detail')
    await clock.until(0.18)
    await localZoom(details, 1.025)
    await clock.until(0.80)
    await resetLocalZoom(details)
  })

  await narrate('edit-trap', async clock => {
    const edit = detail.getByRole('button', { name: 'Editar', exact: true })
    await clock.until(0.52)
    await demoClick(edit)
  })

  const editDialog = page.getByRole('dialog', { name: 'Editar trampa', exact: true })
  await expect(editDialog).toBeVisible()
  await narrate('save-edit', async clock => {
    const name = editDialog.getByRole('textbox', { name: 'Nombre', exact: true })
    await clock.until(0.18)
    await demoType(name, 'Trampa demostración UV')
    await clock.until(0.70)
    await demoClick(editDialog.locator('button[form="mip-item-form"]'))
    await expect(editDialog).toBeHidden()
  })

  const updated = page.getByRole('button', { name: 'Trampa demostración UV', exact: true })
  await expect(updated).toBeVisible()

  await narrate('row-actions', async clock => {
    const edit = page.getByRole('button', { name: 'Editar Trampa demostración UV', exact: true })
    const deactivate = page.getByRole('button', { name: 'Desactivar Trampa demostración UV', exact: true })
    const remove = page.getByRole('button', { name: 'Eliminar Trampa demostración UV', exact: true })
    await clock.until(0.18)
    await pointAt(edit, 420)
    await clock.until(0.48)
    await pointAt(deactivate, 420)
    await clock.until(0.76)
    await pointAt(remove, 420)
  })

  await narrate('deactivate-trap', async clock => {
    const deactivate = page.getByRole('button', { name: 'Desactivar Trampa demostración UV', exact: true })
    await clock.until(0.30)
    await demoClick(deactivate)
    await expect(page.getByRole('dialog', { name: 'Desactivar trampa', exact: true })).toBeVisible()
  })

  const deactivateDialog = page.getByRole('dialog', { name: 'Desactivar trampa', exact: true })
  await narrate('confirm-deactivation', async clock => {
    await clock.until(0.50)
    await demoClick(deactivateDialog.getByRole('button', { name: 'Desactivar', exact: true }))
    await expect(deactivateDialog).toBeHidden()
    await expect(updated).toBeHidden()
  })

  await narrate('inactive-trap', async clock => {
    const inactiveTab = page.getByRole('button', { name: 'Inactivas', exact: true })
    await clock.until(0.36)
    await demoClick(inactiveTab)
    const inactive = page.getByRole('button', { name: 'Trampa demostración UV', exact: true })
    await expect(inactive).toBeVisible()
    await clock.until(0.72)
    await localZoom(inactive, 1.025)
    await clock.until(0.92)
    await resetLocalZoom(inactive)
  })

  await narrate('reactivate-trap', async clock => {
    const reactivate = page.getByRole('button', { name: 'Reactivar Trampa demostración UV', exact: true })
    await clock.until(0.28)
    await demoClick(reactivate)
    const dialog = page.getByRole('dialog', { name: 'Reactivar trampa', exact: true })
    await expect(dialog).toBeVisible()
    await clock.until(0.70)
    await demoClick(dialog.getByRole('button', { name: 'Reactivar', exact: true }))
    await expect(dialog).toBeHidden()
  })

  await narrate('active-again', async clock => {
    const activeTab = page.getByRole('button', { name: 'Activas', exact: true })
    await clock.until(0.32)
    await demoClick(activeTab)
    const active = page.getByRole('button', { name: 'Trampa demostración UV', exact: true })
    await expect(active).toBeVisible()
    await clock.until(0.70)
    await localZoom(active, 1.025)
    await clock.until(0.92)
    await resetLocalZoom(active)
  })

  await narrate('delete-trap', async clock => {
    const remove = page.getByRole('button', { name: 'Eliminar Trampa demostración UV', exact: true })
    await clock.until(0.22)
    await demoClick(remove)
    const dialog = page.getByRole('dialog', { name: 'Eliminar trampa', exact: true })
    await expect(dialog).toBeVisible()
    await clock.until(0.48)
    await pointAt(dialog.getByText(/solo si no tiene referencias ni historial/i), Math.min(1_300, Math.round(clock.durationMs * 0.34)))
    await clock.until(1)
  })

  const deleteDialog = page.getByRole('dialog', { name: 'Eliminar trampa', exact: true })
  await narrate('confirm-delete', async clock => {
    await clock.until(0.54)
    await demoClick(deleteDialog.getByRole('button', { name: 'Eliminar', exact: true }))
    await expect(deleteDialog).toBeHidden()
  })

  await narrate('deleted-trap', async clock => {
    await expect(page.getByRole('button', { name: 'Trampa demostración UV', exact: true })).toBeHidden()
    const original = page.getByRole('button', { name: 'Trampa adhesiva', exact: true })
    await expect(original).toBeVisible()
    await clock.until(0.30)
    await localZoom(original, 1.018)
    await clock.until(0.80)
    await resetLocalZoom(original)
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
