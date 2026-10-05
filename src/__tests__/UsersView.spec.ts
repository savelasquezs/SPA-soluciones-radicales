import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUser, getUser, listUsers } from '@/services/usersService'
import { useNotificationsStore } from '@/stores/notifications'
import type { UserRecord } from '@/types/domain'
import UsersView from '@/views/UsersView.vue'

vi.mock('@/services/usersService', () => ({
  UserServiceError: class UserServiceError extends Error {
    retryable = true
  },
  listUsers: vi.fn<() => Promise<UserRecord[]>>(),
  getUser: vi.fn<(id: string) => Promise<UserRecord>>(),
  createUser: vi.fn<() => Promise<UserRecord>>(),
  updateUser: vi.fn<() => Promise<UserRecord>>(),
  setUserActive: vi.fn<() => Promise<UserRecord>>(),
  updateUserCertificate: vi.fn<() => Promise<UserRecord>>(),
}))

const user = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: 'user-1',
  authUserId: null,
  nombreCompleto: 'Ana Pérez',
  correoGoogle: 'ana@example.com',
  esAdmin: true,
  esTecnico: true,
  activo: true,
  certificadoStoragePath: null,
  certificadoFechaEmision: null,
  certificadoFechaVencimiento: null,
  certificadoObservaciones: null,
  version: 1,
  ...overrides,
})

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(listUsers).mockResolvedValue([
    user(),
    user({ id: 'user-2', nombreCompleto: 'Luis Mora', correoGoogle: 'luis@example.com', esAdmin: false, esTecnico: true, activo: false }),
  ])
  vi.mocked(getUser).mockImplementation(async (id) => user({ id }))
})

describe('Usuarios', () => {
  it('muestra dos roles, estados de usuario y credencial opcional', async () => {
    const wrapper = mount(UsersView)
    await flushPromises()

    expect(wrapper.text()).toContain('Administrador')
    expect(wrapper.text()).toContain('Técnico')
    expect(wrapper.text()).toContain('Activo')
    expect(wrapper.text()).toContain('Inactivo')
    expect(wrapper.text()).toContain('Sin certificado')
  })

  it('oculta y muestra el certificado según Rol técnico', async () => {
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Agregar usuario')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Certificado técnico')
    await wrapper.get('#create-technician').setValue('NO')
    expect(wrapper.find('#create-certificate').exists()).toBe(false)
    await wrapper.get('#create-technician').setValue('SI')
    expect(wrapper.find('#create-certificate').exists()).toBe(true)
    wrapper.unmount()
  })

  it('conserva los datos del formulario cuando falla el servicio remoto', async () => {
    vi.mocked(createUser).mockRejectedValue(new Error('Error remoto controlado'))
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Agregar usuario')!.trigger('click')
    await wrapper.get('#create-name').setValue('María López')
    await wrapper.get('#create-email').setValue('maria@example.com')
    await wrapper.get('#create-user-form').trigger('submit')
    await flushPromises()

    expect(createUser).toHaveBeenCalledOnce()
    expect(wrapper.get<HTMLInputElement>('#create-name').element.value).toBe('María López')
    expect(wrapper.get<HTMLInputElement>('#create-email').element.value).toBe('maria@example.com')
    const notifications = useNotificationsStore().items
    expect(notifications[notifications.length - 1]?.message).toBe('Error remoto controlado')
    wrapper.unmount()
  })
})
