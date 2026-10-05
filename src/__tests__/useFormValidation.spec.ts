import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, reactive } from 'vue'
import { describe, expect, it } from 'vitest'

import { useFormValidation } from '@/composables/useFormValidation'

describe('useFormValidation', () => {
  it('muestra el error y enfoca el primer campo inválido al enviar', async () => {
    const wrapper = mount(defineComponent({
      setup() {
        const form = reactive({ nombre: '' })
        const validation = useFormValidation(form, {
          nombre: (value) => String(value).trim() ? null : 'Ingresa el nombre',
        })
        return { form, validation }
      },
      template: `
        <form novalidate @submit.prevent="validation.validate()">
          <input v-model="form.nombre" :aria-invalid="Boolean(validation.error('nombre'))" />
          <span v-if="validation.error('nombre')">{{ validation.error('nombre') }}</span>
          <button type="submit">Guardar</button>
        </form>
      `,
    }), { attachTo: document.body })

    await wrapper.get('button').trigger('submit')
    await nextTick()

    expect(wrapper.text()).toContain('Ingresa el nombre')
    expect(document.activeElement).toBe(wrapper.get('input').element)
    wrapper.unmount()
  })

  it('enfoca el primer control dentro de un grupo inválido', async () => {
    const wrapper = mount(defineComponent({
      setup() {
        const form = reactive({ administrador: false, tecnico: false })
        const validation = useFormValidation(form, {
          administrador: (_value, current) => current.administrador || current.tecnico
            ? null
            : 'Selecciona al menos un rol',
        })
        return { form, validation }
      },
      template: `
        <form novalidate @submit.prevent="validation.validate()">
          <fieldset :aria-invalid="Boolean(validation.error('administrador'))">
            <input id="administrador" v-model="form.administrador" type="checkbox" />
            <input id="tecnico" v-model="form.tecnico" type="checkbox" />
          </fieldset>
          <button type="submit">Guardar</button>
        </form>
      `,
    }), { attachTo: document.body })

    await wrapper.get('button').trigger('submit')
    await nextTick()

    expect(document.activeElement).toBe(wrapper.get('#administrador').element)
    wrapper.unmount()
  })
})
