import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { replace, selectRole } = vi.hoisted(() => ({
  replace: vi.fn<(path: string) => Promise<void>>(),
  selectRole: vi.fn<(role: 'ADMINISTRADOR' | 'TECNICO') => Promise<void>>(),
}))

vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({ selectRole }),
}))

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({ show: vi.fn<(message: string, tone: string) => void>() }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { redirect: '/usuarios' } }),
  useRouter: () => ({ replace }),
}))

import RoleSelectionView from '@/views/RoleSelectionView.vue'

describe('RoleSelectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectRole.mockResolvedValue()
    replace.mockResolvedValue()
  })

  it('continues to the protected destination after choosing a role', async () => {
    const wrapper = mount(RoleSelectionView)

    await wrapper.get('button:nth-of-type(2)').trigger('click')

    expect(selectRole).toHaveBeenCalledWith('TECNICO')
    expect(replace).toHaveBeenCalledWith('/usuarios')
  })
})
