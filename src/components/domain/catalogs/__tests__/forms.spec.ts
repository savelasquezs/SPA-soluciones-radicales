import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { emptyProductInput } from '@/helpers/mipCatalogs'
import type { MipCatalogItem } from '@/types/mipCatalogs'
import MipProductForm from '../MipProductForm.vue'
import MipCatalogItemForm from '../MipCatalogItemForm.vue'
import ProductCoveragePicker from '../ProductCoveragePicker.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers.length = 0
})

const pest: MipCatalogItem = {
  id: '10000000-0000-4000-8000-000000000001',
  clave: 'CUCARACHA',
  nombre: 'Cucaracha',
  clasificacion: 'RASTREROS',
  categoriaProducto: 'INSECTOS_RASTREROS',
  activo: true,
  version: 1,
}
const rodent: MipCatalogItem = {
  ...pest,
  id: '10000000-0000-4000-8000-000000000002',
  clave: 'ROEDOR',
  nombre: 'Roedor',
  categoriaProducto: 'ROEDORES',
}

describe('formularios compartidos de catálogos', () => {
  it('crear/editar producto comparte campos sin lote ni vencimiento', async () => {
    const wrapper = mount(MipProductForm, {
      props: {
        modelValue: emptyProductInput(),
        options: { pests: [pest, rodent], methods: [] },
        file: null,
      },
    })
    wrappers.push(wrapper)
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    expect(wrapper.find('input[name*=lote]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/Fecha de vencimiento/)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('invalid')).toHaveLength(1)
    expect(wrapper.find('[aria-invalid=true]').exists()).toBe(true)
    await wrapper.setProps({ modelValue: { ...emptyProductInput(), nombre: 'Nombre precargado' } })
    expect((wrapper.get('#product-nombre').element as HTMLInputElement).value).toBe('Nombre precargado')
  })

  it('trampas conservan solo monitoreo y métodos no muestran clasificaciones', async () => {
    const wrapper = mount(MipCatalogItemForm, {
      props: {
        kind: 'traps',
        modelValue: { nombre: '', clasificacion: null, categoriaProducto: null },
      },
    })
    wrappers.push(wrapper)
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(2)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('invalid')).toHaveLength(1)

    await wrapper.setProps({
      kind: 'methods',
      modelValue: { nombre: 'Método precargado', clasificacion: null, categoriaProducto: null },
    })
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(0)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('plagas separan monitoreo y categoría de producto', async () => {
    const wrapper = mount(MipCatalogItemForm, {
      props: {
        kind: 'pests',
        modelValue: { nombre: 'Mosca', clasificacion: null, categoriaProducto: null },
      },
    })
    wrappers.push(wrapper)

    await wrapper.get('input[value=VOLADORES]').setValue(true)
    const emitted = wrapper.emitted('update:modelValue')
    const automatic = emitted?.[emitted.length - 1]?.[0] as { nombre: string; clasificacion: 'VOLADORES'; categoriaProducto: 'INSECTOS_VOLADORES' }
    expect(automatic).toMatchObject({
      clasificacion: 'VOLADORES',
      categoriaProducto: 'INSECTOS_VOLADORES',
    })
    await wrapper.setProps({ modelValue: automatic })
    expect(wrapper.text()).toContain('Se asigna automáticamente a las plagas voladoras.')

    await wrapper.setProps({
      modelValue: { nombre: 'Roedor', clasificacion: 'RASTREROS', categoriaProducto: null },
    })
    expect(wrapper.find('input[value=INSECTOS_RASTREROS]').exists()).toBe(true)
    expect(wrapper.find('input[value=ROEDORES]').exists()).toBe(true)
  })

  it('selección de categoría conserva referencia simbólica y no absorbe roedores', async () => {
    const wrapper = mount(ProductCoveragePicker, {
      props: {
        categories: [],
        pestIds: [pest.id, rodent.id],
        pests: [pest, rodent],
      },
    })
    wrappers.push(wrapper)

    await wrapper.get('#product-coverage').trigger('click')
    const fieldsets = wrapper.findAll('fieldset')
    const categoryBoxes = fieldsets[0]!.findAll('input[type=checkbox]')
    await categoryBoxes[0]!.setValue(true)

    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual({
      categorias: ['INSECTOS_RASTREROS'],
      plagaIds: [rodent.id],
    })

    await wrapper.setProps({
      categories: ['INSECTOS_RASTREROS'],
      pestIds: [rodent.id],
    })
    expect(wrapper.text()).toContain('Incluida por categoría')
    expect(wrapper.text()).toContain('Roedor')
  })
})
