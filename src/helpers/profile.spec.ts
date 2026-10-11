import { describe, expect, it } from 'vitest'

import { certificateFieldErrors, personalFieldErrors, technicianCertificateStatus } from './profile'

describe('perfil personal', () => {
  it('valida nombre y celular, permitiendo colombianos o E.164', () => {
    expect(personalFieldErrors('Ana Pérez', '300 123 4567')).toEqual({})
    expect(personalFieldErrors('Ana Pérez', '+573001234567')).toEqual({})
    expect(personalFieldErrors(' ', '123')).toMatchObject({ nombre: expect.any(String), telefono: expect.any(String) })
  })

  it('requiere certificado y fechas cronológicamente válidas', () => {
    expect(certificateFieldErrors(null, null, null)).toMatchObject({
      file: expect.any(String), issue: expect.any(String), expiry: expect.any(String),
    })
    expect(certificateFieldErrors('cert.pdf', '2026-10-10', '2026-10-09').expiry).toBeTruthy()
    expect(certificateFieldErrors('cert.pdf', '2026-10-10', '2027-10-10')).toEqual({})
  })

  it('muestra vigencia y vencimiento sin depender del reloj del dispositivo', () => {
    expect(technicianCertificateStatus(null, '2026-10-10').label).toBe('Sin certificado')
    expect(technicianCertificateStatus('2026-09-10', '2026-10-10').label).toBe('Vencido')
    expect(technicianCertificateStatus('2026-10-31', '2026-10-10').label).toBe('Por vencer')
    expect(technicianCertificateStatus('2027-01-31', '2026-10-10').label).toBe('Vigente')
  })
})
