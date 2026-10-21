import type { Page } from '@playwright/test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const demoClientId = '61000000-0000-4000-8000-000000000001'
export const demoSiteId = '62000000-0000-4000-8000-000000000001'
export const demoVehicleId = '63000000-0000-4000-8000-000000000001'
const certId = '64000000-0000-4000-8000-000000000001'

type Vehicle = { id: string; siteId: string; placa: string; activo: boolean; version: number }
const user = {
  id: '90000000-0000-4000-8000-000000000001',
  nombreCompleto: 'Administrador de demostración',
  correoGoogle: 'demo@solucionesradicales.test',
  esAdmin: true,
  esTecnico: false,
  rolActivo: 'ADMINISTRADOR',
  requiereSeleccionRol: false,
}
const client = {
  id: demoClientId, tipoCliente: 'NEGOCIO', nombre: 'Industrias Demo SAS',
  nit: '901777000', correos: ['administracion@industrias-demo.test'],
  activo: true, version: 1, vigenciaCertificadoMeses: 12,
  residenciaDireccion: null, residenciaCelular: null, residenciaValorServicio: null, sedesCount: 1,
}
const site = {
  id:demoSiteId, clientId:demoClientId, nombre:'Sede Norte', direccion:'Calle 50 # 20-30',
  correos:[], heredaCorreosCliente:true,
  contactoPrincipalNombre:'Ana Demostración',
  contactoPrincipalCorreo:'ana@sede-demo.test', contactoPrincipalCelular:'+573007770101',
  valorServicio:180000, periodicidadMeses:1, manejaRefuerzo:false,
  tipoSede:'NEGOCIO', planoStoragePath:null, manejaVehiculos:true,
  generaCertificadoVehiculo:true, vigenciaCertificadoVehiculoMeses:6,
  duracionServicioMinutos:120, activo:true, version:1, areasCount:0, proximoServicio:null,
}

async function syntheticCertificate() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612,792])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  page.drawRectangle({x:38,y:680,width:536,height:74,color:rgb(.05,.15,.23)})
  page.drawText('SOLUCIONES RADICALES', {x:61,y:717,size:18,font:bold,color:rgb(1,1,1)})
  page.drawText('CERTIFICADO VEHICULAR - DEMOSTRACION', {x:61,y:691,size:10,font,color:rgb(.82,.88,.92)})
  page.drawText('Certificado de control integrado de plagas', {x:56,y:633,size:18,font:bold,color:rgb(.09,.17,.24)})
  page.drawText('Cliente: Industrias Demo SAS', {x:56,y:581,size:12,font})
  page.drawText('Sede: Sede Norte', {x:56,y:554,size:12,font})
  page.drawText('Placa del vehiculo: ABC123', {x:56,y:527,size:13,font:bold})
  page.drawText('Servicio: 022', {x:56,y:500,size:12,font})
  page.drawText('Fecha de expedicion: 10/10/2026', {x:56,y:473,size:12,font})
  page.drawText('Fecha de vencimiento: 10/04/2027', {x:56,y:446,size:12,font})
  page.drawLine({start:{x:56,y:425},end:{x:555,y:425},thickness:1,color:rgb(.84,.86,.88)})
  page.drawText('DOCUMENTO FICTICIO PARA EL MANUAL DE USUARIO', {
    x:56,y:402,size:11,font:bold,color:rgb(.12,.47,.69),
  })
  page.drawText('No tiene validez comercial ni sustituye un certificado real.', {x:56,y:382,size:10,font,color:rgb(.35,.39,.44)})
  return Buffer.from(await pdf.save())
}

