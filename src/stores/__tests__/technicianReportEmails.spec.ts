import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTechnicianReportEmailStore } from '@/stores/technicianReportEmails'
import * as outbox from '@/services/technicianReportEmailOutbox'
import * as sharing from '@/services/reportSharingService'
import * as services from '@/services/servicesService'
import { ApiClientError } from '@/services/apiService'
import type { TechnicianReportEmailIntent } from '@/types/technicianReportEmails'
import type { TechnicianPackageCache, TechnicianMutation } from '@/types/technicianServices'

const actorId = '10000000-0000-4000-8000-000000000101'
const serviceId = '10000000-0000-4000-8000-000000000102'
const deviceId = '10000000-0000-4000-8000-000000000103'
const clientId = '10000000-0000-4000-8000-000000000104'
const origin = 'https://develop-soluciones-radicales.solucionesradicales1.workers.dev'
const payload = {
  recipients:['contacto@example.test'],certificateIds:[],origin,
  subject:'Informe MIP', message:'Se adjunta el informe de su visita.',
}
let items: TechnicianReportEmailIntent[] = []
const cached: { [id:string]: TechnicianPackageCache } = reactive({})
const mutations: { [id:string]: TechnicianMutation[] } = reactive({})
const mockServices = {
  caches:cached,
  mutations,
  hydrateCaches:vi.fn<() => Promise<void>>(async () => undefined),
  syncPending:vi.fn<(_id:string) => Promise<'synced' | 'pending' | 'conflict'>>(async () => 'synced'),
}

vi.mock('@/stores/technicianServices', () => ({ useTechnicianServicesStore: () => mockServices }))
vi.mock('@/services/technicianReportEmailOutbox', () => ({
  listTechnicianReportEmails: vi.fn<typeof outbox.listTechnicianReportEmails>(async (actor:string) => items.filter(x => x.actorId === actor).map(x => JSON.parse(JSON.stringify(x)) as TechnicianReportEmailIntent)),
  saveTechnicianReportEmail: vi.fn<typeof outbox.saveTechnicianReportEmail>(async (v: TechnicianReportEmailIntent) => { items = [...items.filter(x => x.requestId !== v.requestId),JSON.parse(JSON.stringify(v)) as TechnicianReportEmailIntent] }),
  deleteTechnicianReportEmail: vi.fn<typeof outbox.deleteTechnicianReportEmail>(async (v: TechnicianReportEmailIntent) => { items = items.filter(x => x.requestId !== v.requestId) }),
  sameReportEmailRequest: (a: typeof payload,b: typeof payload) => JSON.stringify(a.recipients) === JSON.stringify(b.recipients)
    && JSON.stringify(a.certificateIds) === JSON.stringify(b.certificateIds) && a.origin === b.origin
    && a.subject === b.subject && a.message === b.message,
}))
vi.mock('@/services/reportSharingService', () => ({ sendTechnicianServiceReport:vi.fn<typeof sharing.sendTechnicianServiceReport>() }))
vi.mock('@/services/servicesService', () => ({ fetchTechnicianPackage:vi.fn<typeof services.fetchTechnicianPackage>() }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  items = []
  Object.keys(cached).forEach(k => delete cached[k])
  Object.keys(mutations).forEach(k => delete mutations[k])
  useAuthStore().user = {
    id:actorId,nombreCompleto:'Técnico',correoGoogle:'tech@example.test',
    esAdmin:false,esTecnico:true,rolActivo:'TECNICO',requiereSeleccionRol:false,
  }
  cached[serviceId] = {
    schemaVersion:1,actorId,serviceId,deviceId,savedAt:new Date().toISOString(),
    package: {
      service:{id:serviceId,solicitud:'SR-0102',tipoServicio:'PRINCIPAL',estado:'EN_PROCESO',version:2,
        inicioProgramado:'2026-10-09T13:00:00Z',finProgramado:'2026-10-09T15:00:00Z',inicioReal:'2026-10-09T13:05:00Z',
        clienteNombre:'Cliente',sedeNombre:'Sede',direccion:'Calle',autoPrepareEligible:true,
        contactEmails:['contacto@example.test']},
      frozen:true,serverNow:new Date().toISOString(),canStart:false,startAvailableAt:'',
      products:[],deviceTypes:[],areas:[],
      signatures:{technicianStoragePath:null,technicianUserId:null,clientStoragePath:null,clientName:null,clientSignedAt:null},
    },
    lock:null,pendingOperation:null,
  }
  mutations[serviceId] = [{
    schemaVersion:1,kind:'SERVICE_FINALIZE',requestId:crypto.randomUUID(),actorId,serviceId,deviceId,
    lockToken:clientId,status:'PENDING',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:null,
    technicianMediaId:clientId,clientMediaId:clientId,
    technicianStoragePath:null,clientStoragePath:null,clientName:'Cliente',
  }]
  vi.mocked(sharing.sendTechnicianServiceReport).mockResolvedValue({sent:true,linkExpiresAt:'2027-01-09',attachmentCount:0})
})

