import type { ServiceResultsData } from '../../../src/types/serviceResults'
import { createHash, randomBytes } from 'node:crypto'

export function newReportToken(): string {
  return randomBytes(32).toString('base64url')
}
export function reportTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
export function validReportToken(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw)
}

export function reportPaths(data: ServiceResultsData): string[] {
  const unique = new Set<string>()
  const historicFinding = /^services\/[0-9a-f-]{36}\/(?:findings\/[0-9a-f-]{36}\/(?:opening|closure|followup)|criteria\/[0-9a-f-]{36}\/evidence)\/[^/]+\.(?:png|jpe?g|webp)$/i
  const add = (path: string | null | undefined, finding = false) => {
    if (path && !path.includes('..') &&
      (path.startsWith('services/' + data.id + '/') || (finding && historicFinding.test(path)))) unique.add(path)
  }
  for (const area of data.areas) {
    area.fotos.forEach(path => add(path))
    for (const item of area.criterios) item.fotos.forEach(path => add(path))
    for (const item of area.puntos) add(item.foto)
    for (const item of area.hallazgos) {
      item.fotos.forEach(path => add(path, true))
      for (const review of item.seguimientos) review.fotos.forEach(path => add(path, true))
    }
  }
  add(data.firmaTecnico)
  add(data.firmaCliente)
  return [...unique]
}
/** Public JSON uses opaque evidence references, never R2 storage paths or database IDs. */
export function publicReportData(data: ServiceResultsData): ServiceResultsData {
  const paths = reportPaths(data)
  const byPath = new Map(paths.map((path, index) => [path, 'e:' + index]))
  const key = (path: string) => byPath.get(path) ?? ''
  return {
    ...data,
    id: 'public',
    firmaTecnico: key(data.firmaTecnico),
    firmaCliente: key(data.firmaCliente),
    areas: data.areas.map((area, index) => ({
      ...area,
      id: String(index + 1),
      fotos: area.fotos.map(key).filter(Boolean),
      criterios: area.criterios.map((item, position) => ({ ...item, id: String(position + 1), criterioId: item.criterioId ? 'criterion:' + (position + 1) : undefined, fotos: item.fotos.map(key).filter(Boolean) })),
      puntos: area.puntos.map(item => ({ ...item, foto: item.foto ? key(item.foto) : null })),
      hallazgos: area.hallazgos.map(item => ({
        ...item, criterioId: item.criterioId && area.criterios.some(criterion => criterion.criterioId === item.criterioId)
          ? 'criterion:' + (area.criterios.findIndex(criterion => criterion.criterioId === item.criterioId) + 1) : null, fotos: item.fotos.map(key).filter(Boolean),
        seguimientos:item.seguimientos.map(review=>({...review,fotos:review.fotos.map(key).filter(Boolean)})),
      })),
    })),
  }
}
