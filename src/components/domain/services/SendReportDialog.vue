<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Check, FileCheck2, Mail, Plus, ShieldCheck, Trash2, Users, X } from 'lucide-vue-next'
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
const recipientChoices = ref<HTMLElement | null>(null)
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
const availableEmails = computed(() => [...new Set([...extraEmails.value, ...(options.value?.registeredEmails ?? [])])])
const recipients = computed(() => [...new Set(checkedEmails.value)].sort())
const normalizedExtra = computed(() => extraInput.value.trim().toLowerCase())
const canAddEmail = computed(() => validEmail(normalizedExtra.value)
  && (recipients.value.length < 20 || checkedEmails.value.includes(normalizedExtra.value)))
const ready = computed(() => !!options.value?.gmailConnected && (recipients.value.length > 0 || canAddEmail.value) && !subjectError.value && !messageError.value && !sending.value && !revoking.value && !deliveryUncertain.value)
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
      fallbackNotice.value = 'No pudimos consultar el estado. Conservaremos el envío; el servidor preparará los certificados antes de enviarlo.'
    } else {
      error.value = failure instanceof Error ? failure.message : 'No pudimos cargar los destinatarios.'
    }
  } finally { loading.value = false }
}
onMounted(() => { void load() })
function toggleEmail(email: string): void {
  if (!checkedEmails.value.includes(email) && recipients.value.length >= 20) {
    emailError.value = 'Puedes enviar a un máximo de 20 correos.'
    return
  }
  checkedEmails.value = checkedEmails.value.includes(email)
    ? checkedEmails.value.filter(value => value !== email)
    : [...checkedEmails.value, email]
  emailError.value = ''
}
function removeExtra(email: string): void {
  extraEmails.value = extraEmails.value.filter(value => value !== email)
  checkedEmails.value = checkedEmails.value.filter(value => value !== email)
}
function addEmail(): void {
  const value = normalizedExtra.value
  if (!validEmail(value)) {
    emailError.value = 'Ingresa una dirección de correo válida.'
    return
  }
  if (!checkedEmails.value.includes(value) && recipients.value.length >= 20) {
    emailError.value = 'Puedes enviar a un máximo de 20 correos.'
    return
  }
  if (!availableEmails.value.includes(value)) extraEmails.value = [value, ...extraEmails.value]
  if (!checkedEmails.value.includes(value)) checkedEmails.value = [...checkedEmails.value, value]
  extraInput.value = ''
  emailError.value = ''
  void nextTick(() => recipientChoices.value?.scrollTo({ top: 0 }))
}
async function send(): Promise<void> {
  if (extraInput.value.trim()) {
    addEmail()
    if (extraInput.value.trim()) return
  }
  if (!ready.value || !options.value) return
  const fingerprint = JSON.stringify([recipients.value, [], window.location.origin, subject.value.trim(), message.value.trim()])
  if (!attempt || attempt.fingerprint !== fingerprint) attempt = { fingerprint, requestId: crypto.randomUUID() }
  sending.value = true
  error.value = ''
  try {
    const input = {
      recipients:recipients.value,
      certificateIds:[],
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
  <BaseDialog :model-value="true" title="Enviar informe" :description="'Servicio ' + solicitud + ' · Informe y certificados en un solo correo'" @update:model-value="!$event && !sending && emit('close')">
    <div class="send-report">
      <LoadingSkeleton v-if="loading" :rows="5" />
      <StatusPanel v-else-if="!options" title="No se pudo preparar el envío" :message="error" tone="danger">
        <BaseButton size="compact" variant="secondary" @click="load">Reintentar</BaseButton>
      </StatusPanel>
      <template v-else>
        <div class="send-report__section">
          <h3><span class="send-report__heading"><Users :size="18" aria-hidden="true" />Destinatarios</span><span>{{ recipients.length }} seleccionados</span></h3>
          <p>Selecciona los correos registrados en el cliente o la sede.</p>
          <div v-if="availableEmails.length" ref="recipientChoices" class="send-report__choices" aria-label="Correos disponibles">
            <div v-for="email in availableEmails" :key="email" class="send-report__choice-row"
              :class="{ 'send-report__choice-row--selected': checkedEmails.includes(email) }">
              <label class="send-report__choice">
                <input type="checkbox" :checked="checkedEmails.includes(email)" :disabled="sending" @change="toggleEmail(email)" />
                <span>{{ email }}</span>
                <Check v-if="checkedEmails.includes(email)" :size="15" class="send-report__selected" aria-hidden="true" />
              </label>
              <button v-if="extraEmails.includes(email)" type="button" class="send-report__remove"
                :aria-label="'Quitar ' + email" :disabled="sending" @click="removeExtra(email)"><X :size="16" /></button>
            </div>
          </div>
          <p v-else class="send-report__empty">No hay correos registrados. Puedes añadir destinatarios manualmente.</p>
          <label class="send-report__label" for="extra-report-email">Agregar otro correo</label>
          <div class="send-report__add">
            <input id="extra-report-email" v-model="extraInput" type="email" placeholder="correo@empresa.com" autocomplete="off"
              :disabled="sending" :aria-invalid="!!emailError" @input="emailError=''" @keydown.enter.prevent="addEmail" />
            <BaseButton :variant="canAddEmail ? 'primary' : 'secondary'" size="compact" :disabled="sending || !canAddEmail" @click="addEmail"><Plus :size="15" /> Añadir</BaseButton>
          </div>
          <small v-if="emailError" class="send-report__validation" role="alert">{{ emailError }}</small>
          <p v-if="extraInput.trim() && !emailError" class="send-report__add-hint" role="status">
            {{ canAddEmail ? 'Pulsa Añadir o Enter. También lo incluiremos si pulsas Enviar informe.' : 'Completa un correo válido para añadirlo.' }}
          </p>
        </div>
        <section class="send-report__certificates" aria-labelledby="report-certificates-title">
          <FileCheck2 :size="23" aria-hidden="true" />
          <div><h3 id="report-certificates-title">Certificados incluidos</h3>
            <p>El correo incluye el certificado del establecimiento y los de los vehículos atendidos que correspondan.</p>
            <small>Se generan automáticamente al finalizar. No necesitas crearlos ni seleccionarlos.</small>
            <small v-if="options.certificateGeneration?.status === 'PENDING' || options.certificateGeneration?.status === 'RUNNING'" role="status">Generación automática en curso.</small>
            <small v-if="options.certificateGeneration?.status === 'FAILED'" class="send-report__validation" role="alert">{{ options.certificateGeneration.error }} El envío volverá a intentar preparar el conjunto completo.</small>
          </div>
          <Check :size="18" aria-hidden="true" />
        </section>
        <EmailComposerFields v-model:subject="subject" v-model:message="message" :disabled="sending"
          :subject-error="subjectError" :message-error="messageError" />
        <p v-if="fallbackNotice" class="send-report__empty" role="status">{{ fallbackNotice }}</p>
        <div class="send-report__info"><ShieldCheck :size="17" aria-hidden="true" /><p v-if="queuedOffline">El correo quedará guardado en este celular hasta que el servicio esté finalizado en el servidor y haya internet. Los certificados se prepararán automáticamente antes de enviar el correo.</p><p v-else>El correo incluye «Abrir aquí» y un código QR para ver el informe. El enlace vence en 90 días y no se adjunta un PDF del informe.</p></div>
        <div v-if="!technicianMode && options.activeLinks" class="send-report__previous">
          <span><Check :size="14" /> {{ options.activeLinks }} enlace(s) vigente(s)</span>
          <button v-if="!confirmRevoke" type="button" :disabled="sending" @click="confirmRevoke=true"><Trash2 :size="14" /> Revocar enlaces</button>
          <div v-else class="send-report__confirm">
            <span>Los enlaces enviados dejarán de funcionar.</span>
            <BaseButton size="compact" variant="secondary" :disabled="revoking" @click="confirmRevoke=false">Cancelar</BaseButton>
            <BaseButton size="compact" variant="danger" :loading="revoking" @click="revoke">Revocar</BaseButton>
          </div>
        </div>
        <p v-if="!options.gmailConnected" class="send-report__validation" role="alert">
          {{ options.gmailNeedsReauthorization
            ? 'La autorización de Google venció o fue revocada.'
            : 'No hay una cuenta de Gmail conectada para enviar el informe.' }}
          <RouterLink v-if="!technicianMode" to="/integraciones" @click="emit('close')">Ir a Integraciones</RouterLink>
          <span v-else>Solicita al administrador que conecte nuevamente Google.</span>
        </p>
        <p v-if="error" class="send-report__validation" role="alert">{{ error }}</p>
        <p v-if="deliveryUncertain" class="send-report__empty">El envío quedó sin confirmación. Revisa Gmail → Enviados antes de intentarlo nuevamente.</p>
      </template>
    </div>
    <template #footer>
      <BaseButton variant="secondary" :disabled="sending" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton :disabled="loading || !ready || (!!extraInput.trim() && !canAddEmail)" :loading="sending" @click="send"><Mail :size="16" /> {{ sending ? 'Preparando y enviando…' : queuedOffline ? 'Guardar envío' : 'Enviar informe' }}</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.send-report{display:grid;gap:1.1rem;font-size:.83rem}
.send-report__section{display:grid;gap:.55rem}
.send-report__section h3{display:flex;justify-content:space-between;gap:.6rem;font-size:.87rem;font-weight:600;margin:0}
.send-report__section h3>span:last-child{font-size:.72rem;color:var(--text-secondary);font-weight:400}
.send-report__section p{font-size:.78rem;color:var(--text-secondary);margin:0}
.send-report__choices{display:grid;gap:.15rem;max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius);padding:.35rem}
.send-report__choice{display:flex;flex:1;min-height:44px;align-items:center;gap:.7rem;padding:.5rem;cursor:pointer;border-radius:6px;min-width:0}
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
.send-report__validation a{color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:2px;margin-left:.3rem}
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

.send-report__heading{display:inline-flex;align-items:center;gap:.45rem;color:var(--text)}
.send-report__heading svg{color:var(--accent)}
.send-report__choice-row{display:flex;align-items:center;border:1px solid transparent;border-radius:var(--radius)}
.send-report__choice-row--selected{background:var(--accent-subtle);border-color:var(--accent)}
.send-report__selected{margin-left:auto;flex-shrink:0;color:var(--accent)}
.send-report__remove{display:grid;place-items:center;min-height:44px;min-width:44px;border:0;background:transparent;color:var(--text-secondary);cursor:pointer}
.send-report__certificates{display:flex;align-items:flex-start;gap:.65rem;padding:.85rem;border:1px solid var(--success);border-radius:var(--radius);background:var(--success-subtle)}
.send-report__certificates>svg{flex-shrink:0;color:var(--success)}
.send-report__certificates div{flex:1;min-width:0}
.send-report__certificates h3{margin:0 0 .3rem;font-size:.87rem}
.send-report__certificates p{margin:0;font-size:.78rem;line-height:1.5}
.send-report__certificates small{display:block;margin-top:.4rem;font-size:.73rem;color:var(--text-secondary)}
.send-report__add-hint{color:var(--accent)!important}
.send-report__add input{color:var(--text);min-height:44px;font-size:1rem}
.send-report__add input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.send-report__choice-row:focus-within{outline:2px solid var(--accent);outline-offset:2px}
</style>
