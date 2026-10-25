import type { Page } from '@playwright/test'

export const demoClientId='71000000-0000-4000-8000-000000000001'
export const demoSiteId='72000000-0000-4000-8000-000000000001'
const kitchenId='73000000-0000-4000-8000-000000000001'
const patioId='73000000-0000-4000-8000-000000000002'
const bodegaId='73000000-0000-4000-8000-000000000003'
const addedId='73000000-0000-4000-8000-000000000004'

type Area={id:string;siteId:string;nombre:string;esExterna:boolean;activo:boolean;version:number;dispositivosCount:number}
const areas:Area[]=[
  {id:kitchenId,siteId:demoSiteId,nombre:'Cocina',esExterna:false,activo:true,version:1,dispositivosCount:2},
  {id:patioId,siteId:demoSiteId,nombre:'Patio',esExterna:true,activo:true,version:1,dispositivosCount:0},
  {id:bodegaId,siteId:demoSiteId,nombre:'Bodega',esExterna:false,activo:false,version:1,dispositivosCount:1},
]
const profile={
 id:'90000000-0000-4000-8000-000000000001',nombreCompleto:'Administrador de demostración',
 correoGoogle:'demo@solucionesradicales.test',esAdmin:true,esTecnico:false,
 rolActivo:'ADMINISTRADOR',requiereSeleccionRol:false,
}
const client={
  id:demoClientId,tipoCliente:'NEGOCIO',nombre:'Industrias Demo SAS',
  nit:'901777000',correos:['administracion@industrias-demo.test'],activo:true,
  version:1,vigenciaCertificadoMeses:12,residenciaDireccion:null,residenciaCelular:null,
  residenciaValorServicio:null,sedesCount:1,
}
const site={
  id:demoSiteId,clientId:demoClientId,nombre:'Sede Norte',direccion:'Calle 50 # 20-30',
  correos:[],heredaCorreosCliente:true,contactoPrincipalNombre:'Ana Demostración',
  contactoPrincipalCorreo:'ana@sede-demo.test',contactoPrincipalCelular:'+573007770101',
  valorServicio:180000,periodicidadMeses:1,manejaRefuerzo:false,tipoSede:'NEGOCIO',
  planoStoragePath:null,manejaVehiculos:false,generaCertificadoVehiculo:false,
  vigenciaCertificadoVehiculoMeses:null,duracionServicioMinutos:120,
  activo:true,version:1,areasCount:3,proximoServicio:null,
}
export async function setupAreaDemo(page:Page) {
  await page.addInitScript(()=>localStorage.setItem('theme','dark'))
  await page.route('**/get-session',async route=>{
    await route.fulfill({json:{
      session:{id:'demo-session',userId:'demo-auth',token:'demo-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:'2026-10-08T00:00:00.000Z',updatedAt:'2026-10-08T00:00:00.000Z'},
      user:{id:'demo-auth',name:profile.nombreCompleto,email:profile.correoGoogle,emailVerified:true,createdAt:'2026-10-08T00:00:00.000Z',updatedAt:'2026-10-08T00:00:00.000Z'},
    }})
  })
  await page.route('https://api.example.test/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
    if(method==='OPTIONS'){await route.fulfill({status:204});return}
    if(path==='/api/session'){await route.fulfill({json:profile});return}
    if(path==='/api/clients' && method==='GET'){
      await route.fulfill({json:url.searchParams.get('active')==='false'?[]:[client]});return
    }
    if(path==='/api/clients/'+demoClientId && method==='GET'){
      await route.fulfill({json:client});return
    }
    if(path==='/api/clients/'+demoClientId+'/sites' && method==='GET'){
      await route.fulfill({json:[site]});return
    }
    if(path==='/api/sites/'+demoSiteId && method==='GET'){
      await route.fulfill({json:{...site,areasCount:areas.length}});return
    }
    if(path==='/api/sites/'+demoSiteId+'/areas' && method==='GET'){
      await route.fulfill({json:areas.toSorted((a,b)=>Number(b.activo)-Number(a.activo)||a.nombre.localeCompare(b.nombre,'es'))});return
    }
    if(path==='/api/sites/'+demoSiteId+'/areas' && method==='POST'){
      const input=req.postDataJSON() as {nombre:string;esExterna:boolean;activo:boolean}
      if(areas.some(a=>a.nombre.toLowerCase()===input.nombre.trim().toLowerCase())){
        await route.fulfill({status:409,json:{error:'Ya existe un Área con ese nombre en la Sede.'}});return
      }
      const created:Area={
        id:addedId,siteId:demoSiteId,nombre:input.nombre.trim(),esExterna:input.esExterna,
        activo:input.activo,version:1,dispositivosCount:0,
      }
      areas.push(created)
      await route.fulfill({status:201,json:created});return
    }
    const match=path.match(/^\/api\/areas\/([0-9a-f-]+)$/)
    if(match && method==='PATCH'){
      const row=areas.find(a=>a.id===match[1])
      if(!row){await route.fulfill({status:404,json:{error:'El Área no existe'}});return}
      const body=req.postDataJSON() as {nombre:string;esExterna:boolean;activo:boolean;version:number}
      if(body.version!==row.version){
        await route.fulfill({status:409,json:{error:'La información cambió. Actualiza la lista.',code:'VERSION_CONFLICT'}});return
      }
      Object.assign(row,{nombre:body.nombre.trim(),esExterna:body.esExterna,activo:body.activo,version:row.version+1})
      await route.fulfill({json:row});return
    }
    if(match && method==='DELETE'){
      const row=areas.find(a=>a.id===match[1])
      if(!row){await route.fulfill({status:404,json:{error:'El Área no existe'}});return}
      if(row.dispositivosCount>0){
        await route.fulfill({status:409,json:{error:'El Área tiene historial o dependencias y no puede eliminarse. Puedes desactivarla.',code:'DEPENDENCIES'}});return
      }
      const index=areas.indexOf(row);areas.splice(index,1)
      await route.fulfill({status:204});return
    }
    await route.fulfill({status:404,json:{error:'Ruta de demostración no preparada'}})
  })
}
