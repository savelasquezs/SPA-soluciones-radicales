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

type DemoClient = {
  id: string
  tipoCliente: 'NEGOCIO' | 'RESIDENCIAL'
  nombre: string
  nit: string | null
  correos: string[]
  activo: boolean
  version: number
  vigenciaCertificadoMeses: number | null
  residenciaDireccion: string | null
  residenciaCelular: string | null
  sedesCount: number
}

const narration = loadNarration(new URL('./clients.narration.json', import.meta.url))
const audioTimings = loadAudioTimings()

const businessId = '51000000-0000-4000-8000-000000000101'
const homeId = '51000000-0000-4000-8000-000000000102'

const initialClients: DemoClient[] = [
  {
    id: '51000000-0000-4000-8000-000000000001',
    tipoCliente: 'NEGOCIO',
    nombre: 'Cafetería Central',
    nit: '900111222',
    correos: ['administracion@cafeteria-demo.test'],
    activo: true,
    version: 1,
    vigenciaCertificadoMeses: 12,
    residenciaDireccion: null,
    residenciaCelular: null,
    sedesCount: 1,
  },
  {
    id: '51000000-0000-4000-8000-000000000002',
    tipoCliente: 'RESIDENCIAL',
    nombre: 'Casa Demostración',
    nit: null,
    correos: [],
    activo: true,
    version: 1,
    vigenciaCertificadoMeses: null,
    residenciaDireccion: 'Carrera 20 # 30-40',
    residenciaCelular: '+573001110000',
    sedesCount: 0,
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
  const records = initialClients.map(item => structuredClone(item))

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
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        },
        user: {
          id: 'demo-auth',
          name: profile.nombreCompleto,
          email: profile.correoGoogle,
          emailVerified: true,
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
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

    if (path === '/api/clients' && method === 'GET') {
      const active = url.searchParams.get('active') !== 'false'
      await route.fulfill({ json: records.filter(row => row.activo === active) })
      return
    }

    if (path === '/api/clients' && method === 'POST') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = request.postDataJSON() as any
      await new Promise(resolve => setTimeout(resolve, 500))
      const created: DemoClient = {
        id: body.tipoCliente === 'NEGOCIO' ? businessId : homeId,
        tipoCliente: body.tipoCliente,
        nombre: body.nombre,
        nit: body.tipoCliente === 'NEGOCIO' ? body.nit : null,
        correos: body.tipoCliente === 'NEGOCIO' ? body.correos ?? [] : [],
        activo: true,
        version: 1,
        vigenciaCertificadoMeses: body.tipoCliente === 'NEGOCIO' ? body.vigenciaCertificadoMeses : null,
        residenciaDireccion: body.tipoCliente === 'RESIDENCIAL' ? body.residenciaDireccion : null,
        residenciaCelular: body.tipoCliente === 'RESIDENCIAL' ? body.residenciaCelular : null,
        sedesCount: 0,
      }
      records.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }

    const clientMatch = path.match(/^\/api\/clients\/([^/]+)$/)
    if (clientMatch && method === 'GET') {
      const row = records.find(item => item.id === decodeURIComponent(clientMatch[1]))
      await route.fulfill(row ? { json: row } : { status: 404, json: { error: 'Cliente no encontrado.' } })
      return
    }

    if (clientMatch && method === 'PATCH') {
      const row = records.find(item => item.id === decodeURIComponent(clientMatch[1]))
      if (!row) {
        await route.fulfill({ status: 404, json: { error: 'Cliente no encontrado.' } })
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = request.postDataJSON() as any
      Object.assign(row, body, { version: row.version + 1 })
      await route.fulfill({ json: row })
      return
    }

    if (/^\/api\/clients\/[^/]+\/sites$/.test(path) && method === 'GET') {
      await route.fulfill({ json: [] })
      return
    }

    if (/^\/api\/clients\/[^/]+\/services$/.test(path) && method === 'GET') {
      await route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } })
      return
    }

    await route.fulfill({ status: 404, json: { error: `Ruta de demostración no preparada: ${path}` } })
  })
}

