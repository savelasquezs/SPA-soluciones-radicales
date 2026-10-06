import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as service from '@/services/clientsService'
import type { ClientRecord } from '@/types/domain'
import ClientsView from '@/views/ClientsView.vue'

vi.mock('@/services/clientsService', () => ({
  listClients: vi.fn<typeof import('@/services/clientsService').listClients>(),
  getClient: vi.fn<typeof import('@/services/clientsService').getClient>(),
  createClient: vi.fn<typeof import('@/services/clientsService').createClient>(),
  updateClient: vi.fn<typeof import('@/services/clientsService').updateClient>(),
  deleteClient: vi.fn<typeof import('@/services/clientsService').deleteClient>(),
  listSites: vi.fn<typeof import('@/services/clientsService').listSites>(),
  getSite: vi.fn<typeof import('@/services/clientsService').getSite>(),
  createSite: vi.fn<typeof import('@/services/clientsService').createSite>(),
  updateSite: vi.fn<typeof import('@/services/clientsService').updateSite>(),
  deleteSite: vi.fn<typeof import('@/services/clientsService').deleteSite>(),
  listAreas: vi.fn<typeof import('@/services/clientsService').listAreas>(),
  createArea: vi.fn<typeof import('@/services/clientsService').createArea>(),
  updateArea: vi.fn<typeof import('@/services/clientsService').updateArea>(),
  deleteArea: vi.fn<typeof import('@/services/clientsService').deleteArea>(),
  listClientHistory: vi.fn<typeof import('@/services/clientsService').listClientHistory>(),
  listSiteHistory: vi.fn<typeof import('@/services/clientsService').listSiteHistory>(),
  listFormOptions: vi.fn<typeof import('@/services/clientsService').listFormOptions>(),
}))

const loaded: ClientRecord = { id: 'client-1', tipoCliente: 'NEGOCIO', nombre: 'Acme SAS', nit: '900123', correos: ['admin@acme.co'], activo: true, version: 1, vigenciaCertificadoMeses: 12, residenciaDireccion: null, residenciaCelular: null, sedesCount: 2 }

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(service.listClients).mockResolvedValue([loaded])
  vi.mocked(service.updateClient).mockImplementation(async (_id, input) => ({ ...loaded, ...input, version: 2, sedesCount: 2 }))
})

describe('Clientes listado', () => {
  it('abre Editar con el registro listado, hace PATCH y actualiza sin GET ni refetch', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/clientes', component: ClientsView }] })
    await router.push('/clientes')
    await router.isReady()
    const wrapper = mount(ClientsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('button[aria-label="Editar Acme SAS"]').trigger('click')
    expect(service.getClient).not.toHaveBeenCalled()
    expect(wrapper.get<HTMLInputElement>('#client-name').element.value).toBe('Acme SAS')

    await wrapper.get('#client-name').setValue('Acme Editado')
    await wrapper.get('#client-form').trigger('submit')
    await flushPromises()

    expect(service.updateClient).toHaveBeenCalledOnce()
    expect(service.listClients).toHaveBeenCalledOnce()
    expect(service.getClient).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Acme Editado')
    wrapper.unmount()
  })
})
