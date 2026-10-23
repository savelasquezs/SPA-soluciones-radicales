// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Identity } from '../auth'

const mocks = vi.hoisted(() => ({
  query: vi.fn<(sql: string, values?: unknown[]) => Promise<{rows: unknown[]; rowCount: number}>>(),
  generate: vi.fn<typeof import('./certificates').ensureReportCertificates>(),
  send: vi.fn<typeof import('../google').sendGmailMessage>(),
  claim: vi.fn<typeof import('../certificates/jobs').claimCertificateJob>(),
  fail: vi.fn<typeof import('../certificates/jobs').failCertificateJob>(),
  complete: vi.fn<typeof import('../certificates/jobs').completeCertificateJob>(),
  lock: vi.fn<typeof import('../certificates/jobs').lockCertificateJob>(),
  dispatch: vi.fn<typeof import('../certificates/jobs').markEmailDispatching>(),
  read: vi.fn<typeof import('../r2').readCertificateObject>(),
  assigned: vi.fn<typeof import('../technician-services/queries').assignedServiceState>(),
}))
vi.mock('../db', () => ({transaction: (work: (client: {query: typeof mocks.query}) => unknown) => work({query:mocks.query})}))
vi.mock('./certificates', () => ({ensureReportCertificates:mocks.generate}))
vi.mock('../certificates/jobs', () => ({claimCertificateJob:mocks.claim,failCertificateJob:mocks.fail,
  completeCertificateJob:mocks.complete,lockCertificateJob:mocks.lock,markEmailDispatching:mocks.dispatch}))
vi.mock('../google', () => ({sendGmailMessage:mocks.send,getGoogleStatus:vi.fn<typeof import('../google').getGoogleStatus>()}))
vi.mock('../r2', () => ({readCertificateObject:mocks.read,createServiceResultMediaReadUrl:vi.fn<typeof import('../r2').createServiceResultMediaReadUrl>()}))
vi.mock('../technician-services/queries', () => ({assignedServiceState:mocks.assigned}))
vi.mock('./data', () => ({loadServiceResultsData:vi.fn<() => Promise<{solicitud:string;cliente:string;sede:string}>>(async()=>({solicitud:'SR-TEST',cliente:'Negocio',sede:'Sede'}))}))
vi.mock('../auth', async original => ({...await original<typeof import('../auth')>(),
  requireTechnician:vi.fn<typeof import('../auth').requireTechnician>(async()=>({id:'10000000-0000-4000-8000-000000000001',nombreCompleto:'Prueba',correoGoogle:'test@example.test',esAdmin:false,esTecnico:true,rolActivo:'TECNICO',requiereSeleccionRol:false})),requireAdmin:vi.fn<typeof import('../auth').requireAdmin>()}))

import { ApiError } from '../auth'
import { technicianReportSharingRoutes } from './sharing'

const id='10000000-0000-4000-8000-000000000001'
const certificate={id,type:'ESTABLECIMIENTO' as const,vehicleId:null,label:'Establecimiento',
  storagePath:'certificates/test.pdf',issuedOn:'2026-10-23',expiresOn:'2027-10-23'}
const app=new Hono<{Variables:{identity:Identity}}>()
app.use('*',async(c,next)=>{c.set('identity',{authUserId:'test',session:{}});await next()})
app.route('/services',technicianReportSharingRoutes)
const request=()=>app.request(`/services/${id}/report-sharing/send`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({requestId:id,recipients:['recipient@example.test'],certificateIds:[],origin:'http://localhost:5173'})})

beforeEach(()=>{
  vi.clearAllMocks()
  mocks.assigned.mockResolvedValue({estado:'FINALIZADO',tipo_servicio:'PRINCIPAL'} as Awaited<ReturnType<typeof mocks.assigned>>)
  mocks.query.mockImplementation(async sql=>({rows:sql.includes('businessEmails')
    ? [{businessEmails:[],siteEmails:[],contactEmail:null}]
    : sql.includes('from public.certificados') ? [{...certificate,path:certificate.storagePath}]
      : sql.includes('insert into private.service_report_links') ? [{id}] : [],rowCount:1}))
  mocks.generate.mockReset().mockResolvedValue([certificate])
  mocks.claim.mockResolvedValue({id,token:'test',completed:false})
  mocks.fail.mockResolvedValue(undefined)
  mocks.read.mockResolvedValue(Buffer.from('%PDF-test'))
  mocks.send.mockReset().mockImplementation(async input=>{await input.onDispatch?.();return 'gmail-test'})
})

describe('report and mandatory certificates',()=>{
  it('prepares and attaches the service certificate even with an empty browser selection',async()=>{
    const response=await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({sent:true,attachmentCount:1})
    expect(mocks.generate).toHaveBeenCalledWith(id,id,expect.any(Function))
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({attachments:[expect.objectContaining({bytes:Buffer.from('%PDF-test')})]}))
    const linked=mocks.query.mock.calls.find(([sql])=>sql.includes('certificate_ids_json=$3'))
    expect(JSON.parse(String(linked?.[1]?.[2]))).toEqual([certificate.id])
  })
  it('does not send an incomplete report when any required certificate fails',async()=>{
    mocks.generate.mockRejectedValue(new ApiError(502,'Falló un certificado vehicular'))
    expect((await request()).status).toBe(502)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(expect.anything(),expect.anything(),false)
  })
  it('does not generate or send documents for an unfinished assigned service',async()=>{
    mocks.assigned.mockResolvedValue({estado:'EN_PROCESO',tipo_servicio:'PRINCIPAL'} as Awaited<ReturnType<typeof mocks.assigned>>)
    expect((await request()).status).toBe(409)
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('preserves the completed email result without generating or sending it again',async()=>{
    mocks.claim.mockResolvedValue({id,token:'',completed:true,result:{sent:true,attachmentCount:1}})
    expect((await request()).status).toBe(200)
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
