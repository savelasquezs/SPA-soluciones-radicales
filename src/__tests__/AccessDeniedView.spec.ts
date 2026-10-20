import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useAnotherAccount, logout, replace, show, session } = vi.hoisted(() => ({
  useAnotherAccount: vi.fn<() => Promise<void>>(),
  logout: vi.fn<() => Promise<void>>(),
  replace: vi.fn<(path: string) => Promise<void>>(),
  show: vi.fn<(message: string, kind: string) => void>(),
  session: { authEmail: 'invitado@gmail.com' },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ ...session, useAnotherAccount, logout }),
}))

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({ show }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
}))

import AccessDeniedView from '@/views/AccessDeniedView.vue'

describe('AccessDeniedView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.authEmail = 'invitado@gmail.com'
    useAnotherAccount.mockResolvedValue()
    logout.mockResolvedValue()
    replace.mockResolvedValue()
  })

  it('explica el bloqueo sin repetir mensajes técnicos y muestra la identidad denegada', () => {
    const wrapper = mount(AccessDeniedView)

    expect(wrapper.get('h1').text()).toBe('Acceso restringido')
    expect(wrapper.text()).toContain('Cuenta: invitado@gmail.com')
    expect(wrapper.text()).toContain('Solicita autorización a un administrador.')
    expect(wrapper.text()).not.toContain('La cuenta no está autorizada')
    expect(wrapper.findAll('button').map(button => button.text())).toEqual([
      'Cambiar de cuenta',
      'Cerrar sesión',
    ])
  })

  it('omite la etiqueta del correo si el proveedor no devolvió una identidad visible', () => {
    session.authEmail = ''
    const wrapper = mount(AccessDeniedView)

    expect(wrapper.find('.denied-card__email').exists()).toBe(false)
  })

  it('cambia de Google sin pedir acceso desde la vista', async () => {
    const wrapper = mount(AccessDeniedView)
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()

    expect(useAnotherAccount).toHaveBeenCalledOnce()
    expect(logout).not.toHaveBeenCalled()
  })

  it('cierra sesión y retorna al acceso al elegir la segunda acción', async () => {
    const wrapper = mount(AccessDeniedView)
    await wrapper.findAll('button')[1]!.trigger('click')
    await flushPromises()

    expect(logout).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith('/acceso')
    expect(useAnotherAccount).not.toHaveBeenCalled()
  })

  it('informa el fallo de cambio de cuenta sin navegar', async () => {
    useAnotherAccount.mockRejectedValueOnce(new Error('No fue posible cambiar de cuenta'))
    const wrapper = mount(AccessDeniedView)
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()

    expect(show).toHaveBeenCalledWith('No fue posible cambiar de cuenta', 'error')
    expect(replace).not.toHaveBeenCalled()
  })
})
