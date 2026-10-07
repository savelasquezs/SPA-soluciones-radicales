import { onMounted, onUnmounted, ref } from 'vue'

export function useNetworkStatus() {
  const online = ref(typeof navigator === 'undefined' || navigator.onLine)
  const update = () => { online.value = navigator.onLine }
  onMounted(() => {
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  })
  onUnmounted(() => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  })
  return { online }
}
