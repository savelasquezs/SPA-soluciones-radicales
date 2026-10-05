import { readdirSync } from 'node:fs'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib'

type Harness = Window & { optimizeForTest: (file: File, profile: 'standard' | 'plan') => Promise<File> }

function contentStreams(document: PDFDocument): number[][] {
  const contents = document.getPage(0).node.lookup(PDFName.of('Contents'), PDFArray)
  return contents.asArray().map((ref) => Array.from(document.context.lookup(ref, PDFRawStream).contents))
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000)
  const asset = process.env.CI
    ? readdirSync('dist/assets').find((file) => file.startsWith('fileOptimization.worker-') && file.endsWith('.js'))
    : undefined
  if (process.env.CI && !asset) throw new Error('No se encontró el worker de compresión en el build')
  const workerUrl = asset ? `/assets/${asset}` : '/src/workers/fileOptimization.worker.ts'
  await page.route('**/__file-optimization-test__', async (route) => {
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><title>File optimization test</title><body></body></html>' })
  })
  await page.goto('/__file-optimization-test__')
  await page.evaluate((url) => {
    (window as Harness).optimizeForTest = async (file, profile) => {
      const worker = new Worker(url, { type: 'module' })
      try {
        return await new Promise<File>((resolve, reject) => {
          worker.onmessage = ({ data }) => data.ok ? resolve(data.file) : reject(new Error(data.error))
          worker.onerror = (error) => reject(new Error(error.message))
          worker.postMessage({ file, profile })
        })
      } finally {
        worker.terminate()
      }
    }
  }, workerUrl)
})

test('comprime una imagen de más de 25 MiB con el codec real sin subirla', async ({ page }) => {
  const output = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(4000, 3000)
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(4000, 3000)
    let seed = 123456789
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
      pixels.data[i] = seed & 255
      pixels.data[i + 1] = (seed >>> 8) & 255
      pixels.data[i + 2] = (seed >>> 16) & 255
      pixels.data[i + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    canvas.width = 1; canvas.height = 1
    const source = new File([blob], 'foto.png', { type: 'image/png', lastModified: 1234 })
    const file = await (window as Harness).optimizeForTest(source, 'standard')
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return { before: source.size, after: file.size, name: file.name, type: file.type, lastModified: file.lastModified, ...dimensions }
  })
  expect(output.before).toBeGreaterThan(25 * 1024 * 1024)
  expect(output.after).toBeLessThan(output.before * 0.4)
  expect(output.type).toBe('image/webp')
  expect(output.name).toBe('foto.webp')
  expect(output.width).toBeLessThanOrEqual(2560)
  expect(output.width / output.height).toBeCloseTo(4 / 3, 2)
  expect(output.lastModified).toBe(1234)
})

test('recomprime imágenes del PDF manteniendo texto, vectores y campos', async ({ page }) => {
  const document = await PDFDocument.create()
  const sheet = document.addPage([600, 800])
  sheet.drawText('Certificado SR: texto seleccionable', { x: 25, y: 775, size: 16 })
  sheet.drawRectangle({ x: 20, y: 150, width: 550, height: 580, borderWidth: 2 })
  const field = document.getForm().createTextField('titular')
  field.setText('Ana Perez')
  field.addToPage(sheet, { x: 25, y: 80, width: 250, height: 25 })
  const pixels = new Uint8Array(1600 * 1200 * 3)
  let seed = 123456789
  for (let i = 0; i < pixels.length; i += 1) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    pixels[i] = seed & 255
  }
  const image = document.context.register(document.context.flateStream(pixels, {
    Type: 'XObject', Subtype: 'Image', Width: 1600, Height: 1200, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
  }))
  const resources = sheet.node.lookup(PDFName.of('Resources'), PDFDict)
  resources.set(PDFName.of('XObject'), document.context.obj({ Scan: image }))
  sheet.node.addContentStream(document.context.register(document.context.flateStream('q 540 0 0 405 25 200 cm /Scan Do Q')))
  const source = await document.save()
  const before = await PDFDocument.load(source)
  const compressed = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const file = await (window as Harness).optimizeForTest(new File([bytes], 'certificado.pdf', { type: 'application/pdf' }), 'standard')
    return Array.from(new Uint8Array(await file.arrayBuffer()))
  }, Buffer.from(source).toString('base64'))
  const after = await PDFDocument.load(new Uint8Array(compressed))
  expect(compressed.length).toBeLessThan(source.byteLength * 0.4)
  expect(after.getPageCount()).toBe(before.getPageCount())
  expect(contentStreams(after)).toEqual(contentStreams(before))
  expect(after.getForm().getTextField('titular').getText()).toBe('Ana Perez')
  expect(after.context.lookup(image, PDFRawStream).dict.lookup(PDFName.of('Filter')).toString()).toBe('/DCTDecode')
})

test('no altera los bytes de un PDF firmado', async ({ page }) => {
  const document = await PDFDocument.create()
  document.addPage().drawText('Documento firmado')
  const signature = document.context.obj({ Type: 'Sig', ByteRange: [0, 100, 200, 300], Contents: PDFHexString.of('00') })
  document.catalog.set(PDFName.of('Signature'), document.context.register(signature))
  const source = await document.save()
  const output = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const file = await (window as Harness).optimizeForTest(new File([bytes], 'firmado.pdf', { type: 'application/pdf' }), 'standard')
    return Array.from(new Uint8Array(await file.arrayBuffer()))
  }, Buffer.from(source).toString('base64'))
  expect(output).toEqual(Array.from(source))
})
