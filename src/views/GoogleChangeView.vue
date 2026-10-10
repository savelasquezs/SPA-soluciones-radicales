<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, CircleAlert } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import { getAccessToken } from '@/services/authService'
import { finishGoogleIdentityChange } from '@/services/profileService'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const processing = ref(true)
const completed = ref(false)
const error = ref<string | null>(null)
const STORAGE_KEY = 'sr:google-profile-handoff'

onMounted(async () => {
  const token = sessionStorage.getItem(STORAGE_KEY)
  if (!token) {
    error.value = 'No existe un cambio de cuenta pendiente. Inícialo desde Mi perfil.'
    processing.value = false
    return
  }
  try {
    // The OAuth callback has a different identity: bypass the old auth cache.
    await getAccessToken({ forceRefresh: true })
    await finishGoogleIdentityChange(token)
    completed.value = true
    sessionStorage.removeItem(STORAGE_KEY)
    await auth.initialize(true)
    if (auth.status !== 'authenticated') throw new Error('Vuelve a entrar con la nueva cuenta Google')
    await router.replace({ name: 'my-profile', query: { googleActualizado: '1' } })
  } catch (cause) {
    sessionStorage.removeItem(STORAGE_KEY)
    error.value = completed.value
      ? 'La cuenta fue cambiada, pero la sesión no se pudo actualizar. Inicia sesión con tu cuenta nueva.'
      : cause instanceof Error ? cause.message : 'No fue posible verificar la cuenta. No se realizaron cambios.'
  } finally {
    processing.value = false
  }
})
</script>

<template>
  <main class="handoff">
    <section class="handoff__card" aria-live="polite">
      <div v-if="processing" class="handoff__indicator" role="status">
        <span class="handoff__spinner" aria-hidden="true"></span>
      </div>
      <CircleAlert v-else-if="error" :size="28" aria-hidden="true" class="handoff__error" />
      <CheckCircle2 v-else :size="28" aria-hidden="true" />
      <h1>{{ processing ? 'Verificando tu nueva cuenta' : error ? 'No se completó la verificación' : 'Cuenta vinculada' }}</h1>
      <p>{{ processing ? 'Estamos confirmando la cuenta directamente con Google.' : error ?? 'Tu perfil conserva todos sus datos e historial.' }}</p>
      <BaseButton v-if="!processing && error" @click="router.replace('/acceso')">
        Ir al acceso
      </BaseButton>
    </section>
  </main>
</template>

<style scoped>
.handoff { display: grid; min-height: 100dvh; place-items: center; padding: 1.25rem; background: var(--bg); }
.handoff__card { display: grid; justify-items: center; gap: 1rem; width: min(100%, 26rem); padding: clamp(1.25rem, 4vw, 2.5rem); border: 1px solid var(--border); border-radius: var(--radius-panel); background: var(--surface); text-align: center; }
.handoff__card h1 { margin: 0; color: var(--text); font-size: 1.25rem; font-weight: 600; }
.handoff__card p { margin: 0; color: var(--text-secondary); line-height: 1.5; overflow-wrap: anywhere; }
.handoff__error { color: var(--danger); }
.handoff__spinner { display: block; width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .handoff__spinner { animation: none; border-style: dashed; } }
</style>
