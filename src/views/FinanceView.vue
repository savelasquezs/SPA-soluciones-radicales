<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CreditCard, RefreshCw } from 'lucide-vue-next'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/base/BaseDialog.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import EmptyState from '@/components/base/EmptyState.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import ResponsiveTable from '@/components/base/ResponsiveTable.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { getFinanceAccount,getFinanceOverview,registerFinancePayment,registerCashDelivery,
  decideFinancePayment,annulCashDelivery,getPaymentProofUrl,saveClientTerms } from '@/services/financeService'
import type { ClienteCartera,DetalleCartera,MetodoPago,ModalidadCobro,Pago,ResumenFinanzas,TecnicoCaja } from '@/types/finance'

type Tab = 'cartera'|'caja'|'movimientos'
type Decision = 'CONFIRMADO'|'RECHAZADO'|'ANULADO'
const route=useRoute(),router=useRouter(),auth=useAuthStore(),notifications=useNotificationsStore()
const active=ref<Tab>('cartera'),loading=ref(true),busy=ref(false),error=ref('')
const snapshot=ref<ResumenFinanzas|null>(null)
const search=ref('')
const clientId=ref(typeof route.query.cliente==='string'?route.query.cliente:'')
const account=ref<DetalleCartera|null>(null),accountLoading=ref(false)
const technicianId=ref('')
const paymentOpen=ref(false),cashOpen=ref(false),termsOpen=ref(false)
const reviewTarget=ref<{kind:'pago'|'entrega';id:string;action:Decision|'ENTREGA_ANULADA'}|null>(null)
const reviewReason=ref('')
const newPaymentId=ref(''),newDeliveryId=ref('')
const paymentMethod=ref<MetodoPago>('TRANSFERENCIA')
const receiver=ref(''),paymentNote=ref(''),values=ref<Record<string,string>>({})
const deliveryAmount=ref(''),deliveryNote=ref('')
const termsMode=ref<ModalidadCobro>('POR_SERVICIO'),termsDays=ref('0')
const tabs=[{id:'cartera',name:'Cartera'},{id:'caja',name:'Caja por técnico'},{id:'movimientos',name:'Movimientos'}] as const
const clients=computed(()=>snapshot.value?.clientes??[])
const technicians=computed(()=>snapshot.value?.tecnicos??[])
const selectedTech=computed(()=>technicians.value.find(t=>t.id===technicianId.value)??null)
const filteredClients=computed(()=>clients.value.filter(c=>c.nombre.toLowerCase().includes(search.value.toLowerCase().trim())))
const totalCartera=computed(()=>clients.value.reduce((t,c)=>t+c.saldo,0))
const totalCaja=computed(()=>technicians.value.reduce((t,c)=>t+c.saldo,0))
const allocations=computed(()=>Object.entries(values.value).map(([servicioId,text])=>({servicioId,monto:Number(text)}))
  .filter(a=>Number.isSafeInteger(a.monto)&&a.monto>0))
const totalPayment=computed(()=>allocations.value.reduce((t,a)=>t+a.monto,0))
const validPayment=computed(()=>Boolean(account.value && totalPayment.value>0
  && allocations.value.every(a=>a.monto<=(account.value?.servicios.find(s=>s.id===a.servicioId)?.saldo??0))
  && Object.values(values.value).every(v=>!v||(/^\d+$/.test(v)&&Number(v)>=0))
  && (paymentMethod.value!=='EFECTIVO'||receiver.value)))
const pendingInCash=computed(()=>snapshot.value?.pagosRevision.filter(p=>p.metodo==='EFECTIVO').length??0)
const visibleReceipts=computed(()=>snapshot.value?.movimientos.filter(p=>p.estado==='CONFIRMADO'
  && p.metodo==='EFECTIVO'&&p.recaudadoPorId===technicianId.value)??[])
