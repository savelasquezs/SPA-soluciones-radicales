import { inject, ref, type InjectionKey, type Ref } from 'vue'

export type AccountTransition = {
  unsaved: Ref<boolean>
  busy: Ref<boolean>
  discardApproved: Ref<boolean>
  setStatus: (unsaved: boolean, busy: boolean) => void
  approveDiscard: () => void
  reset: () => void
}

export const accountTransitionKey: InjectionKey<AccountTransition> = Symbol('account-transition')

export function createAccountTransition(): AccountTransition {
  const unsaved = ref(false)
  const busy = ref(false)
  const discardApproved = ref(false)
  return {
    unsaved,
    busy,
    discardApproved,
    setStatus(isDirty, isBusy) {
      unsaved.value = isDirty
      busy.value = isBusy
    },
    approveDiscard() { discardApproved.value = true },
    reset() {
      unsaved.value = false
      busy.value = false
      discardApproved.value = false
    },
  }
}

export function useAccountTransition(): AccountTransition | null {
  return inject(accountTransitionKey, null)
}
