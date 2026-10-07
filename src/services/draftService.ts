import { openDB } from 'idb'
import type { ServiceEditorDraft } from '@/types/adminServices'
import { isServiceId } from '@/helpers/adminServices'

const database = openDB('soluciones-radicales-offline', 1, {
  upgrade(db) { if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts') },
})
export interface AdminServiceDraft {
  schemaVersion: 1
  actorId: string
  context: string
  requestId: string
  draft: ServiceEditorDraft
  confirmed: boolean
  proposalVersion: number | null
  updatedAt: string
}
function key(actorId: string, context: string): string {
  if (!isServiceId(actorId) || (context!=='new' && !isServiceId(context))) throw new Error('El contexto del borrador no es válido.')
  return `admin-service:${actorId}:${context}`
}
export async function loadAdminServiceDraft(actorId: string, context: string): Promise<AdminServiceDraft | null> {
  const value=await (await database).get('drafts',key(actorId,context)) as AdminServiceDraft | undefined
  if (!value || value.schemaVersion!==1 || value.actorId!==actorId || value.context!==context || !isServiceId(value.requestId) || !value.draft?.programacion || !Array.isArray(value.draft.productos)) return null
  return value
}
export async function saveAdminServiceDraft(draft: AdminServiceDraft): Promise<void> {
  const plain=JSON.parse(JSON.stringify(draft)) as AdminServiceDraft
  if (JSON.stringify(plain).length>150_000) throw new Error('El borrador supera el tamaño permitido.')
  await (await database).put('drafts',plain,key(plain.actorId,plain.context))
}
export async function clearAdminServiceDraft(actorId: string, context: string): Promise<void> { await (await database).delete('drafts',key(actorId,context)) }
