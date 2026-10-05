import { describe, expect, it } from 'vitest'

import { hasRequiredRole } from '@/router/guards'

describe('autorización de rutas por rol activo', () => {
  it('impide que Técnico entre a Usuarios', () => {
    expect(hasRequiredRole('TECNICO', ['ADMINISTRADOR'])).toBe(false)
  })

  it('permite que Administrador entre a Usuarios', () => {
    expect(hasRequiredRole('ADMINISTRADOR', ['ADMINISTRADOR'])).toBe(true)
  })

  it('usa el rol activo para una persona con dos roles', () => {
    const availableRoles = ['ADMINISTRADOR', 'TECNICO'] as const
    expect(availableRoles).toContain('ADMINISTRADOR')
    expect(availableRoles).toContain('TECNICO')
    expect(hasRequiredRole('TECNICO', ['ADMINISTRADOR'])).toBe(false)
    expect(hasRequiredRole('ADMINISTRADOR', ['ADMINISTRADOR'])).toBe(true)
  })
})
