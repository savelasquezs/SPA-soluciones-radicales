import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AreaForm from '@/components/domain/clients/AreaForm.vue'
import ClientForm from '@/components/domain/clients/ClientForm.vue'
import SiteForm from '@/components/domain/clients/SiteForm.vue'
import type { AreaInput, ClientInput, SiteInput } from '@/types/domain'

const client = (type: ClientInput['tipoCliente']): ClientInput => ({ tipoCliente: type, nombre: type === 'NEGOCIO' ? 'Acme SAS' : 'María Gómez', nit: type === 'NEGOCIO' ? '900123' : null, correos: [], activo: true, vigenciaCertificadoMeses: type === 'NEGOCIO' ? 12 : null, residenciaDireccion: type === 'RESIDENCIAL' ? 'Calle 1' : null, residenciaCelular: type === 'RESIDENCIAL' ? '+573001234567' : null })
const site = (): SiteInput => ({ nombre: 'Principal', direccion: 'Calle 1', correos: [], heredaCorreosCliente: true, contactoPrincipalNombre: 'Ana', contactoPrincipalCorreo: null, contactoPrincipalCelular: '+573001234567', valorServicio: 100000, periodicidadMeses: 1, manejaRefuerzo: false, planoStoragePath: null, manejaVehiculos: false, generaCertificadoVehiculo: false, vigenciaCertificadoVehiculoMeses: null, duracionServicioMinutos: 120, activo: true })

describe('formularios compartidos de Clientes', () => {
  it('ClientForm muestra reglas de Negocio y oculta esos campos para Casa', async () => {
    const wrapper = mount(ClientForm, { props: { modelValue: client('NEGOCIO'), mode: 'create' } })
    expect(wrapper.find('#client-nit').exists()).toBe(true)
    expect(wrapper.text()).toContain('Certificado de establecimiento')
    expect(wrapper.find('[name="client-certificate-template"]').exists()).toBe(false)
    await wrapper.setProps({ modelValue: client('RESIDENCIAL') })
    expect(wrapper.find('#client-nit').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Certificado de establecimiento')
    expect(wrapper.find('#client-phone').exists()).toBe(true)
    expect(wrapper.find('#client-address').exists()).toBe(true)
  })

  it('ClientForm en edición recibe el snapshot inicial y bloquea el tipo', () => {
    const wrapper = mount(ClientForm, { props: { modelValue: client('NEGOCIO'), mode: 'edit' } })
    expect(wrapper.get<HTMLInputElement>('#client-name').element.value).toBe('Acme SAS')
    expect(wrapper.get<HTMLSelectElement>('#client-type').element.disabled).toBe(true)
  })

  it('SiteForm exige contacto y no contiene certificado de establecimiento', async () => {
    const wrapper = mount(SiteForm, { props: { modelValue: site(), mode: 'create' } })
    expect(wrapper.find('#site-contact').exists()).toBe(true)
    expect(wrapper.find('#site-phone').exists()).toBe(true)
    expect(wrapper.text()).toContain('Certificado de establecimiento: configuración de Cliente.')
    expect(wrapper.find('[name="site-establishment-certificate"]').exists()).toBe(false)
    await wrapper.setProps({ modelValue: { ...site(), manejaVehiculos: true, generaCertificadoVehiculo: true, vigenciaCertificadoVehiculoMeses: 12 } })
    expect(wrapper.find('[name="site-vehicle-months"]').exists()).toBe(true)
    expect(wrapper.find('[name="site-vehicle-template"]').exists()).toBe(false)
  })

  it('AreaForm sirve para crear y editar con el mismo árbol', () => {
    const input: AreaInput = { nombre: 'Cocina', esExterna: false, activo: true }
    const create = mount(AreaForm, { props: { modelValue: input, mode: 'create' } })
    const edit = mount(AreaForm, { props: { modelValue: { ...input, version: 2 }, mode: 'edit' } })
    expect(create.html().replace('Cocina', '')).toContain('area-name')
    expect(edit.get<HTMLInputElement>('#area-name').element.value).toBe('Cocina')
  })
})
