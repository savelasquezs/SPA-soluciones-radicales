import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocked = vi.hoisted(() => ({
  balance: vi.fn(),
  report: vi.fn(),
  upload: vi.fn(),
  show: vi.fn(),
}))
vi.mock('@/services/financeService', () => ({
  getTechnicianServiceBalance: mocked.balance,
  reportTechnicianPayment: mocked.report,
  uploadPaymentProof: mocked.upload,
}))
vi.mock('@/composables/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: { value: true } }),
}))
vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({ show: mocked.show }),
}))

import TechnicianPaymentDialog from '@/components/domain/services/TechnicianPaymentDialog.vue'

const DialogStub = {
  props: ['modelValue'],
  template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
}
const PhotoStub = {
  name: 'TechnicianEvidencePicker',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div data-test="photo-picker" />',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.balance.mockResolvedValue({ disponible: 150000, estado: 'EN_PROCESO' })
  mocked.report.mockResolvedValue({ id: 'payment-id' })
})

describe('reporte de cobro técnico', () => {
  it('utiliza la misma captura de fotografías y reintenta la subida sin cobrar dos veces', async () => {
    mocked.upload.mockRejectedValueOnce(new Error('R2 no respondió')).mockResolvedValueOnce(undefined)
    const wrapper = mount(TechnicianPaymentDialog, {
      props: { open: true, serviceId: 'service-id' },
      global: { stubs: { BaseDialog: DialogStub, TechnicianEvidencePicker: PhotoStub } },
    })
    await flushPromises()
    await wrapper.get('select[name="technician-pay-method"]').setValue('TRANSFERENCIA')
    const picker = wrapper.findComponent({ name: 'TechnicianEvidencePicker' })
    expect(picker.exists()).toBe(true)
    const photo = new File(['foto'], 'comprobante.jpg', { type: 'image/jpeg' })
    picker.vm.$emit('update:modelValue', [photo])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Comprobante de la transferencia')

    await wrapper.get('#technician-payment-form').trigger('submit')
    await flushPromises()
    expect(mocked.report).toHaveBeenCalledTimes(1)
    expect(mocked.upload).toHaveBeenCalledExactlyOnceWith('payment-id', photo)
    expect(wrapper.text()).toContain('El cobro ya está registrado')
    expect(wrapper.text()).toContain('Reintentar comprobante')

    await wrapper.get('#technician-payment-form').trigger('submit')
    await flushPromises()
    expect(mocked.report).toHaveBeenCalledTimes(1)
    expect(mocked.upload).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
