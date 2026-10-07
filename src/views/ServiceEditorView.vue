<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
import LoadingSkeleton from '@/components/base/LoadingSkeleton.vue'
import StatusPanel from '@/components/base/StatusPanel.vue'
import ServicePage from '@/components/domain/services/ServicePage.vue'
import ServiceForm from '@/components/domain/services/ServiceForm.vue'
import ServiceSaveFeedback from '@/components/domain/services/ServiceSaveFeedback.vue'
import { useServiceMutation } from '@/composables/useServiceMutation'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { useAdminServicesStore } from '@/stores/adminServices'
import { createAdminService, updateAdminService } from '@/services/adminServicesService'
import { draftToServiceInput, emptyServiceDraft, isServiceId, scheduleFromDraft, scheduleToDraft, serviceToDraft, suggestReinforcement, toBogotaInput, validateServiceInput } from '@/helpers/adminServices'
import type { AdminService, ServiceEditorDraft, UpcomingService } from '@/types/adminServices'

const route=useRoute(), router=useRouter(), store=useAdminServicesStore()
const editing=computed(()=>route.name==='admin-service-edit')
const record=ref<AdminService | null>(null), upcoming=ref<UpcomingService | null>(null)
const draft=ref<ServiceEditorDraft>(emptyServiceDraft()), baseline=ref(''), confirmed=ref(false)
const loading=ref(true), loadError=ref(''), completed=ref(false), reloadOpen=ref(false), renderVersion=ref(0)
const { saving,errors,errorMessage,conflict,overlapOpen,overlaps,run,invalid,reset,clearValidation,acceptOverlap,cancelOverlap }=useServiceMutation()
const serialize=()=>JSON.stringify({ draft:draft.value,confirmed:confirmed.value })
const dirty=computed(()=>!loading.value && !completed.value && Boolean(baseline.value) && serialize()!==baseline.value)
const { confirmOpen,cancelDiscard,confirmDiscard }=useUnsavedChanges(dirty,saving)
const title=computed(()=>editing.value ? 'Editar servicio' : upcoming.value ? 'Agendar próxima visita' : 'Programar servicio')
let generation=0
onBeforeUnmount(()=>{ generation++ })
watch(()=>`${route.name}:${String(route.params.id ?? '')}:${String(route.query.upcomingId ?? '')}`,()=>{ void load() },{ immediate:true })
function returnTo(): string { const value=route.query.returnTo; return typeof value==='string' && /^\/(?:servicios|agenda)(?:\?|$)/.test(value) ? value : '/servicios' }
function back(): void { void router.push(returnTo()) }
async function load(force=false): Promise<void> {
  const current=++generation
  loading.value=true; loadError.value=''; reloadOpen.value=false
  try {
    const workspace=await store.loadOptions(force)
    const id=String(route.params.id ?? ''), upcomingId=String(route.query.upcomingId ?? '')
    const [service,proposal]=await Promise.all([
      editing.value ? store.ensureService(id,force) : Promise.resolve(null),
      upcomingId && isServiceId(upcomingId) ? store.ensureUpcoming(upcomingId,force) : Promise.resolve(null),
    ])
    if(current!==generation) return
    if(service && service.estado!=='PROGRAMADO') throw new Error('Solo puedes editar servicios Programados. Consulta el detalle para ver su ejecución o registrar el pago.')
    if(proposal?.servicioAgendadoId) throw new Error('Esta próxima visita ya fue agendada. Vuelve a la lista para consultar el servicio creado.')
    if(proposal?.estado==='NO_DESEA') throw new Error('Esta propuesta está marcada como No desea. Actualiza primero su seguimiento.')
    record.value=service; upcoming.value=proposal
    const siteId=proposal?.sedeId ?? (typeof route.query.sedeId==='string' ? route.query.sedeId : '')
    const site=workspace.sedes.find(item=>item.id===siteId)
    draft.value=service ? serviceToDraft(service) : emptyServiceDraft(site)
    if(proposal) {
      draft.value.programacion.inicioProgramado=toBogotaInput(proposal.fechaSugerida)
      if(site?.manejaRefuerzo) draft.value.refuerzo=scheduleToDraft(suggestReinforcement(scheduleFromDraft(draft.value.programacion)))
    }
    confirmed.value=proposal?.estado==='CONFIRMADO'
    completed.value=false; baseline.value=serialize(); renderVersion.value++; reset()
  } catch(failure) { if(current===generation) loadError.value=failure instanceof Error ? failure.message : 'No fue posible preparar el formulario.' }
  finally { if(current===generation) loading.value=false }
}
async function save(): Promise<void> {
  if(completed.value || saving.value || loading.value) return
  const parsed=validateServiceInput(draftToServiceInput(draft.value))
  if(upcoming.value && !confirmed.value) parsed.errors.confirmed='Confirma que el cliente aceptó este horario.'
  if(Object.keys(parsed.errors).length) { await invalid(parsed.errors); return }
  await run((requestId,allowConflicts)=>record.value
    ? updateAdminService(record.value,requestId,parsed.value,allowConflicts)
    : createAdminService(requestId,parsed.value,allowConflicts,upcoming.value ? { id:upcoming.value.id,version:upcoming.value.version,confirmed:confirmed.value } : undefined),
  async result=>{
    store.applyMutation(result,!record.value)
    completed.value=true; baseline.value=serialize()
    await router.push(returnTo())
  },record.value ? 'Servicio actualizado. Calendar se sincronizará en segundo plano.' : 'Servicio creado. Calendar se sincronizará en segundo plano.')
}
</script>
<template>
  <ServicePage :title="title" :caption="record?.solicitud">
    <template #actions><BaseButton size="compact" variant="secondary" :disabled="saving" @click="back">Volver</BaseButton><BaseButton v-if="!loading && !loadError" size="compact" type="submit" form="admin-service-form" :loading="saving" :disabled="conflict || completed">{{ record ? 'Guardar cambios' : 'Agendar servicio' }}</BaseButton></template>
    <LoadingSkeleton v-if="loading" :rows="8" />
    <StatusPanel v-else-if="loadError" title="No fue posible preparar el servicio" :message="loadError" tone="danger"><BaseButton size="compact" variant="secondary" @click="load(true)">Reintentar</BaseButton></StatusPanel>
    <template v-else-if="store.options">
      <ServiceSaveFeedback :error="errorMessage" :conflict="conflict" :overlaps="overlaps" :overlap-open="overlapOpen" :saving="saving" @reload="reloadOpen=true" @accept="acceptOverlap" @cancel="cancelOverlap" />
      <div v-if="upcoming" class="svc-notice"><BaseCheckbox v-model="confirmed" name="service-client-confirmed" label="El cliente confirmó la fecha y la hora de esta visita" required :disabled="saving || completed" :error="errors.confirmed" /></div>
      <ServiceForm :key="renderVersion" v-model="draft" :workspace="store.options" :record="record" :disabled="saving || completed" :errors="errors" @submit="save" @changed="clearValidation" />
      <div class="svc-dialog-actions"><BaseButton size="compact" variant="secondary" :disabled="saving" @click="back">Volver</BaseButton><BaseButton type="submit" form="admin-service-form" size="compact" :loading="saving" :disabled="conflict || completed">{{ record ? 'Guardar cambios' : 'Agendar servicio' }}</BaseButton></div>
    </template>
    <ConfirmDialog :open="confirmOpen" title="Salir sin guardar" message="Los cambios de programación no se guardarán." confirm-label="Salir" danger @confirm="confirmDiscard" @cancel="cancelDiscard" />
    <ConfirmDialog :open="reloadOpen" title="Revisar versión actual" message="Se reemplazará el borrador por los datos guardados. Los cambios de otra persona no se sobrescribirán." confirm-label="Cargar versión actual" @confirm="load(true)" @cancel="reloadOpen=false" />
  </ServicePage>
</template>
