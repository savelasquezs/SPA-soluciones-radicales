<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseFileUpload from '@/components/base/BaseFileUpload.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { getPaymentProofUrl,myCashBalance,uploadPaymentProof } from '@/services/financeService'
import { useNotificationsStore } from '@/stores/notifications'
import type { Pago, TecnicoCaja } from '@/types/finance'

const notifications=useNotificationsStore()
const loading=ref(true),busy=ref(''),error=ref('')
const balance=ref<TecnicoCaja|null>(null),payments=ref<Pago[]>([])
const files=ref<Record<string,File|null>>({})
const fmt=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v)
const date=(iso:string)=>new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(iso))
onMounted(()=>{void refresh()})
async function refresh():Promise<void>{
  loading.value=true;error.value=''
  try{const result=await myCashBalance();balance.value=result.balance;payments.value=result.pagos}
  catch(e){error.value=e instanceof Error?e.message:'No fue posible consultar la caja.'}
  finally{loading.value=false}
}
async function attach(p:Pago):Promise<void>{
  const file=files.value[p.id]
  if(!file||busy.value)return
  busy.value=p.id
  try{await uploadPaymentProof(p.id,file);files.value[p.id]=null;notifications.show('Comprobante adjuntado.','success');await refresh()}
  catch(e){notifications.show(e instanceof Error?e.message:'No fue posible subir el comprobante.','error')}
  finally{busy.value=''}
}
async function openProof(p:Pago):Promise<void>{
  const tab=window.open('','_blank')
  try{const url=await getPaymentProofUrl(p.id);if(tab)tab.location.href=url;else window.location.href=url}
  catch(e){tab?.close();notifications.show(e instanceof Error?e.message:'No fue posible abrir el comprobante.','error')}
}
</script>

<template>
  <ServicePage title="Mi caja" caption="Cobros reportados, efectivo confirmado y entregas a administración.">
    <header class="cash-head"><BaseButton variant="secondary" size="compact" :disabled="Boolean(busy)" @click="refresh"><RefreshCw :size="15"/>Actualizar</BaseButton></header>
    <LoadingSkeleton v-if="loading" :lines="5"/>
    <p v-else-if="error" class="cash-alert">{{ error }} <BaseButton size="compact" @click="refresh">Reintentar</BaseButton></p>
    <template v-else-if="balance">
      <section class="cash-summary">
        <article><span>Efectivo recaudado y confirmado</span><strong>{{ fmt(balance.recaudado) }}</strong></article>
        <article><span>Entregado a administración</span><strong>{{ fmt(balance.entregado) }}</strong></article>
        <article><span>Pendiente por entregar</span><strong>{{ fmt(balance.saldo) }}</strong></article>
      </section>
      <section class="cash-panel"><h2>Mis cobros reportados</h2>
        <p class="cash-help">Los pagos pendientes de confirmación no aumentan el efectivo por entregar.</p>
        <article v-for="p in payments" :key="p.id" class="cash-entry">
          <div class="cash-entry-heading"><div><strong>{{ p.clienteNombre }} · {{ fmt(p.monto) }}</strong>
              <small>{{ date(p.fechaPago) }} · {{ p.metodo==='EFECTIVO'?'Efectivo':'Transferencia' }} · {{ p.aplicaciones.map(a=>a.solicitud).join(', ') }}</small></div>
            <StatusBadge :tone="p.estado==='CONFIRMADO'?'success':p.estado==='PENDIENTE'?'warning':'neutral'">{{ p.estado==='PENDIENTE'?'Por confirmar':p.estado==='CONFIRMADO'?'Confirmado':p.estado==='RECHAZADO'?'Rechazado':'Anulado' }}</StatusBadge></div>
          <p v-if="p.motivoRevision" class="cash-help">{{ p.motivoRevision }}</p>
          <template v-if="p.metodo==='TRANSFERENCIA'">
            <BaseButton v-if="p.comprobanteDisponible" size="compact" variant="ghost" @click="openProof(p)">Ver comprobante</BaseButton>
            <div v-else-if="p.estado==='PENDIENTE'" class="cash-upload">
              <BaseFileUpload :model-value="files[p.id]??null" :name="'cash-proof-'+p.id" label="Adjuntar comprobante" size="compact" accept=".jpg,.jpeg,.png,.webp"
                @update:model-value="files[p.id]=$event"/>
              <BaseButton variant="secondary" size="compact" :loading="busy===p.id" :disabled="!files[p.id]" @click="attach(p)">Subir</BaseButton>
            </div>
          </template>
        </article>
        <p v-if="!payments.length" class="cash-help">Aún no has reportado cobros.</p>
      </section>
    </template>
  </ServicePage>
</template>
<style scoped>
.cash-head{display:flex;justify-content:flex-end}.cash-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem}
.cash-summary article,.cash-panel{display:grid;gap:.5rem;border:1px solid var(--border);border-radius:var(--radius-lg);padding:.85rem;background:var(--surface)}
.cash-summary span,.cash-entry small,.cash-help{color:var(--text-secondary);font-size:.78rem}
.cash-summary strong{font-size:1.13rem;font-variant-numeric:tabular-nums}.cash-panel{margin-top:.85rem;gap:.7rem}
.cash-panel h2{margin:0;font-size:1rem}.cash-help{margin:0}.cash-entry{display:grid;gap:.65rem;border-bottom:1px solid var(--border);padding-bottom:.75rem}
.cash-entry:last-child{border-bottom:0}.cash-entry-heading{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap}
.cash-entry-heading strong{font-size:.87rem}.cash-entry-heading small{display:block;margin-top:.3rem}
.cash-upload{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:.5rem}.cash-alert{color:var(--danger)}
@media(max-width:700px){.cash-summary{grid-template-columns:1fr}.cash-upload{grid-template-columns:1fr}}
</style>
