import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadVideoTarget } from './video-target.mjs'

const root = process.cwd()
const target = loadVideoTarget()
const contentPath = resolve(root, target.narration)
const outDir = resolve(root, 'docs-media/audio')
const segmentDir = resolve(outDir, 'segments')
const projectId = process.env.GCP_PROJECT_ID
const languageCode = process.env.TTS_LANGUAGE_CODE || 'es-US'
const voiceName = process.env.TTS_VOICE || 'es-US-Chirp3-HD-Kore'

if (!projectId) throw new Error('GCP_PROJECT_ID es obligatorio para generar la narración.')

const content = JSON.parse(readFileSync(contentPath, 'utf8'))
mkdirSync(segmentDir, { recursive: true })

const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
if (!accessToken) throw new Error('No fue posible obtener un access token de Google Cloud.')

function durationMs(file) {
  const seconds = Number(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8' }).trim())
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`No fue posible medir la duración de ${file}.`)
  return Math.round(seconds * 1000)
}

const result = {
  videoId: target.id,
  voice: { languageCode, name: voiceName, gender: 'female' },
  segments: {},
}

for (const segment of content.segments) {
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': projectId,
    },
    body: JSON.stringify({
      input: { text: segment.text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: 'LINEAR16' },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Google TTS rechazó ${segment.id}: ${response.status} ${detail}`)
  }

  const payload = await response.json()
  if (!payload.audioContent) throw new Error(`Google TTS no devolvió audio para ${segment.id}.`)

  const rawFile = resolve(segmentDir, `${segment.id}.raw.wav`)
  const file = resolve(segmentDir, `${segment.id}.wav`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(rawFile, Buffer.from(payload.audioContent, 'base64'))

  execFileSync('ffmpeg', [
    '-y', '-i', rawFile,
    '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-48dB,areverse,apad=pad_dur=0.08',
    '-ar', '48000', '-ac', '1', file,
  ], { stdio: 'ignore' })

  result.segments[segment.id] = { text: segment.text, file, durationMs: durationMs(file) }
}

writeFileSync(resolve(outDir, 'timings.json'), JSON.stringify(result, null, 2) + '\n')
console.log(`Narración ${target.id} generada con ${voiceName}: ${content.segments.length} segmentos.`)
