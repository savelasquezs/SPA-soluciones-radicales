import { nextTick, onBeforeUnmount, ref } from 'vue'
import { ApiClientError } from '@/services/apiService'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import type { ScheduleConflict, ServiceErrors } from '@/types/adminServices'

export function useServiceMutation() {
  const auth=useAuthStore(), notifications=useNotificationsStore()
  const saving=ref(false), errors=ref<ServiceErrors>({}), errorMessage=ref(''), conflict=ref(false)
  const overlapOpen=ref(false), overlaps=ref<ScheduleConflict[]>([]), operationId=ref(crypto.randomUUID())
  let alive=true, retryWithOverlap: (()=>Promise<void>) | null=null
  const session=()=>`${auth.profile?.id ?? ''}:${auth.activeRole ?? ''}`
  onBeforeUnmount(()=>{ alive=false; retryWithOverlap=null })
  function clearValidation(): void { errors.value={}; if(!conflict.value) errorMessage.value='' }
  function reset(): void {
    operationId.value=crypto.randomUUID(); errors.value={}; errorMessage.value=''; conflict.value=false
    overlapOpen.value=false; overlaps.value=[]; retryWithOverlap=null
  }
  async function invalid(fields: ServiceErrors): Promise<void> {
    errors.value=fields
    notifications.show('Revisa los campos marcados.','error')
    await nextTick()
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }
  async function run<T>(work: (requestId: string, allowConflicts: boolean)=>Promise<T>, success: (result: T)=>void | Promise<void>, label: string, allowConflicts=false): Promise<void> {
    if(saving.value || conflict.value || !auth.isAdmin) return
    const stamp=session()
    saving.value=true; errorMessage.value=''; errors.value={}; overlapOpen.value=false
    let result: T
    try {
      result=await work(operationId.value,allowConflicts)
    } catch(failure) {
      if(!alive || stamp!==session()) return
      if(failure instanceof ApiClientError && failure.code==='SCHEDULE_CONFLICT') {
        overlaps.value=Array.isArray(failure.details?.conflicts) ? failure.details.conflicts as ScheduleConflict[] : []
        retryWithOverlap=()=>run(work,success,label,true); overlapOpen.value=true
        return
      }
      errorMessage.value=failure instanceof Error ? failure.message : 'No fue posible guardar. Tus datos se conservan.'
      if(failure instanceof ApiClientError) {
        conflict.value=['VERSION_CONFLICT','REQUEST_REUSED','FOLLOW_UP_RESOLVED'].includes(failure.code ?? '')
        const fields=failure.details?.fields
        if(fields && typeof fields==='object' && !Array.isArray(fields)) errors.value=Object.fromEntries(Object.entries(fields).filter(([,value])=>typeof value==='string')) as ServiceErrors
      }
      notifications.show(errorMessage.value,'error')
      await nextTick(); document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    } finally { if(alive && stamp===session()) saving.value=false }
    if(!alive || stamp!==session()) return
    // The write has committed. Release the navigation guard before calling the
    // UI callback; a navigation problem must never be reported as a failed save.
    reset()
    notifications.show(label,'success')
    try { await success(result) }
    catch { notifications.show('Los datos se guardaron, pero no se pudo actualizar la pantalla. Vuelve a consultar el registro antes de repetir la operación.','warning') }
  }
  async function acceptOverlap(): Promise<void> { const retry=retryWithOverlap; overlapOpen.value=false; if(retry) await retry() }
  function cancelOverlap(): void { overlapOpen.value=false; retryWithOverlap=null }
  return { operationId,saving,errors,errorMessage,conflict,overlapOpen,overlaps,run,invalid,reset,clearValidation,acceptOverlap,cancelOverlap }
}
