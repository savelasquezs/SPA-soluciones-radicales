import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MasterFileKind } from '@/services/filesService'

type Authorization = { url: string; contentType: string; storagePath: string }
const mocks = vi.hoisted(() => ({
  api: vi.fn<(path: string, options: RequestInit) => Promise<Authorization>>(),
  optimize: vi.fn<(kind: MasterFileKind, file: File) => Promise<File>>(),
}))
vi.mock('@/services/apiService', () => ({ apiRequest: mocks.api, ApiClientError: class extends Error {} }))
vi.mock('@/services/fileOptimizationService', () => ({ optimizeFileForStorage: mocks.optimize }))

import { uploadMasterFile } from '@/services/filesService'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.api.mockResolvedValue({ url: 'https://r2.example.test/upload', contentType: 'image/webp', storagePath: 'sites/plans/foto.webp' })
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response))
})
afterEach(() => vi.unstubAllGlobals())

describe('carga centralizada a R2', () => {
  it('espera la compresión antes de firmar y sube exactamente los bytes y MIME optimizados', async () => {
    const original = new File(['original original original'], 'foto.png', { type: 'image/png' })
    const compressed = new File(['small'], 'foto.webp', { type: 'image/webp' })
    let complete: (file: File) => void = () => undefined
    mocks.optimize.mockReturnValue(new Promise<File>((resolve) => { complete = resolve }))
    const phases: string[] = []
    const pending = uploadMasterFile('SITE_PLAN', original, (phase) => phases.push(phase))
    expect(phases).toEqual(['compressing'])
    expect(mocks.api).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    complete(compressed)
    expect(await pending).toBe('sites/plans/foto.webp')
    expect(phases).toEqual(['compressing', 'uploading'])
    expect(mocks.optimize).toHaveBeenCalledExactlyOnceWith('SITE_PLAN', original)
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith('api/files/master/upload-url', {
      method: 'POST', body: JSON.stringify({ kind: 'SITE_PLAN', fileName: 'foto.webp', contentType: 'image/webp', size: 5 }),
    })
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://r2.example.test/upload', {
      method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: compressed,
    })
  })

  it('no autoriza ni sube nada si la compresión falla', async () => {
    mocks.optimize.mockRejectedValue(new Error('No fue posible comprimir'))
    await expect(uploadMasterFile('SITE_PLAN', new File(['image'], 'foto.png'))).rejects.toThrow('comprimir')
    expect(mocks.api).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('conserva el manejo de errores de R2 después de optimizar', async () => {
    mocks.optimize.mockResolvedValue(new File(['small'], 'foto.webp', { type: 'image/webp' }))
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)
    await expect(uploadMasterFile('SITE_PLAN', new File(['image'], 'foto.png'))).rejects.toThrow('R2 rechazó')
  })
})
