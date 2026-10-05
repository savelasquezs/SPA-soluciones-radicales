import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUser, getUser, listUsers, updateUser } from '@/services/usersService'
import { useNotificationsStore } from '@/stores/notifications'
import type { UserInput, UserRecord } from '@/types/domain'
import UsersView from '@/views/UsersView.vue'

vi.mock('@/services/usersService', () => ({
  listUsers: vi.fn<() => Promise<UserRecord[]>>(),
  getUser: vi.fn<(id: string) => Promise<UserRecord>>(),
  createUser: vi.fn<(input: UserInput) => Promise<UserRecord>>(),
  updateUser: vi.fn<(id: string, input: UserInput) => Promise<UserRecord>>(),
  setUserActive: vi.fn<(user: UserRecord, active: boolean) => Promise<UserRecord>>(),
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
  vi.mocked(updateUser).mockImplementation(async (_id, input) => user({ ...input, id: _id, version: 2 }))
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
    expect(wrapper.text()).toContain('Acciones')
  })

  it('usa el mismo diálogo para crear y editar sin renderizar un perfil inline', async () => {
    vi.mocked(getUser).mockResolvedValue(user({
      authUserId: 'google-user-1',
      nombreCompleto: 'Ana Pérez Actualizada',
      correoGoogle: 'ana@gmail.com',
    }))

    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.find('.profile-grid').exists()).toBe(false)
    await wrapper.get('button[aria-label="Editar Ana Pérez"]').trigger('click')
    await flushPromises()

    expect(getUser).toHaveBeenCalledWith('user-1')
    expect(wrapper.text()).toContain('Editar usuario')
    expect(wrapper.get<HTMLInputElement>('#user-name').element.value).toBe('Ana Pérez Actualizada')
    expect(wrapper.get<HTMLInputElement>('#user-email').element.disabled).toBe(true)
    expect(wrapper.find('#user-status').exists()).toBe(true)
    wrapper.unmount()
  })

  it('oculta y muestra el certificado según Rol técnico al crear', async () => {
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Agregar usuario')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Datos del usuario')
    expect(wrapper.text()).toContain('Acceso y roles')
    expect(wrapper.text()).toContain('Certificado técnico')
    expect(wrapper.text()).not.toContain('Adjuntar certificado')
    expect(wrapper.text()).toContain('Seleccionar archivo')
    await wrapper.get('#user-technician').setValue('NO')
    expect(wrapper.find('#user-certificate').exists()).toBe(false)
    await wrapper.get('#user-technician').setValue('SI')
    expect(wrapper.find('#user-certificate').exists()).toBe(true)
    wrapper.unmount()
  })

  it('conserva los datos del formulario cuando falla el servicio remoto al crear', async () => {
    vi.mocked(createUser).mockRejectedValue(new Error('Error remoto controlado'))
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Agregar usuario')!.trigger('click')
    await wrapper.get('#user-name').setValue('María López')
    await wrapper.get('#user-email').setValue('maria@example.com')
    await wrapper.get('#user-form').trigger('submit')
    await flushPromises()

    expect(createUser).toHaveBeenCalledOnce()
    expect(wrapper.get<HTMLInputElement>('#user-name').element.value).toBe('María López')
    expect(wrapper.get<HTMLInputElement>('#user-email').element.value).toBe('maria@example.com')
    const notifications = useNotificationsStore().items
    expect(notifications[notifications.length - 1]?.message).toBe('Error remoto controlado')
    wrapper.unmount()
  })

  it('guarda la edición y actualiza la fila con la respuesta definitiva', async () => {
    const wrapper = mount(UsersView, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('button[aria-label="Editar Ana Pérez"]').trigger('click')
    await flushPromises()

    await wrapper.get('#user-name').setValue('Ana Pérez Editada')
    await wrapper.get('#user-form').trigger('submit')
    await flushPromises()

    expect(updateUser).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Ana Pérez Editada')
    expect(wrapper.find('dialog[open]').exists()).toBe(false)
    wrapper.unmount()
  })
})
