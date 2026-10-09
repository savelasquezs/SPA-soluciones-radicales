import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useTechnicianServicesStore } from '@/stores/technicianServices'
import { ApiClientError } from '@/services/apiService'
import { fetchTechnicianPackage } from '@/services/servicesService'
import { sendTechnicianServiceReport } from '@/services/reportSharingService'
import { listTechnicianReportEmails, saveTechnicianReportEmail, deleteTechnicianReportEmail, sameReportEmailRequest } from '@/services/technicianReportEmailOutbox'
import type { SendServiceReportInput } from '@/types/reportSharing'
import type { TechnicianReportEmailIntent } from '@/types/technicianReportEmails'

function connected(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}
function now(): string { return new Date().toISOString() }
const pendingRetry = (attempts: number) => new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(attempts, 6)) * 1000).toISOString()
const uncertainCode = (failure: ApiClientError) => failure.code === 'EMAIL_DELIVERY_UNKNOWN'
const retryableFailure = (failure: unknown): boolean => {
  if (!(failure instanceof ApiClientError)) return true
  return !uncertainCode(failure) && (failure.status >= 500 || failure.status === 408 || failure.status === 429
    || failure.status === 401 || failure.code === 'SERVICE_NOT_FINALIZED' || failure.code === 'OPERATION_RUNNING')
}

export const useTechnicianReportEmailStore = defineStore('technician-report-email', () => {
  const auth = useAuthStore()
  const technician = useTechnicianServicesStore()
  const items = ref<TechnicianReportEmailIntent[]>([])
  const syncing = ref(false)
  let actorLoaded = ''
  let underway: Promise<void> | null = null
  const pendingCount = computed(() => items.value.filter(x => x.status !== 'NEEDS_REVIEW').length)
  const reviewCount = computed(() => items.value.filter(x => x.status === 'NEEDS_REVIEW').length)

  async function hydrate(force = false): Promise<void> {
    if (auth.activeRole !== 'TECNICO' || !auth.profile?.id) {
      items.value = []
      actorLoaded = ''
      return
    }
    if (!force && actorLoaded === auth.profile.id) return
    const actor = auth.profile.id
    const found = await listTechnicianReportEmails(actor)
    if (auth.profile?.id !== actor || auth.activeRole !== 'TECNICO') return
    items.value = found
    actorLoaded = actor
  }
  async function refresh(): Promise<void> { await hydrate(true) }
  const forService = (serviceId: string): TechnicianReportEmailIntent[] => items.value.filter(x => x.serviceId === serviceId)

  async function queue(serviceId: string, payload: Omit<SendServiceReportInput, 'requestId'>): Promise<'sent' | 'pending' | 'needs_review'> {
    if (auth.activeRole !== 'TECNICO' || !auth.profile?.id) throw new Error('Se requiere el rol Técnico.')
    await technician.hydrateCaches()
    await hydrate()
    const cached = technician.caches[serviceId]
    const closing = (technician.mutations[serviceId] ?? []).some(v => v.kind === 'SERVICE_FINALIZE')
    if (!cached || (cached.package.service.estado !== 'FINALIZADO' && !closing)) {
      throw new Error('Finaliza el servicio antes de enviar su informe.')
    }
    const actor = auth.profile.id
    const input = {
      ...payload,
      recipients: [...new Set(payload.recipients.map(x => x.trim().toLowerCase()))].sort(),
      certificateIds: [...new Set(payload.certificateIds)].sort(),
    }
    const duplicate = items.value.find(x => x.actorId === actor && x.serviceId === serviceId
      && x.status !== 'NEEDS_REVIEW' && sameReportEmailRequest(x.input, { ...input,requestId:x.requestId }))
    if (!duplicate) {
      const date = now()
      const requestId = crypto.randomUUID()
      await saveTechnicianReportEmail({
        schemaVersion:1,actorId:actor,serviceId,requestId,
        input:{ ...input,requestId },status:'PENDING',
        attempts:0,nextRetryAt:null,createdAt:date,updatedAt:date,error:null,
      })
      await refresh()
    }
    if (connected()) await flushAll()
    if (items.value.some(x => x.serviceId === serviceId && x.actorId === actor && x.status === 'NEEDS_REVIEW'
      && sameReportEmailRequest(x.input,{...input,requestId:x.requestId}))) return 'needs_review'
    return items.value.some(x => x.serviceId === serviceId && x.actorId === actor
      && x.status !== 'NEEDS_REVIEW' && sameReportEmailRequest(x.input,{...input,requestId:x.requestId})) ? 'pending' : 'sent'
  }

  async function flushAll(): Promise<void> {
    if (!connected() || auth.activeRole !== 'TECNICO' || !auth.profile?.id) return
    if (underway) return underway
    underway = doFlush()
    try { await underway } finally { underway = null }
  }

  async function doFlush(): Promise<void> {
    syncing.value = true
    const actor = auth.profile?.id
    try {
      await technician.hydrateCaches()
      await hydrate(true)
      if (!actor) return
      const ids = [...new Set(items.value
        .filter(x => x.actorId === actor && x.status !== 'NEEDS_REVIEW')
        .filter(x => !x.nextRetryAt || Date.parse(x.nextRetryAt) <= Date.now())
        .map(x => x.serviceId))]
      for (const id of ids) {
        if (!connected() || auth.profile?.id !== actor || auth.activeRole !== 'TECNICO') break
        let closureSynced = false
        try {
          if (await technician.syncPending(id) !== 'synced') continue
          const cached = technician.caches[id]
          if (cached?.package.service.estado === 'FINALIZADO') closureSynced = true
          else closureSynced = (await fetchTechnicianPackage(id)).service.estado === 'FINALIZADO'
        } catch {
          continue // Service sync errors keep mail queued, never send before closure.
        }
        if (!closureSynced) continue
        for (const mail of items.value.filter(x => x.serviceId === id && x.actorId === actor && x.status !== 'NEEDS_REVIEW')) {
          if (!connected() || auth.profile?.id !== actor || auth.activeRole !== 'TECNICO') break
          if (mail.nextRetryAt && Date.parse(mail.nextRetryAt) > Date.now()) continue
          const sending: TechnicianReportEmailIntent = {
            ...mail,status:'SENDING',attempts:mail.attempts + 1,updatedAt:now(),error:null,
          }
          await saveTechnicianReportEmail(sending)
          await refresh()
          try {
            await sendTechnicianServiceReport(id,sending.input)
            await deleteTechnicianReportEmail(sending)
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : 'No fue posible enviar el correo.'
            const retryable = retryableFailure(failure) && sending.attempts < 5
            await saveTechnicianReportEmail({
              ...sending, status:retryable ? 'PENDING' : 'NEEDS_REVIEW',
              nextRetryAt: retryable ? pendingRetry(sending.attempts) : null,
              error: message,updatedAt:now(),
            })
          }
          await refresh()
        }
      }
    } finally {
      syncing.value = false
    }
  }

  return { items,syncing,pendingCount,reviewCount,hydrate,refresh,forService,queue,flushAll }
})
