import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/adminServicesService'
import { useAdminServicesStore } from '@/stores/adminServices'
import { useAuthStore } from '@/stores/auth'
import type { AdminService, PagedResult, ServiceFilter } from '@/types/adminServices'

vi.mock('@/services/adminServicesService',()=>({
  fetchAdminService:vi.fn<typeof api.fetchAdminService>(),
  fetchAdminServices:vi.fn<typeof api.fetchAdminServices>(),
  fetchPendingCount:vi.fn<typeof api.fetchPendingCount>(),
  fetchServiceWorkspace:vi.fn<typeof api.fetchServiceWorkspace>(),
  fetchUpcomingService:vi.fn<typeof api.fetchUpcomingService>(),
  fetchUpcomingServices:vi.fn<typeof api.fetchUpcomingServices>(),
}))
const id='10000000-0000-4000-8000-000000000001'
const person={ id,nombreCompleto:'Técnico de prueba',correoGoogle:'tecnico@example.invalid',activo:true,tieneCertificado:false,certificadoFechaVencimiento:null }
const record=(overrides: Partial<AdminService>={}): AdminService=>({
  id,solicitud:'SR-TEST',tipoServicio:'PRINCIPAL',estado:'PROGRAMADO',version:1,inicioProgramado:'2030-10-07T14:00:00Z',finProgramado:'2030-10-07T15:30:00Z',
  tecnicoResponsableId:id,tecnicosColaboradoresIds:[],clientId:id,clienteNombre:'Cliente de prueba',sedeId:id,sedeNombre:'Sede de prueba',direccion:'Dirección sintética',servicioPrincipalId:null,
  inicioReal:null,finReal:null,responsable:person,colaboradores:[],contacto:{ nombre:null,celular:null,correos:[] },valorServicio:200000,observaciones:'',productos:[],refuerzo:null,principal:null,
  pago:{ metodoPago:null,estadoPago:'SIN_REGISTRAR',tecnicoRecaudoPrevistoId:null,recaudadoPorId:null,recaudadoPorNombre:null,pagoFecha:null,confirmadoAt:null,confirmadoPor:null,comprobanteStoragePath:null },
  calendar:{ estado:'PENDIENTE',ultimaSyncAt:null,error:null },executionLock:null,motivoCancelacion:null,canceladoAt:null,...overrides,
})
const filter: ServiceFilter={ from:'2030-10-07',to:'2030-10-07',tab:'agenda',estado:'',tipo:'',tecnicoId:'',query:'',page:1,pageSize:25 }
function listing(items: AdminService[]): PagedResult<AdminService> { return { items,total:items.length,page:1,pageSize:25,pendingCount:1 } }
beforeEach(()=>{
  setActivePinia(createPinia());vi.resetAllMocks()
  useAuthStore().user={ id,nombreCompleto:'Admin de prueba',correoGoogle:'admin@example.invalid',esAdmin:true,esTecnico:false,rolActivo:'ADMINISTRADOR',requiereSeleccionRol:false }
})
describe('service snapshots',()=>{
  it('reuses loaded detail and updates without refetching the list',async()=>{
    vi.mocked(api.fetchAdminServices).mockResolvedValue(listing([record()]))
    const store=useAdminServicesStore();await store.loadServices(filter)
    const snapshot=await store.ensureService(id)
    store.applyMutation({ services:[{ ...snapshot,version:2,observaciones:'Actualizado' }],upcoming:null,pendingCount:0 })
    expect(api.fetchAdminService).not.toHaveBeenCalled();expect(api.fetchAdminServices).toHaveBeenCalledOnce()
    expect(store.rows[0]?.observaciones).toBe('Actualizado');expect(store.total).toBe(1)
  })
  it('removes and reinserts an edited service when its date leaves and reenters the active range',async()=>{
    vi.mocked(api.fetchAdminServices).mockResolvedValue(listing([record()]))
    const store=useAdminServicesStore();await store.loadServices(filter)
    store.applyMutation({ services:[record({ version:2,inicioProgramado:'2030-10-08T14:00:00Z' })],upcoming:null,pendingCount:0 })
    expect(store.rows).toHaveLength(0);expect(store.total).toBe(0)
    store.applyMutation({ services:[record({ version:3 })],upcoming:null,pendingCount:0 })
    expect(store.rows).toHaveLength(1);expect(store.total).toBe(1)
  })
  it('ignores a slow listing that predates a committed mutation',async()=>{
    vi.mocked(api.fetchAdminServices).mockResolvedValueOnce(listing([record()]))
    const store=useAdminServicesStore();await store.loadServices(filter)
    let resolve!: (value: PagedResult<AdminService>)=>void
    vi.mocked(api.fetchAdminServices).mockImplementationOnce(()=>new Promise(done=>{ resolve=done }))
    const pending=store.loadServices(filter,true)
    store.applyMutation({ services:[record({ version:2,estado:'CANCELADO' })],upcoming:null,pendingCount:0 })
    resolve(listing([record()]));await pending
    expect(store.rows[0]?.estado).toBe('CANCELADO');expect(store.pendingCount).toBe(0);expect(store.loading).toBe(false)
  })
  it('never overwrites a newer snapshot with an older mutation replay',async()=>{
    vi.mocked(api.fetchAdminServices).mockResolvedValue(listing([record({ version:3 })]))
    const store=useAdminServicesStore();await store.loadServices(filter)
    store.applyMutation({ services:[record({ version:2,estado:'CANCELADO' })],upcoming:null,pendingCount:1 })
    expect(store.rows[0]?.version).toBe(3);expect(store.rows[0]?.estado).toBe('PROGRAMADO')
  })
  it('clears administrator snapshots when the active role changes',async()=>{
    const store=useAdminServicesStore();store.upsert(record())
    useAuthStore().user!.rolActivo='TECNICO';await nextTick()
    expect(store.records).toEqual({});expect(store.options).toBeNull()
  })
})
