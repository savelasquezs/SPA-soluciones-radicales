<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import AppShell from '@/components/layout/AppShell.vue'
import { apiRequest } from '@/services/apiService'
import { useNotificationsStore } from '@/stores/notifications'

const route = useRoute()
const router = useRouter()
const notifications = useNotificationsStore()
const loading = ref(true)
const connecting = ref(false)
const sending = ref(false)
const error = ref<string | null>(null)
const connected = ref(false)
const connectedEmail = ref<string | null>(null)
const recipient = ref('')
const subject = ref('Prueba de integración Gmail')

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
    const status = await apiRequest<{ connected: boolean; email: string | null }>('api/google/status')
    connected.value = status.connected
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
    const result = await apiRequest<{ authorizationUrl: string }>('api/google/authorization-url', {
      method: 'POST',
      body: JSON.stringify({ returnUrl: `${window.location.origin}/integraciones` }),
    })
    window.location.assign(result.authorizationUrl)
  } catch (connectError) {
    notifications.show(connectError instanceof Error ? connectError.message : 'No fue posible iniciar la autorización', 'danger')
    connecting.value = false
  }
}

async function sendTest(): Promise<void> {
  sending.value = true
  try {
    await apiRequest<{ sent: boolean; messageId: string }>('api/email/test', {
      method: 'POST',
      body: JSON.stringify({ to: recipient.value, subject: subject.value }),
    })
    notifications.show('Correo de prueba enviado por Gmail', 'success')
  } catch (sendError) {
    notifications.show(sendError instanceof Error ? sendError.message : 'No fue posible enviar el correo', 'danger')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AppShell>
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Integraciones</h1>
          <p>Gmail y Calendar operan exclusivamente con la cuenta empresarial.</p>
        </div>
      </header>

      <StatusPanel v-if="loading" title="Verificando Google" busy />
      <StatusPanel v-else-if="error" title="No pudimos verificar la integración" :message="error" tone="danger">
        <BaseButton variant="secondary" @click="loadStatus">Reintentar</BaseButton>
      </StatusPanel>

      <template v-else>
        <section class="card integration-card">
          <div>
            <span class="badge" :class="connected ? 'badge--success' : 'badge--warning'">
              {{ connected ? 'Conectada' : 'Pendiente' }}
            </span>
            <h2>Cuenta empresarial Google</h2>
            <p>{{ connectedEmail ?? 'solucionesradicales1@gmail.com' }}</p>
          </div>
          <BaseButton :variant="connected ? 'secondary' : 'primary'" :loading="connecting" @click="connectGoogle">
            {{ connected ? 'Renovar autorización' : 'Conectar Google' }}
          </BaseButton>
        </section>

        <form class="card" @submit.prevent="sendTest">
          <h2>Prueba real de Gmail</h2>
          <p class="muted">El mensaje se enviará desde solucionesradicales1@gmail.com.</p>
          <div class="form-grid email-form">
            <BaseInput v-model="recipient" label="Destinatario" name="recipient" type="email" required />
            <BaseInput v-model="subject" label="Asunto" name="subject" required />
          </div>
          <div class="form-actions">
            <BaseButton type="submit" :loading="sending" :disabled="!connected">Enviar prueba</BaseButton>
          </div>
        </form>
      </template>
    </div>
  </AppShell>
</template>

<style scoped>
.integration-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.integration-card h2 {
  margin-top: 0.8rem;
}

.integration-card p {
  margin: 0.3rem 0 0;
  color: var(--text-secondary);
}

.email-form {
  margin-top: 1.25rem;
}

@media (max-width: 620px) {
  .integration-card {
    display: grid;
  }
}
</style>
