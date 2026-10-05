import { describe, expect, it } from 'vitest'

import { certificateStatus, validateUserInput } from '@/helpers/users'
import type { UserInput, UserRecord } from '@/types/domain'

const baseInput = (overrides: Partial<UserInput> = {}): UserInput => ({
  nombreCompleto: 'Ana Pérez',
  correoGoogle: 'ana@example.com',
  esAdmin: false,
  esTecnico: true,
  activo: true,
  certificadoStoragePath: null,
  certificadoFechaEmision: null,
  certificadoFechaVencimiento: null,
  certificadoObservaciones: null,
  ...overrides,
})

const statusUser = (overrides: Partial<UserRecord>): UserRecord => ({
  id: 'user-1',
  authUserId: null,
  nombreCompleto: 'Ana Pérez',
  correoGoogle: 'ana@example.com',
  esAdmin: false,
  esTecnico: true,
  activo: true,
  certificadoStoragePath: null,
  certificadoFechaEmision: null,
  certificadoFechaVencimiento: null,
  certificadoObservaciones: null,
  version: 1,
  ...overrides,
})

describe('validación de usuarios', () => {
  it('valida nombre, correo y al menos un rol', () => {
    const errors = validateUserInput(baseInput({ nombreCompleto: ' ', correoGoogle: 'correo', esTecnico: false }), null)
    expect(errors.nombreCompleto).toBeTruthy()
    expect(errors.correoGoogle).toBeTruthy()
    expect(errors.roles).toBeTruthy()
  })

  it('permite un técnico sin certificado', () => {
    expect(validateUserInput(baseInput(), null)).toEqual({})
  })

  it('exige ambas fechas cuando se adjunta un certificado', () => {
    const file = new File(['pdf'], 'certificado.pdf', { type: 'application/pdf' })
    expect(validateUserInput(baseInput(), file).certificadoFechaEmision).toBeTruthy()
    expect(validateUserInput(baseInput({ certificadoFechaEmision: '2026-01-01' }), file).certificadoFechaVencimiento).toBeTruthy()
    expect(validateUserInput(baseInput({ certificadoFechaEmision: '2026-01-01', certificadoFechaVencimiento: '2027-01-01' }), file)).toEqual({})
  })

  it('rechaza un vencimiento anterior a la emisión', () => {
    const file = new File(['pdf'], 'certificado.pdf', { type: 'application/pdf' })
    const errors = validateUserInput(baseInput({ certificadoFechaEmision: '2026-05-02', certificadoFechaVencimiento: '2026-05-01' }), file)
    expect(errors.certificadoFechaVencimiento).toContain('anterior')
  })
})

describe('estado de credenciales', () => {
  const today = '2026-10-04'

  it.each([
    ['No aplica', statusUser({ esTecnico: false }), 'not-applicable'],
    ['Sin certificado', statusUser({}), 'none'],
    ['Vigente', statusUser({ certificadoStoragePath: 'certificados/ana.pdf', certificadoFechaVencimiento: '2027-01-01' }), 'valid'],
    ['Por vencer', statusUser({ certificadoStoragePath: 'certificados/ana.pdf', certificadoFechaVencimiento: '2026-10-20' }), 'expiring'],
    ['Vencido', statusUser({ certificadoStoragePath: 'certificados/ana.pdf', certificadoFechaVencimiento: '2026-10-03' }), 'expired'],
  ])('%s', (_label, user, expected) => {
    expect(certificateStatus(user, today)).toBe(expected)
  })
})
