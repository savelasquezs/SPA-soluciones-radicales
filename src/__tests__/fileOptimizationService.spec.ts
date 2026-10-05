import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { optimizeFileForStorage } from '@/services/fileOptimizationService'
import { validateUserInput } from '@/helpers/users'
import type { UserInput } from '@/types/domain'
import { MAX_OPTIMIZATION_SOURCE_BYTES } from '@/types/fileOptimization'
import type { OptimizationResponse } from '@/types/fileOptimization'

type FakeWorker = {
  onmessage: ((event: { data: OptimizationResponse }) => void) | null
  onerror: (() => void) | null
  onmessageerror: (() => void) | null
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}
let worker: FakeWorker
let factory: ReturnType<typeof vi.fn>

beforeEach(() => {
  worker = { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() }
  factory = vi.fn(function () { return worker })
  vi.stubGlobal('Worker', factory)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const original = () => new File(['large image content'], 'foto.png', { type: 'image/png', lastModified: 1234 })
const result = () => new File(['small'], 'foto.webp', { type: 'image/webp', lastModified: 1234 })

describe('optimización previa al upload', () => {
  it('devuelve solo el archivo más pequeño y termina el worker', async () => {
    const file = original()
    const compressed = result()
    const pending = optimizeFileForStorage('USER_CERTIFICATE', file)
    expect(worker.postMessage).toHaveBeenCalledWith({ file, profile: 'standard' })
    worker.onmessage?.({ data: { ok: true, file: compressed } })
    expect(await pending).toBe(compressed)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('usa el perfil de mayor detalle para planos', async () => {
    const file = original()
    const pending = optimizeFileForStorage('SITE_PLAN', file)
    expect(worker.postMessage).toHaveBeenCalledWith({ file, profile: 'plan' })
    worker.onmessage?.({ data: { ok: true, file } })
    expect(await pending).toBe(file)
  })

  it.each([19, 40])('no sustituye el original por una salida de %i bytes que no ahorra espacio', async (bytes) => {
    const file = original()
    const pending = optimizeFileForStorage('SITE_PLAN', file)
    worker.onmessage?.({ data: { ok: true, file: new File(['x'.repeat(bytes)], 'foto.webp', { type: 'image/webp' }) } })
    expect(await pending).toBe(file)
  })

  it.each(['doc', 'docx'])('deja %s intacto sin crear un worker', async (extension) => {
    const file = new File(['document'], `plantilla.${extension}`)
    expect(await optimizeFileForStorage('CLIENT_ESTABLISHMENT_TEMPLATE', file)).toBe(file)
    expect(factory).not.toHaveBeenCalled()
  })

  it('deduce el MIME cuando el navegador no lo proporciona', async () => {
    const file = new File(['pdf'], 'documento.PDF')
    const pending = optimizeFileForStorage('SITE_PLAN', file)
    const normalized = worker.postMessage.mock.calls[0]![0].file as File
    expect(normalized.type).toBe('application/pdf')
    worker.onmessage?.({ data: { ok: true, file: normalized } })
    expect((await pending).type).toBe('application/pdf')
  })

  it('rechaza MIME incoherente, archivos vacíos y originales excesivos antes del worker', async () => {
    await expect(optimizeFileForStorage('SITE_PLAN', new File(['x'], 'foto.png', { type: 'application/pdf' }))).rejects.toThrow('extensión')
    await expect(optimizeFileForStorage('SITE_PLAN', new File([], 'foto.png', { type: 'image/png' }))).rejects.toThrow('vacío')
    const large = original()
    Object.defineProperty(large, 'size', { value: MAX_OPTIMIZATION_SOURCE_BYTES + 1 })
    await expect(optimizeFileForStorage('SITE_PLAN', large)).rejects.toThrow('64 MB')
    expect(factory).not.toHaveBeenCalled()
  })

  it('no oculta errores de compresión subiendo el original', async () => {
    const pending = optimizeFileForStorage('SITE_PLAN', original())
    worker.onmessage?.({ data: { ok: false, error: 'No fue posible comprimir' } })
    await expect(pending).rejects.toThrow('comprimir')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rechaza una salida vacía', async () => {
    const pending = optimizeFileForStorage('SITE_PLAN', original())
    worker.onmessage?.({ data: { ok: true, file: new File([], 'foto.webp') } })
    await expect(pending).rejects.toThrow('vacío')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('limpia el worker al fallar o al vencer el tiempo máximo', async () => {
    const failed = optimizeFileForStorage('SITE_PLAN', original())
    worker.onerror?.()
    await expect(failed).rejects.toThrow('No se ha subido')
    vi.useFakeTimers()
    const pending = optimizeFileForStorage('SITE_PLAN', original())
    const rejection = expect(pending).rejects.toThrow('tardó demasiado')
    await vi.advanceTimersByTimeAsync(120_000)
    await rejection
    expect(worker.terminate).toHaveBeenCalledTimes(2)
  })

  it('mantiene el límite de certificado en el resultado, no en el original de 30 MB', async () => {
    const large = original()
    Object.defineProperty(large, 'size', { value: 30 * 1024 * 1024 })
    const pending = optimizeFileForStorage('USER_CERTIFICATE', large)
    worker.onmessage?.({ data: { ok: true, file: result() } })
    expect((await pending).size).toBe(5)
    const tooLarge = result()
    Object.defineProperty(tooLarge, 'size', { value: 11 * 1024 * 1024 })
    const rejected = optimizeFileForStorage('USER_CERTIFICATE', large)
    worker.onmessage?.({ data: { ok: true, file: tooLarge } })
    await expect(rejected).rejects.toThrow('después de comprimirlo')
  })

  it('el formulario permite que una foto de 30 MB alcance el motor', () => {
    const file = original()
    Object.defineProperty(file, 'size', { value: 30 * 1024 * 1024, configurable: true })
    const input: UserInput = {
      nombreCompleto: 'Ana Pérez', correoGoogle: 'ana@gmail.com', esAdmin: false, esTecnico: true, activo: true,
      certificadoStoragePath: null, certificadoFechaEmision: '2026-01-01', certificadoFechaVencimiento: '2027-01-01', certificadoObservaciones: null,
    }
    expect(validateUserInput(input, file)).toEqual({})
    Object.defineProperty(file, 'size', { value: MAX_OPTIMIZATION_SOURCE_BYTES + 1 })
    expect(validateUserInput(input, file).certificateFile).toContain('64 MB')
  })
})
