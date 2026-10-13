<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Mail, Plus, ShieldCheck, Trash2, X } from 'lucide-vue-next'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import EmailComposerFields from '@/components/base/EmailComposerFields.vue'
import { useTechnicianReportEmailStore } from '@/stores/technicianReportEmails'
import {
  getReportShareOptions, getTechnicianReportShareOptions, sendServiceReport, revokeServiceReportLinks,
} from '@/services/reportSharingService'
import { useNotificationsStore } from '@/stores/notifications'
import type { SendServiceReportResult, ServiceReportShareOptions } from '@/types/reportSharing'

const props = withDefaults(defineProps<{
  serviceId: string; solicitud: string; cliente: string; sede: string
  mode?: 'ADMINISTRADOR' | 'TECNICO'
  cachedEmails?: string[]
  completionConfirmed?: boolean
}>(), { mode: 'ADMINISTRADOR', cachedEmails: () => [], completionConfirmed: true })
const emit = defineEmits<{ close: []; sent: [result: SendServiceReportResult]; queued: [result: 'sent' | 'pending' | 'needs_review'] }>()
const notify = useNotificationsStore()
const emailOutbox = useTechnicianReportEmailStore()
const technicianMode = computed(() => props.mode === 'TECNICO')
const queuedOffline = computed(() => technicianMode.value && (!navigator.onLine || !props.completionConfirmed))
const fallbackNotice = ref('')
const loading = ref(true)
const error = ref('')
const options = ref<ServiceReportShareOptions | null>(null)
const checkedEmails = ref<string[]>([])
const extraEmails = ref<string[]>([])
const extraInput = ref('')
const emailError = ref('')
const selectedCertificates = ref<string[]>([])
const subject = ref('Informe técnico MIP · ' + props.solicitud + ' · ' + props.sede)
const message = ref('Buen día,\n\nCompartimos el informe técnico de la visita realizada. Gracias por confiar en Soluciones Radicales.')
const subjectError = computed(() => !subject.value.trim() || /[\r\n]/.test(subject.value) || subject.value.length > 200
  ? 'Revisa el asunto del correo.' : '')
const messageError = computed(() => !message.value.trim() || message.value.length > 4000
  ? 'El mensaje no puede estar vacío y debe tener máximo 4000 caracteres.' : '')
const sending = ref(false)
const revoking = ref(false)
const confirmRevoke = ref(false)
const deliveryUncertain = ref(false)
const recipients = computed(() => [...new Set([...checkedEmails.value,...extraEmails.value])].sort())
const ready = computed(() => !!options.value?.gmailConnected && recipients.value.length > 0 && !subjectError.value && !messageError.value && !sending.value && !revoking.value && !deliveryUncertain.value)
const validEmail = (value: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value) && value.length <= 254
let attempt: { fingerprint: string; requestId: string } | null = null

