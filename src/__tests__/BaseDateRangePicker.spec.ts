import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'

import BaseDateRangePicker from '@/components/base/BaseDateRangePicker.vue'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

function lastEmission(wrapper: VueWrapper): unknown[] | undefined {
  const emissions = wrapper.emitted('update:modelValue')
  return emissions?.[emissions.length - 1]
}

describe('BaseDateRangePicker', () => {
  it('permite escribir ambos extremos sin teclear barras', async () => {
    const wrapper = mount(BaseDateRangePicker, {
      attachTo: document.body,
      props: { modelValue: { from: '', to: '' } },
    })

    const inputs = wrapper.findAll('.date-segments input')
    await inputs[0]!.setValue('10')
    await inputs[1]!.setValue('10')
    await inputs[2]!.setValue('1994')
    await inputs[2]!.trigger('blur')
    await wrapper.vm.$nextTick()
    expect(lastEmission(wrapper)).toEqual([{ from: '1994-10-10', to: '' }])

    await wrapper.setProps({ modelValue: { from: '1994-10-10', to: '' } })
    const updatedInputs = wrapper.findAll('.date-segments input')
    await updatedInputs[3]!.setValue('18')
    await updatedInputs[4]!.setValue('10')
    await updatedInputs[5]!.setValue('1994')
    await updatedInputs[5]!.trigger('blur')
    await wrapper.vm.$nextTick()

    expect(lastEmission(wrapper)).toEqual([{ from: '1994-10-10', to: '1994-10-18' }])
    wrapper.unmount()
  })

  it('usa un solo control y un calendario de rango compacto', async () => {
    const wrapper = mount(BaseDateRangePicker, {
      attachTo: document.body,
      props: { modelValue: { from: '2026-05-01', to: '2026-05-02' }, label: 'Rango' },
    })

    expect(wrapper.findAll('.date-range-control')).toHaveLength(1)
    expect(wrapper.findAll('.date-segments')).toHaveLength(2)
    await wrapper.get('button[aria-label="Seleccionar rango de fechas"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('dialog').classes()).toContain('base-dialog--compact')

    await wrapper.get('button[aria-label="10 mayo 2026"]').trigger('click')
    await wrapper.get('button[aria-label="18 mayo 2026"]').trigger('click')
    expect(wrapper.get('button[aria-label="11 mayo 2026"]').classes()).toContain('is-in-range')
    await wrapper.get('.base-dialog__footer button:last-child').trigger('click')

    expect(lastEmission(wrapper)).toEqual([{ from: '2026-05-10', to: '2026-05-18' }])
    wrapper.unmount()
  })

  it('normaliza el rango si la segunda fecha elegida es anterior', async () => {
    const wrapper = mount(BaseDateRangePicker, {
      attachTo: document.body,
      props: { modelValue: { from: '2026-05-01', to: '2026-05-02' } },
    })

    await wrapper.get('button[aria-label="Seleccionar rango de fechas"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="18 mayo 2026"]').trigger('click')
    await wrapper.get('button[aria-label="10 mayo 2026"]').trigger('click')
    await wrapper.get('.base-dialog__footer button:last-child').trigger('click')

    expect(lastEmission(wrapper)).toEqual([{ from: '2026-05-10', to: '2026-05-18' }])
    wrapper.unmount()
  })
})
