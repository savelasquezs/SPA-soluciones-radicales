import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import type { CertificateContext, CertificateSettings, GenerateCertificateInput, SendCertificatesInput } from '../src/types/certificates'
import { templateFixture } from '../functions/api/certificates/testing/fixture'

const id = '11111111-1111-4111-8111-111111111111'
const vehicle = '22222222-2222-4222-8222-222222222222'
const templatePath = `clients/establishment-templates/${id}-base.docx`
const profile = { id, nombreCompleto: 'Admin de prueba', correoGoogle: 'admin@example.test', esAdmin: true, esTecnico: false, rolActivo: 'ADMINISTRADOR', requiereSeleccionRol: false }
async function setup(page: Page, options: { empty?: boolean; unavailable?: boolean; generationFailure?: boolean; sendUnknown?: boolean } = {}) {
  const recorded = { generations: [] as GenerateCertificateInput[], mails: [] as SendCertificatesInput[], contextCalls: 0, settingsSaves: 0 }
  const settings: CertificateSettings = { converterReady: !options.unavailable, templates: [
    { type: 'ESTABLECIMIENTO', storagePath: options.empty ? null : templatePath, fileName: options.empty ? null : 'base.docx', revision: options.empty ? null : id },
    { type: 'VEHICULO', storagePath: null, fileName: null, revision: null },
  ] }
  const context: CertificateContext = { serviceId: id, solicitud: 'SS-PRUEBA-123', clientName: 'Negocio de prueba', siteName: 'Sede de prueba', recipients: ['uno@example.test', 'dos@example.test'], vehicles: [{ id: vehicle, placa: 'ABC-123' }], documents: [], availability: { ESTABLECIMIENTO: { available: true, reason: null, templateSource: 'GLOBAL' }, VEHICULO: { available: true, reason: null, templateSource: 'GLOBAL' } } }
  const pdf = await PDFDocument.create(); pdf.addPage()
  const pdfBytes = Buffer.from(await pdf.save())
  await page.route('**/get-session', async (route) => route.fulfill({ json: {
    session: { id: 'session', userId: 'auth-1', token: 'e2e-token', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
    user: { id: 'auth-1', name: 'Admin de prueba', email: 'admin@example.test', emailVerified: true, createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' },
  } }))
  await page.route('https://storage.example.test/**', async (route) => route.fulfill({ status: 200, body: '' }))
  await page.route('https://api.example.test/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (path === '/api/session') return route.fulfill({ json: profile })
    if (path === '/api/clients') return route.fulfill({ json: url.searchParams.get('active') === 'false' ? [] : [{ id, nombre: 'Negocio de prueba', nit: '900', tipoCliente: 'NEGOCIO', activo: true, version: 1, sedesCount: 1, correos: [], vigenciaCertificadoMeses: 2 }] })
    if (path === `/api/clients/${id}/sites`) return route.fulfill({ json: [{ id, clientId: id, nombre: 'Sede de prueba', direccion: 'Dirección de prueba', tipoSede: 'NEGOCIO', activo: true, version: 1, valorServicio: 1, areasCount: 0, formulariosCount: 0, correos: [], formulariosAplicablesIds: [] }] })
    if (path === '/api/certificates/settings') return route.fulfill({ json: settings })
    if (path.startsWith('/api/certificates/templates/')) {
      recorded.settingsSaves++
      const input = route.request().postDataJSON() as { storagePath: string }
      settings.templates[0] = { type: 'ESTABLECIMIENTO', storagePath: input.storagePath, revision: id, fileName: 'nueva.docx' }
      return route.fulfill({ json: settings.templates[0] })
    }
    if (path === '/api/files/master/upload-url') return route.fulfill({ json: { storagePath: templatePath, url: 'https://storage.example.test/upload', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } })
    if (path === '/api/files/master/delete') return route.fulfill({ status: 204 })
    if (path === '/api/certificates/preview') return route.fulfill({ contentType: 'application/pdf', body: pdfBytes })
    if (path === '/api/certificates/services') return route.fulfill({ json: { items: [{ id, solicitud: 'SS-PRUEBA-123', fecha: '2026-01-31' }], page: 1, hasMore: false } })
    if (path === `/api/certificates/services/${id}/context`) { recorded.contextCalls++; return route.fulfill({ json: context }) }
    if (path === '/api/certificates/generate') {
      const input = route.request().postDataJSON() as GenerateCertificateInput
      recorded.generations.push(input)
      if (options.generationFailure && recorded.generations.length === 1) return route.fulfill({ status: 502, json: { error: 'No fue posible convertir el Word. Inténtalo de nuevo.' } })
      context.documents = [{ id, type: input.type, vehicleId: input.type === 'VEHICULO' ? vehicle : null, label: input.type === 'VEHICULO' ? 'ABC-123' : 'Establecimiento', storagePath: `certificates/${id}/${id}/${recorded.generations.length}.pdf`, issuedOn: '2026-01-31', expiresOn: '2026-03-31' }]
      return route.fulfill({ status: 201, json: { documents: context.documents } })
    }
    if (path === '/api/certificates/send') {
      recorded.mails.push(route.request().postDataJSON() as SendCertificatesInput)
      if (options.sendUnknown) return route.fulfill({ status: 502, json: { error: 'Entrega no confirmada. Revisa Gmail.', code: 'EMAIL_DELIVERY_UNKNOWN' } })
      return route.fulfill({ json: { sent: true, messageId: 'test-only-gmail' } })
    }
    if (path.endsWith('/read-url')) return route.fulfill({ json: { url: 'https://storage.example.test/file.pdf' } })
    return route.fulfill({ status: 404, json: { error: `Mock missing: ${path}` } })
  })
  await page.goto('/configuracion/certificados')
  await expect(page.getByRole('heading', { name: 'Certificados', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Establecimiento', exact: true })).toBeVisible()
  return recorded
}
async function chooseService(page: Page) {
  await page.getByRole('button', { name: 'Generar y enviar', exact: true }).click()
  await page.getByLabel('Negocio', { exact: true }).selectOption(id)
  await page.getByLabel('Sede', { exact: true }).selectOption(id)
  await page.getByLabel('Servicio finalizado', { exact: true }).selectOption(id)
  await expect(page.getByRole('button', { name: 'Generar PDF', exact: true })).toBeEnabled()
}

test('plantillas: guarda sin recargar, muestra prueba y funciona en claro, oscuro y móvil', async ({ page }, info) => {
  const calls = await setup(page, { empty: true })
  const card = page.locator('.template-card').first()
  await card.locator('input[type=file]').setInputFiles({ name: 'nueva.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: templateFixture() })
  await card.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
  await expect(card.getByText('nueva.docx', { exact: true })).toBeVisible()
  expect(calls.settingsSaves).toBe(1)
  await card.getByRole('button', { name: 'Probar PDF' }).click()
  await expect(page.getByRole('dialog', { name: 'Prueba de certificado' })).toBeVisible()
  await expect(page.getByTitle('Vista previa del certificado de prueba')).toBeVisible()
  expect(calls.generations).toHaveLength(0); expect(calls.mails).toHaveLength(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.screenshot({ path: info.outputPath('templates-light-desktop.png'), fullPage: true })
  await page.getByLabel('Apariencia').selectOption('dark')
  await page.screenshot({ path: info.outputPath('templates-dark-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('templates-dark-mobile.png'), fullPage: true })
})

test('generación y envío manual: datos reutilizados, confirmaciones y mensaje editable', async ({ page }, info) => {
  const calls = await setup(page)
  await chooseService(page)
  await page.getByRole('button', { name: 'Generar PDF', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Certificados del servicio' })).toBeVisible()
  expect(calls.contextCalls).toBe(1)
  expect(calls.mails).toHaveLength(0)
  await page.getByRole('button', { name: 'Regenerar PDF', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Regenerar certificados' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Regenerar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar certificados', exact: true })).toBeEnabled()
  expect(calls.generations).toHaveLength(2)
  expect(calls.generations[1]!.confirmReplace).toBe(true)
  expect(calls.generations[1]!.previousPaths.ESTABLECIMIENTO).toContain('/1.pdf')
  await page.getByLabel('Asunto', { exact: true }).fill('Asunto personalizado')
  await page.getByLabel('Mensaje', { exact: true }).fill('Buen día. Adjuntamos el certificado solicitado.')
  await page.getByRole('button', { name: 'Enviar certificados', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Enviar certificados' })).toContainText('uno@example.test')
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar correo', exact: true }).click()
  await expect(page.getByText('Correo enviado', { exact: true })).toBeVisible()
  expect(calls.mails[0]).toMatchObject({ subject: 'Asunto personalizado', text: 'Buen día. Adjuntamos el certificado solicitado.', recipients: ['dos@example.test', 'uno@example.test'] })
  expect(calls.mails[0]!.documents).toHaveLength(1)
  expect(calls.contextCalls).toBe(1)
  await page.screenshot({ path: info.outputPath('generation-light-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 360, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await page.getByRole('button', { name: 'Enviar certificados', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: info.outputPath('generation-light-mobile.png'), fullPage: true })
})

test('fallos: conserva selección, reutiliza idempotencia y bloquea reenvío ambiguo', async ({ page }) => {
  const calls = await setup(page, { generationFailure: true, sendUnknown: true })
  await chooseService(page)
  await page.getByLabel('Tipo de certificado', { exact: true }).selectOption('VEHICULO')
  await page.getByRole('button', { name: 'Vehículos atendidos' }).click()
  await page.getByRole('option', { name: 'ABC-123' }).click()
  await page.getByRole('button', { name: 'Vehículos atendidos' }).click()
  await page.getByRole('button', { name: 'Generar PDF', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'No fue posible convertir' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Generar PDF', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Certificados del servicio' })).toBeVisible()
  expect(calls.generations[0]!.vehicleIds).toEqual([vehicle])
  expect(calls.generations[0]!.requestId).toBe(calls.generations[1]!.requestId)
  await page.getByRole('button', { name: 'Enviar certificados', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar correo', exact: true }).click()
  await expect(page.getByText('No repitas el envío sin revisar primero la carpeta Enviados de Gmail.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar certificados', exact: true })).toBeDisabled()
  expect(calls.mails).toHaveLength(1)
})

test('sin conversor permite configurar Word pero no muestra una prueba ficticia como PDF real', async ({ page }) => {
  await setup(page, { unavailable: true })
  await expect(page.getByText(/El conversor privado de Word a PDF aún no está configurado/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Probar PDF' }).first()).toBeDisabled()
})