test('video: gestión de clientes Negocio y Casa', async ({ page }) => {
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
  await narrate('intro', async clock => clock.until(1))

  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()
  await installRecordingUi(page)
  await page.waitForTimeout(350)

  await narrate('open-clients', async clock => {
    await clock.until(0.2)
    await pointAt(page.getByRole('link', { name: 'Clientes', exact: true }), 620)
    await clock.until(0.72)
    await pointAt(page.getByRole('tab', { name: 'Activos', exact: true }), 420)
    await pointAt(page.getByRole('tab', { name: 'Inactivos', exact: true }), 420)
  })

  const search = page.getByRole('searchbox', { name: 'Buscar cliente', exact: true })
  const typeFilter = page.getByRole('combobox', { name: 'Tipo', exact: true })
  await narrate('list-filter', async clock => {
    await clock.until(0.2)
    await pointAt(search, 420)
    await clock.until(0.52)
    await moveCursor(typeFilter)
    await typeFilter.selectOption('RESIDENCIAL')
    await expect(page.getByRole('button', { name: 'Casa Demostración', exact: true })).toBeVisible()
    await clock.until(0.82)
    await typeFilter.selectOption('ALL')
  })

  await narrate('new-client', async clock => {
    await clock.until(0.48)
    await demoClick(page.getByRole('button', { name: 'Nuevo cliente', exact: true }))
  })

  let dialog = page.getByRole('dialog', { name: 'Nuevo cliente', exact: true })
  await expect(dialog).toBeVisible()
  const typeSelect = dialog.getByRole('combobox', { name: 'Tipo de cliente', exact: true })

  await narrate('two-types', async clock => {
    await clock.until(0.18)
    await pointAt(typeSelect, 520)
    await clock.until(0.52)
    await typeSelect.selectOption('RESIDENCIAL')
    await expect(dialog.getByRole('textbox', { name: 'Celular', exact: true })).toBeVisible()
    await clock.until(0.76)
    await typeSelect.selectOption('NEGOCIO')
    await expect(dialog.getByRole('textbox', { name: 'NIT', exact: true })).toBeVisible()
  })

  await narrate('business-name', async clock => {
    await clock.until(0.18)
    await demoType(dialog.getByRole('textbox', { name: 'Nombre / razón social', exact: true }), 'Alimentos Demo SAS')
    await clock.until(0.62)
    await demoType(dialog.getByRole('textbox', { name: 'NIT', exact: true }), '901234567')
  })

  await narrate('business-emails', async clock => {
    await clock.until(0.32)
    await demoType(dialog.getByRole('textbox', { name: 'Correos generales', exact: true }), 'calidad@alimentos-demo.test')
  })

  await narrate('business-certificate', async clock => {
    const section = dialog.getByText('Certificado de establecimiento', { exact: true }).locator('..')
    await clock.until(0.18)
    await localZoom(section, 1.02)
    await clock.until(0.56)
    const months = dialog.getByRole('spinbutton', { name: 'Vigencia en meses', exact: true })
    await moveCursor(months)
    await months.fill('12')
    await clock.until(0.88)
    await resetLocalZoom(section)
  })

  await narrate('create-business', async clock => {
    await clock.until(0.48)
    await demoClick(dialog.getByRole('button', { name: 'Crear cliente', exact: true }))
    await expect(dialog).toBeHidden()
  })

  const business = page.getByRole('button', { name: 'Alimentos Demo SAS', exact: true })
  await narrate('business-created', async clock => {
    await expect(business).toBeVisible()
    await clock.until(0.22)
    await localZoom(business, 1.025)
    await clock.until(0.82)
    await resetLocalZoom(business)
  })

  await narrate('business-detail', async clock => {
    await clock.until(0.2)
    await demoClick(business)
    await expect(page.getByRole('heading', { name: 'Alimentos Demo SAS', exact: true })).toBeVisible()
    await clock.until(0.58)
    await localZoom(page.locator('.summary-card'), 1.018)
    await clock.until(0.88)
    await resetLocalZoom(page.locator('.summary-card'))
  })

  await narrate('back-to-list', async clock => {
    await clock.until(0.52)
    await demoClick(page.getByRole('button', { name: '← Clientes', exact: true }))
    await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()
  })

  await demoClick(page.getByRole('button', { name: 'Nuevo cliente', exact: true }))
  dialog = page.getByRole('dialog', { name: 'Nuevo cliente', exact: true })
  await expect(dialog).toBeVisible()

  await narrate('choose-home', async clock => {
    const select = dialog.getByRole('combobox', { name: 'Tipo de cliente', exact: true })
    await clock.until(0.38)
    await demoClick(select)
    await select.selectOption('RESIDENCIAL')
    await expect(dialog.getByText('Certificado de establecimiento')).toBeHidden()
  })

  await narrate('home-fields', async clock => {
    const name = dialog.getByRole('textbox', { name: 'Nombre', exact: true })
    const phone = dialog.getByRole('textbox', { name: 'Celular', exact: true })
    const address = dialog.getByRole('textbox', { name: 'Dirección', exact: true })
    await clock.until(0.16)
    await pointAt(name, 420)
    await clock.until(0.48)
    await pointAt(phone, 420)
    await clock.until(0.76)
    await pointAt(address, 420)
  })

  await narrate('home-rules', async clock => {
    await clock.until(0.18)
    await localZoom(dialog.locator('form'), 1.01)
    await clock.until(0.82)
    await resetLocalZoom(dialog.locator('form'))
  })

  await narrate('create-home', async clock => {
    await clock.until(0.12)
    await demoType(dialog.getByRole('textbox', { name: 'Nombre', exact: true }), 'Laura Demostración')
    await clock.until(0.36)
    await demoType(dialog.getByRole('textbox', { name: 'Celular', exact: true }), '3005550198')
    await clock.until(0.58)
    await demoType(dialog.getByRole('textbox', { name: 'Dirección', exact: true }), 'Calle 25 # 10-20')
    await clock.until(0.78)
    await demoClick(dialog.getByRole('button', { name: 'Crear cliente', exact: true }))
    await expect(dialog).toBeHidden()
  })

  const home = page.getByRole('button', { name: 'Laura Demostración', exact: true })
  await narrate('home-created', async clock => {
    await expect(home).toBeVisible()
    await clock.until(0.2)
    await localZoom(home, 1.025)
    await clock.until(0.82)
    await resetLocalZoom(home)
  })

  const whatsapp = page.getByRole('link', { name: /Hablar por WhatsApp con 300 555 0198/ })
  await narrate('home-whatsapp', async clock => {
    await clock.until(0.35)
    await pointAt(whatsapp, 900)
    await clock.until(1)
  })

  await narrate('home-detail', async clock => {
    await clock.until(0.22)
    await demoClick(home)
    await expect(page.getByRole('heading', { name: 'Laura Demostración', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Agregar Sede/ })).toHaveCount(0)
    await clock.until(0.58)
    await localZoom(page.locator('.summary-card'), 1.018)
    await clock.until(0.88)
    await resetLocalZoom(page.locator('.summary-card'))
  })

  await demoClick(page.getByRole('button', { name: '← Clientes', exact: true }))
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()

  await narrate('client-actions', async clock => {
    const edit = page.getByRole('button', { name: 'Editar Laura Demostración', exact: true })
    const remove = page.getByRole('button', { name: 'Eliminar o desactivar Laura Demostración', exact: true })
    await clock.until(0.2)
    await pointAt(edit, 520)
    await clock.until(0.62)
    await pointAt(remove, 520)
  })

  await narrate('inactive-tab', async clock => {
    await clock.until(0.46)
    await demoClick(page.getByRole('tab', { name: 'Inactivos', exact: true }))
    await expect(page.getByText('No hay clientes para mostrar', { exact: true })).toBeVisible()
  })

  await showOutro(page)
  await narrate('outro', async clock => clock.until(1))
  await page.waitForTimeout(650)

  mkdirSync(resolve(process.cwd(), 'docs-media'), { recursive: true })
  writeFileSync(
    resolve(process.cwd(), 'docs-media/timeline.json'),
    JSON.stringify({ ...timeline, durationMs: Date.now() - startedAt }, null, 2) + '\n',
  )
})