describe('Envíos del Técnico con cola offline', () => {
  it('guarda el intento sin internet y envía una sola vez después de sincronizar el cierre', async () => {
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
    const store = useTechnicianReportEmailStore()
    expect(await store.queue(serviceId,payload)).toBe('pending')
    expect(items).toHaveLength(1)
    const requestId=items[0]!.requestId
    expect(vi.mocked(sharing.sendTechnicianServiceReport)).not.toHaveBeenCalled()
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
    vi.mocked(mockServices.syncPending).mockImplementation(async () => {
      cached[serviceId]!.package.service.estado='FINALIZADO'
      mutations[serviceId]=[]
      return 'synced'
    })
    await store.flushAll()
    expect(mockServices.syncPending).toHaveBeenCalledWith(serviceId)
    expect(sharing.sendTechnicianServiceReport).toHaveBeenCalledWith(serviceId,{...payload,requestId})
    expect(items).toHaveLength(0)
    expect(store.pendingCount).toBe(0)
  })
  it('deduplica el mismo intento pendiente y no envía antes de la confirmación', async () => {
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
    const store = useTechnicianReportEmailStore()
    await store.queue(serviceId,payload)
    await store.queue(serviceId,payload)
    expect(items).toHaveLength(1)
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
    vi.mocked(mockServices.syncPending).mockResolvedValue('pending')
    await store.flushAll()
    expect(sharing.sendTechnicianServiceReport).not.toHaveBeenCalled()
    expect(items[0]?.status).toBe('PENDING')
  })
  it('mantiene un envío pendiente ante un fallo transitorio sin duplicar solicitudes', async () => {
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
    const store = useTechnicianReportEmailStore()
    await store.queue(serviceId,payload)
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
    cached[serviceId]!.package.service.estado='FINALIZADO'
    vi.mocked(sharing.sendTechnicianServiceReport).mockRejectedValueOnce(new ApiClientError('Gmail no disponible',503))
    await store.flushAll()
    expect(items[0]?.status).toBe('PENDING')
    expect(items[0]?.attempts).toBe(1)
    expect(items[0]?.nextRetryAt).toBeTruthy()
    const id=items[0]!.requestId
    await store.flushAll()
    expect(sharing.sendTechnicianServiceReport).toHaveBeenCalledTimes(1)
    expect(items[0]!.requestId).toBe(id)
  })
  it('bloquea reenvíos automáticos cuando Gmail no confirmó si entregó el mensaje', async () => {
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
    const store = useTechnicianReportEmailStore()
    await store.queue(serviceId,payload)
    Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
    cached[serviceId]!.package.service.estado='FINALIZADO'
    vi.mocked(sharing.sendTechnicianServiceReport)
      .mockRejectedValue(new ApiClientError('Revisa Enviados',502,'EMAIL_DELIVERY_UNKNOWN'))
    await store.flushAll()
    expect(items[0]?.status).toBe('NEEDS_REVIEW')
    expect(store.reviewCount).toBe(1)
    await store.flushAll()
    expect(sharing.sendTechnicianServiceReport).toHaveBeenCalledTimes(1)
  })
  it('aísla los correos locales por usuario y no permite acciones antes del cierre', async () => {
    const store = useTechnicianReportEmailStore()
    mutations[serviceId]=[]
    await expect(store.queue(serviceId,payload)).rejects.toThrow('Finaliza')
    mutations[serviceId]=[{
      schemaVersion:1,kind:'SERVICE_FINALIZE',requestId:crypto.randomUUID(),actorId,serviceId,deviceId,
      lockToken:clientId,status:'PENDING',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:null,
      technicianMediaId:clientId,clientMediaId:clientId,technicianStoragePath:null,clientStoragePath:null,clientName:'Cliente',
    }]
    Object.defineProperty(navigator,'onLine',{configurable:true,value:false})
    await store.queue(serviceId,payload)
    useAuthStore().user={...useAuthStore().user!,id:clientId}
    await store.hydrate()
    expect(store.items).toHaveLength(0)
    expect(items).toHaveLength(1)
    expect(outbox.listTechnicianReportEmails).toHaveBeenCalledWith(clientId)
  })
})
