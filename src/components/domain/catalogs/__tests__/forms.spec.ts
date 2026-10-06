import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { emptyProductInput } from '@/helpers/mipCatalogs'
import type { MipCatalogItem } from '@/types/mipCatalogs'
import MipProductForm from '../MipProductForm.vue'
import MipCatalogItemForm from '../MipCatalogItemForm.vue'
import ProductCoveragePicker from '../ProductCoveragePicker.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { for (const wrapper of wrappers) wrapper.unmount(); wrappers.length = 0 })
const pest: MipCatalogItem = { id: '10000000-0000-4000-8000-000000000001', clave: 'CUCARACHA', nombre: 'Cucaracha', clasificacion: 'RASTREROS', activo: true, version: 1 }

describe('formularios compartidos de catálogos', () => {
  it('crear/editar producto comparte campos sin lote ni vencimiento', async () => {
    const wrapper = mount(MipProductForm, { props: { modelValue: emptyProductInput(), options: { pests: [pest], methods: [] }, file: null } }); wrappers.push(wrapper)
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    expect(wrapper.find('input[name*=lote]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Fecha de vencimiento/)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('invalid')).toHaveLength(1)
    expect(wrapper.find('[aria-invalid=true]').exists()).toBe(true)
    await wrapper.setProps({ modelValue: { ...emptyProductInput(), nombre: 'Nombre precargado' } })
    expect((wrapper.get('#product-nombre').element as HTMLInputElement).value).toBe('Nombre precargado')
  })
  it('nombre y clasificación exclusivos en la misma forma de trampa/plaga', async () => {
    const wrapper = mount(MipCatalogItemForm, { props: { kind: 'traps', modelValue: { nombre: '', clasificacion: null } } }); wrappers.push(wrapper)
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(2)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('invalid')).toHaveLength(1)
    await wrapper.setProps({ kind: 'methods', modelValue: { nombre: 'Método precargado', clasificacion: null } })
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(0)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })
  it('selección de categoría conserva referencia simbólica y muestra inclusión', async () => {
    const wrapper = mount(ProductCoveragePicker, { props: { categories: [], pestIds: [pest.id], pests: [pest] } }); wrappers.push(wrapper)
    await wrapper.get('#product-coverage').trigger('click')
    await wrapper.findAll('input[type=checkbox]')[0]!.setValue(true)
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({ categorias: ['RASTREROS'], plagaIds: [] })
    await wrapper.setProps({ categories: ['RASTREROS'], pestIds: [] })
    expect(wrapper.text()).toContain('Incluida por categoría')
    const checkboxes = wrapper.findAll('input[type=checkbox]')
    expect(checkboxes[checkboxes.length - 1]?.attributes('disabled')).toBeDefined()
  })
})
