<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseDateTimePicker from '@/components/base/BaseDateTimePicker.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ServiceContactActions from './ServiceContactActions.vue'
import ServiceSaveFeedback from './ServiceSaveFeedback.vue'
import { useServiceMutation } from '@/composables/useServiceMutation'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { useAdminServicesStore } from '@/stores/adminServices'
import { useNotificationsStore } from '@/stores/notifications'
import { previewConfirmationEmail, saveUpcomingFollowUp, sendConfirmationEmail } from '@/services/adminServicesService'
import { FOLLOW_UP_LABELS, formatServiceDate, isDateOnly } from '@/helpers/adminServices'
import type { ConfirmationEmail, ServiceErrors, UpcomingPatch, UpcomingService } from '@/types/adminServices'
const props=defineProps<{ record: UpcomingService; mode: 'manage' | 'email' }>()
const emit=defineEmits<{ close: [] }>()
const store=useAdminServicesStore(), notifications=useNotificationsStore()
const original=ref(props.record), form=ref<UpcomingPatch>({ estado:props.record.estado,fechaRecontacto:props.record.fechaRecontacto,nota:props.record.nota,contactoRealizado:null })
const email=ref<ConfirmationEmail | null>(null), recipient=ref(''), reviewed=ref(false), resend=ref(false)
const loading=ref(false), loadError=ref(''), discardOpen=ref(false), reloadOpen=ref(false), declineOpen=ref(false)
const { saving,errors,errorMessage,conflict,overlapOpen,overlaps,run,invalid,reset,acceptOverlap,cancelOverlap }=useServiceMutation()
const baseline=ref(JSON.stringify(form.value))
const dirty=computed(()=>props.mode==='manage' && JSON.stringify(form.value)!==baseline.value)
const { confirmOpen,cancelDiscard,confirmDiscard }=useUnsavedChanges(dirty,computed(()=>saving.value || loading.value))
const close=()=>{ if(saving.value || loading.value) return; if(dirty.value) discardOpen.value=true; else emit('close') }
onMounted(()=>{ if(props.mode==='email') void loadEmail() })
async function loadEmail(): Promise<void> {
  loading.value=true; loadError.value=''
  try { const result=await previewConfirmationEmail(original.value.id); original.value=result.upcoming; store.upsertUpcoming(result.upcoming); email.value=result.email; recipient.value=result.email.to }
  catch(failure) { loadError.value=failure instanceof Error ? failure.message : 'No fue posible preparar el correo.' }
  finally { loading.value=false }
}
async function save(confirmedDecline = false): Promise<void> {
  const fields: ServiceErrors={}
  if(props.mode==='manage') {
    if(form.value.estado==='POSPUESTO' && !isDateOnly(form.value.fechaRecontacto)) fields.fechaRecontacto='Indica cuándo volver a contactar.'
    if(form.value.nota.length>5000) fields.nota='Usa máximo 5.000 caracteres.'
    if(Object.keys(fields).length) { await invalid(fields); return }
    if(form.value.estado==='NO_DESEA' && !confirmedDecline) { declineOpen.value=true; return }
    declineOpen.value=false
    await run(requestId=>saveUpcomingFollowUp(original.value,requestId,form.value),result=>{ store.applyUpcoming(result); baseline.value=JSON.stringify(form.value); emit('close') },'Seguimiento actualizado.')
  } else {
    if(!recipient.value) fields.recipient='Selecciona un destinatario registrado.'
    if(original.value.correoEstado==='INCIERTO' && !reviewed.value) fields.reviewed='Revisa Enviados en Gmail antes de iniciar otro envío.'
    if(original.value.correoEstado==='ENVIADO' && !resend.value) fields.resend='Confirma expresamente el nuevo envío.'
    if(Object.keys(fields).length) { await invalid(fields); return }
    await run(requestId=>sendConfirmationEmail(original.value,requestId,recipient.value,reviewed.value,resend.value),result=>{ store.applyUpcoming(result); emit('close') },'Correo de confirmación en cola. Puedes consultar su estado al actualizar la lista.')
  }
}
async function reload(): Promise<void> {
  reloadOpen.value=false; loading.value=true
  try {
    const fresh=await store.ensureUpcoming(original.value.id,true)
    original.value=fresh; form.value={ estado:fresh.estado,fechaRecontacto:fresh.fechaRecontacto,nota:fresh.nota,contactoRealizado:null }; baseline.value=JSON.stringify(form.value); reset()
    if(props.mode==='email') await loadEmail()
  } catch(failure) { notifications.show(failure instanceof Error ? failure.message : 'No fue posible cargar la propuesta.','error') }
  finally { loading.value=false }
}
</script>
<template>
  <BaseDialog :model-value="true" :title="mode==='email' ? 'Correo de confirmación' : 'Seguimiento de próxima visita'" :description="`${original.clienteNombre} · ${original.sedeNombre}`" class="svc-action-dialog" :close-on-escape="!saving" @update:model-value="!$event && close()">
    <form id="upcoming-editor-form" class="svc-dialog-stack" novalidate @submit.prevent="save()">
      <ServiceSaveFeedback :error="errorMessage" :conflict="conflict" :overlaps="overlaps" :overlap-open="overlapOpen" :saving="saving" @reload="reloadOpen=true" @accept="acceptOverlap" @cancel="cancelOverlap" />
      <div class="svc-toolbar"><p class="svc-muted svc-small">Visita sugerida: {{ formatServiceDate(original.fechaSugerida) }} · {{ formatServiceDate(original.fechaSugerida,true) }}</p><ServiceContactActions :contact="original.contacto" /></div>
      <template v-if="mode==='manage'">
        <div class="svc-form-grid">
          <BaseSelect v-model="form.estado" name="follow-up-state" label="Seguimiento" :disabled="saving || loading"><option v-for="(label,value) in FOLLOW_UP_LABELS" :key="value" :value="value">{{ label }}</option></BaseSelect>
          <BaseSelect :model-value="form.contactoRealizado ?? ''" name="follow-up-contact" label="Registrar contacto realizado" :disabled="saving || loading" @update:model-value="form.contactoRealizado=$event==='WHATSAPP' || $event==='CORREO' ? $event : null"><option value="">No registrar otro contacto</option><option value="WHATSAPP">WhatsApp</option><option value="CORREO">Correo</option></BaseSelect>
          <BaseDateTimePicker v-if="form.estado==='POSPUESTO'" v-model="form.fechaRecontacto" mode="date" name="follow-up-date" label="Volver a contactar" required :disabled="saving || loading" :error="errors.fechaRecontacto" />
          <BaseTextarea v-model="form.nota" class="svc-full" name="follow-up-note" label="Nota" :rows="3" maxlength="5000" :disabled="saving || loading" :error="errors.nota" />
        </div>
        <p class="svc-muted svc-small">Abrir WhatsApp no marca el mensaje como enviado ni confirma la visita.</p>
      </template>
      <template v-else>
        <LoadingSkeleton v-if="loading" :rows="4" />
        <div v-else-if="loadError" class="svc-inline-error" role="alert">{{ loadError }}<BaseButton variant="secondary" size="compact" @click="loadEmail">Reintentar</BaseButton></div>
        <template v-else-if="email">
          <BaseSelect v-model="recipient" name="confirmation-recipient" label="Destinatario" required :disabled="saving" :error="errors.recipient"><option value="">Selecciona un correo</option><option v-for="address in original.contacto.correos" :key="address" :value="address">{{ address }}</option></BaseSelect>
          <p class="svc-small"><strong>Asunto:</strong> {{ email.subject }}</p><pre class="svc-email-preview">{{ email.text }}</pre>
          <BaseCheckbox v-if="original.correoEstado==='INCIERTO'" v-model="reviewed" name="confirmation-reviewed" label="Revisé Enviados en Gmail y este mensaje necesita un nuevo envío" required :disabled="saving" :error="errors.reviewed" />
          <BaseCheckbox v-if="original.correoEstado==='ENVIADO'" v-model="resend" name="confirmation-resend" label="Enviar nuevamente este correo de confirmación" required :disabled="saving" :error="errors.resend" />
          <p v-if="original.correoEstado==='PENDIENTE'" class="svc-muted svc-small">Ya hay un envío en cola. Actualiza la lista para consultar el resultado.</p>
        </template>
      </template>
    </form>
    <template #footer><div class="svc-dialog-actions"><BaseButton variant="secondary" size="compact" :disabled="saving || loading" @click="close">Volver</BaseButton><BaseButton type="submit" form="upcoming-editor-form" size="compact" :loading="saving" :disabled="loading || conflict || (mode==='email' && (!email || original.correoEstado==='PENDIENTE'))">{{ mode==='email' ? 'Solicitar envío' : 'Guardar seguimiento' }}</BaseButton></div></template>
  </BaseDialog>
  <ConfirmDialog :open="discardOpen" title="Descartar cambios" message="El seguimiento no se actualizará." confirm-label="Descartar" danger @confirm="emit('close')" @cancel="discardOpen=false" />
  <ConfirmDialog :open="reloadOpen" title="Cargar versión actual" message="Se reemplazará el borrador por el seguimiento guardado." confirm-label="Cargar versión actual" @confirm="reload" @cancel="reloadOpen=false" />
  <ConfirmDialog :open="declineOpen" title="El cliente no desea la próxima visita" message="La propuesta saldrá de los pendientes. Se conserva el seguimiento y no se cancelan otros servicios." confirm-label="Marcar como No desea" @confirm="save(true)" @cancel="declineOpen=false" />
  <ConfirmDialog :open="confirmOpen" title="Salir sin guardar" message="Los cambios de seguimiento no se guardarán." confirm-label="Salir" danger @confirm="confirmDiscard" @cancel="cancelDiscard" />
</template>
