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
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { createAdminService, fetchServiceCommand, updateAdminService } from '@/services/adminServicesService'
import { clearAdminServiceDraft, loadAdminServiceDraft, saveAdminServiceDraft, type AdminServiceDraft } from '@/services/draftService'
import { draftToServiceInput, emptyServiceDraft, isServiceId, isZonedInstant, scheduleFromDraft, scheduleToDraft, serviceToDraft, suggestReinforcement, toBogotaInput, validateServiceInput } from '@/helpers/adminServices'
import type { AdminService, ServiceEditorDraft, UpcomingService } from '@/types/adminServices'

const route=useRoute(), router=useRouter(), store=useAdminServicesStore(), auth=useAuthStore(), notifications=useNotificationsStore()
const editing=computed(()=>route.name==='admin-service-edit')
const record=ref<AdminService | null>(null), upcoming=ref<UpcomingService | null>(null)
const draft=ref<ServiceEditorDraft>(emptyServiceDraft()), baseline=ref(''), confirmed=ref(false)
const loading=ref(true), loadError=ref(''), completed=ref(false), reloadOpen=ref(false), renderVersion=ref(0)
const draftStatus=ref(''), draftContext=ref('new')
const { operationId,saving,errors,errorMessage,conflict,overlapOpen,overlaps,run,invalid,reset,clearValidation,acceptOverlap,cancelOverlap }=useServiceMutation()
const serialize=()=>JSON.stringify({ draft:draft.value,confirmed:confirmed.value })
const dirty=computed(()=>!loading.value && !completed.value && Boolean(baseline.value) && serialize()!==baseline.value)
const { confirmOpen,cancelDiscard,confirmDiscard }=useUnsavedChanges(dirty,saving)
const title=computed(()=>editing.value ? 'Editar servicio' : upcoming.value ? 'Agendar próxima visita' : 'Programar servicio')
let generation=0, saveTimer: ReturnType<typeof setTimeout> | undefined, draftWrites: Promise<void>=Promise.resolve()
onBeforeUnmount(()=>{ generation++; if(saveTimer) clearTimeout(saveTimer) })
watch(()=>`${String(route.name)}:${String(route.params.id ?? '')}:${String(route.query.upcomingId ?? '')}`,()=>{ void load() },{ immediate:true })
watch([draft,confirmed,operationId],()=>{
  if(saveTimer) clearTimeout(saveTimer)
  if(loading.value || editing.value || completed.value || !auth.profile?.id || !dirty.value) return
  saveTimer=setTimeout(()=>{ void persistDraft() },500)
},{ deep:true })
function returnTo(): string {
  const value=route.query.returnTo
  return typeof value==='string' && /^\/(?:servicios(?:\/[0-9a-f-]{36})?|agenda)(?:\?|$)/i.test(value) ? value : '/servicios'
}
function back(): void { void router.push(returnTo()) }
async function persistDraft(): Promise<void> {
  if(editing.value || completed.value || !auth.profile?.id) return
  const stamp=generation
  const payload: AdminServiceDraft={ schemaVersion:1,actorId:auth.profile.id,context:draftContext.value,requestId:operationId.value,
    draft:JSON.parse(JSON.stringify(draft.value)) as ServiceEditorDraft,confirmed:confirmed.value,proposalVersion:upcoming.value?.version ?? null,updatedAt:new Date().toISOString() }
  draftWrites=draftWrites.catch(()=>undefined).then(()=>saveAdminServiceDraft(payload))
  try { await draftWrites; if(stamp===generation) draftStatus.value='Borrador guardado en este dispositivo' }
  catch { if(stamp===generation) draftStatus.value='No se pudo guardar el borrador local; mantén esta página abierta.' }
}
async function clearDraft(actorId: string, context: string): Promise<void> {
  if(saveTimer) clearTimeout(saveTimer)
  await draftWrites.catch(()=>undefined)
  await clearAdminServiceDraft(actorId,context)
}
async function load(force=false): Promise<void> {
  const current=++generation
  if(saveTimer) clearTimeout(saveTimer)
  loading.value=true; loadError.value=''; reloadOpen.value=false; draftStatus.value=''
  try {
    const workspace=await store.loadOptions(force)
    const id=String(route.params.id ?? ''), upcomingId=String(route.query.upcomingId ?? ''), actorId=auth.profile?.id
    if(upcomingId && !isServiceId(upcomingId)) throw new Error('La próxima visita no es válida.')
    draftContext.value=upcomingId || 'new'
    let local: AdminServiceDraft | null=null
    if(!editing.value && actorId) {
      try { local=await loadAdminServiceDraft(actorId,draftContext.value) }
      catch { draftStatus.value='El guardado local no está disponible en este navegador.' }
      if(local) {
        const saved=await fetchServiceCommand(local.requestId)
        if(current!==generation) return
        if(saved.result) {
          store.applyMutation(saved.result,true); completed.value=true
          await clearDraft(actorId,draftContext.value)
          const principal=saved.result.services.find(service=>service.tipoServicio==='PRINCIPAL')
          notifications.show('Esta operación ya se había guardado. No se creó un duplicado.','info')
          await router.replace(principal ? { name:'service-detail',params:{ id:principal.id } } : returnTo())
          return
        }
      }
      if(force) { await clearDraft(actorId,draftContext.value); local=null }
    }
    const [service,proposal]=await Promise.all([
      editing.value ? store.ensureService(id,force) : Promise.resolve(null),
      upcomingId ? store.ensureUpcoming(upcomingId,force) : Promise.resolve(null),
    ])
    if(current!==generation) return
    if(service && service.estado!=='PROGRAMADO') throw new Error('Solo puedes editar servicios Programados. Consulta el detalle para ver su ejecución o registrar el pago.')
    if(proposal?.servicioAgendadoId) throw new Error('Esta próxima visita ya fue agendada. Vuelve a la lista para consultar el servicio creado.')
    if(proposal?.estado==='NO_DESEA') throw new Error('Esta propuesta está marcada como No desea. Actualiza primero su seguimiento.')
    record.value=service; upcoming.value=proposal
    const siteId=proposal?.sedeId ?? (typeof route.query.sedeId==='string' ? route.query.sedeId : '')
    const site=workspace.sedes.find(item=>item.id===siteId)
    draft.value=service ? serviceToDraft(service) : emptyServiceDraft(site)
    const slotStart=route.query.start
    if(!service && !proposal && typeof slotStart==='string' && isZonedInstant(slotStart) && new Date(slotStart).getTime()>Date.now()) {
      draft.value.programacion.inicioProgramado=toBogotaInput(slotStart)
      if(site?.manejaRefuerzo) draft.value.refuerzo=scheduleToDraft(suggestReinforcement(scheduleFromDraft(draft.value.programacion)))
    }
    if(proposal) {
      draft.value.programacion.inicioProgramado=toBogotaInput(proposal.fechaSugerida)
      if(site?.manejaRefuerzo) draft.value.refuerzo=scheduleToDraft(suggestReinforcement(scheduleFromDraft(draft.value.programacion)))
    }
    confirmed.value=proposal?.estado==='CONFIRMADO'
    completed.value=false; baseline.value=serialize(); reset()
    if(local && (!proposal || local.draft.sedeId===proposal.sedeId)) {
      draft.value=local.draft; operationId.value=local.requestId as typeof operationId.value
      confirmed.value=proposal ? local.proposalVersion===proposal.version && local.confirmed : false
      draftStatus.value='Borrador recuperado. Revisa los datos antes de agendar.'
    }
    renderVersion.value++
  } catch(failure) { if(current===generation) loadError.value=failure instanceof Error ? failure.message : 'No fue posible preparar el formulario.' }
  finally { if(current===generation) loading.value=false }
}
const parsedSchedule = scheduleFromDraft
async function save(): Promise<void> {
  if(completed.value || saving.value || loading.value) return
  const invalidDate=document.querySelector<HTMLElement>('#admin-service-form .date-time-control input[aria-invalid="true"]')
  if(invalidDate) { invalidDate.focus(); notifications.show('Revisa las fechas y horas antes de guardar.','error'); return }
  const isResidential=store.options?.sedes.some(site=>site.id===draft.value.sedeId && site.tipoSede==='RESIDENCIAL') || record.value?.tipoSede==='RESIDENCIAL'
  const parsed=validateServiceInput(draftToServiceInput(draft.value),!editing.value,new Date(),isResidential)
  if(upcoming.value && !confirmed.value) parsed.errors.confirmed='Confirma que el cliente aceptó este horario.'
  if(Object.keys(parsed.errors).length) { await invalid(parsed.errors); return }
  if(!editing.value) await persistDraft()
  const actorId=auth.profile?.id, context=draftContext.value
  await run((requestId,resolution)=>record.value
    ? updateAdminService(record.value,requestId,{
      ...parsed.value,programacion:resolution?.schedules[0] ?? parsed.value.programacion,
      refuerzo:parsed.value.refuerzo ? resolution?.schedules[1] ?? parsed.value.refuerzo : null,
    },resolution?.reassignments ?? [])
    : createAdminService(requestId,{
      ...parsed.value,programacion:resolution?.schedules[0] ?? parsed.value.programacion,
      refuerzo:parsed.value.refuerzo ? resolution?.schedules[1] ?? parsed.value.refuerzo : null,
    },resolution?.reassignments ?? [],upcoming.value ? { id:upcoming.value.id,version:upcoming.value.version,confirmed:confirmed.value } : undefined),
  async result=>{
    store.applyMutation(result,!record.value)
    completed.value=true; baseline.value=serialize()
    if(!editing.value && actorId) await clearDraft(actorId,context).catch(()=>{ notifications.show('El servicio está guardado. No se pudo limpiar el borrador local.','warning') })
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
      <ServiceSaveFeedback :error="errorMessage" :conflict="conflict" :overlaps="overlaps" :overlap-open="overlapOpen" :saving="saving" :technicians="store.options.tecnicos" :schedules="[parsedSchedule(draft.programacion),...(draft.refuerzo ? [parsedSchedule(draft.refuerzo)] : [])]" @reload="reloadOpen=true" @accept="acceptOverlap" @cancel="cancelOverlap" />
      <small v-if="draftStatus" class="svc-muted" role="status">{{ draftStatus }}</small>
      <div v-if="upcoming" class="svc-notice"><BaseCheckbox v-model="confirmed" name="service-client-confirmed" label="El cliente confirmó la fecha y la hora de esta visita" required :disabled="saving || completed" :error="errors.confirmed" /></div>
      <ServiceForm :key="renderVersion" v-model="draft" :workspace="store.options" :record="record" :disabled="saving || completed" :errors="errors" @submit="save" @changed="clearValidation" />
      <div class="svc-dialog-actions"><BaseButton size="compact" variant="secondary" :disabled="saving" @click="back">Volver</BaseButton><BaseButton type="submit" form="admin-service-form" size="compact" :loading="saving" :disabled="conflict || completed">{{ record ? 'Guardar cambios' : 'Agendar servicio' }}</BaseButton></div>
    </template>
    <ConfirmDialog :open="confirmOpen" title="Salir sin guardar" message="Los cambios no se guardarán como servicio." confirm-label="Salir" danger @confirm="confirmDiscard" @cancel="cancelDiscard" />
    <ConfirmDialog :open="reloadOpen" title="Revisar versión actual" message="Se reemplazará el borrador por los datos guardados. Los cambios de otra persona no se sobrescribirán." confirm-label="Cargar versión actual" @confirm="load(true)" @cancel="reloadOpen=false" />
  </ServicePage>
</template>
