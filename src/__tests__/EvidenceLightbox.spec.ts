import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'
import EvidenceLightbox from '@/components/base/EvidenceLightbox.vue'
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open','') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})
const initial = { open: true, index: 0, total: 2, title: 'Puesto 01', caption: 'Servicio de prueba', url: 'https://storage.example.test/photo.jpg', state: 'AVAILABLE' as const }
describe('EvidenceLightbox', () => {
  it('supports arrows, zoom, reset and close without editing photos', async () => {
    const wrapper = mount(EvidenceLightbox, { props: initial })
    await wrapper.find('img').trigger('load')
    await wrapper.find('[aria-label="Ampliar zoom"]').trigger('click')
    expect(wrapper.text()).toContain('150 %')
    await wrapper.find('[aria-label="Ajustar fotografía"]').trigger('click')
    expect(wrapper.text()).toContain('100 %')
    await wrapper.find('dialog').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')?.[0]).toEqual([1])
    await wrapper.find('[aria-label="Cerrar visor"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Eliminar')
    wrapper.unmount()
  })
  it('renders expired and retry states without a broken image', async () => {
    const wrapper = mount(EvidenceLightbox, { props: { ...initial, state: 'EXPIRED', url: null } })
    expect(wrapper.text()).toContain('Foto vencida')
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ state: 'ERROR' })
    await wrapper.findAll('button').find(button => button.text() === 'Reintentar')!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    await wrapper.find('dialog').trigger('cancel')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
