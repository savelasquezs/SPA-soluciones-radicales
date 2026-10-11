<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, CircleAlert } from 'lucide-vue-next'

import BaseButton from '@/components/base/BaseButton.vue'
import {
  clearPendingGoogleHandoff, readPendingGoogleHandoff,
  readPendingGoogleHandoffState,
} from '@/helpers/googleHandoff'
import { ApiClientError } from '@/services/apiService'
import { waitForNewGoogleSession } from '@/services/googleSessionReady'
import { finishGoogleIdentityChange } from '@/services/profileService'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const processing = ref(true)
const switching = ref(false)
const completed = ref(false)
const canRetry = ref(false)
const error = ref<string | null>(null)

async function verifyNewAccount(): Promise<void> {
  processing.value = true
  error.value = null
  const pending = readPendingGoogleHandoffState()
  if (!pending) {
    error.value = 'No hay un cambio de cuenta vigente. Inicia el proceso desde tu cuenta anterior.'
    canRetry.value = false
    processing.value = false
    return
  }
  try {
    // OAuth can return the previous cached Google session on the first read.
    // Confirm the identity has actually changed before posting the one-use
    // handoff, or the API will correctly reject it as "same account".
    await waitForNewGoogleSession(pending.originalAuthUserId)
    try {
      await finishGoogleIdentityChange(pending.token)
    } catch (cause) {
      // Narrow recovery: the API performs no mutation on this exact 409.
      // A stale JWT can survive one extra SDK read, so refresh and try once.
      if (!(cause instanceof ApiClientError && cause.status === 409
        && cause.message === 'Seleccionaste la misma cuenta de Google'
        && pending.originalAuthUserId)) throw cause
      await waitForNewGoogleSession(pending.originalAuthUserId)
      await finishGoogleIdentityChange(pending.token)
    }
    completed.value = true
    clearPendingGoogleHandoff()
    await auth.initialize(true)
    if (auth.status !== 'authenticated') {
      throw new Error('La cuenta cambió, pero la sesión no se pudo actualizar. Vuelve a iniciar sesión con la nueva cuenta.')
    }
    await router.replace({ name: 'my-profile', query: { googleActualizado: '1' } })
  } catch (cause) {
    error.value = completed.value
      ? 'La cuenta se vinculó, pero hubo un problema al actualizar la sesión. Inicia sesión con la nueva cuenta.'
      : cause instanceof Error ? cause.message : 'No se pudo confirmar la nueva cuenta. Tu usuario original permanece intacto.'
    // Retain the one-time handoff on network failures; users can retry before
    // its deadline instead of being forced to start over or losing access.
    canRetry.value = !completed.value && Boolean(readPendingGoogleHandoff())
  } finally {
    processing.value = false
  }
}

async function selectAnotherGoogleAccount(): Promise<void> {
  if (switching.value || processing.value) return
  switching.value = true
  try {
    await auth.useAnotherAccount(new URL('/cuenta/cambiar-google', window.location.origin).toString())
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No fue posible seleccionar otra cuenta Google.'
  } finally {
    switching.value = false
  }
}

onMounted(() => { void verifyNewAccount() })
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
      <div v-if="!processing && error" class="handoff__actions">
        <BaseButton v-if="canRetry" :disabled="switching" @click="verifyNewAccount">Reintentar verificación</BaseButton>
        <BaseButton v-if="canRetry" variant="secondary" :loading="switching" @click="selectAnotherGoogleAccount">Elegir otra cuenta Google</BaseButton>
        <BaseButton v-else variant="secondary" @click="router.replace('/acceso')">Ir al acceso</BaseButton>
      </div>
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
.handoff__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; width: 100%; }
.handoff__actions :deep(button) { min-height: 44px; flex: 1 1 12rem; max-width: 100%; }
</style>
