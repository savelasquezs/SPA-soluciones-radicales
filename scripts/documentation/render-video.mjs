import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadVideoTarget } from './video-target.mjs'

const root = process.cwd()
const target = loadVideoTarget()
const playDir = resolve(root, 'docs-media/playwright')
const audioDir = resolve(root, 'docs-media/audio')
const finalDir = resolve(root, 'docs-media/final')
const timelinePath = resolve(root, 'docs-media/timeline.json')
const timingsPath = resolve(audioDir, 'timings.json')
const narrationPath = resolve(root, target.narration)
const outputPath = resolve(finalDir, target.output)

function findVideo(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findVideo(full)
      if (nested) return nested
    } else if (entry.name === 'video.webm') {
      return full
    }
  }
  return null
}

function probeDuration(file) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8' }).trim())
}

function probeStreams(file) {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate',
    '-of', 'json',
    file,
  ], { encoding: 'utf8' }))
}

function writeAmbientWav(file, durationSeconds) {
  const sampleRate = 48_000
  const channels = 1
  const bitsPerSample = 16
  const totalSamples = Math.ceil(durationSeconds * sampleRate)
  const data = Buffer.alloc(totalSamples * 2)
  const chords = [
    [130.81, 164.81, 196.00, 246.94],
    [110.00, 130.81, 164.81, 220.00],
    [87.31, 130.81, 174.61, 220.00],
    [98.00, 146.83, 196.00, 261.63],
  ]
  const chordSeconds = 8

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate
    const chordIndex = Math.floor(t / chordSeconds) % chords.length
    const local = t % chordSeconds
    const fade = Math.min(1, local / 1.25, (chordSeconds - local) / 1.25)
    const globalFade = Math.min(1, t / 2.2, Math.max(0, (durationSeconds - t) / 2.6))
    const lfo = 0.78 + 0.22 * Math.sin(2 * Math.PI * 0.065 * t)
    let sample = 0
    for (const frequency of chords[chordIndex]) sample += Math.sin(2 * Math.PI * frequency * t)
    sample /= chords[chordIndex].length
    const bellPhase = local % 4
    if (bellPhase < 1.5) {
      const bellEnvelope = Math.exp(-3.2 * bellPhase)
      sample += 0.18 * bellEnvelope * Math.sin(2 * Math.PI * chords[chordIndex][3] * 2 * t)
    }
    const amplitude = 0.22 * fade * globalFade * lfo
    const value = Math.max(-1, Math.min(1, sample * amplitude))
    data.writeInt16LE(Math.round(value * 32767), i * 2)
  }

  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  writeFileSync(file, Buffer.concat([header, data]))
}

function validateTimeline(narration, timeline, timings) {
  const expectedIds = narration.segments.map(segment => segment.id)
  const actualIds = timeline.narration.map(item => item.id)
  const uniqueIds = new Set(expectedIds)

  if (uniqueIds.size !== expectedIds.length) {
    throw new Error('La narración contiene identificadores duplicados.')
  }
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error(`El timeline no coincide con la narración. Esperado: ${expectedIds.join(', ')}. Recibido: ${actualIds.join(', ')}.`)
  }
  for (const id of expectedIds) {
    const audio = timings.segments?.[id]
    if (!audio?.file || !existsSync(audio.file)) throw new Error(`Falta el audio sintetizado del segmento ${id}.`)
    if (!Number.isFinite(audio.durationMs) || audio.durationMs <= 0) throw new Error(`Duración inválida para el segmento ${id}.`)
  }
  for (let index = 1; index < timeline.narration.length; index += 1) {
    if (timeline.narration[index].startMs <= timeline.narration[index - 1].startMs) {
      throw new Error(`El timeline no es estrictamente creciente en ${timeline.narration[index].id}.`)
    }
  }
}

if (!existsSync(timelinePath) || !existsSync(timingsPath) || !existsSync(narrationPath)) {
  throw new Error('Faltan timeline.json, timings.json o el archivo de narración. Ejecuta primero TTS y Playwright.')
}

