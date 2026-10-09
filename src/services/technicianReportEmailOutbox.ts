import { isServiceId } from '@/helpers/adminServices'
import { offlineDatabase } from '@/services/offlineDatabase'
import type { TechnicianReportEmailIntent } from '@/types/technicianReportEmails'

const validEmail = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)

function valid(value: unknown, actorId?: string): value is TechnicianReportEmailIntent {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<TechnicianReportEmailIntent>
  const input = v.input
  return v.schemaVersion === 1 && [v.actorId,v.serviceId,v.requestId].every(isServiceId)
    && (actorId === undefined || actorId === v.actorId)
    && input?.requestId === v.requestId && typeof input?.origin === 'string'
    && /^https?:\/\//.test(input.origin) && input.origin.length <= 250
    && typeof input.subject === 'string' && input.subject.trim().length > 0 && input.subject.length <= 200
    && !/[\r\n]/.test(input.subject)
    && typeof input.message === 'string' && input.message.trim().length > 0 && input.message.length <= 4000
    && Array.isArray(input.recipients) && input.recipients.length >= 1 && input.recipients.length <= 20
    && input.recipients.every(validEmail) && new Set(input.recipients).size === input.recipients.length
    && Array.isArray(input.certificateIds) && input.certificateIds.length <= 10
    && input.certificateIds.every(isServiceId) && new Set(input.certificateIds).size === input.certificateIds.length
    && ['PENDING','SENDING','NEEDS_REVIEW'].includes(v.status ?? '')
    && Number.isSafeInteger(v.attempts) && Number(v.attempts) >= 0
    && (v.error === null || typeof v.error === 'string')
    && (v.nextRetryAt === null || typeof v.nextRetryAt === 'string')
    && typeof v.createdAt === 'string' && typeof v.updatedAt === 'string'
}

function key(value: Pick<TechnicianReportEmailIntent, 'actorId'|'serviceId'|'requestId'>): string {
  if (![value.actorId,value.serviceId,value.requestId].every(isServiceId)) throw new Error('La cola de correos no es válida.')
  return 'technician-report-email:' + value.actorId + ':' + value.serviceId + ':' + value.requestId
}

export async function listTechnicianReportEmails(actorId: string): Promise<TechnicianReportEmailIntent[]> {
  if (!isServiceId(actorId)) return []
  return (await (await offlineDatabase).getAll('technicianReportEmails'))
    .filter((v): v is TechnicianReportEmailIntent => valid(v,actorId))
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt))
}

export async function saveTechnicianReportEmail(value: TechnicianReportEmailIntent): Promise<void> {
  if (!valid(value)) throw new Error('El correo pendiente no es válido.')
  const plain = JSON.parse(JSON.stringify(value)) as TechnicianReportEmailIntent
  if (JSON.stringify(plain).length > 16000) throw new Error('El correo pendiente supera el tamaño permitido.')
  await (await offlineDatabase).put('technicianReportEmails',plain,key(plain))
}

export async function deleteTechnicianReportEmail(value: Pick<TechnicianReportEmailIntent, 'actorId'|'serviceId'|'requestId'>): Promise<void> {
  await (await offlineDatabase).delete('technicianReportEmails', key(value))
}

export function sameReportEmailRequest(a: TechnicianReportEmailIntent['input'], b: TechnicianReportEmailIntent['input']): boolean {
  return a.origin === b.origin && a.subject === b.subject && a.message === b.message
    && JSON.stringify([...a.recipients].sort()) === JSON.stringify([...b.recipients].sort())
    && JSON.stringify([...a.certificateIds].sort()) === JSON.stringify([...b.certificateIds].sort())
}
