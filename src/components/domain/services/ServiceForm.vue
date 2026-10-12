<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseSearchSelect from '@/components/base/BaseSearchSelect.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import { useAuthStore } from '@/stores/auth'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import ServiceScheduleFields from './ServiceScheduleFields.vue'
import ServiceProductsFields from './ServiceProductsFields.vue'
import { draftToServiceInput, formatServiceDate, formatServiceMoney, scheduleFromDraft, scheduleToDraft, suggestReinforcement, validateServiceInput } from '@/helpers/adminServices'
import type { AdminService, ServiceEditorDraft, ServiceErrors, ServiceScheduleDraft, ServiceWorkspace } from '@/types/adminServices'

const props=withDefaults(defineProps<{ modelValue: ServiceEditorDraft; workspace: ServiceWorkspace; record?: AdminService | null; disabled?: boolean; errors?: ServiceErrors; formId?: string }>(),{ record:null,disabled:false,errors:()=>({}),formId:'admin-service-form' })
const auth=useAuthStore()
const emit=defineEmits<{ 'update:modelValue': [value: ServiceEditorDraft]; submit: []; changed: [] }>()
const touched=ref(new Set<string>()), automaticRefuerzo=ref(!props.record && (!props.modelValue.refuerzo || JSON.stringify(props.modelValue.refuerzo)===JSON.stringify(scheduleToDraft(suggestReinforcement(scheduleFromDraft(props.modelValue.programacion))))))
const selectedSite=computed(()=>props.workspace.sedes.find(site=>site.id===props.modelValue.sedeId))
const clientId=ref(selectedSite.value?.clientId ?? props.record?.clientId ?? '')
watch(() => props.modelValue.sedeId,id => {
  if(id) clientId.value=props.workspace.sedes.find(item=>item.id===id)?.clientId ?? props.record?.clientId ?? ''
})
const clients=computed(()=>{
  const byId=new Map<string,{id:string;label:string}>()
  for(const site of props.workspace.sedes)if(!byId.has(site.clientId))byId.set(site.clientId,{id:site.clientId,label:site.clienteNombre})
  if(props.record&&!byId.has(props.record.clientId))byId.set(props.record.clientId,{id:props.record.clientId,label:props.record.clienteNombre})
  return [...byId.values()].sort((a,b)=>a.label.localeCompare(b.label,'es'))
})
const clientSites=computed(()=>props.workspace.sedes.filter(site=>site.clientId===clientId.value && site.tipoSede!=='RESIDENCIAL'))
const residential=computed(()=>selectedSite.value?.tipoSede==='RESIDENCIAL' || props.record?.tipoSede==='RESIDENCIAL')
const cashReceivers=computed(()=>{
  const users=props.workspace.tecnicos.map(person=>({id:person.id,label:person.nombreCompleto}))
  const admin=auth.profile
  if(admin?.esAdmin&&!users.some(person=>person.id===admin.id))users.unshift({id:admin.id,label:'Yo · '+admin.nombreCompleto+' · Administrador'})
  return users
})
const reinforcement=computed(()=>props.record?.tipoServicio==='REFUERZO')
const confirmedPayment=computed(()=>props.record?.pago.estadoPago==='CONFIRMADO')
const amount=computed(()=>{
  if(props.record) return props.record.valorServicio
  if(residential.value) {
    const value=Number(props.modelValue.valorServicio)
    return props.modelValue.valorServicio?.trim() && Number.isSafeInteger(value) && value>=0 ? value : 0
  }
  return selectedSite.value?.valorServicio ?? 0
})
const technicians=computed(()=>{
  const map=new Map(props.workspace.tecnicos.map(person=>[person.id,person]))
  for(const person of props.record ? [props.record.responsable,...props.record.colaboradores] : []) if(!map.has(person.id)) map.set(person.id,person)
  return [...map.values()]
})
const localErrors=computed(()=>validateServiceInput(draftToServiceInput(props.modelValue),!props.record,new Date(),residential.value).errors)
const visibleErrors=computed(()=>({ ...Object.fromEntries(Object.entries(localErrors.value).filter(([key])=>touched.value.has(key))),...props.errors }))
function touch(key: string): void { touched.value.add(key) }
function patch(value: Partial<ServiceEditorDraft>): void { emit('update:modelValue',{ ...props.modelValue,...value }); emit('changed') }
function changeClient(id:string):void {
  if(id===clientId.value)return
  clientId.value=id
  const residentialSite=props.workspace.sedes.find(site=>site.clientId===id && site.tipoSede==='RESIDENCIAL')
  changeSite(residentialSite?.id ?? '')
}
function changePaymentState(paid:boolean):void {
  patch({cobro:{...props.modelValue.cobro,pagado:paid,tecnicoRecaudoPrevistoId:paid ? null : props.modelValue.cobro.tecnicoRecaudoPrevistoId,recaudadoPorId:null}})
  touch('cobro.pagado')
}
function changePaymentMethod(method:'EFECTIVO'|'TRANSFERENCIA'|null):void {
  patch({cobro:{...props.modelValue.cobro,metodoPago:method,tecnicoRecaudoPrevistoId:method==='EFECTIVO'&&!props.modelValue.cobro.pagado ? props.modelValue.cobro.tecnicoRecaudoPrevistoId : null,recaudadoPorId:method==='EFECTIVO'&&props.modelValue.cobro.pagado ? props.modelValue.cobro.recaudadoPorId ?? null : null}})
  touch('cobro.metodoPago')
}
function changeSite(id: string): void {
  const site=props.workspace.sedes.find(item=>item.id===id)
  const programacion={ ...props.modelValue.programacion,duracionMinutos:String(site?.duracionServicioMinutos ?? 90) }
  automaticRefuerzo.value=true
  patch({ sedeId:id,valorServicio:'',programacion,refuerzo:site?.manejaRefuerzo ? scheduleToDraft(suggestReinforcement(scheduleFromDraft(programacion))) : null })
  touch('sedeId')
}
function changeSchedule(programacion: ServiceScheduleDraft): void {
  patch({ programacion,...automaticRefuerzo.value && props.modelValue.refuerzo ? { refuerzo:scheduleToDraft(suggestReinforcement(scheduleFromDraft(programacion))) } : {} })
}
function changeRefuerzo(refuerzo: ServiceScheduleDraft): void { automaticRefuerzo.value=false; patch({ refuerzo }) }
function resetRefuerzo(): void { automaticRefuerzo.value=true; patch({ refuerzo:scheduleToDraft(suggestReinforcement(scheduleFromDraft(props.modelValue.programacion))) }) }
const responsibleName=computed(()=>technicians.value.find(person=>person.id===props.modelValue.programacion.tecnicoResponsableId)?.nombreCompleto ?? 'Sin asignar')
</script>
<template>
  <form :id="formId" class="svc-editor-layout" novalidate @submit.prevent="emit('submit')">
    <div class="svc-form-main">
      <section class="svc-card">
        <h2>{{ reinforcement ? 'Refuerzo' : 'Servicio Principal' }}</h2>
        <div class="svc-form-grid">
          <BaseSearchSelect :model-value="clientId" :options="clients" name="servicio-cliente"
            label="Cliente" placeholder="Buscar cliente…" required :disabled="disabled || Boolean(record)"
            :error="!clientId ? visibleErrors.sedeId : undefined" @update:model-value="changeClient" />
          <BaseSelect v-if="!residential" :model-value="modelValue.sedeId" name="servicio-sede" label="Sede" required
            :disabled="disabled || Boolean(record) || !clientId" :error="visibleErrors.sedeId"
            @update:model-value="changeSite">
            <option value="">Selecciona una sede</option>
            <option v-if="record && !selectedSite" :value="record.sedeId">{{ record.sedeNombre }}</option>
            <option v-for="site in clientSites" :key="site.id" :value="site.id">{{ site.nombre }}</option>
          </BaseSelect>
        </div>
        <p v-if="reinforcement && record?.principal" class="svc-muted svc-small">Vinculado a {{ record.principal.solicitud }} · Sin cobro</p>
        <p v-else-if="selectedSite" class="svc-muted svc-small">{{ residential ? 'Dirección de la visita: ' : '' }}{{ selectedSite.direccion }}</p>
        <div v-if="residential" class="svc-form-grid"><BaseInput :model-value="modelValue.valorServicio ?? ''" name="servicio-valor" label="Valor del servicio (COP)" type="number" min="0" step="1" required :disabled="disabled || Boolean(record)" :error="visibleErrors.valorServicio" @update:model-value="patch({ valorServicio:$event })" @blur="touch('valorServicio')" /></div>
        <ServiceScheduleFields :future-only="!record" :model-value="modelValue.programacion" :technicians="technicians" :disabled="disabled" :errors="visibleErrors" @update:model-value="changeSchedule" @blur="touch" />
      </section>
      <section v-if="modelValue.refuerzo" class="svc-card">
        <div class="svc-card-header"><h2>Refuerzo · {{ formatServiceMoney(0) }}</h2><BaseButton v-if="!automaticRefuerzo" size="compact" variant="secondary" :disabled="disabled" @click="resetRefuerzo">Sugerir +21 días</BaseButton></div>
        <p class="svc-muted svc-small">La propuesta inicial es a 3 semanas. Puedes cambiar la fecha, la hora y el equipo.</p>
        <ServiceScheduleFields :future-only="!record" :model-value="modelValue.refuerzo" prefix="refuerzo" :technicians="technicians" :disabled="disabled" :errors="visibleErrors" @update:model-value="changeRefuerzo" @blur="touch" />
      </section>
      <section class="svc-card">
        <h2>Productos previstos</h2>
        <ServiceProductsFields :model-value="modelValue.productos" :products="workspace.productos" :previous="record?.productos" :disabled="disabled" :errors="visibleErrors" :service-date="modelValue.programacion.inicioProgramado.slice(0,10)" @update:model-value="patch({ productos:$event })" @blur="touch" />
      </section>
      <section v-if="!reinforcement" class="svc-card">
        <h2>Pago del servicio</h2>
        <div class="svc-form-grid">
          <BaseSelect v-if="!record" :model-value="modelValue.cobro.pagado ? 'SI' : 'NO'" name="servicio-ya-pago"
            label="¿El cliente ya pagó?" :disabled="disabled" :error="visibleErrors['cobro.pagado']"
            @update:model-value="changePaymentState($event==='SI')">
            <option value="NO">No, cobro pendiente</option><option value="SI">Sí, ya pagó</option>
          </BaseSelect>
          <BaseSelect :model-value="modelValue.cobro.metodoPago ?? ''" name="servicio-metodo"
            label="Método de pago" :required="Boolean(modelValue.cobro.pagado)" :disabled="disabled || confirmedPayment"
            :error="visibleErrors['cobro.metodoPago']"
            @update:model-value="changePaymentMethod($event==='EFECTIVO'||$event==='TRANSFERENCIA' ? $event : null)">
            <option value="">{{ modelValue.cobro.pagado ? 'Selecciona un método' : 'Definir después' }}</option>
            <option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option>
          </BaseSelect>
          <BaseSelect v-if="modelValue.cobro.metodoPago==='EFECTIVO' && modelValue.cobro.pagado"
            :model-value="modelValue.cobro.recaudadoPorId ?? ''" name="servicio-recibio" label="Quién recibió el efectivo"
            required :disabled="disabled || confirmedPayment" :error="visibleErrors['cobro.recaudadoPorId']"
            @update:model-value="patch({cobro:{...modelValue.cobro,recaudadoPorId:$event || null}});touch('cobro.recaudadoPorId')">
            <option value="">Selecciona quién recibió el efectivo</option>
            <option v-for="person in cashReceivers" :key="person.id" :value="person.id">{{ person.label }}</option>
          </BaseSelect>
          <BaseSelect v-else-if="modelValue.cobro.metodoPago==='EFECTIVO' && !modelValue.cobro.pagado"
            :model-value="modelValue.cobro.tecnicoRecaudoPrevistoId ?? ''" name="servicio-recauda"
            label="Recauda en la visita" :disabled="disabled || confirmedPayment"
            :error="visibleErrors['cobro.tecnicoRecaudoPrevistoId']"
            @update:model-value="patch({cobro:{...modelValue.cobro,tecnicoRecaudoPrevistoId:$event || null}})">
            <option value="">Por definir</option>
            <option v-for="person in technicians" :key="person.id" :value="person.id">{{ person.nombreCompleto }}</option>
          </BaseSelect>
        </div>
        <p class="svc-muted svc-small">{{ confirmedPayment ? 'El pago está confirmado. Las correcciones se hacen desde el registro de pago.' : modelValue.cobro.pagado ? 'El pago se registrará como confirmado al agendar el servicio.' : 'Esta información prepara el cobro; no confirma que el dinero haya sido recibido.' }}</p>
      </section>
      <section class="svc-card"><BaseTextarea :model-value="modelValue.observaciones" name="servicio-observaciones" label="Observaciones para la visita" :rows="3" maxlength="5000" :disabled="disabled" :error="visibleErrors.observaciones" @update:model-value="patch({ observaciones:$event })" @blur="touch('observaciones')" /></section>
    </div>
    <aside class="svc-summary" aria-label="Resumen de programación">
      <section class="svc-card">
        <h2>Resumen</h2>
        <dl>
          <div><dt>{{ residential ? 'Cliente y dirección' : 'Cliente y sede' }}</dt><dd>{{ selectedSite ? residential ? `${selectedSite.clienteNombre} · ${selectedSite.direccion}` : `${selectedSite.clienteNombre} · ${selectedSite.nombre}` : record ? residential ? `${record.clienteNombre} · ${record.direccion}` : `${record.clienteNombre} · ${record.sedeNombre}` : 'Sin seleccionar' }}</dd></div>
          <div><dt>{{ reinforcement ? 'Refuerzo' : 'Principal' }}</dt><dd>{{ formatServiceDate(scheduleFromDraft(modelValue.programacion).inicioProgramado) }} · {{ formatServiceDate(scheduleFromDraft(modelValue.programacion).inicioProgramado,true) }}</dd></div>
          <div><dt>Equipo</dt><dd>{{ responsibleName }}<small v-if="modelValue.programacion.tecnicosColaboradoresIds.length" class="svc-muted"> + {{ modelValue.programacion.tecnicosColaboradoresIds.length }} colaboradores</small></dd></div>
          <div v-if="modelValue.refuerzo"><dt>Refuerzo gratuito</dt><dd>{{ formatServiceDate(scheduleFromDraft(modelValue.refuerzo).inicioProgramado) }} · {{ formatServiceDate(scheduleFromDraft(modelValue.refuerzo).inicioProgramado,true) }}</dd></div>
          <div><dt>Valor del servicio</dt><dd><strong class="svc-amount">{{ formatServiceMoney(amount) }}</strong></dd></div>
        </dl>
      </section>
      <section class="svc-card"><h2>Calendar</h2><p class="svc-muted svc-small">Cada visita tendrá su propio evento. El responsable y los colaboradores recibirán la invitación.</p></section>
    </aside>
  </form>
</template>
