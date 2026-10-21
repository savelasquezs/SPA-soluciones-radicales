<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
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
const monto=ref(''),metodo=ref<MetodoPago>('EFECTIVO'),observacion=ref(''),proof=ref<File|null>(null),requestId=ref('')
const valid=computed(()=>!saving.value&&online.value&&Number.isSafeInteger(Number(monto.value))
  &&Number(monto.value)>0&&Number(monto.value)<=max.value&&(metodo.value==='EFECTIVO'||!!proof.value))
const fmt=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v)
watch(()=>[props.open,props.serviceId] as const,([open])=>{
  if(open){requestId.value=crypto.randomUUID();metodo.value='EFECTIVO';observacion.value='';proof.value=null;void load()}
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
  try{
    const result=await reportTechnicianPayment(props.serviceId,requestId.value,Number(monto.value),metodo.value,observacion.value)
    // La intención de cobro queda persistida primero; un fallo en R2 no la duplica.
    if(metodo.value==='TRANSFERENCIA'&&proof.value){
      try{await uploadPaymentProof(result.id,proof.value)}
      catch{notifications.show('Cobro reportado. Sube el comprobante pendiente desde Mi caja.','info');emit('saved');emit('close');return}
    }
    notifications.show('Cobro reportado. Administración debe confirmar la recepción.','success')
    emit('saved');emit('close')
  }catch(e){error.value=e instanceof Error?e.message:'No fue posible registrar el cobro.'}
  finally{saving.value=false}
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
      <form id="technician-payment-form" class="payment-form" @submit.prevent="save">
        <BaseSelect v-model="metodo" name="technician-pay-method" label="Método" required :disabled="saving"><option value="EFECTIVO">Efectivo recibido</option><option value="TRANSFERENCIA">Transferencia recibida</option></BaseSelect>
        <BaseInput v-model="monto" name="technician-pay-amount" label="Monto (COP)" type="number" min="1" :max="String(max)" step="1" required :disabled="saving"/>
        <BaseFileUpload v-if="metodo==='TRANSFERENCIA'" v-model="proof" name="technician-pay-proof" label="Comprobante de la transferencia" required size="compact"
          accept=".jpg,.jpeg,.png,.webp" :disabled="saving" hint="Fotografía JPG, PNG o WebP. Se carga de forma privada."/>
        <BaseTextarea v-model="observacion" name="technician-pay-note" label="Observación (opcional)" :rows="2" maxlength="1000" :disabled="saving"/>
      </form>
    </template>
    <template #footer><BaseButton size="compact" variant="secondary" :disabled="saving" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton type="submit" form="technician-payment-form" size="compact" :loading="saving"
        :disabled="loading||!valid||!['FINALIZADO','EN_PROCESO'].includes(state)">Reportar pago</BaseButton></template>
  </BaseDialog>
</template>

<style scoped>
.payment-form{display:grid;gap:.7rem;margin:.8rem 0}.payment-alert{margin:0 0 .65rem;color:var(--danger);font-size:.82rem}
.payment-caption{margin:0 0 .65rem;color:var(--text-secondary);font-size:.85rem}.payment-caption strong{color:var(--text)}
</style>
