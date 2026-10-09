import { expect, test, type Page, type Route } from '@playwright/test'
import type { AdminService } from '../src/types/adminServices'
import type { ServiceResultsData } from '../src/types/serviceResults'
import { todayBogota } from '../src/helpers/adminServices'
import { publicReportData } from '../functions/api/service-results/public'

const serviceId = '10000000-0000-4000-8000-000000000008'
const areaId = '10000000-0000-4000-8000-000000000009'
const now = '2026-10-09T14:00:00.000Z'
const certificateId = '10000000-0000-4000-8000-000000000014'
const publicToken = 'a'.repeat(43)
const photo = (value: string) => 'services/' + serviceId + '/' + value
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLZsAAAAASUVORK5CYII=', 'base64')
const result: ServiceResultsData = {
  id:serviceId, solicitud:'SR-00000008', cliente:'Empresa de prueba', nit:'900000001',
  sede:'Sucursal Central', direccion:'Calle 1', tecnico:'Laura Técnica',
  firmanteCliente:'Camila Cliente', firmaTecnico:photo('signatures/technician/tech.png'),
  firmaCliente:photo('signatures/client/client.png'),
  inicioProgramado:now,inicioReal:now,finReal:'2026-10-09T15:00:00.000Z',
  productos:[{nombre:'Producto A',principio:'Ingrediente A',registro:'Registro 1',lote:'L-1',dosis:'5 mL/L',metodos:'Aspersión'}],
  areas:[{id:areaId,nombre:'Cocina',sinAcceso:false,motivo:null,fotos:[],
    criterios:[{nombre:'Control de residuos',evaluacion:'CP',observacion:'Mejorar disposición',fotos:[photo('criteria/e1/evidence.png')]}],
    puntos:[{numero:'01',ubicacion:'Acceso',tipo:'Trampa adhesiva',estado:'BUENO',capturas:[{plagaNombreSnapshot:'Moscas',cantidad:2}],observaciones:'Correcto',foto:photo('devices/d1/review/image.png')}],
    hallazgos:[{descripcion:'Abertura',recomendacion:'Sellar',estado:'ABIERTO',responsable:'Cliente',fotos:[photo('findings/f1/opening/image.png')]}],
  }],
  historico:[{solicitud:'SR-00000008',fecha:'2026-10-09T15:00:00.000Z',cumplimiento:50,capturas:2}],
}
function service(): AdminService {
  return {
    id:serviceId,solicitud:result.solicitud,tipoServicio:'PRINCIPAL',estado:'FINALIZADO',version:1,
    inicioProgramado:now,finProgramado:'2026-10-09T15:00:00.000Z',
    inicioReal:now,finReal:result.finReal,tecnicoResponsableId:areaId,tecnicosColaboradoresIds:[],
    clientId:areaId,clienteNombre:result.cliente,sedeId:areaId,sedeNombre:result.sede,direccion:result.direccion,
    servicioPrincipalId:null,responsable:{id:areaId,nombreCompleto:result.tecnico,correoGoogle:'tech@example.test',activo:true,tieneCertificado:false,certificadoFechaVencimiento:null},colaboradores:[],
    contacto:{nombre:'Contacto',celular:null,correos:[]},valorServicio:150000,observaciones:'',productos:[],
    refuerzo:null,principal:null,pago:{metodoPago:'EFECTIVO',estadoPago:'CONFIRMADO',tecnicoRecaudoPrevistoId:null,recaudadoPorId:null,recaudadoPorNombre:null,pagoFecha:null,confirmadoAt:null,confirmadoPor:null,comprobanteStoragePath:null},
    calendar:{estado:'SINCRONIZADO',ultimaSyncAt:null,error:null},executionLock:null,motivoCancelacion:null,canceladoAt:null,
  }
}
async function setup(page: Page, role: 'ADMINISTRADOR' | 'TECNICO') {
  const requests: Record<string, unknown>[] = []
  let publicHasAuthorization = false
  await page.addInitScript(() => {
    window.print = () => document.body.setAttribute('data-report-printed', 'true')
  })
  await page.route('**/get-session', route => route.fulfill({json:{
    session:{id:'session',userId:'auth-1',token:'test-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:now,updatedAt:now},
    user:{id:'auth-1',name:'Admin',email:'admin@example.test',emailVerified:true,createdAt:now,updatedAt:now},
  }}))
  await page.route('https://r2.example.test/**', route => route.fulfill({status:200,contentType:'image/png',body:png}))
  await page.route('https://api.example.test/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204})
    if (url.pathname === '/api/session') return route.fulfill({json:{
      id:areaId,nombreCompleto:'Persona de prueba',correoGoogle:'admin@example.test',
      esAdmin:role==='ADMINISTRADOR',esTecnico:role==='TECNICO',rolActivo:role,requiereSeleccionRol:false,
    }})
    if (url.pathname === '/api/admin/services/workspace') return route.fulfill({json:{sedes:[],tecnicos:[],productos:[]}})
    if (url.pathname === '/api/admin/services/pending-count') return route.fulfill({json:{count:0}})
    if (url.pathname === '/api/admin/services') return route.fulfill({json:{items:[service()],total:1,page:1,pageSize:25,pendingCount:0}})
    if (url.pathname === '/api/admin/services/' + serviceId + '/report-sharing' && route.request().method()==='GET') return route.fulfill({json:{registeredEmails:['sede@example.test','cliente@example.test'],certificates:[{id:certificateId,type:'ESTABLECIMIENTO',label:'Establecimiento',expiresOn:'2027-10-09'}],activeLinks:0,lastSharedAt:null,gmailConnected:true}})
    if (url.pathname === '/api/admin/services/' + serviceId + '/report-sharing/send') { requests.push(route.request().postDataJSON()); return route.fulfill({json:{sent:true,linkExpiresAt:'2027-01-09T00:00:00Z',attachmentCount:1}}) }
    if (url.pathname === '/api/admin/services/' + serviceId + '/report-sharing/revoke') return route.fulfill({json:{revoked:1}})
    if (url.pathname === '/api/public/reports/resolve') {publicHasAuthorization ||= !!route.request().headers()['authorization'];return route.fulfill({json:{data:publicReportData(result)}})}
    if (url.pathname === '/api/public/reports/media') {publicHasAuthorization ||= !!route.request().headers()['authorization'];return route.fulfill({json:{url:'https://r2.example.test/opaque.png'}})}
    if (url.pathname === '/api/admin/services/' + serviceId + '/results') return route.fulfill({json:{data:result}})
    if (url.pathname === '/api/admin/services/' + serviceId + '/media/read-url') return route.fulfill({json:{url:'https://r2.example.test/' + encodeURIComponent(url.searchParams.get('path') || '') + '.png'}})
    return route.fulfill({status:404,json:{error:'Ruta inesperada: ' + url.pathname}})
  })
  return { requests, publicHasAuthorization: () => publicHasAuthorization }
}