export async function setupVehicleDemo(page: Page) {
  const vehicles: Vehicle[] = [
    {id:demoVehicleId,siteId:demoSiteId,placa:'ABC123',activo:true,version:1},
    {id:'63000000-0000-4000-8000-000000000002',siteId:demoSiteId,placa:'DEF456',activo:true,version:1},
    {id:'63000000-0000-4000-8000-000000000003',siteId:demoSiteId,placa:'GHI789',activo:false,version:1},
  ]
  const certificate = await syntheticCertificate()
  await page.addInitScript(() => localStorage.setItem('theme','dark'))

  await page.route('**/get-session', async route => {
    await route.fulfill({json:{
      session:{id:'demo-session',userId:'demo-auth',token:'demo-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:'2026-10-08T00:00:00.000Z',updatedAt:'2026-10-08T00:00:00.000Z'},
      user:{id:'demo-auth',name:user.nombreCompleto,email:user.correoGoogle,emailVerified:true,createdAt:'2026-10-08T00:00:00.000Z',updatedAt:'2026-10-08T00:00:00.000Z'},
    }})
  })
  await page.route('**/demo-vehicle-certificate.pdf', async route => {
    await route.fulfill({status:200,contentType:'application/pdf',headers:{'Content-Disposition':'inline'},body:certificate})
  })
  await page.route('https://api.example.test/api/**', async route => {
    const request=route.request()
    const url=new URL(request.url()), path=url.pathname, method=request.method()
    if(method==='OPTIONS') {await route.fulfill({status:204}); return}
    if(path==='/api/session') {await route.fulfill({json:user});return}
    if(path==='/api/clients' && method==='GET') {
      await route.fulfill({json:url.searchParams.get('active')==='false' ? [] : [client]});return
    }
    if(path==='/api/clients/'+demoClientId && method==='GET') {
      await route.fulfill({json:client});return
    }
    if(path==='/api/clients/'+demoClientId+'/sites' && method==='GET') {
      await route.fulfill({json:[site]});return
    }
    if(path==='/api/sites/'+demoSiteId && method==='GET') {
      await route.fulfill({json:site});return
    }
    if(path==='/api/sites/'+demoSiteId+'/vehicles' && method==='GET') {
      await route.fulfill({json:vehicles});return
    }
    if(path==='/api/sites/'+demoSiteId+'/vehicles' && method==='POST') {
      const body=request.postDataJSON() as {placa:string}
      const placa=body.placa.trim().toUpperCase()
      if(vehicles.some(vehicle=>vehicle.placa===placa)) {
        await route.fulfill({status:409,json:{error:'Ya existe un vehículo con esa placa en la Sede.'}});return
      }
      const created={id:'63000000-0000-4000-8000-000000000004',siteId:demoSiteId,placa,activo:true,version:1}
      vehicles.push(created)
      await route.fulfill({status:201,json:created});return
    }
    const vehicleMatch=path.match(/^\/api\/vehicles\/([0-9a-f-]+)$/)
    if(vehicleMatch && method==='PATCH') {
      const record=vehicles.find(vehicle=>vehicle.id===vehicleMatch[1])
      if(!record) {await route.fulfill({status:404,json:{error:'El vehículo no existe'}});return}
      const body=request.postDataJSON() as {placa:string;activo:boolean;version:number}
      if(body.version!==record.version) {
        await route.fulfill({status:409,json:{error:'Los datos han cambiado. Actualiza la lista.',code:'VERSION_CONFLICT'}});return
      }
      record.placa=body.placa.trim().toUpperCase()
      record.activo=body.activo
      record.version++
      await route.fulfill({json:record});return
    }
    if(vehicleMatch && method==='DELETE') {
      if(vehicleMatch[1]===demoVehicleId) {
        await route.fulfill({status:409,json:{error:'Este vehículo tiene historial y no puede eliminarse. Puedes desactivarlo.',code:'DEPENDENCIES'}});return
      }
      const index=vehicles.findIndex(vehicle=>vehicle.id===vehicleMatch[1])
      if(index<0){await route.fulfill({status:404,json:{error:'No existe el vehículo'}});return}
      vehicles.splice(index,1)
      await route.fulfill({status:204});return
    }
    if(path==='/api/sites/'+demoSiteId+'/vehicles/'+demoVehicleId+'/certificates' && method==='GET') {
      await route.fulfill({json:{page:1,hasMore:false,items:[
        {id:certId,serviceId:'65000000-0000-4000-8000-000000000001',solicitud:'022',
          issuedOn:'2026-10-10',expiresOn:'2027-04-10',status:'GENERADO',pdfAvailable:true},
      ]}});return
    }
    if(path==='/api/certificates/documents/'+certId+'/read-url' && method==='POST') {
      const body=request.postDataJSON() as {inline?:boolean}
      await route.fulfill({json:{url:body.inline
        ? 'http://127.0.0.1:5174/demo-vehicle-certificate.pdf'
        : 'http://127.0.0.1:5174/demo-vehicle-certificate.pdf?download=1'}});return
    }
    await route.fulfill({status:404,json:{error:'Ruta no preparada para datos ficticios'}})
  })
}
