import { describe, expect, it } from 'vitest'
import { formatTechnicianDateTime, isExactAreaPermutation, moveTechnicianArea, nextTechnicianArea, orderedTechnicianAreas, sortTechnicianServices, technicianAreaResolved, technicianServiceStateLabel } from '@/helpers/technicianServices'
import type { TechnicianArea, TechnicianServiceSummary } from '@/types/technicianServices'

const record = (id: string, estado: TechnicianServiceSummary['estado'], inicioProgramado: string): TechnicianServiceSummary => ({
  id,
  solicitud: id,
  tipoServicio: 'PRINCIPAL',
  estado,
  version: 1,
  inicioProgramado,
  finProgramado: inicioProgramado,
  inicioReal: null,
  clienteNombre: 'Cliente',
  sedeNombre: 'Sede',
  direccion: 'Dirección',
})

describe('technician service presentation', () => {
  it('prioritizes active work, upcoming visits and recent history', () => {
    const result = sortTechnicianServices([
      record('final-old', 'FINALIZADO', '2026-10-01T14:00:00Z'),
      record('planned', 'PROGRAMADO', '2026-10-08T14:00:00Z'),
      record('progress', 'EN_PROCESO', '2026-10-07T14:00:00Z'),
      record('final-new', 'FINALIZADO', '2026-10-06T14:00:00Z'),
    ])
    expect(result.map(item => item.id)).toEqual(['progress', 'planned', 'final-new', 'final-old'])
  })

  it('formats domain states and Bogotá dates for the field UI', () => {
    expect(technicianServiceStateLabel('EN_PROCESO')).toBe('En proceso')
    expect(formatTechnicianDateTime('2026-10-07T14:00:00Z')).toContain('9:00')
  })
})

const area = (id: string, position: number, resolved = false): TechnicianArea => ({
  id,
  areaId: id,
  nombre: id,
  esExterna: false,
  posicionInicial: position,
  posicionRecorrido: position,
  sinAcceso: false,
  sinAccesoDescripcion: null,
  sinAccesoFotoStoragePath: null,
  version: 1,
  criterios: [{ id: `${id}-criterion`, criterioId: `${id}-criterion`, nombre: 'Criterio', soloAreaExterna: false, evaluacion: resolved ? 'C' : null, observacion: null, evidenciasStoragePaths: [], version: 1 }],
  dispositivos: [],
})

describe('technician area route', () => {
  it('orders and moves areas without mutating the source', () => {
    const records = [area('c', 2), area('a', 0), area('b', 1)]
    expect(orderedTechnicianAreas(records).map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(moveTechnicianArea(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveTechnicianArea(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(records.map(item => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('accepts only an exact permutation', () => {
    expect(isExactAreaPermutation(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(isExactAreaPermutation(['a', 'b'], ['a', 'a'])).toBe(false)
    expect(isExactAreaPermutation(['a', 'b'], ['a'])).toBe(false)
  })

  it('uses criteria, device reviews and the complete no-access exception', () => {
    expect(technicianAreaResolved(area('a', 0, true))).toBe(true)
    expect(technicianAreaResolved({ ...area('a', 0, true), dispositivos: [{ id: 'd', dispositivoId: 'd', numero: '1', ubicacion: 'x', tipoCodigo: 'TRAMPA', estadoAnterior: 'ACTIVO', revisado: false }] })).toBe(false)
    expect(technicianAreaResolved({ ...area('a', 0), sinAcceso: true, sinAccesoDescripcion: 'Cerrada', sinAccesoFotoStoragePath: 'services/photo.jpg' })).toBe(true)
    expect(technicianAreaResolved({ ...area('a', 0), sinAcceso: true, sinAccesoDescripcion: 'Cerrada', sinAccesoFotoLocalId: 'local-photo' })).toBe(true)
  })

  it('wraps to an earlier pending area and never returns the current area', () => {
    const records = [area('a', 0), area('b', 1, true), area('c', 2, true)]
    expect(nextTechnicianArea(records, 'b')).toMatchObject({ kind: 'AREA', area: { id: 'a' } })
    expect(nextTechnicianArea(records, 'a')).toEqual({ kind: 'PENDING' })
    expect(nextTechnicianArea(records.map(item => ({ ...item, criterios: item.criterios.map(criterion => ({ ...criterion, evaluacion: 'C' })) })), 'a')).toEqual({ kind: 'CLOSURE' })
  })

  it('handles empty and single-area routes without circular navigation', () => {
    expect(nextTechnicianArea([], 'missing')).toEqual({ kind: 'CLOSURE' })
    expect(nextTechnicianArea([area('a', 0)], 'a')).toEqual({ kind: 'PENDING' })
    expect(nextTechnicianArea([area('a', 0, true)], 'a')).toEqual({ kind: 'CLOSURE' })
  })
})
