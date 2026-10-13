<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import { useFormValidation } from '@/composables/useFormValidation'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { getGoogleAuthorizationUrl, getGoogleIntegrationStatus, sendTestEmail } from '@/services/integrationsService'
import { useNotificationsStore } from '@/stores/notifications'

const route = useRoute()
const router = useRouter()
const notifications = useNotificationsStore()
const loading = ref(true)
const connecting = ref(false)
const sending = ref(false)
const error = ref<string | null>(null)
const connected = ref(false)
const needsReauthorization = ref(false)
const connectedEmail = ref<string | null>(null)
const emailForm = reactive({
  recipient: '',
  subject: 'Prueba de integración Gmail',
  body: 'Esta es una prueba real de Gmail enviada desde Soluciones Radicales MIP.',
})
const emailBaseline = ref(JSON.stringify(emailForm))
const emailDirty = computed(() => JSON.stringify(emailForm) !== emailBaseline.value)
const {
  confirmOpen: discardConfirmOpen,
  cancelDiscard,
  confirmDiscard,
} = useUnsavedChanges(emailDirty)
const emailValidation = useFormValidation(emailForm, {
  recipient: (value) => {
    if (!String(value).trim()) return 'El destinatario es obligatorio'
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)) ? null : 'Ingresa un correo válido'
  },
  subject: (value) => String(value).trim() ? null : 'El asunto es obligatorio',
  body: (value) => String(value).trim() ? null : 'El mensaje es obligatorio',
})

onMounted(async () => {
  if (route.query.google === 'connected') {
    notifications.show('Cuenta empresarial de Google conectada', 'success')
    await router.replace('/integraciones')
  }
  await loadStatus()
})

async function loadStatus(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const status = await getGoogleIntegrationStatus()
    connected.value = status.connected
    needsReauthorization.value = status.needsReauthorization
    connectedEmail.value = status.email
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'No fue posible consultar Google'
  } finally {
    loading.value = false
  }
}

async function connectGoogle(): Promise<void> {
  connecting.value = true
  try {
    const authorizationUrl = await getGoogleAuthorizationUrl(`${window.location.origin}/integraciones`)
    window.location.assign(authorizationUrl)
  } catch (connectError) {
    notifications.show(connectError instanceof Error ? connectError.message : 'No fue posible iniciar la autorización', 'error')
    connecting.value = false
  }
}

async function sendTest(): Promise<void> {
  if (!emailValidation.validate()) return
  sending.value = true
  try {
    await sendTestEmail({ to: emailForm.recipient, subject: emailForm.subject, text: emailForm.body })
    emailBaseline.value = JSON.stringify(emailForm)
    notifications.show('Correo de prueba enviado por Gmail', 'success')
  } catch (sendError) {
    notifications.show(sendError instanceof Error ? sendError.message : 'No fue posible enviar el correo', 'error')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="page integrations-page">
      <header class="page-header admin-page-header">
        <div class="admin-page-heading">
          <h1>Integraciones</h1>
          <p>— Gmail y Calendar de la cuenta empresarial</p>
        </div>
      </header>

      <LoadingSkeleton v-if="loading" label="Verificando Google" :lines="3" />
      <StatusPanel v-else-if="error" title="No pudimos verificar la integración" :message="error" tone="danger">
        <BaseButton variant="secondary" @click="loadStatus">Reintentar</BaseButton>
      </StatusPanel>

      <template v-else>
        <section class="card integration-card">
          <div>
            <span class="badge" :class="connected ? 'badge--success' : 'badge--warning'">
              {{ connected ? 'Conectada' : needsReauthorization ? 'Autorización vencida' : 'Pendiente' }}
            </span>
            <h2>Cuenta empresarial Google</h2>
            <p>{{ connectedEmail ?? 'solucionesradicales1@gmail.com' }}</p>
            <p v-if="needsReauthorization" class="integration-warning" role="alert">
              La autorización de Google venció o fue revocada. Vuelve a autorizar la cuenta para restablecer Gmail y Calendar.
            </p>
          </div>
          <BaseButton :variant="connected ? 'secondary' : 'primary'" :loading="connecting" @click="connectGoogle">
            {{ needsReauthorization ? 'Volver a autorizar' : connected ? 'Renovar autorización' : 'Conectar Google' }}
          </BaseButton>
        </section>

        <form class="card" novalidate @submit.prevent="sendTest">
          <h2>Prueba real de Gmail</h2>
          <p class="muted">El mensaje se enviará desde solucionesradicales1@gmail.com.</p>
          <div class="form-grid email-form">
            <BaseInput
              v-model="emailForm.recipient"
              label="Destinatario"
              name="recipient"
              type="email"
              autocomplete="email"
              required
              :error="emailValidation.error('recipient')"
              @blur="emailValidation.touch('recipient')"
            />
            <BaseInput
              v-model="emailForm.subject"
              label="Asunto"
              name="subject"
              required
              :error="emailValidation.error('subject')"
              @blur="emailValidation.touch('subject')"
            />
            <BaseTextarea
              v-model="emailForm.body"
              class="form-grid__wide"
              label="Mensaje"
              name="body"
              required
              :error="emailValidation.error('body')"
              @blur="emailValidation.touch('body')"
            />
          </div>
          <div class="form-actions">
            <BaseButton type="submit" :loading="sending" :disabled="!connected">Enviar prueba</BaseButton>
          </div>
        </form>
      </template>
      <ConfirmDialog
        :open="discardConfirmOpen"
        title="Descartar mensaje"
        message="El correo de prueba tiene cambios que todavía no se han enviado."
        confirm-label="Descartar y salir"
        danger
        @cancel="cancelDiscard"
        @confirm="confirmDiscard"
      />
  </div>
</template>

<style scoped>
.integration-warning { color: var(--danger) !important; max-width: 32rem; }
.integrations-page { gap: 0.75rem; }
.integration-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.integration-card h2 {
  margin-top: 0.35rem;
}

.integration-card p {
  margin: 0.3rem 0 0;
  color: var(--text-secondary);
}

.email-form {
  margin-top: 0.75rem;
}

@media (max-width: 620px) {
  .integration-card {
    display: grid;
  }
}
</style>