const visibleDeliveries=computed(()=>snapshot.value?.entregas.filter(m=>m.tecnicoId===technicianId.value)??[])
const fmt=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v)
const date=(value:string)=>new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeZone:'America/Bogota'}).format(new Date(value))
const message=(e:unknown)=>e instanceof Error?e.message:'No fue posible completar la operación.'

onMounted(()=>{void refresh()})
async function refresh():Promise<void>{
  loading.value=true;error.value=''
  try{
    snapshot.value=await getFinanceOverview()
    if(clientId.value)await loadAccount()
    if(!technicianId.value)technicianId.value=technicians.value[0]?.id??''
  }catch(e){error.value=message(e)}
  finally{loading.value=false}
}
async function loadAccount():Promise<void>{
  if(!clientId.value){account.value=null;return}
  accountLoading.value=true
  try{account.value=await getFinanceAccount(clientId.value)}
  catch(e){account.value=null;notifications.show(message(e),'error')}
  finally{accountLoading.value=false}
}
async function selectClient(id:string):Promise<void>{
  clientId.value=id
  void router.replace({query:{...route.query,cliente:id||undefined,servicio:undefined}})
  await loadAccount()
}
function openPayment():void{
  if(!account.value)return
  newPaymentId.value=crypto.randomUUID()
  paymentMethod.value='TRANSFERENCIA';receiver.value='';paymentNote.value=''
  values.value={}
  const selected=route.query.servicio
  if(typeof selected==='string'){
    const service=account.value.servicios.find(s=>s.id===selected && s.saldo>0)
    if(service)values.value[service.id]=String(service.saldo)
  }
  paymentOpen.value=true
}
async function savePayment():Promise<void>{
  if(!validPayment.value||busy.value||!account.value)return
  busy.value=true
  try{
    await registerFinancePayment({requestId:newPaymentId.value,clienteId:account.value.cliente.id,
      metodo:paymentMethod.value,recaudadoPorId:paymentMethod.value==='EFECTIVO'?receiver.value:null,
      observacion:paymentNote.value,aplicaciones:allocations.value})
    paymentOpen.value=false
    notifications.show('Pago registrado y aplicado a los servicios.','success')
    await refresh()
  }catch(e){notifications.show(message(e),'error')}
  finally{busy.value=false}
}
function openCash(tech:TecnicoCaja):void{
  technicianId.value=tech.id;newDeliveryId.value=crypto.randomUUID()
  deliveryAmount.value=String(Math.max(0,tech.saldo));deliveryNote.value='';cashOpen.value=true
}
async function saveCash():Promise<void>{
  if(!selectedTech.value||busy.value)return
  const monto=Number(deliveryAmount.value)
  if(!Number.isSafeInteger(monto)||monto<=0||monto>selectedTech.value.saldo)return
  busy.value=true
  try{
    await registerCashDelivery({requestId:newDeliveryId.value,tecnicoId:selectedTech.value.id,
      monto,observacion:deliveryNote.value})
    cashOpen.value=false;notifications.show('Entrega de efectivo registrada.','success');await refresh()
  }catch(e){notifications.show(message(e),'error')}
  finally{busy.value=false}
}
function openTerms(c:ClienteCartera):void{
  clientId.value=c.id;termsMode.value=c.modalidadCobro;termsDays.value=String(c.plazoPagoDias);termsOpen.value=true
}
async function saveTerms():Promise<void>{
  if(!clientId.value||busy.value)return
  const days=Number(termsDays.value)
  if(!Number.isInteger(days)||days<0||days>365)return
  busy.value=true
  try{
    await saveClientTerms(clientId.value,termsMode.value,days)
    termsOpen.value=false;notifications.show('Condiciones de pago guardadas.','success');await refresh()
  }catch(e){notifications.show(message(e),'error')}
  finally{busy.value=false}
}
function openReview(kind:'pago'|'entrega',id:string,action:Decision|'ENTREGA_ANULADA'):void{
  reviewTarget.value={kind,id,action};reviewReason.value=''
}
async function saveReview():Promise<void>{
  const target=reviewTarget.value
  if(!target||busy.value||(target.action!=='CONFIRMADO'&&!reviewReason.value.trim()))return
  busy.value=true
  try{
    if(target.kind==='pago')await decideFinancePayment(target.id,target.action as Decision,reviewReason.value)
    else await annulCashDelivery(target.id,reviewReason.value)
    reviewTarget.value=null;notifications.show('Movimiento actualizado.','success');await refresh()
  }catch(e){notifications.show(message(e),'error')}
  finally{busy.value=false}
}
async function proof(payment:Pago):Promise<void>{
  const tab=window.open('','_blank')
  try{const url=await getPaymentProofUrl(payment.id);if(tab)tab.location.href=url;else window.location.href=url}
  catch(e){tab?.close();notifications.show(message(e),'error')}
}
</script>

