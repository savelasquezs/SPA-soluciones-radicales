import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'

// Decompress into /run, not /tmp: Neon mounts /tmp noexec and /opt/function read-only.
const root = mkdtempSync('/run/sr-neon-api-')
const tar = brotliDecompressSync(readFileSync(new URL('./payload.tar.br', import.meta.url)))

function readAscii(offset, size) {
  const bytes = tar.subarray(offset, offset + size)
  const nul = bytes.indexOf(0)
  return bytes.subarray(0, nul < 0 ? bytes.length : nul).toString('utf8')
}

for (let offset = 0; offset + 512 <= tar.length;) {
  const name = readAscii(offset, 100)
  if (!name) break
  const prefix = readAscii(offset + 345, 155)
  const path = prefix ? prefix + '/' + name : name
  const bytesText = readAscii(offset + 124, 12).trim()
  const size = Number.parseInt(bytesText || '0', 8)
  const type = String.fromCharCode(tar[offset + 156] || 48)
  if (!Number.isSafeInteger(size) || size < 0 || path.startsWith('/') ||
    path.split('/').includes('..') || (type !== '0' && type !== '5')) {
    throw new Error('Archivo de despliegue inválido')
  }
  const target = join(root, path)
  if (type === '5') {
    mkdirSync(target, { recursive: true })
  } else {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, tar.subarray(offset + 512, offset + 512 + size))
  }
  offset += 512 + Math.ceil(size / 512) * 512
}

const targetEntry = pathToFileURL(join(root, 'index.mjs'))
if (process.env.SR_NEON_NATIVE_SMOKE === '1') {
  const require = createRequire(targetEntry)
  const sharp = require('sharp')
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer()
  if (png.length < 10) throw new Error('Sharp no produjo una imagen')
  console.log('native-sharp-smoke: OK, bytes=' + png.length)
  process.exit(0)
}

const api = await import(targetEntry.href)
if (!api.default || typeof api.default.fetch !== 'function') {
  throw new Error('API no exporta un manejador HTTP válido')
}
export default api.default
