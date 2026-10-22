<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import TechnicianEvidencePicker from '@/components/domain/services/TechnicianEvidencePicker.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { getTechnicianServiceBalance,reportTechnicianPayment,uploadPaymentProof } from '@/services/financeService'
import { useNotificationsStore } from '@/stores/notifications'
import type { MetodoPago } from '@/types/finance'

const props=defineProps<{open:boolean;serviceId:string}>()
const emit=defineEmits<{close:[];saved:[]}>()
const notifications=useNotificationsStore(),{online}=useNetworkStatus()
const loading=ref(false),saving=ref(false),error=ref(''),max=ref(0),state=ref('')
const monto=ref(''),metodo=ref<MetodoPago>('EFECTIVO'),observacion=ref(''),proofs=ref<File[]>([]),requestId=ref('')
const reportedPaymentId=ref<string|null>(null)
const valid=computed(()=>!saving.value&&online.value&&Number.isSafeInteger(Number(monto.value))
  &&Number(monto.value)>0&&Number(monto.value)<=max.value&&(metodo.value==='EFECTIVO'||proofs.value.length===1))
const fmt=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v)
watch(()=>[props.open,props.serviceId] as const,([open])=>{
  if(open){requestId.value=crypto.randomUUID();metodo.value='EFECTIVO';observacion.value='';proofs.value=[];reportedPaymentId.value=null;void load()}
}, {immediate:true})
async function load():Promise<void>{
  loading.value=true;error.value=''
  try{
    const data=await getTechnicianServiceBalance(props.serviceId)
    max.value=data.disponible;state.value=data.estado;monto.value=String(data.disponible||'')
  }catch(e){error.value=e instanceof Error?e.message:'No fue posible consultar el cobro.'}
  finally{loading.value=false}
}
async function save():Promise<void>{
  if(!valid.value)return
  saving.value=true
  error.value=''
  try{
    // A successful receipt must never be submitted a second time when the
    // separate R2 upload fails. Keep its ID and the selected photo for retry.
    if(!reportedPaymentId.value){
      const result=await reportTechnicianPayment(props.serviceId,requestId.value,Number(monto.value),metodo.value,observacion.value)
      reportedPaymentId.value=result.id
      emit('saved')
    }
    if(metodo.value==='TRANSFERENCIA'&&proofs.value[0]){
      await uploadPaymentProof(reportedPaymentId.value,proofs.value[0])
    }
    notifications.show('Cobro reportado. Administración debe confirmar la recepción.','success')
    emit('close')
  }catch(e){
    const detail=e instanceof Error?e.message:'No fue posible subir el comprobante.'
    error.value=reportedPaymentId.value
      ? 'El cobro ya está registrado, pero falta el comprobante. '+detail+' Puedes reintentar aquí o desde Mi caja.'
      : detail
  }finally{saving.value=false}
}
</script>

<template>
  <BaseDialog :model-value="open" title="Reportar cobro" description="El administrador debe confirmar este pago." @update:model-value="!saving&&!$event&&emit('close')">
    <LoadingSkeleton v-if="loading" label="Revisando saldo" :lines="2"/>
    <template v-else>
      <p v-if="error" class="payment-alert" role="alert">{{ error }}</p>
      <p class="payment-caption">Saldo aún cobrable: <strong>{{ fmt(max) }}</strong></p>
      <p v-if="!online" class="payment-alert">Conéctate para reportar el cobro. No se contará dinero hasta confirmarlo.</p>
      <p v-if="max<=0" class="payment-caption">El servicio no tiene saldos disponibles para reportar.</p>
      <p v-if="reportedPaymentId" class="payment-caption">El cobro ya fue reportado. Solo falta subir el comprobante; no se registrará otro pago.</p>
      <form id="technician-payment-form" class="payment-form" @submit.prevent="save">
        <BaseSelect v-model="metodo" name="technician-pay-method" label="Método" required :disabled="saving || !!reportedPaymentId"><option value="EFECTIVO">Efectivo recibido</option><option value="TRANSFERENCIA">Transferencia recibida</option></BaseSelect>
        <BaseInput v-model="monto" name="technician-pay-amount" label="Monto (COP)" type="number" min="1" :max="String(max)" step="1" required :disabled="saving || !!reportedPaymentId"/>
        <TechnicianEvidencePicker v-if="metodo==='TRANSFERENCIA'" v-model="proofs" name="technician-pay-proof" label="Comprobante de la transferencia" required :max="1" :disabled="saving"/>
        <BaseTextarea v-model="observacion" name="technician-pay-note" label="Observación (opcional)" :rows="2" maxlength="1000" :disabled="saving || !!reportedPaymentId"/>
      </form>
    </template>
    <template #footer><BaseButton size="compact" variant="secondary" :disabled="saving" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton type="submit" form="technician-payment-form" size="compact" :loading="saving"
        :disabled="loading||!valid||!['FINALIZADO','EN_PROCESO'].includes(state)">{{ reportedPaymentId ? 'Reintentar comprobante' : 'Reportar pago' }}</BaseButton></template>
  </BaseDialog>
</template>

<style scoped>
.payment-form{display:grid;gap:.7rem;margin:.8rem 0}.payment-alert{margin:0 0 .65rem;color:var(--danger);font-size:.82rem}
.payment-caption{margin:0 0 .65rem;color:var(--text-secondary);font-size:.85rem}.payment-caption strong{color:var(--text)}
</style>
