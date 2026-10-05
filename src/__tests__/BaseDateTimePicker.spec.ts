import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeAll, describe, expect, it } from 'vitest'

import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open') }
})

async function openPicker(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('button[aria-label^="Seleccionar"]').trigger('click')
  await wrapper.vm.$nextTick()
}

function lastEmission(wrapper: VueWrapper): unknown[] | undefined {
  const emissions = wrapper.emitted('update:modelValue')
  return emissions?.[emissions.length - 1]
}

describe('BaseDateTimePicker', () => {
  it('edita una fecha, cambia mes y año y respeta min/max', async () => {
    const wrapper = mount(BaseDateTimePicker, {
      attachTo: document.body,
      props: { modelValue: '2026-05-15', mode: 'date', label: 'Fecha', min: '2026-05-10', max: '2027-06-20' },
    })
    await openPicker(wrapper)

    const selects = wrapper.findAll('.calendar__selectors select')
    await selects[0]!.setValue('6')
    await selects[1]!.setValue('2027')
    expect(wrapper.get('button[aria-label="21 junio 2027"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="20 junio 2027"]').trigger('click')
    await wrapper.get('.base-dialog__footer button:last-child').trigger('click')
    expect(lastEmission(wrapper)).toEqual(['2027-06-20'])
    wrapper.unmount()
  })

  it('cambia mes con controles y navega el calendario con teclado', async () => {
    const wrapper = mount(BaseDateTimePicker, {
      attachTo: document.body,
      props: { modelValue: '2026-05-15', mode: 'date', label: 'Fecha' },
    })
    await openPicker(wrapper)
    await wrapper.get('button[aria-label="Mes siguiente"]').trigger('click')
    expect(wrapper.text()).toContain('junio')
    const day = wrapper.get('button[aria-label="15 junio 2026"]')
    await day.trigger('keydown', { key: 'ArrowRight' })
    await wrapper.vm.$nextTick()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('16 junio 2026')
    wrapper.unmount()
  })

  it('soporta hora y minuteStep', async () => {
    const wrapper = mount(BaseDateTimePicker, {
      attachTo: document.body,
      props: { modelValue: null, mode: 'time', label: 'Hora', minuteStep: 15 },
    })
    await openPicker(wrapper)
    const selects = wrapper.findAll('.time-picker select')
    expect(selects[1]!.findAll('option').map((option) => option.text())).toEqual(['00', '15', '30', '45'])
    await selects[0]!.setValue('14')
    await selects[1]!.setValue('30')
    await wrapper.get('.base-dialog__footer button:last-child').trigger('click')
    expect(lastEmission(wrapper)).toEqual(['14:30'])
    wrapper.unmount()
  })

  it('soporta fecha y hora en un valor local', async () => {
    const wrapper = mount(BaseDateTimePicker, {
      attachTo: document.body,
      props: { modelValue: '2026-05-15T09:00', mode: 'datetime', label: 'Inicio' },
    })
    await openPicker(wrapper)
    await wrapper.get('button[aria-label="16 mayo 2026"]').trigger('click')
    const selects = wrapper.findAll('.time-picker select')
    await selects[0]!.setValue('11')
    await selects[1]!.setValue('25')
    await wrapper.get('.base-dialog__footer button:last-child').trigger('click')
    expect(lastEmission(wrapper)).toEqual(['2026-05-16T11:25'])
    wrapper.unmount()
  })

  it('valida required y permite limpiar', async () => {
    const wrapper = mount(BaseDateTimePicker, {
      props: { modelValue: null, mode: 'date', label: 'Fecha', required: true, clearable: true },
    })
    await wrapper.get('input').trigger('blur')
    expect(wrapper.text()).toContain('obligatorio')
    await wrapper.setProps({ modelValue: '2026-05-15' })
    await wrapper.get('button[aria-label="Limpiar"]').trigger('click')
    expect(lastEmission(wrapper)).toEqual([null])
  })

  it.each(['disabled', 'readonly'] as const)('no abre cuando está %s', async (state) => {
    const wrapper = mount(BaseDateTimePicker, {
      props: { modelValue: null, mode: 'date', label: 'Fecha', [state]: true },
    })
    const trigger = wrapper.get('button[aria-label="Seleccionar fecha"]')
    expect(trigger.attributes('disabled')).toBeDefined()
  })

  it('cierra con Escape y funciona en tema claro y oscuro', async () => {
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme
      const wrapper = mount(BaseDateTimePicker, {
        attachTo: document.body,
        props: { modelValue: '2026-05-15', mode: 'date', label: 'Fecha' },
      })
      await openPicker(wrapper)
      expect(wrapper.get('dialog').attributes('open')).toBeDefined()
      await wrapper.get('input').trigger('keydown', { key: 'Escape' })
      await wrapper.vm.$nextTick()
      expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
      wrapper.unmount()
    }
  })
})