<template>
  <div class="finance-page">
    <header class="finance-head">
      <div><h1>Pagos y caja</h1><p>Recaudo, cartera y entregas de efectivo sin duplicar movimientos.</p></div>
      <BaseButton size="compact" variant="secondary" :disabled="busy" @click="refresh"><RefreshCw :size="16"/>Actualizar</BaseButton>
    </header>
    <LoadingSkeleton v-if="loading && !snapshot" :lines="7" label="Cargando saldos"/>
    <div v-else-if="error && !snapshot" class="finance-card">{{ error }} <BaseButton variant="secondary" size="compact" @click="refresh">Reintentar</BaseButton></div>
    <template v-else-if="snapshot">
      <section class="finance-kpis" aria-label="Resumen financiero">
        <article><span>Cartera por cobrar</span><strong>{{ fmt(totalCartera) }}</strong></article>
        <article><span>Efectivo por entregar</span><strong>{{ fmt(totalCaja) }}</strong></article>
        <article><span>Cobros por revisar</span><strong>{{ snapshot.pagosRevision.length }}</strong><small>{{ pendingInCash }} en efectivo</small></article>
      </section>
      <nav class="finance-tabs" aria-label="Módulos financieros">
        <button v-for="item in tabs"
          :key="item.id" type="button" :aria-current="active===item.id?'page':undefined"
          @click="active=item.id">{{ item.name }}</button>
      </nav>
      <template v-if="active==='cartera'">
        <div class="finance-toolbar">
          <BaseInput v-model="search" name="finance-client-search" label="Buscar cliente" type="search" placeholder="Nombre del cliente"/>
          <p>La cartera reúne todas las sedes del cliente. Solo los servicios finalizados generan ventas.</p>
        </div>
        <section class="finance-card">
          <ResponsiveTable>
            <template #table><table><thead><tr><th>Cliente</th><th>Condición</th><th class="numeric">Servicios realizados</th><th class="numeric">Pagado</th><th class="numeric">Saldo</th></tr></thead>
              <tbody><tr v-for="c in filteredClients" :key="c.id" :class="{'selected':clientId===c.id}">
                <td><button class="finance-link" @click="selectClient(c.id)">{{ c.nombre }}</button></td>
                <td>{{ c.modalidadCobro==='CREDITO'?'Crédito':'Por servicio' }}</td><td class="numeric">{{ fmt(c.realizado) }}</td><td class="numeric">{{ fmt(c.pagado) }}</td><td class="numeric"><strong>{{ fmt(c.saldo) }}</strong></td>
              </tr></tbody></table></template>
            <template #cards><button v-for="c in filteredClients" :key="c.id" class="finance-mobile-record" @click="selectClient(c.id)">
              <strong>{{ c.nombre }}</strong><small>{{ c.modalidadCobro==='CREDITO'?'Crédito':'Por servicio' }} · Realizado {{ fmt(c.realizado) }}</small>
              <span>Saldo {{ fmt(c.saldo) }}</span></button></template>
          </ResponsiveTable>
          <EmptyState v-if="!filteredClients.length" title="No hay clientes" message="Cambia la búsqueda para ver los registros."/>
        </section>
        <LoadingSkeleton v-if="accountLoading" :lines="4"/>
        <section v-else-if="account" class="finance-card finance-details">
          <header class="finance-section-head"><div><h2>{{ account.cliente.nombre }}</h2>
            <p>Saldo por cobrar: <strong>{{ fmt(account.cliente.saldo) }}</strong> · Anticipos: {{ fmt(account.cliente.anticipos) }}</p></div>
            <div class="finance-actions"><BaseButton size="compact" variant="secondary" @click="openTerms(account.cliente)">Condiciones</BaseButton>
              <BaseButton size="compact" @click="openPayment"><CreditCard :size="15"/>Registrar abono</BaseButton></div>
          </header>
          <ResponsiveTable>
            <template #table><table><thead><tr><th>Servicio</th><th>Sede</th><th>Fecha</th><th>Estado</th><th class="numeric">Valor</th><th class="numeric">Abonado</th><th class="numeric">Pendiente</th></tr></thead>
              <tbody><tr v-for="s in account.servicios" :key="s.id">
                <td><RouterLink :to="'/servicios/'+s.id" class="finance-link">{{ s.solicitud }}</RouterLink></td><td>{{ s.sedeNombre }}</td><td>{{ date(s.fecha) }}</td><td>{{ s.estado==='FINALIZADO'?'Realizado':'Programado / en proceso' }}</td>
                <td class="numeric">{{ fmt(s.valor) }}</td><td class="numeric">{{ fmt(s.abonado) }}</td><td class="numeric">{{ fmt(s.saldo) }}</td></tr>
              </tbody></table></template>
            <template #cards><div v-for="s in account.servicios" :key="s.id" class="finance-mobile-record"><RouterLink :to="'/servicios/'+s.id">{{ s.solicitud }}</RouterLink>
              <small>{{ s.sedeNombre }} · {{ date(s.fecha) }}</small><span>Pendiente {{ fmt(s.saldo) }}</span></div></template>
          </ResponsiveTable>
          <p v-if="!account.servicios.length" class="finance-muted">Este cliente aún no tiene servicios facturables.</p>
        </section>
      </template>
      <template v-else-if="active==='caja'">
        <section class="finance-card">
          <h2>Caja de técnicos</h2><p class="finance-muted">Saldo acumulado, incluso si proviene de días anteriores.</p>
          <ResponsiveTable><template #table><table><thead><tr><th>Técnico</th><th class="numeric">Efectivo recibido</th><th class="numeric">Entregado</th><th class="numeric">Por entregar</th><th>Acción</th></tr></thead>
            <tbody><tr v-for="t in technicians" :key="t.id"><td><button class="finance-link" @click="technicianId=t.id">{{ t.nombre }}</button></td><td class="numeric">{{ fmt(t.recaudado) }}</td>
              <td class="numeric">{{ fmt(t.entregado) }}</td><td class="numeric"><strong>{{ fmt(t.saldo) }}</strong></td><td><BaseButton size="compact" variant="secondary" :disabled="t.saldo<=0" @click="openCash(t)">Recibir dinero</BaseButton></td>
            </tr></tbody></table></template>
            <template #cards><article v-for="t in technicians" :key="t.id" class="finance-mobile-record"><button class="finance-link" @click="technicianId=t.id">{{ t.nombre }}</button>
              <small>Recibido {{ fmt(t.recaudado) }} · Entregado {{ fmt(t.entregado) }}</small><span>{{ fmt(t.saldo) }} por entregar</span>
              <BaseButton size="compact" variant="secondary" :disabled="t.saldo<=0" @click="openCash(t)">Recibir dinero</BaseButton></article></template>
          </ResponsiveTable>
        </section>
        <section v-if="selectedTech" class="finance-card finance-details"><header class="finance-section-head"><div><h2>Movimientos de {{ selectedTech.nombre }}</h2><p>Efectivo confirmado y entregas registradas.</p></div></header>
          <div v-for="p in visibleReceipts" :key="p.id" class="finance-entry"><span>{{ p.aplicaciones.map(a=>a.solicitud).join(', ') }} · {{ date(p.fechaPago) }}</span><strong>+{{ fmt(p.monto) }}</strong></div>
          <div v-for="m in visibleDeliveries" :key="m.id" class="finance-entry"><span>{{ date(m.fechaHora) }} · Entrega {{ m.anuladoAt?'anulada':'' }}<small v-if="m.observacion">{{ m.observacion }}</small></span>
            <div class="finance-actions"><strong>{{ m.anuladoAt?'0': '-'+fmt(m.monto) }}</strong><BaseButton v-if="!m.anuladoAt" size="compact" variant="ghost" @click="openReview('entrega',m.id,'ENTREGA_ANULADA')">Anular</BaseButton></div></div>
          <p v-if="!visibleReceipts.length&&!visibleDeliveries.length" class="finance-muted">Sin movimientos registrados.</p>
        </section>
      </template>
      <template v-else>
        <section class="finance-card"><header class="finance-section-head"><div><h2>Pagos por revisar</h2><p>El efectivo reportado no aumenta la caja hasta que administración lo confirme.</p></div></header>
          <div v-for="p in snapshot.pagosRevision" :key="p.id" class="finance-entry">
            <div><strong>{{ p.clienteNombre }} · {{ fmt(p.monto) }}</strong><small>{{ p.aplicaciones.map(a=>a.solicitud).join(', ') }} · {{ p.metodo==='EFECTIVO'?'Efectivo':'Transferencia' }} · {{ p.registradoPorNombre }}</small>
              <small v-if="p.observacion">{{ p.observacion }}</small></div>
            <div class="finance-actions"><BaseButton v-if="p.comprobanteDisponible" variant="ghost" size="compact" @click="proof(p)">Ver comprobante</BaseButton>
              <BaseButton size="compact" variant="secondary" @click="openReview('pago',p.id,'RECHAZADO')">Rechazar</BaseButton>
              <BaseButton size="compact" @click="openReview('pago',p.id,'CONFIRMADO')">Confirmar</BaseButton></div>
          </div>
          <EmptyState v-if="!snapshot.pagosRevision.length" title="Sin pagos pendientes" message="Los cobros reportados por técnicos aparecerán aquí."/>
        </section>
        <section class="finance-card"><h2>Historial de cobros</h2>
          <div v-for="p in snapshot.movimientos" :key="p.id" class="finance-entry">
            <div><strong>{{ p.clienteNombre }} · {{ fmt(p.monto) }}</strong><small>{{ date(p.fechaPago) }} · {{ p.metodo }} · {{ p.aplicaciones.map(a=>a.solicitud).join(', ') }}</small></div>
            <div class="finance-actions"><StatusBadge :tone="p.estado==='CONFIRMADO'?'success':p.estado==='PENDIENTE'?'warning':'neutral'">{{ p.estado }}</StatusBadge>
              <BaseButton v-if="p.estado==='CONFIRMADO'" size="compact" variant="ghost" @click="openReview('pago',p.id,'ANULADO')">Anular</BaseButton></div>
          </div>
        </section>
      </template>
    </template>

    <BaseDialog :model-value="paymentOpen" title="Registrar abono" description="Un pago puede cubrir varios servicios del mismo cliente." size="wide" @update:model-value="!busy&&(paymentOpen=$event)">
      <template v-if="account">
        <div class="finance-form-row"><BaseSelect v-model="paymentMethod" name="pay-method" label="Método de pago" required><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option></BaseSelect>
          <BaseSelect v-if="paymentMethod==='EFECTIVO'" v-model="receiver" name="pay-receiver" label="Recibió el efectivo" required>
            <option value="">Seleccionar</option><option :value="auth.profile?.id??''">Caja central (administración)</option>
            <option v-for="t in technicians.filter(t=>t.id!==auth.profile?.id)" :key="t.id" :value="t.id">{{ t.nombre }}</option>
          </BaseSelect></div>
        <div class="finance-allocations"><h3>Aplicar a servicios</h3><div v-for="s in account.servicios.filter(s=>s.saldo>0)" :key="s.id" class="finance-amount-row">
          <div><strong>{{ s.solicitud }}</strong><small>{{ s.sedeNombre }} · Pendiente {{ fmt(s.saldo) }}</small></div>
          <BaseInput :model-value="values[s.id] ?? ''" @update:model-value="values[s.id]=$event" :name="'pay-'+s.id" label="Abono (COP)" type="number" min="0" :max="String(s.saldo)" step="1"/>
        </div></div>
        <BaseTextarea v-model="paymentNote" name="payment-note" label="Observación (opcional)" :rows="2" maxlength="1000"/>
        <p class="finance-total">Total a registrar <strong>{{ fmt(totalPayment) }}</strong></p>
      </template>
      <template #footer><BaseButton variant="secondary" :disabled="busy" @click="paymentOpen=false">Cancelar</BaseButton><BaseButton :loading="busy" :disabled="!validPayment" @click="savePayment">Confirmar pago</BaseButton></template>
    </BaseDialog>

    <BaseDialog :model-value="cashOpen" title="Recibir dinero del técnico" @update:model-value="!busy&&(cashOpen=$event)">
      <p v-if="selectedTech" class="finance-muted">{{ selectedTech.nombre }} · Disponible {{ fmt(selectedTech.saldo) }}</p>
      <BaseInput v-model="deliveryAmount" name="cash-amount" label="Efectivo recibido (COP)" type="number" min="1" :max="String(selectedTech?.saldo??0)" step="1" required/>
      <BaseTextarea v-model="deliveryNote" name="cash-note" label="Observación (opcional)" :rows="2" maxlength="1000"/>
      <template #footer><BaseButton variant="secondary" :disabled="busy" @click="cashOpen=false">Cancelar</BaseButton><BaseButton :loading="busy"
        :disabled="!Number.isSafeInteger(Number(deliveryAmount))||Number(deliveryAmount)<=0||Number(deliveryAmount)>(selectedTech?.saldo??0)" @click="saveCash">Registrar entrega</BaseButton></template>
    </BaseDialog>

    <BaseDialog :model-value="termsOpen" title="Condiciones de cobro" @update:model-value="!busy&&(termsOpen=$event)">
      <p class="finance-muted">La modalidad de crédito acumula los servicios realizados. No genera mensualidades automáticas.</p>
      <BaseSelect v-model="termsMode" name="terms-mode" label="Modalidad"><option value="POR_SERVICIO">Por servicio</option><option value="CREDITO">Crédito / pago periódico</option></BaseSelect>
      <BaseInput v-model="termsDays" name="terms-days" label="Plazo de pago (días)" type="number" min="0" max="365" step="1"/>
      <template #footer><BaseButton variant="secondary" :disabled="busy" @click="termsOpen=false">Cancelar</BaseButton><BaseButton :loading="busy" :disabled="!Number.isInteger(Number(termsDays))||Number(termsDays)<0||Number(termsDays)>365" @click="saveTerms">Guardar</BaseButton></template>
    </BaseDialog>

    <BaseDialog :model-value="Boolean(reviewTarget)" :title="reviewTarget?.action==='CONFIRMADO'?'Confirmar cobro':'Corregir movimiento'"
      @update:model-value="!busy&&(reviewTarget=null)">
      <p class="finance-muted">{{ reviewTarget?.action==='CONFIRMADO'?'Verifica que recibiste el efectivo o que el dinero de la transferencia llegó al banco.':'El registro original se conserva en el historial y quedará auditado.' }}</p>
      <BaseTextarea v-model="reviewReason" name="review-reason" label="Motivo u observación"
        :required="reviewTarget?.action!=='CONFIRMADO'" :rows="3" maxlength="1000"/>
      <template #footer><BaseButton variant="secondary" :disabled="busy" @click="reviewTarget=null">Cancelar</BaseButton>
        <BaseButton :variant="reviewTarget?.action==='CONFIRMADO'?'primary':'danger'" :loading="busy"
          :disabled="reviewTarget?.action!=='CONFIRMADO'&&!reviewReason.trim()" @click="saveReview">Confirmar</BaseButton></template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.finance-page{display:grid;gap:.85rem;min-width:0}