function fallbackOptions(): ServiceReportShareOptions {
  const emails = [...new Set((props.cachedEmails ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim().toLowerCase())
    .filter(validEmail))].sort()
  return { registeredEmails:emails,certificates:[],activeLinks:0,lastSharedAt:null,gmailConnected:true }
}
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  fallbackNotice.value = ''
  try {
    if (technicianMode.value && (!navigator.onLine || !props.completionConfirmed)) {
      options.value = fallbackOptions()
    } else {
      options.value = await (technicianMode.value
        ? getTechnicianReportShareOptions(props.serviceId)
        : getReportShareOptions(props.serviceId))
    }
  } catch (failure) {
    if (technicianMode.value) {
      options.value = fallbackOptions()
      fallbackNotice.value = 'No pudimos consultar los certificados. Puedes guardar el envío del informe; se intentará al tener conexión.'
    } else {
      error.value = failure instanceof Error ? failure.message : 'No pudimos cargar los destinatarios.'
    }
  } finally { loading.value = false }
}
onMounted(() => { void load() })
function toggleEmail(email: string): void {
  checkedEmails.value = checkedEmails.value.includes(email)
    ? checkedEmails.value.filter(value => value !== email)
    : [...checkedEmails.value, email]
}
function toggleCertificate(id: string): void {
  selectedCertificates.value = selectedCertificates.value.includes(id)
    ? selectedCertificates.value.filter(value => value !== id)
    : [...selectedCertificates.value, id]
}
function addEmail(): void {
  const value = extraInput.value.trim().toLowerCase()
  if (!validEmail(value)) {
    emailError.value = 'Ingresa una dirección de correo válida.'
    return
  }
  if (options.value?.registeredEmails.includes(value) || extraEmails.value.includes(value)) {
    emailError.value = 'Este correo ya está registrado en la selección.'
    return
  }
  if (recipients.value.length >= 20) { emailError.value = 'Puedes enviar a un máximo de 20 correos.'; return }
  extraEmails.value = [...extraEmails.value,value]
  extraInput.value = ''
  emailError.value = ''
}
async function send(): Promise<void> {
  if (!ready.value || !options.value) return
  const fingerprint = JSON.stringify([recipients.value, [...selectedCertificates.value].sort(), window.location.origin, subject.value.trim(), message.value.trim()])
  if (!attempt || attempt.fingerprint !== fingerprint) attempt = { fingerprint, requestId: crypto.randomUUID() }
  sending.value = true
  error.value = ''
  try {
    const input = {
      recipients:recipients.value,
      certificateIds:[...selectedCertificates.value].sort(),
      origin:window.location.origin,
      subject:subject.value.trim(),
      message:message.value.trim(),
    }
    if (technicianMode.value) {
      const result = await emailOutbox.queue(props.serviceId,input)
      notify.show(result === 'sent'
        ? 'Informe enviado correctamente.'
        : result === 'needs_review'
          ? 'El correo necesita revisión antes de un nuevo intento.'
          : 'Envío guardado. Se enviará cuando el servicio esté sincronizado y haya conexión.',
        result === 'needs_review' ? 'warning' : 'success')
      emit('queued',result)
      emit('close')
    } else {
      const result = await sendServiceReport(props.serviceId,{ ...input,requestId:attempt.requestId })
      notify.show('Informe enviado por Gmail a ' + recipients.value.length + ' destinatario(s).','success')
      emit('sent',result)
      emit('close')
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'No fue posible enviar el informe.'
    if (failure && typeof failure === 'object' && 'code' in failure &&
      (failure as { code?: string }).code === 'EMAIL_DELIVERY_UNKNOWN') deliveryUncertain.value = true
  } finally { sending.value = false }
}
async function revoke(): Promise<void> {
  if (!confirmRevoke.value || revoking.value) return
  revoking.value = true
  try {
    const result = await revokeServiceReportLinks(props.serviceId)
    notify.show('Se revocaron ' + result.revoked + ' enlace(s) del informe.','success')
    confirmRevoke.value = false
    await load()
  } catch (failure) { error.value = failure instanceof Error ? failure.message : 'No fue posible revocar enlaces.' }
  finally { revoking.value = false }
}
</script>

<template>
  <BaseDialog :model-value="true" title="Enviar informe" :description="'Servicio ' + solicitud + ' · Enlace seguro por correo'" @update:model-value="!$event && !sending && emit('close')">
    <div class="send-report">
      <LoadingSkeleton v-if="loading" :rows="5" />
      <StatusPanel v-else-if="!options" title="No se pudo preparar el envío" :message="error" tone="danger">
        <BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton>
      </StatusPanel>
      <template v-else>
        <div class="send-report__section">
          <h3>Destinatarios <span>{{ recipients.length }} seleccionados</span></h3>
          <p>Selecciona los correos registrados en el cliente o la sede.</p>
          <div v-if="options.registeredEmails.length" class="send-report__choices">
            <label v-for="email in options.registeredEmails" :key="email" class="send-report__choice">
              <input type="checkbox" :checked="checkedEmails.includes(email)" :disabled="sending" @change="toggleEmail(email)" />
              <span>{{ email }}</span>
            </label>
          </div>
          <p v-else class="send-report__empty">No hay correos registrados. Puedes añadir destinatarios manualmente.</p>
          <label class="send-report__label" for="extra-report-email">Agregar otro correo</label>
          <div class="send-report__add">
            <input id="extra-report-email" v-model="extraInput" type="email" placeholder="correo@empresa.com" autocomplete="off"
              :disabled="sending" :aria-invalid="!!emailError" @input="emailError=''" @keydown.enter.prevent="addEmail" />
            <BaseButton variant="secondary" size="compact" :disabled="sending || !extraInput.trim()" @click="addEmail"><Plus :size="15" /> Añadir</BaseButton>
          </div>
          <small v-if="emailError" class="send-report__validation" role="alert">{{ emailError }}</small>
          <div v-if="extraEmails.length" class="send-report__extras">
            <span v-for="email in extraEmails" :key="email" class="send-report__chip">
              {{ email }}
              <button type="button" :aria-label="'Quitar ' + email" :disabled="sending" @click="extraEmails=extraEmails.filter(value => value!==email)"><X :size="13" /></button>
            </span>
          </div>
        </div>
        <div class="send-report__section">
          <h3>Adjuntar certificado <span>Opcional</span></h3>
          <p>Solo certificados PDF ya generados para este servicio.</p>
          <div v-if="options.certificates.length" class="send-report__choices">
            <label v-for="certificate in options.certificates" :key="certificate.id" class="send-report__choice">
              <input type="checkbox" :checked="selectedCertificates.includes(certificate.id)" :disabled="sending" @change="toggleCertificate(certificate.id)" />
              <span>
                <strong>{{ certificate.type==='ESTABLECIMIENTO' ? 'Certificado de establecimiento' : 'Certificado vehicular · ' + certificate.label }}</strong>
                <small>Vence: {{ certificate.expiresOn }}</small>
              </span>
            </label>
          </div>
          <p v-else class="send-report__empty">Todavía no hay certificados generados. Puedes enviar únicamente el informe.</p>
        </div>
        <EmailComposerFields v-model:subject="subject" v-model:message="message" :disabled="sending"
          :subject-error="subjectError" :message-error="messageError" />
        <p v-if="fallbackNotice" class="send-report__empty" role="status">{{ fallbackNotice }}</p>
        <div class="send-report__info"><ShieldCheck :size="17" aria-hidden="true" /><p v-if="queuedOffline">El correo quedará guardado en este celular hasta que el servicio esté finalizado en el servidor y haya internet. El certificado podrá adjuntarse después, cuando esté generado.</p><p v-else>El correo incluye «Abrir aquí» y un código QR para ver el informe. El enlace vence en 90 días y no se adjunta un PDF del informe.</p></div>
        <div v-if="!technicianMode && options.activeLinks" class="send-report__previous">
          <span><Check :size="14" /> {{ options.activeLinks }} enlace(s) vigente(s)</span>
          <button v-if="!confirmRevoke" type="button" :disabled="sending" @click="confirmRevoke=true"><Trash2 :size="14" /> Revocar enlaces</button>
          <div v-else class="send-report__confirm">
            <span>Los enlaces enviados dejarán de funcionar.</span>
            <BaseButton size="compact" variant="secondary" :disabled="revoking" @click="confirmRevoke=false">Cancelar</BaseButton>
            <BaseButton size="compact" variant="danger" :loading="revoking" @click="revoke">Revocar</BaseButton>
          </div>
        </div>
        <p v-if="!options.gmailConnected" class="send-report__validation" role="alert">No hay una cuenta de Gmail conectada para enviar el informe.</p>
        <p v-if="error" class="send-report__validation" role="alert">{{ error }}</p>
        <p v-if="deliveryUncertain" class="send-report__empty">El envío quedó sin confirmación. Revisa Gmail → Enviados antes de intentarlo nuevamente.</p>
      </template>
    </div>
    <template #footer>
      <BaseButton variant="secondary" :disabled="sending" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton :disabled="loading || !ready || !!extraInput.trim()" :loading="sending" @click="send"><Mail :size="16" /> {{ queuedOffline ? 'Guardar envío' : 'Enviar informe' }}</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.send-report{display:grid;gap:1.1rem;font-size:.83rem}
.send-report__section{display:grid;gap:.55rem}
.send-report__section h3{display:flex;justify-content:space-between;gap:.6rem;font-size:.87rem;font-weight:600;margin:0}
.send-report__section h3 span{font-size:.72rem;color:var(--text-secondary);font-weight:400}
.send-report__section p{font-size:.78rem;color:var(--text-secondary);margin:0}
.send-report__choices{display:grid;gap:.15rem;max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius);padding:.35rem}
.send-report__choice{display:flex;align-items:center;gap:.7rem;padding:.5rem;cursor:pointer;border-radius:6px;min-width:0}
.send-report__choice:hover{background:var(--hover)}
.send-report__choice input{width:17px;height:17px;accent-color:var(--accent);flex-shrink:0}
.send-report__choice span{min-width:0;overflow-wrap:anywhere}
.send-report__choice strong,.send-report__choice small{display:block}
.send-report__choice strong{font-weight:500;font-size:.78rem}
.send-report__choice small{color:var(--text-secondary);font-size:.72rem;margin-top:.15rem}
.send-report__label{font-size:.76rem;font-weight:500;margin-top:.2rem}
.send-report__add{display:flex;align-items:stretch;gap:.5rem;min-width:0}
.send-report__add input{min-width:0;flex:1;padding:.6rem .7rem;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);font-size:.83rem}
.send-report__add input[aria-invalid='true']{border-color:var(--danger)}
.send-report__validation{color:var(--danger);font-size:.75rem}
.send-report__extras{display:flex;flex-wrap:wrap;gap:.35rem}
.send-report__chip{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--border);background:var(--hover);border-radius:6px;padding:.25rem .35rem;font-size:.73rem;max-width:100%;overflow-wrap:anywhere}
.send-report__chip button{display:inline-flex;border:0;background:none;cursor:pointer;align-items:center}
.send-report__empty{color:var(--text-secondary);font-size:.77rem}
.send-report__info{display:flex;gap:.6rem;background:var(--background);border-radius:6px;padding:.7rem;color:var(--text-secondary)}
.send-report__info svg{flex-shrink:0}
.send-report__info p{margin:0;font-size:.75rem}
.send-report__previous{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.6rem;font-size:.75rem}
.send-report__previous>span{display:flex;align-items:center;gap:.35rem;color:var(--success)}
.send-report__previous>button{display:flex;align-items:center;gap:.35rem;background:transparent;border:0;color:var(--text-secondary);cursor:pointer}
.send-report__confirm{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.send-report__confirm>span{color:var(--danger);font-size:.72rem}
@media(max-width:550px){.send-report__add{flex-wrap:wrap}.send-report__add input{flex-basis:100%}}
</style>
