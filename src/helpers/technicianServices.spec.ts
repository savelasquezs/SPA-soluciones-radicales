import { describe, expect, it } from 'vitest'
import { formatTechnicianDateTime, sortTechnicianServices, technicianServiceStateLabel } from '@/helpers/technicianServices'
import type { TechnicianServiceSummary } from '@/types/technicianServices'

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
