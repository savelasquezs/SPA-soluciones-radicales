<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import ServiceScheduleFields from './ServiceScheduleFields.vue'
import ServiceSaveFeedback from './ServiceSaveFeedback.vue'
import { useServiceMutation } from '@/composables/useServiceMutation'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { useAdminServicesStore } from '@/stores/adminServices'
import { useNotificationsStore } from '@/stores/notifications'
import { cancelAdminService, reprogramAdminService, saveServicePayment } from '@/services/adminServicesService'
import { formatServiceMoney, scheduleFromDraft, scheduleFromRecord, scheduleToDraft, validateSchedule } from '@/helpers/adminServices'
import type { AdminService, ServiceErrors, ServiceMutation, ServicePaymentInput } from '@/types/adminServices'

const props=defineProps<{ record: AdminService; mode: 'schedule' | 'team' | 'cancel' | 'payment' }>()
const emit=defineEmits<{ close: []; saved: [result: ServiceMutation] }>()
const store=useAdminServicesStore(), notifications=useNotificationsStore()
const original=ref(props.record), schedule=ref(scheduleToDraft(scheduleFromRecord(props.record)))
const child=ref(props.mode==='schedule' && props.record.refuerzo?.estado==='PROGRAMADO' ? scheduleToDraft(scheduleFromRecord(props.record.refuerzo)) : null)
const reason=ref(''), payment=ref<ServicePaymentInput>({ metodoPago:props.record.pago.metodoPago ?? 'EFECTIVO',estadoPago:'CONFIRMADO',tecnicoQueRecaudaId:props.record.pago.tecnicoQueRecaudaId ?? props.record.pago.tecnicoRecaudoPrevistoId,motivo:'' })
const { saving,errors,errorMessage,conflict,overlapOpen,overlaps,run,invalid,reset,clearValidation,acceptOverlap,cancelOverlap }=useServiceMutation()
const loadingRecord=ref(false), discardOpen=ref(false), reloadOpen=ref(false)
const serialize=()=>JSON.stringify({ schedule:schedule.value,child:child.value,reason:reason.value,payment:payment.value })
let baseline=serialize()
const dirty=computed(()=>serialize()!==baseline)
const { confirmOpen,cancelDiscard,confirmDiscard }=useUnsavedChanges(dirty,computed(()=>saving.value || loadingRecord.value))
const title=computed(()=>({ schedule:original.value.tipoServicio==='REFUERZO' ? 'Reprogramar Refuerzo' : 'Reprogramar servicio',team:'Cambiar equipo',cancel:'Cancelar servicio',payment:'Registrar pago' })[props.mode])
const technicians=computed(()=>{
  const people=new Map((store.options?.tecnicos ?? []).map(person=>[person.id,person]))
  for(const person of [original.value.responsable,...original.value.colaboradores]) if(!people.has(person.id)) people.set(person.id,person)
  return [...people.values()]
})
const paymentReasonRequired=computed(()=>original.value.pago.estadoPago==='CONFIRMADO' || payment.value.estadoPago==='RECHAZADO')
const primaryLabel=computed(()=>props.mode==='cancel' ? 'Cancelar servicio' : props.mode==='payment' && payment.value.estadoPago==='CONFIRMADO' ? 'Confirmar pago' : 'Guardar cambios')
function close(): void { if(saving.value || loadingRecord.value) return; if(dirty.value) discardOpen.value=true; else emit('close') }
async function save(): Promise<void> {
  const fields: ServiceErrors={}
  if(props.mode==='schedule' || props.mode==='team') {
    Object.assign(fields,validateSchedule(scheduleFromDraft(schedule.value)).errors)
    if(child.value) Object.assign(fields,validateSchedule(scheduleFromDraft(child.value),'refuerzo').errors)
  }
  if(props.mode==='cancel' && !reason.value.trim()) fields.reason='Indica el motivo de cancelación.'
  if(props.mode==='payment') {
    if(paymentReasonRequired.value && !payment.value.motivo.trim()) fields.motivo='Indica el motivo de la corrección o rechazo.'
    if(payment.value.metodoPago==='EFECTIVO' && payment.value.estadoPago==='CONFIRMADO' && !payment.value.tecnicoQueRecaudaId) fields.tecnicoQueRecaudaId='Selecciona quién recibió el efectivo.'
  }
  if(Object.keys(fields).length) { await invalid(fields); return }
  await run((requestId,allowConflicts)=>{
    if(props.mode==='cancel') return cancelAdminService(original.value,requestId,reason.value)
    if(props.mode==='payment') return saveServicePayment(original.value,requestId,{ ...payment.value,tecnicoQueRecaudaId:payment.value.metodoPago==='EFECTIVO' ? payment.value.tecnicoQueRecaudaId : null })
    return reprogramAdminService(original.value,requestId,scheduleFromDraft(schedule.value),allowConflicts,child.value ? scheduleFromDraft(child.value) : undefined)
  },result=>{ store.applyMutation(result); baseline=serialize(); emit('saved',result); emit('close') },props.mode==='cancel' ? 'Servicio cancelado; el historial se conserva.' : props.mode==='payment' ? 'Registro de pago actualizado.' : 'Cambios guardados. Calendar se actualizará en segundo plano.')
}
async function reload(): Promise<void> {
  reloadOpen.value=false; loadingRecord.value=true
  try {
    const fresh=await store.ensureService(original.value.id,true)
    original.value=fresh; schedule.value=scheduleToDraft(scheduleFromRecord(fresh))
    child.value=props.mode==='schedule' && fresh.refuerzo?.estado==='PROGRAMADO' ? scheduleToDraft(scheduleFromRecord(fresh.refuerzo)) : null
    payment.value={ metodoPago:fresh.pago.metodoPago ?? 'EFECTIVO',estadoPago:'CONFIRMADO',tecnicoQueRecaudaId:fresh.pago.tecnicoQueRecaudaId ?? fresh.pago.tecnicoRecaudoPrevistoId,motivo:'' }
    reason.value=''; baseline=serialize(); reset()
  } catch(failure) { notifications.show(failure instanceof Error ? failure.message : 'No fue posible cargar la versión actual.','error') }
  finally { loadingRecord.value=false }
}
</script>
<template>
  <BaseDialog :model-value="true" :title="title" :description="`${original.solicitud} · ${original.clienteNombre} · ${original.sedeNombre}`" class="svc-action-dialog" :close-on-escape="!saving" @update:model-value="!$event && close()">
    <form id="service-quick-form" class="svc-dialog-stack" novalidate @submit.prevent="save">
      <ServiceSaveFeedback :error="errorMessage" :conflict="conflict" :overlaps="overlaps" :overlap-open="overlapOpen" :saving="saving" @reload="reloadOpen=true" @accept="acceptOverlap" @cancel="cancelOverlap" />
      <template v-if="mode==='schedule' || mode==='team'">
        <section class="svc-card"><h3 v-if="child">Principal · {{ original.solicitud }}</h3><ServiceScheduleFields :model-value="schedule" :technicians="technicians" :show-dates="mode==='schedule'" :disabled="saving || loadingRecord" :errors="errors" @update:model-value="schedule=$event; clearValidation()" /></section>
        <section v-if="child" class="svc-card"><h3>Refuerzo · {{ original.refuerzo?.solicitud }}</h3><ServiceScheduleFields :model-value="child" prefix="refuerzo" :technicians="technicians" :disabled="saving || loadingRecord" :errors="errors" @update:model-value="child=$event; clearValidation()" /></section>
        <p class="svc-muted svc-small">{{ child ? 'Se guardarán ambas programaciones en una sola operación. La fecha del Refuerzo es independiente.' : mode==='team' ? 'Este cambio afecta únicamente al equipo de esta visita.' : 'Este cambio no modifica la programación del Principal.' }}</p>
      </template>
      <template v-else-if="mode==='cancel'">
        <p v-if="original.refuerzo?.estado==='PROGRAMADO'">También se cancelará {{ original.refuerzo.solicitud }}, el Refuerzo que continúa Programado.</p>
        <p v-else class="svc-muted svc-small">No se eliminan el servicio, sus evidencias ni sus registros de pago.</p>
        <BaseTextarea v-model="reason" name="service-cancel-reason" label="Motivo" required maxlength="5000" :rows="4" :disabled="saving || loadingRecord" :error="errors.reason" @update:model-value="clearValidation" />
      </template>
      <template v-else>
        <div class="svc-notice"><span>Valor del servicio</span><strong class="svc-amount">{{ formatServiceMoney(original.valorServicio) }}</strong></div>
        <div class="svc-form-grid">
          <BaseSelect v-model="payment.metodoPago" name="payment-method" label="Método de pago" required :disabled="saving || loadingRecord"><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option></BaseSelect>
          <BaseSelect v-model="payment.estadoPago" name="payment-state" label="Estado del pago" required :disabled="saving || loadingRecord"><option value="CONFIRMADO">Confirmado</option><option value="PENDIENTE">Pendiente</option><option value="RECHAZADO">Rechazado</option></BaseSelect>
          <BaseSelect v-if="payment.metodoPago==='EFECTIVO' && payment.estadoPago==='CONFIRMADO'" :model-value="payment.tecnicoQueRecaudaId ?? ''" class="svc-full" name="payment-collected-by" label="Quién recibió el efectivo" required :disabled="saving || loadingRecord" :error="errors.tecnicoQueRecaudaId" @update:model-value="payment.tecnicoQueRecaudaId=$event || null"><option value="">Selecciona un técnico</option><option v-for="person in technicians" :key="person.id" :value="person.id">{{ person.nombreCompleto }}</option><option v-if="original.pago.tecnicoQueRecaudaId && !technicians.some(person=>person.id===original.pago.tecnicoQueRecaudaId)" :value="original.pago.tecnicoQueRecaudaId">{{ original.pago.tecnicoQueRecaudaNombre }} · Histórico</option></BaseSelect>
          <BaseTextarea v-model="payment.motivo" class="svc-full" name="payment-reason" label="Observación" :required="paymentReasonRequired" :rows="3" maxlength="5000" :disabled="saving || loadingRecord" :error="errors.motivo" />
        </div>
        <p v-if="payment.estadoPago==='CONFIRMADO'" class="svc-muted svc-small">Al confirmar registras que el dinero fue recibido. Esto no registra una entrega de caja del técnico al administrador.</p>
      </template>
    </form>
    <template #footer><div class="svc-dialog-actions"><BaseButton variant="secondary" size="compact" :disabled="saving || loadingRecord" @click="close">Volver</BaseButton><BaseButton form="service-quick-form" type="submit" size="compact" :variant="mode==='cancel' ? 'danger' : 'primary'" :loading="saving || loadingRecord" :disabled="conflict">{{ primaryLabel }}</BaseButton></div></template>
  </BaseDialog>
  <ConfirmDialog :open="discardOpen" title="Descartar cambios" message="Los cambios de este editor no se guardarán." confirm-label="Descartar" danger @confirm="emit('close')" @cancel="discardOpen=false" />
  <ConfirmDialog :open="reloadOpen" title="Cargar versión actual" message="Se reemplazarán los cambios del editor por la versión guardada. No se sobrescribirá el trabajo de otra persona." confirm-label="Cargar versión actual" @confirm="reload" @cancel="reloadOpen=false" />
  <ConfirmDialog :open="confirmOpen" title="Salir sin guardar" message="Los cambios de este editor no se guardarán." confirm-label="Salir" danger @confirm="confirmDiscard" @cancel="cancelDiscard" />
</template>