.finance-head,.finance-section-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.65rem}
h1{font-size:1.35rem;line-height:1.7rem;font-weight:650;margin:0}h2{font-size:1rem;margin:0}h3{font-size:.88rem;margin:0}
.finance-head p,.finance-section-head p,.finance-muted,.finance-toolbar p{color:var(--text-secondary);font-size:.78rem;margin:.2rem 0 0}
.finance-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem}
.finance-kpis article,.finance-card{min-width:0;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface);padding:.85rem}
.finance-kpis article{display:grid;gap:.4rem}
.finance-kpis span,.finance-kpis small{color:var(--text-secondary);font-size:.75rem}
.finance-kpis strong{font-size:1.25rem;font-variant-numeric:tabular-nums;font-weight:650}
.finance-tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--border)}
.finance-tabs button{min-height:38px;background:transparent;border:0;border-bottom:2px solid transparent;padding:.4rem .75rem;color:var(--text-secondary);cursor:pointer}
.finance-tabs button[aria-current]{border-color:var(--accent);color:var(--text);font-weight:600}
.finance-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:1rem}.finance-toolbar>*:first-child{min-width:220px}.finance-toolbar p{padding-bottom:.6rem}
.finance-card{display:grid;gap:.65rem}.finance-details{margin-top:.2rem}
table{width:100%;border-collapse:collapse;text-align:left;font-size:.8rem}
th,td{border-bottom:1px solid var(--border);padding:.58rem .5rem;vertical-align:middle}
th{font-size:.71rem;color:var(--text-secondary);font-weight:550}
tr:last-child td{border-bottom:0}tr.selected{background:var(--hover)}
.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.finance-link{border:0;background:transparent;padding:0;color:var(--text);text-decoration:none;cursor:pointer;font:inherit;font-weight:600;text-align:left}
.finance-link:hover{text-decoration:underline;text-underline-offset:3px}
.finance-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;justify-content:flex-end}
.finance-entry{display:flex;align-items:center;justify-content:space-between;gap:.7rem;padding:.65rem 0;border-bottom:1px solid var(--border);font-size:.8rem}
.finance-entry:last-child{border-bottom:0}.finance-entry small,.finance-amount-row small{display:block;color:var(--text-secondary);font-size:.72rem;margin-top:.25rem}
.finance-form-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
.finance-allocations{display:grid;gap:.55rem;margin:.8rem 0;max-height:42vh;overflow-y:auto}
.finance-amount-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,190px);align-items:center;gap:.65rem;border-bottom:1px solid var(--border);padding:.35rem 0}
.finance-amount-row strong{font-size:.85rem}.finance-total{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-top:1px solid var(--border);font-size:.9rem}
.finance-mobile-record{display:grid;gap:.3rem;text-align:left;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);padding:.75rem;font-size:.85rem}
.finance-mobile-record small{color:var(--text-secondary);font-size:.75rem}.finance-mobile-record span{font-weight:600}
@media(max-width:720px){.finance-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.finance-kpis article:last-child{grid-column:span 2}.finance-form-row,.finance-amount-row{grid-template-columns:1fr}.finance-entry{align-items:flex-start;flex-direction:column}.finance-actions{justify-content:flex-start}.finance-toolbar>*:first-child{width:100%}}
</style>
