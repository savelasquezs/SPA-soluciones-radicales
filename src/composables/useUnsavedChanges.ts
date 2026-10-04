import { onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useUnsavedChanges(isDirty: MaybeRefOrGetter<boolean>) {
  const confirmOpen = ref(false)
  let resolveNavigation: ((allow: boolean) => void) | null = null

  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!toValue(isDirty)) return
    event.preventDefault()
  }

  window.addEventListener('beforeunload', beforeUnload)

  onBeforeRouteLeave(() => {
    if (!toValue(isDirty)) return true
    confirmOpen.value = true
    return new Promise<boolean>((resolve) => {
      resolveNavigation = resolve
    })
  })

  function finish(allow: boolean): void {
    confirmOpen.value = false
    resolveNavigation?.(allow)
    resolveNavigation = null
  }

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    resolveNavigation?.(false)
  })

  return {
    confirmOpen,
    cancelDiscard: () => finish(false),
    confirmDiscard: () => finish(true),
  }
}