test('Historial ofrece informe solo administrativo y A4 con fotografías y ambas firmas', async ({page}) => {
  await setup(page, 'ADMINISTRADOR')
  const day = todayBogota()
  await page.goto('/servicios?tab=history&from=' + day + '&to=' + day)
  const link = page.getByRole('link', {name:'Abrir informe de SR-00000008'})
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(new RegExp('/servicios/' + serviceId + '/informe'))
  await expect(page.getByRole('heading',{name:'Informe técnico de servicio'})).toBeVisible()
  await expect(page.getByText('Producto A')).toBeVisible()
  await expect(page.getByText('Control de residuos', { exact:true })).toBeVisible()
  await expect(page.getByText('Abertura')).toBeVisible()
  await expect(page.getByRole('img',{name:'Firma del técnico'})).toBeVisible()
  await expect(page.getByRole('img',{name:'Firma de conformidad del cliente'})).toBeVisible()
  const print = page.getByRole('button',{name:'Imprimir / Guardar PDF'})
  await expect(print).toBeEnabled()
  await print.click()
  await expect(page.locator('body')).toHaveAttribute('data-report-printed','true')
  await expect(page.getByText('Vista administrativa · Sin compartir')).toBeVisible()
  await expect(page.getByText('QR')).toHaveCount(0)
})

test('un técnico no puede abrir el informe administrativo por URL', async ({page}) => {
  await setup(page, 'TECNICO')
  await page.goto('/servicios/' + serviceId + '/informe')
  await expect(page).toHaveURL(/prohibido/)
  await expect(page.getByRole('heading',{name:'Informe técnico de servicio'})).toHaveCount(0)
})


test('El administrador selecciona emails registrados, agrega otro y adjunta un certificado opcional', async ({page}) => {
  const { requests } = await setup(page,'ADMINISTRADOR')
  await page.goto('/servicios/' + serviceId + '/informe')
  await page.getByRole('button',{name:'Enviar informe'}).click()
  await expect(page.getByRole('heading',{name:'Enviar informe'})).toBeVisible()
  await expect(page.getByText('sede@example.test')).toBeVisible()
  const editor = page.locator('details.email-composer')
  await expect(editor).not.toHaveAttribute('open', '')
  await editor.locator('summary').click()
  await expect(editor).toHaveAttribute('open', '')
  await page.getByLabel('Asunto', { exact:true }).fill('Informe MIP personalizado')
  await page.getByLabel('Mensaje', { exact:true }).fill('Buenas tardes, compartimos su informe.')
  await editor.locator('summary').click()
  await expect(editor).not.toHaveAttribute('open', '')
  await page.getByLabel('sede@example.test').check()
  await page.getByLabel('Agregar otro correo').fill('Extra@Example.test')
  await page.getByRole('button',{name:'Añadir'}).click()
  await page.getByText('Certificado de establecimiento').click()
  await page.getByRole('button',{name:'Enviar informe',exact:true}).last().click()
  await expect(page.getByRole('heading',{name:'Enviar informe'})).toHaveCount(0)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    recipients:['extra@example.test','sede@example.test'],
    certificateIds:[certificateId],
    origin:new URL(page.url()).origin,
    subject:'Informe MIP personalizado',
    message:'Buenas tardes, compartimos su informe.',
  })
})

test('el enlace público se abre sin sesión y no solicita autorización ni muestra acciones administrativas', async ({page}) => {
  const state = await setup(page,'TECNICO')
  await page.goto('/informe/consulta/' + publicToken)
  await expect(page.getByRole('heading',{name:'Informe técnico de servicio'})).toBeVisible()
  await expect(page.getByRole('img',{name:'Firma del técnico'})).toBeVisible()
  await expect(page.getByRole('img',{name:'Firma de conformidad del cliente'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Guardar PDF'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Enviar informe'})).toHaveCount(0)
  expect(state.publicHasAuthorization()).toBe(false)
})
