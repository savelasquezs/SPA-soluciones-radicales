import { describe, expect, it } from 'vitest'

import { formatPhone, normalizePhone, validateClientInput, validateSiteInput } from '@/helpers/clients'
import type { ClientInput, SiteInput } from '@/types/domain'

const business = (): ClientInput => ({ tipoCliente: 'NEGOCIO', nombre: 'Acme SAS', nit: '900123456', correos: [], activo: true, vigenciaCertificadoMeses: 12, residenciaDireccion: null, residenciaCelular: null })
const residence = (): ClientInput => ({ tipoCliente: 'RESIDENCIAL', nombre: 'María Gómez', nit: null, correos: [], activo: true, vigenciaCertificadoMeses: null, residenciaDireccion: 'Calle 1 # 2-3', residenciaCelular: '300 123 4567' })
const site = (): SiteInput => ({ nombre: 'Principal', direccion: 'Calle 10', correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: 'Ana', contactoPrincipalCorreo: null, contactoPrincipalCelular: '3001234567', valorServicio: 150000, periodicidadMeses: 1, manejaRefuerzo: false, planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null, duracionServicioMinutos: 120, activo: true })

describe('clientes helpers', () => {
  it('exige nombre, NIT y vigencia para Negocio', () => {
    expect(validateClientInput({ ...business(), nombre: '', nit: '', vigenciaCertificadoMeses: 0 })).toMatchObject({ nombre: expect.any(String), nit: expect.any(String), vigenciaCertificadoMeses: expect.any(String) })
  })

  it('exige únicamente nombre, celular y dirección para Casa', () => {
    expect(validateClientInput(residence())).toEqual({})
    expect(validateClientInput({ ...residence(), residenciaCelular: '', residenciaDireccion: '' })).toMatchObject({ residenciaCelular: expect.any(String), residenciaDireccion: expect.any(String) })
  })

  it('normaliza y muestra celulares colombianos', () => {
    expect(normalizePhone('300 123 4567')).toBe('+573001234567')
    expect(formatPhone('+573001234567')).toBe('300 123 4567')
  })

  it('valida contacto requerido y correo opcional de Sede', () => {
    expect(validateSiteInput(site())).toEqual({})
    expect(validateSiteInput({ ...site(), contactoPrincipalNombre: '', contactoPrincipalCelular: '', contactoPrincipalCorreo: 'incorrecto' })).toMatchObject({ contactoPrincipalNombre: expect.any(String), contactoPrincipalCelular: expect.any(String), contactoPrincipalCorreo: expect.any(String) })
  })
})