const video = findVideo(playDir)
if (!video) throw new Error('No se encontró video.webm de Playwright.')

const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'))
const timings = JSON.parse(readFileSync(timingsPath, 'utf8'))
const narration = JSON.parse(readFileSync(narrationPath, 'utf8'))
validateTimeline(narration, timeline, timings)

const rawStreams = probeStreams(video).streams ?? []
const rawVideo = rawStreams.find(stream => stream.codec_type === 'video')
if (!rawVideo || rawVideo.width !== 1920 || rawVideo.height !== 1080) {
  throw new Error(`La grabación debe ser 1920 × 1080 real. Recibido: ${rawVideo?.width ?? 0} × ${rawVideo?.height ?? 0}.`)
}

const videoDuration = probeDuration(video)
if (!Number.isFinite(videoDuration) || videoDuration <= 0) throw new Error('No fue posible medir la duración del video bruto.')

mkdirSync(finalDir, { recursive: true })
const music = resolve(audioDir, 'ambient-original.wav')
writeAmbientWav(music, videoDuration)

const ordered = timeline.narration.map(item => ({
  ...item,
  file: timings.segments[item.id].file,
}))

const args = ['-y', '-i', video, '-i', music]
for (const item of ordered) args.push('-i', item.file)

const filters = ['[1:a]volume=0.075[music]']
const voiceLabels = []
ordered.forEach((item, index) => {
  const input = index + 2
  const label = `v${index}`
  filters.push(`[${input}:a]adelay=${Math.max(0, Math.round(item.startMs))}:all=1,volume=1.0[${label}]`)
  voiceLabels.push(`[${label}]`)
})

filters.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:duration=longest:normalize=0[voice]`)
filters.push(`[voice]apad=whole_dur=${videoDuration.toFixed(3)},atrim=0:${videoDuration.toFixed(3)}[voice_full]`)
filters.push('[voice_full]asplit=2[voice_sc][voice_mix]')
filters.push('[music][voice_sc]sidechaincompress=threshold=0.012:ratio=10:attack=20:release=550[ducked]')
filters.push(`[ducked][voice_mix]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.94,atrim=0:${videoDuration.toFixed(3)}[premaster]`)
filters.push('[premaster]loudnorm=I=-16:TP=-1:LRA=11,aresample=48000[aout]')

args.push(
  '-filter_complex', filters.join(';'),
  '-map', '0:v:0',
  '-map', '[aout]',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-r', '30',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-movflags', '+faststart',
  '-metadata', `title=${target.metadataTitle}`,
  '-max_muxing_queue_size', '2048',
  '-t', videoDuration.toFixed(3),
  outputPath,
)

const result = spawnSync('ffmpeg', args, { stdio: 'inherit' })
if (result.status !== 0) throw new Error(`FFmpeg terminó con código ${result.status}.`)

const finalStreams = probeStreams(outputPath).streams ?? []
const finalVideo = finalStreams.find(stream => stream.codec_type === 'video')
const finalAudio = finalStreams.find(stream => stream.codec_type === 'audio')
if (finalVideo?.codec_name !== 'h264' || finalVideo.width !== 1920 || finalVideo.height !== 1080) {
  throw new Error(`Salida de video inválida: ${finalVideo?.codec_name ?? 'sin codec'}, ${finalVideo?.width ?? 0} × ${finalVideo?.height ?? 0}.`)
}
if (finalAudio?.codec_name !== 'aac') throw new Error(`Salida de audio inválida: ${finalAudio?.codec_name ?? 'sin codec'}.`)

const finalDuration = probeDuration(outputPath)
if (Math.abs(finalDuration - videoDuration) > 0.35) {
  throw new Error(`La duración final (${finalDuration.toFixed(3)} s) no coincide con la grabación (${videoDuration.toFixed(3)} s).`)
}

console.log(`Video final ${target.id} validado: ${outputPath}`)
console.log(`Duración: ${finalDuration.toFixed(2)} s · 1920 × 1080 · H.264 + AAC`)
