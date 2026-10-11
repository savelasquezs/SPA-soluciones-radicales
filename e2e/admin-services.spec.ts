import { test, expect, type Page, type Route } from '@playwright/test'
import type { AdminService, ServiceInput, ServiceLink, ServiceMutation, ServiceSchedule, ServiceTechnician, ServiceWorkspace, UpcomingService } from '../src/types/adminServices'
import { addDateDays, addInstantDays, fromBogotaInput, scheduleEnd, suggestReinforcement, todayBogota, toBogotaInput } from '../src/helpers/adminServices'
import { serviceDateShortcutRange } from '../src/helpers/serviceDateRanges'

const uid=(n: number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const ids={ admin:uid(1),tech:uid(2),other:uid(3),third:uid(4),site:uid(5),client:uid(6),product:uid(7),principal:uid(8),refuerzo:uid(9),upcoming:uid(10) }
const day=todayBogota()
const start=fromBogotaInput(`${day}T09:00`)
const listUrl=`/servicios?from=${day}&to=${addDateDays(day,45)}`
const technician=(id: string,name: string): ServiceTechnician=>({ id,nombreCompleto:name,correoGoogle:`${id}@example.invalid`,activo:true,tieneCertificado:false,certificadoFechaVencimiento:null })
const people=[technician(ids.tech,'Camilo Ruiz'),technician(ids.other,'Ana Torres'),technician(ids.third,'Mateo Díaz')]
const contact={ nombre:'Laura de prueba',celular:'+573000000001',correos:['cliente@example.invalid'] }
const workspace: ServiceWorkspace={
  sedes:[{ id:ids.site,clientId:ids.client,clienteNombre:'Casa Verde',nombre:'Laureles',direccion:'Dirección sintética de prueba',valorServicio:300000,periodicidadMeses:1,duracionServicioMinutos:90,manejaRefuerzo:true,contacto:contact }],
  tecnicos:people,productos:[{ id:ids.product,nombre:'Producto de prueba',principioActivo:'Composición de prueba',dosisAplicacion:'5 mL/L',metodos:[{ codigo:'ASPERSION',nombre:'Aspersión' }],activo:true }],
}
function record(id=ids.principal,kind: 'PRINCIPAL' | 'REFUERZO'='PRINCIPAL'): AdminService {
  const isRef=kind==='REFUERZO', beginning=isRef ? addInstantDays(start,21) : start
  return {
    id,solicitud:isRef ? 'SR-0102' : 'SR-0101',tipoServicio:kind,estado:'PROGRAMADO',version:1,
    inicioProgramado:beginning,finProgramado:new Date(new Date(beginning).getTime()+90*60_000).toISOString(),
    tecnicoResponsableId:ids.tech,tecnicosColaboradoresIds:[ids.other],clientId:ids.client,clienteNombre:'Casa Verde',sedeId:ids.site,sedeNombre:'Laureles',direccion:'Dirección sintética de prueba',
    servicioPrincipalId:isRef ? ids.principal : null,inicioReal:null,finReal:null,responsable:people[0]!,colaboradores:[people[1]!],contacto:contact,
    valorServicio:isRef ? 0 : 300000,observaciones:'',productos:[],refuerzo:null,principal:null,
    pago:{ metodoPago:isRef ? null : 'EFECTIVO',estadoPago:isRef ? 'SIN_REGISTRAR' : 'PENDIENTE',tecnicoRecaudoPrevistoId:isRef ? null : ids.tech,
      recaudadoPorId:null,recaudadoPorNombre:null,pagoFecha:null,confirmadoAt:null,confirmadoPor:null,comprobanteStoragePath:null },
    calendar:{ estado:'SINCRONIZADO',ultimaSyncAt:start,error:null },executionLock:null,motivoCancelacion:null,canceladoAt:null,
  }
}
function link(value: AdminService): ServiceLink {
  const { id,solicitud,tipoServicio,estado,version,inicioProgramado,finProgramado,tecnicoResponsableId,tecnicosColaboradoresIds }=value
  return { id,solicitud,tipoServicio,estado,version,inicioProgramado,finProgramado,tecnicoResponsableId,tecnicosColaboradoresIds }
}
function proposal(): UpcomingService {
  return { id:ids.upcoming,clientId:ids.client,clienteNombre:'Casa Verde',sedeId:ids.site,sedeNombre:'Laureles',direccion:'Dirección sintética de prueba',contacto:contact,
    principalAnteriorId:ids.principal,principalAnteriorSolicitud:'SR-0101',ultimoServicioAt:addInstantDays(start,-25),periodicidadMeses:1,fechaSugerida:addInstantDays(start,5),estado:'PENDIENTE',ultimoContactoAt:null,canalUltimoContacto:null,fechaRecontacto:null,nota:'',version:1,servicioAgendadoId:null,correoEstado:'SIN_ENVIAR',correoError:null }
}
interface Body {
  requestId: string; version: number; input: ServiceInput; programacion: ServiceSchedule;
  refuerzo?: { version: number; programacion: ServiceSchedule }; upcoming?: { id: string; version: number; confirmed: boolean };
  reason?: string; estado?: UpcomingService['estado']; nota?: string; fechaRecontacto?: string | null; contactoRealizado?: 'WHATSAPP' | 'CORREO' | null;
}
async function setup(page: Page, role: 'ADMINISTRADOR' | 'TECNICO'='ADMINISTRADOR') {
  const records=[record(),record(ids.refuerzo,'REFUERZO')]
  let next=proposal(), counter=20, failList=false, conflictOnce=false, lostResponse=false
  const calls: { path: string; method: string; body?: Body; query?: string }[]=[]
  const journal=new Map<string,ServiceMutation>()
  function synchronize(): void {
    for(const item of records) {
      const r=records.find(value=>value.servicioPrincipalId===item.id), p=records.find(value=>value.id===item.servicioPrincipalId)
      item.refuerzo=r ? link(r) : null; item.principal=p ? link(p) : null
    }
  }
  function schedule(item: AdminService, value: ServiceSchedule): void {
    item.inicioProgramado=value.inicioProgramado;item.finProgramado=scheduleEnd(value)
    item.tecnicoResponsableId=value.tecnicoResponsableId;item.tecnicosColaboradoresIds=value.tecnicosColaboradoresIds
    item.responsable=people.find(person=>person.id===value.tecnicoResponsableId)!
    item.colaboradores=people.filter(person=>value.tecnicosColaboradoresIds.includes(person.id));item.version++;item.calendar.estado='PENDIENTE'
  }
  const count=()=>!next.servicioAgendadoId && ['PENDIENTE','CONTACTADO'].includes(next.estado) ? 1 : 0
  const result=(items: AdminService[], upcoming: UpcomingService | null=null): ServiceMutation=>{ synchronize();return structuredClone({ services:items,upcoming,pendingCount:count() }) }
  synchronize()
  await page.route('**/get-session',route=>route.fulfill({ json:{
    session:{ id:'session',userId:'auth-1',token:'e2e-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z' },
    user:{ id:'auth-1',name:'Admin de prueba',email:'admin@example.test',emailVerified:true,createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z' },
  } }))
  const json=(route: Route,value: unknown,status=200)=>route.fulfill({ status,json:value })
  await page.route('https://api.example.test/api/**',async route=>{
    const request=route.request(), url=new URL(request.url()), path=url.pathname, method=request.method()
    if(method==='OPTIONS') { await route.fulfill({ status:204 });return }
    const body=method==='GET' ? undefined : request.postDataJSON() as Body
    calls.push({ path,method,body,query:url.searchParams.toString() })
    if(path==='/api/session') { await json(route,{ id:ids.admin,nombreCompleto:'Admin de prueba',correoGoogle:'admin@example.test',esAdmin:role==='ADMINISTRADOR',esTecnico:role==='TECNICO',rolActivo:role,requiereSeleccionRol:false });return }
    if(path==='/api/certificates/settings') { await json(route,{ templates:[],converterReady:true });return }
    if(path==='/api/clients') { await json(route,url.searchParams.get('active')==='false' ? [] : [{ id:ids.client,nombre:'Casa Verde',tipoCliente:'NEGOCIO',nit:'CI-1',correos:contact.correos,activo:true,version:1,vigenciaCertificadoMeses:12,sedesCount:1 }]);return }
    if(path===`/api/clients/${ids.client}/sites`) { await json(route,[{ ...workspace.sedes[0],id:ids.site,clientId:ids.client,tipoSede:'NEGOCIO',activo:true,version:1,correos:contact.correos,areasCount:0 }]);return }
    if(path===`/api/certificates/services/${ids.principal}/context`) { await json(route,{ serviceId:ids.principal,solicitud:'SR-0101',clientName:'Casa Verde',siteName:'Laureles',recipients:contact.correos,vehicles:[],documents:[],availability:{ ESTABLECIMIENTO:{ available:false,reason:'Configura una plantilla.',templateSource:null },VEHICULO:{ available:false,reason:'Sin vehículos.',templateSource:null } } });return }
    const base='/api/admin/services'
    if(path===`${base}/workspace`) { await json(route,workspace);return }
    if(path===`${base}/pending-count`) { await json(route,{ count:count() });return }
    if(path.startsWith(`${base}/commands/`)) { await json(route,{ result:journal.get(path.split('/').at(-1)!) ?? null });return }
    if(path===`${base}/upcoming`) { await json(route,{ items:next.servicioAgendadoId ? [] : [next],total:next.servicioAgendadoId ? 0 : 1,page:1,pageSize:25,pendingCount:count() });return }
    if(path===`${base}/upcoming/${ids.upcoming}/email-preview`) { await json(route,{ upcoming:next,email:{ to:contact.correos[0],subject:'Confirmación de próxima visita · Casa Verde',text:'Hola, Laura.\n\n¿Nos confirman su disponibilidad para la próxima visita? Esta fecha es una propuesta.\n\nSoluciones Radicales' } });return }
    if(path===`${base}/upcoming/${ids.upcoming}/email`) { next={ ...next,version:next.version+1,correoEstado:'PENDIENTE' };await json(route,{ upcoming:next,pendingCount:count() },202);return }
    if(path===`${base}/upcoming/${ids.upcoming}`) {
      if(method==='PATCH' && body) next={ ...next,estado:body.estado!,nota:body.nota ?? '',fechaRecontacto:body.fechaRecontacto ?? null,version:next.version+1,...body.contactoRealizado ? { ultimoContactoAt:new Date().toISOString(),canalUltimoContacto:body.contactoRealizado } : {} }
      await json(route,method==='GET' ? next : { upcoming:next,pendingCount:count() });return
    }
    if(path===base && method==='GET') {
      if(failList) { failList=false;await json(route,{ error:'No fue posible cargar los servicios.' },500);return }
      synchronize()
      const items=records.filter(item=>{
        const d=toBogotaInput(item.inicioProgramado).slice(0,10)
        return d >= (url.searchParams.get('from') || '') && d <= (url.searchParams.get('to') || '9999') && (url.searchParams.get('tab')!=='history' || ['FINALIZADO','CANCELADO'].includes(item.estado))
      })
      const pageNumber=Number(url.searchParams.get('page') || '1')
      const pageSize=Number(url.searchParams.get('pageSize') || '25')
      await json(route,{ items:items.slice((pageNumber-1)*pageSize,pageNumber*pageSize),total:items.length,page:pageNumber,pageSize,pendingCount:count() });return
    }
    if(path===base && method==='POST' && body) {
      if(journal.has(body.requestId)) { await json(route,journal.get(body.requestId),201);return }
      const created=record(uid(counter++));created.solicitud=`SR-${counter}`;created.tecnicosColaboradoresIds=[]
      schedule(created,body.input.programacion);created.observaciones=body.input.observaciones
      created.productos=body.input.productos.map(product=>({ ...product,id:uid(counter++),nombre:'Producto de prueba',dosis:'5 mL/L',metodoAplicacionNombre:'Aspersión',activo:true,aplicado:false }))
      created.pago={ ...created.pago,...body.input.cobro,
        estadoPago:body.input.cobro.pagado ? 'CONFIRMADO' : body.input.cobro.metodoPago ? 'PENDIENTE' : 'SIN_REGISTRAR',
        recaudadoPorId:body.input.cobro.pagado ? body.input.cobro.recaudadoPorId ?? null : null,
        recaudadoPorNombre:body.input.cobro.pagado && body.input.cobro.recaudadoPorId===ids.admin ? 'Admin de prueba' : null,
      }
      const child=record(uid(counter++),'REFUERZO');child.solicitud=`SR-${counter}`;child.servicioPrincipalId=created.id
      schedule(child,body.input.refuerzo ?? suggestReinforcement(body.input.programacion));records.push(created,child)
      if(body.upcoming) next={ ...next,estado:'CONFIRMADO',servicioAgendadoId:created.id,version:next.version+1 }
      const saved=result([created,child],body.upcoming ? next : null);journal.set(body.requestId,saved)
      if(lostResponse) { lostResponse=false;await route.abort('failed');return }
      await json(route,saved,201);return
    }
    const parts=path.slice(`${base}/`.length).split('/'), item=records.find(value=>value.id===parts[0])
    if(item) {
      if(method==='GET') { synchronize();await json(route,parts[1]==='audit' ? { items:[],total:0,page:1,pageSize:20 } : item);return }
      if(parts[1]==='execution-lock' && parts[2]==='release' && method==='POST') {
        const released=Boolean(item.executionLock);item.executionLock=null
        await json(route,{ serviceId:item.id,released });return
      }
      if(conflictOnce) { conflictOnce=false;item.version++;await json(route,{ error:'Otra persona modificó el registro. Tus cambios se conservan.',code:'VERSION_CONFLICT' },409);return }
      if(method==='PUT' && body) {
        schedule(item,body.input.programacion);item.observaciones=body.input.observaciones
        const child=records.find(value=>value.servicioPrincipalId===item.id)
        if(child && body.input.refuerzo) schedule(child,body.input.refuerzo)
      } else if(parts[1]==='reschedule' && body) {
        schedule(item,body.programacion)
        const child=records.find(value=>value.servicioPrincipalId===item.id)
        if(child && body.refuerzo) schedule(child,body.refuerzo.programacion)
      } else if(parts[1]==='cancel' && body) {
        for(const candidate of records.filter(value=>value.id===item.id || (value.servicioPrincipalId===item.id && value.estado==='PROGRAMADO'))) { candidate.estado='CANCELADO';candidate.version++;candidate.motivoCancelacion=body.reason ?? '';candidate.canceladoAt=new Date().toISOString() }
      } else if(parts[1]==='payment' && body) {
        const pay=body.input as unknown as AdminService['pago']
        item.pago={ ...item.pago,...pay,recaudadoPorNombre:pay.recaudadoPorId===ids.admin ? 'Admin de prueba' : people.find(person=>person.id===pay.recaudadoPorId)?.nombreCompleto ?? null };item.version++
      } else if(parts[1]==='calendar') item.calendar.estado='PENDIENTE'
      await json(route,result(records.filter(value=>value.id===item.id || value.id===item.servicioPrincipalId || value.servicioPrincipalId===item.id)));return
    }
    await json(route,{ error:`Unexpected test endpoint: ${path}` },404)
  })
  return { records,calls,get upcoming(){ return next },failNextList(){ failList=true },conflictNext(){ conflictOnce=true },loseCreateResponse(){ lostResponse=true },journal }
}
async function fillDate(page: Page,selector: string,value: string): Promise<void> {
  const input=page.locator(selector)
  const inputName=await input.getAttribute('name')
  if(inputName?.endsWith('-day')) {
    const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
    if(!match) throw new Error(`Expected DD/MM/YYYY for segmented date: ${value}`)
    const base=inputName.slice(0,-4)
    await input.fill(match[1]!.padStart(2,'0'))
    await page.locator(`[name="${base}-month"]`).fill(match[2]!.padStart(2,'0'))
    await page.locator(`[name="${base}-year"]`).fill(match[3]!)
    await page.locator(`[name="${base}-year"]`).blur()
    return
  }
  await input.fill(value)
  await input.blur()
}
async function selectSiteAndTeam(page: Page): Promise<void> {
  await page.locator('#servicio-cliente').fill('Casa')
  await page.getByRole('listbox',{name:'Cliente'}).getByRole('option',{name:'Casa Verde'}).click()
  await page.locator('#servicio-sede').selectOption(ids.site)
  await page.locator('#programacion-responsable').selectOption(ids.tech)
}

test('clickable team cell reuses the loaded snapshot and multiselect excludes the responsible',async({ page })=>{
  const api=await setup(page);await page.goto(listUrl)
  await page.getByRole('button',{ name:'Cambiar equipo de SR-0101',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Cambiar equipo' })).toBeVisible()
  await page.getByRole('button',{ name:'Colaboradores',exact:true }).click()
  await expect(page.getByRole('listbox',{ name:'Colaboradores',exact:true }).getByRole('option',{ name:/Camilo Ruiz/ })).toHaveCount(0)
  await page.getByRole('listbox',{ name:'Colaboradores',exact:true }).getByRole('option',{ name:/Mateo Díaz/ }).click()
  await page.getByRole('button',{ name:'Colaboradores',exact:true }).click()
  await page.getByRole('button',{ name:'Guardar cambios',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Cambiar equipo' })).toHaveCount(0)
  await expect(page.getByRole('button',{ name:'Cambiar equipo de SR-0101',exact:true })).toContainText('Mateo Díaz')
  expect(api.calls.filter(call=>call.method==='GET' && call.path===`/api/admin/services/${ids.principal}`)).toHaveLength(0)
  expect(api.calls.filter(call=>call.method==='GET' && call.path==='/api/admin/services')).toHaveLength(1)
})

test('creates a complete reviewed pair with custom Refuerzo dates, products and planned cash',async({ page },info)=>{
  const api=await setup(page);await page.goto(listUrl)
  await page.getByRole('button',{ name:'Programar servicio',exact:true }).click()
  await page.getByRole('button',{ name:'Agendar servicio',exact:true }).first().click()
  await expect(page.locator('#servicio-sede')).toHaveAttribute('aria-invalid','true')
  await selectSiteAndTeam(page)
  await page.getByRole('button',{ name:'Productos a utilizar',exact:true }).click()
  await page.getByRole('searchbox',{name:'Buscar productos'}).fill('Prueba')
  await page.getByRole('option',{ name:/Producto de prueba/ }).click()
  await page.getByRole('button',{ name:'Aceptar',exact:true }).click()
  await page.locator('#producto-0-lote').fill('LOTE-2030')
  await expect(page.locator('#producto-0-dosis')).toHaveCount(0)
  await expect(page.locator('#producto-0-metodo')).toHaveCount(0)
  await expect(page.locator('#producto-0-fabricacion')).toHaveCount(0)
  await fillDate(page,'#producto-0-vencimiento','01/12/2035')
  await fillDate(page,'#refuerzo-inicio','04/11/2030 14:00')
  await page.locator('#servicio-metodo').selectOption('EFECTIVO')
  await page.locator('#servicio-recauda').selectOption(ids.other)
  await page.getByLabel('Observaciones para la visita',{ exact:false }).fill('Visita coordinada con el cliente.')
  await page.screenshot({ path:info.outputPath('service-form-light.png'),fullPage:true })
  await page.setViewportSize({ width:390,height:844 })
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path:info.outputPath('service-form-mobile-light.png'),fullPage:true })
  await page.getByRole('button',{ name:'Agendar servicio',exact:true }).first().click()
  await expect(page).toHaveURL(url=>url.pathname==='/servicios')
  await expect.poll(()=>api.calls.filter(value=>value.path==='/api/admin/services' && value.method==='POST').length).toBe(1)
  const call=api.calls.find(value=>value.path==='/api/admin/services' && value.method==='POST')!
  expect(toBogotaInput(call.body!.input.refuerzo!.inicioProgramado)).toBe('2030-11-04T14:00')
  expect(call.body!.input.productos[0]?.lote).toBe('LOTE-2030')
  expect(call.body!.input.productos[0]?.fechaVencimiento).toBe('2035-12-01')
  expect(call.body!.input.productos[0]).not.toHaveProperty('dosis')
  expect(call.body!.input.productos[0]).not.toHaveProperty('metodoAplicacionCodigo')
  expect(call.body!.input.productos[0]).not.toHaveProperty('fechaFabricacion')
  expect(call.body!.input.cobro.tecnicoRecaudoPrevistoId).toBe(ids.other)
  const created=api.records.find(value=>![ids.principal,ids.refuerzo].includes(value.id) && value.tipoServicio==='PRINCIPAL')!
  expect(created.valorServicio).toBe(300000);expect(created.pago.estadoPago).toBe('PENDIENTE');expect(created.pago.recaudadoPorId).toBeNull()
})

test('crea servicio ya pagado en efectivo con receptor Administrador, sin confirmación adicional',async({page})=>{
  const api=await setup(page)
  await page.goto(listUrl)
  await page.getByRole('button',{name:'Programar servicio',exact:true}).click()
  await selectSiteAndTeam(page)
  await page.locator('#servicio-ya-pago').selectOption('SI')
  await page.locator('#servicio-metodo').selectOption('EFECTIVO')
  await expect(page.locator('#servicio-recibio')).toBeVisible()
  await page.locator('#servicio-recibio').selectOption(ids.admin)
  await page.getByRole('button',{name:'Agendar servicio',exact:true}).first().click()
  await expect(page).toHaveURL(url=>url.pathname==='/servicios')
  const call=api.calls.find(x=>x.path==='/api/admin/services'&&x.method==='POST')
  expect(call?.body?.input.cobro).toMatchObject({
    metodoPago:'EFECTIVO',pagado:true,recaudadoPorId:ids.admin,tecnicoRecaudoPrevistoId:null,
  })
  const service=api.records.find(x=>![ids.principal,ids.refuerzo].includes(x.id)&&x.tipoServicio==='PRINCIPAL')
  expect(service?.pago.estadoPago).toBe('CONFIRMADO')
})

test('valida una fecha pasada al programar sin enviar la solicitud al backend',async({page})=>{
  const api=await setup(page)
  await page.goto(listUrl)
  await page.getByRole('button',{name:'Programar servicio',exact:true}).click()
  await selectSiteAndTeam(page)
  await page.locator('#programacion-inicio').fill('01/01/2024 · 10:00')
  await page.locator('#programacion-inicio').blur()
  await expect(page.locator('#programacion-inicio')).toHaveAttribute('aria-invalid','true')
  await page.getByRole('button',{name:'Agendar servicio',exact:true}).first().click()
  expect(api.calls.filter(x=>x.path==='/api/admin/services'&&x.method==='POST')).toHaveLength(0)
})

test('joint reprogramming and independent Refuerzo reprogramming keep separate dates',async({ page })=>{
  const api=await setup(page);await page.goto(listUrl)
  await page.getByRole('button',{ name:'Reprogramar SR-0101',exact:true }).click()
  await fillDate(page,'#programacion-inicio','15/10/2030 10:00')
  await fillDate(page,'#refuerzo-inicio','08/11/2030 15:15')
  await page.getByRole('button',{ name:'Guardar cambios',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Reprogramar servicio' })).toHaveCount(0)
  expect(toBogotaInput(api.records[0]!.inicioProgramado)).toBe('2030-10-15T10:00')
  expect(toBogotaInput(api.records[1]!.inicioProgramado)).toBe('2030-11-08T15:15')
  await page.goto(`/servicios/${ids.refuerzo}`)
  await expect(page.getByRole('navigation',{ name:'Ruta de navegación' }).getByRole('link',{ name:'Servicios',exact:true })).toHaveAttribute('href','/servicios')
  await page.getByRole('button',{ name:'Reprogramar',exact:true }).click()
  await expect(page.locator('#refuerzo-inicio')).toHaveCount(0)
  await fillDate(page,'#programacion-inicio','11/11/2030 11:30')
  await page.getByRole('button',{ name:'Guardar cambios',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Reprogramar Refuerzo' })).toHaveCount(0)
  expect(toBogotaInput(api.records[0]!.inicioProgramado)).toBe('2030-10-15T10:00')
  expect(toBogotaInput(api.records[1]!.inicioProgramado)).toBe('2030-11-11T11:30')
})

test('version conflict preserves the draft until explicitly loading the current snapshot',async({ page })=>{
  const api=await setup(page);await page.goto(listUrl)
  await page.getByRole('button',{ name:'Editar SR-0101',exact:true }).click()
  await page.getByLabel('Observaciones para la visita',{ exact:false }).fill('No perder esta observación')
  api.conflictNext()
  await page.getByRole('button',{ name:'Guardar cambios',exact:true }).first().click()
  await expect(page.getByText('Otra persona modificó el registro. Tus cambios se conservan.',{ exact:true }).first()).toBeVisible()
  await expect(page.getByLabel('Observaciones para la visita',{ exact:false })).toHaveValue('No perder esta observación')
  await expect(page.getByRole('button',{ name:'Guardar cambios',exact:true }).first()).toBeDisabled()
  await page.getByRole('button',{ name:'Revisar versión actual',exact:true }).click()
  await page.getByRole('button',{ name:'Cargar versión actual',exact:true }).click()
  await expect(page.getByLabel('Observaciones para la visita',{ exact:false })).toHaveValue('')
})

test('preagenda preserves the row until creation and sends predefined email only on explicit request',async({ page })=>{
  const api=await setup(page);await page.goto('/servicios?tab=upcoming')
  const row=page.locator(`[data-upcoming-id="${ids.upcoming}"]`)
  await expect(row).toBeVisible()
  expect(api.upcoming.ultimoContactoAt).toBeNull()
  await row.getByRole('button',{ name:'Enviar correo de confirmación',exact:true }).click()
  await expect(page.locator('.svc-email-preview')).toContainText('Esta fecha es una propuesta.')
  expect(api.calls.filter(call=>call.method==='POST' && call.path.endsWith('/email'))).toHaveLength(0)
  await page.getByRole('button',{ name:'Solicitar envío',exact:true }).click()
  await expect(row).toContainText('En cola')
  await row.getByRole('button',{ name:'Agendar',exact:true }).click()
  await expect(page.getByLabel('El cliente confirmó la fecha y la hora de esta visita',{ exact:false })).not.toBeChecked()
  await page.getByRole('button',{ name:'Volver',exact:true }).first().click()
  await expect(row).toBeVisible()
  await row.getByRole('button',{ name:'Agendar',exact:true }).click()
  await page.locator('#programacion-responsable').selectOption(ids.tech)
  await page.getByLabel('El cliente confirmó la fecha y la hora de esta visita',{ exact:false }).check()
  await page.getByRole('button',{ name:'Agendar servicio',exact:true }).first().click()
  await expect(page).toHaveURL(url=>url.pathname==='/servicios' && url.searchParams.get('tab')==='upcoming')
  await expect(row).toHaveCount(0)
  await expect.poll(()=>api.upcoming.servicioAgendadoId).toBeTruthy()
})

test('cancellation requires a reason and cash confirmation requires the actual collector',async({ page })=>{
  const api=await setup(page);await page.goto(listUrl)
  await page.getByRole('button',{ name:'Registrar pago de SR-0101',exact:true }).click()
  await page.locator('#payment-collected-by').selectOption('')
  await page.getByRole('button',{ name:'Confirmar pago',exact:true }).click()
  await expect(page.locator('#payment-collected-by')).toHaveAttribute('aria-invalid','true')
  await page.locator('#payment-collected-by').selectOption(ids.admin)
  await expect(page.locator('#payment-collected-by')).toHaveValue(ids.admin)
  await page.getByRole('button',{ name:'Confirmar pago',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Registrar pago' })).toHaveCount(0)
  expect(api.records[0]!.pago.recaudadoPorId).toBe(ids.admin)
  expect(api.records[0]!.pago.recaudadoPorNombre).toBe('Admin de prueba')
  await page.getByRole('button',{ name:'Cancelar SR-0101',exact:true }).click()
  await page.getByRole('button',{ name:'Cancelar servicio',exact:true }).click()
  await expect(page.locator('#service-cancel-reason')).toHaveAttribute('aria-invalid','true')
  await page.locator('#service-cancel-reason').fill('El cliente solicitó cancelar ambas visitas.')
  await page.getByRole('button',{ name:'Cancelar servicio',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Cancelar servicio' })).toHaveCount(0)
  expect(api.records.every(value=>value.estado==='CANCELADO')).toBe(true)
})

test('admin releases active technician access from the service detail',async({ page })=>{
  const api=await setup(page)
  api.records[0]!.estado='EN_PROCESO'
  api.records[0]!.inicioReal=start
  api.records[0]!.executionLock={ userId:ids.tech,userName:'Camilo Ruiz',acquiredAt:start }
  await page.goto(`/servicios/${ids.principal}`)
  await expect(page.getByText('Edición técnica',{ exact:true })).toBeVisible()
  await expect(page.getByText(/Camilo Ruiz · desde/)).toBeVisible()
  await page.getByRole('button',{ name:'Liberar acceso técnico',exact:true }).click()
  const dialog=page.getByRole('dialog',{ name:'Liberar acceso técnico' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Los datos ya sincronizados se conservan.')
  await dialog.getByRole('button',{ name:'Liberar acceso',exact:true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button',{ name:'Liberar acceso técnico',exact:true })).toHaveCount(0)
  await expect(page.getByText('Acceso técnico liberado. Otro celular ya puede activar el servicio.',{ exact:true })).toBeVisible()
  expect(api.records[0]!.executionLock).toBeNull()
  const call=api.calls.find(value=>value.method==='POST' && value.path===`/api/admin/services/${ids.principal}/execution-lock/release`)
  expect(call?.body?.reason).toContain('Camilo Ruiz')
})

test('lost creation response is recovered from the scoped draft without creating another service',async({ page })=>{
  const api=await setup(page);await page.goto('/servicios/nuevo')
  await selectSiteAndTeam(page)
  await page.getByLabel('Observaciones para la visita',{ exact:false }).fill('Borrador persistente')
  await expect(page.getByRole('status').filter({ hasText:'Borrador guardado' })).toBeVisible()
  api.loseCreateResponse()
  await page.getByRole('button',{ name:'Agendar servicio',exact:true }).first().click()
  await expect.poll(()=>api.journal.size).toBe(1)
  await page.reload()
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}$/)
  expect(api.records).toHaveLength(4)
  expect(api.calls.filter(call=>call.method==='POST' && call.path==='/api/admin/services')).toHaveLength(1)
})

test('quick date ranges update the URL and expose the active selection',async({ page })=>{
  await setup(page);await page.goto('/servicios')
  const today=todayBogota()
  const cases=[
    ['Ayer','yesterday'],['Hoy','today'],['Mañana','tomorrow'],['Esta semana','week'],['Este mes','month'],
  ] as const
  for(const [label,id] of cases) {
    await page.getByRole('button',{ name:label,exact:true }).click()
    const expected=serviceDateShortcutRange(id,today)
    await expect(page).toHaveURL(url=>url.pathname==='/servicios' && url.searchParams.get('from')===expected.from && url.searchParams.get('to')===expected.to)
    await expect(page.getByRole('button',{ name:label,exact:true })).toHaveAttribute('aria-pressed','true')
  }
})

test('weekly calendar expands its time grid and reveals operational detail on hover',async({ page })=>{
  const api=await setup(page)
  api.records[0]!.inicioProgramado=fromBogotaInput(`${day}T07:30`)
  api.records[0]!.finProgramado=fromBogotaInput(`${day}T09:00`)
  api.records[1]!.inicioProgramado=fromBogotaInput(`${day}T21:30`)
  api.records[1]!.finProgramado=fromBogotaInput(`${day}T22:30`)
  await page.goto(`/servicios?view=week&from=${day}`)
  const calendar=page.getByRole('region',{ name:'Agenda semanal por horas' })
  await expect(calendar).toBeVisible()
  await expect(calendar.locator('.svc-week-calendar__hour-label').first()).toContainText('7:00')
  await expect(calendar.locator('.svc-week-calendar__hour-label').last()).toContainText('10:00')
  const event=calendar.locator('.svc-week-calendar__event').first()
  await expect(event).toContainText('Casa Verde')
  await event.hover()
  const popover=event.locator('.svc-week-calendar__popover')
  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Dirección sintética de prueba')
  await expect(popover).toContainText('Técnico: Camilo Ruiz')
  await expect(popover).toContainText('Programado')
})

test('error retry, compact desktop, dark mode and mobile do not overflow the page',async({ page },info)=>{
  const api=await setup(page);api.failNextList()
  await page.setViewportSize({ width:1440,height:1024 });await page.goto(listUrl)
  await expect(page.getByText('No fue posible cargar la lista',{ exact:true })).toBeVisible()
  await page.getByRole('button',{ name:'Reintentar',exact:true }).click()
  await expect(page.locator(`[data-service-id="${ids.principal}"]`)).toBeVisible()
  const filterTops=await page.locator('.svc-filters > .base-field, .svc-date-filter .base-field').evaluateAll(elements=>elements.map(element=>Math.round(element.getBoundingClientRect().top)))
  expect(Math.max(...filterTops)-Math.min(...filterTops)).toBeLessThanOrEqual(2)
  const dateControlBottom=await page.locator('.svc-date-filter .date-range-control').evaluate(element=>Math.round(element.getBoundingClientRect().bottom))
  const shortcutTop=await page.getByRole('group',{ name:'Rangos rápidos de fecha' }).evaluate(element=>Math.round(element.getBoundingClientRect().top))
  expect(shortcutTop).toBeGreaterThan(dateControlBottom)
  await page.screenshot({ path:info.outputPath('services-desktop-light.png'),fullPage:true })
  await page.evaluate(()=>{ document.documentElement.dataset.theme='dark' })
  await page.screenshot({ path:info.outputPath('services-desktop-dark.png'),fullPage:true })
  await page.setViewportSize({ width:390,height:844 })
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true)
  await page.screenshot({ path:info.outputPath('services-mobile-dark.png'),fullPage:true })
  await page.getByRole('tab',{ name:/Próximos por confirmar/ }).click()
  await expect(page.locator(`[data-upcoming-id="${ids.upcoming}"]`)).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true)
  await page.screenshot({ path:info.outputPath('upcoming-mobile-dark.png'),fullPage:true })
})

test('technician role cannot enter administrator creation or call admin endpoints',async({ page })=>{
  const api=await setup(page,'TECNICO');await page.goto('/servicios/nuevo')
  await expect(page).not.toHaveURL(/\/servicios\/nuevo/)
  expect(api.calls.filter(call=>call.path.startsWith('/api/admin/services'))).toHaveLength(0)
})


test('opens certificates with the finalized service already selected without a history scan',async({ page })=>{
  const api=await setup(page)
  api.records[0]!.estado='FINALIZADO';api.records[0]!.inicioReal=start;api.records[0]!.finReal=api.records[0]!.finProgramado
  await page.goto(`/servicios/${ids.principal}`)
  await page.getByRole('button',{ name:'Generar y consultar certificados',exact:true }).click()
  await expect(page.locator('#cert-service')).toHaveValue(ids.principal)
  await expect(page.locator('#cert-business')).toHaveValue(ids.client)
  await expect(page.locator('#cert-site')).toHaveValue(ids.site)
  expect(api.calls.filter(call=>call.path==='/api/certificates/services')).toHaveLength(0)
  expect(api.calls.filter(call=>call.method==='POST')).toHaveLength(0)
})


test('weekly calendar confirms drag rescheduling, preserves the Refuerzo, and never saves on cancel',async({ page })=>{
  const api=await setup(page)
  const weekStart=addDateDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)+7)
  const old=fromBogotaInput(weekStart+'T09:00')
  api.records[0]!.inicioProgramado=old
  api.records[0]!.finProgramado=scheduleEnd({ inicioProgramado:old,duracionMinutos:90 })
  const childStart=api.records[1]!.inicioProgramado
  await page.goto('/agenda?view=week&from='+weekStart)
  const source=page.locator('.svc-week-calendar__event[data-service-id="'+ids.principal+'"]')
  const destination=page.locator('.svc-week-calendar__day[data-date="'+addDateDays(weekStart,1)+'"]')
  await source.dragTo(destination,{ sourcePosition:{ x:12,y:12 },targetPosition:{ x:35,y:150 } })
  const dialog=page.getByRole('dialog',{ name:'Confirmar nueva fecha' })
  await expect(dialog).toBeVisible()
  expect(api.calls.filter(call=>call.method==='POST' && call.path.endsWith('/reschedule'))).toHaveLength(0)
  await dialog.getByRole('button',{ name:'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.records[0]!.inicioProgramado).toBe(old)
  await source.dragTo(destination,{ sourcePosition:{ x:12,y:12 },targetPosition:{ x:35,y:150 } })
  await expect(dialog).toContainText('El Refuerzo conservará su fecha')
  await dialog.getByRole('button',{ name:'Mover servicio' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(()=>api.calls.filter(call=>call.method==='POST' && call.path.endsWith('/reschedule')).length).toBe(1)
  const request=api.calls.find(call=>call.method==='POST' && call.path.endsWith('/reschedule'))!
  expect(toBogotaInput(request.body!.programacion.inicioProgramado).slice(0,10)).toBe(addDateDays(weekStart,1))
  expect(request.body!.programacion.duracionMinutos).toBe(90)
  expect(request.body!.refuerzo).toBeUndefined()
  expect(api.records[1]!.inicioProgramado).toBe(childStart)
})

test('weekly calendar opens quick rescheduling and prefills creation from an empty hour',async({ page })=>{
  const api=await setup(page)
  const weekStart=addDateDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)+7)
  const scheduled=fromBogotaInput(weekStart+'T09:00')
  api.records[0]!.inicioProgramado=scheduled
  api.records[0]!.finProgramado=scheduleEnd({ inicioProgramado:scheduled,duracionMinutos:90 })
  await page.goto('/agenda?view=week&from='+weekStart)
  await page.getByRole('button',{ name:/Reprogramar SR-0101/ }).click()
  await expect(page.getByRole('dialog',{ name:'Reprogramar servicio' })).toBeVisible()
  await page.getByRole('dialog',{ name:'Reprogramar servicio' }).getByRole('button',{ name:'Volver' }).click()
  const target=addDateDays(weekStart,2)
  await page.locator('.svc-week-calendar__slot-target[data-date="'+target+'"]').click({ position:{ x:25,y:160 } })
  await expect(page).toHaveURL(/\/servicios\/nuevo/)
  const requested=new URL(page.url()).searchParams.get('start')
  expect(requested).toBeTruthy()
  expect(toBogotaInput(requested!).slice(0,10)).toBe(target)
  await expect(page.locator('#programacion-inicio')).toHaveValue(new RegExp(toBogotaInput(requested!).slice(11,16)))
})


test('mobile service cards are dense and preserve the actions for a programmed visit',async({page},info)=>{
  await setup(page)
  await page.setViewportSize({width:390,height:844})
  await page.goto(listUrl)
  const cards=page.locator('.svc-table-region--services [data-service-id]')
  await expect(cards).toHaveCount(2)
  const first=cards.filter({has:page.getByRole('link',{name:/Casa Verde/})}).first()
  await expect(first).toBeVisible()
  await expect(first.locator('.svc-record-date-mobile')).toBeVisible()
  await expect(first.locator('.svc-mobile-service-meta')).toContainText('Principal')
  await expect(first.locator('.svc-record-kind')).toBeHidden()
  await expect(first.locator('.svc-record-contact')).toContainText('300')
  await expect(first.locator('.svc-record-payment')).toContainText('300.000')
  await expect.poll(()=>first.evaluate(node=>Math.round(node.getBoundingClientRect().height))).toBeLessThanOrEqual(235)
  await first.getByRole('button',{name:'Acciones de SR-0101'}).click()
  const actions=page.getByRole('dialog',{name:'Acciones · SR-0101'})
  await expect(actions).toBeVisible()
  await expect(actions.getByRole('button',{name:'Reprogramar'})).toBeVisible()
  await expect(actions.getByRole('button',{name:'Cambiar equipo'})).toBeVisible()
  await expect(actions.getByRole('button',{name:'Editar servicio'})).toBeVisible()
  await expect(actions.getByRole('button',{name:'Registrar pago'})).toBeVisible()
  await expect(actions.getByRole('button',{name:'Cancelar servicio'})).toBeVisible()
  await actions.getByRole('button',{name:'Reprogramar'}).click()
  await expect(page.getByRole('dialog',{name:'Reprogramar servicio'})).toBeVisible()
  await page.getByRole('dialog',{name:'Reprogramar servicio'}).getByRole('button',{name:'Volver'}).click()
  await page.screenshot({path:info.outputPath('services-compact-mobile-dark.png'),fullPage:true})
})

test('mobile date and advanced filters stay compact, with responsive layout and URL state',async({page},info)=>{
  await setup(page)
  await page.setViewportSize({width:390,height:844})
  await page.goto(listUrl)
  await expect(page.getByRole('button',{name:/Filtros/})).toBeVisible()
  await expect(page.getByRole('combobox',{name:'Estado'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Fechas anteriores'})).toBeVisible()
  await page.getByRole('button',{name:/Filtros/}).click()
  await expect(page.getByRole('combobox',{name:'Estado'})).toBeVisible()
  await expect(page.getByRole('combobox',{name:'Tipo'})).toBeVisible()
  await expect(page.getByRole('combobox',{name:'Técnico'})).toBeVisible()
  await page.getByRole('combobox',{name:'Estado'}).selectOption('PROGRAMADO')
  await expect(page.getByRole('button',{name:'Filtros (1)'})).toBeVisible()
  await expect(page).toHaveURL(/estado=PROGRAMADO/)
  await page.getByRole('button',{name:'Limpiar filtros'}).click()
  await expect(page.getByRole('combobox',{name:'Estado'})).toHaveCount(0)
  await expect(page).not.toHaveURL(/estado=PROGRAMADO/)
  await page.getByRole('button',{name:'Fechas anteriores'}).click()
  await expect(page).toHaveURL(new RegExp('from='+addDateDays(day,-1)))
  await page.getByRole('button',{name:'Fechas siguientes'}).click()
  await expect(page).toHaveURL(new RegExp('from='+day))
  await page.locator('.svc-mobile-datebar__range').click()
  await expect(page.getByRole('group',{name:'Rangos rápidos de fecha'})).toBeVisible()
  await page.getByRole('button',{name:'Hoy',exact:true}).click()
  await expect(page.getByRole('group',{name:'Rangos rápidos de fecha'})).toHaveCount(0)
  for(const width of [320,360,390,768]) {
    await page.setViewportSize({width,height:844})
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  }
  await page.setViewportSize({width:390,height:844})
  await page.evaluate(()=>{document.documentElement.dataset.theme='light'})
  await page.screenshot({path:info.outputPath('services-compact-mobile-light.png'),fullPage:true})
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark'})
  await page.screenshot({path:info.outputPath('services-compact-mobile-dark.png'),fullPage:true})
})


test('extra compact mobile spacing preserves service and upcoming access',async({page},info)=>{
  await setup(page)
  await page.setViewportSize({width:390,height:844})
  await page.goto(listUrl)
  const services=page.locator('.svc-table-region--services [data-service-id]')
  await expect(services).toHaveCount(2)
  await expect.poll(()=>services.first().evaluate(node=>Math.round(node.getBoundingClientRect().height))).toBeLessThanOrEqual(220)
  await expect(services.first().getByRole('button',{name:'Acciones de SR-0101'})).toBeVisible()
  await page.getByRole('tab',{name:/Próximos por confirmar/}).click()
  const upcoming=page.locator('.svc-table-region--upcoming [data-upcoming-id]')
  await expect(upcoming).toBeVisible()
  await expect(upcoming.locator('[data-label="Cliente y sede"]')).toContainText('Casa Verde')
  await expect(upcoming.locator('[data-label="Seguimiento"]')).toContainText('Pendiente')
  await expect(upcoming.getByRole('button',{name:'Agendar'})).toBeVisible()
  await expect.poll(()=>upcoming.evaluate(node=>Math.round(node.getBoundingClientRect().height))).toBeLessThanOrEqual(285)
  await page.screenshot({path:info.outputPath('upcoming-compact-spacing-mobile.png'),fullPage:true})
  await page.setViewportSize({width:320,height:844})
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  await expect.poll(()=>upcoming.evaluate(node=>Math.round(node.getBoundingClientRect().height))).toBeLessThanOrEqual(335)
})


test('mobile week defaults to the first occupied day and switches dates without refetching',async({page},info)=>{
  const api=await setup(page)
  await page.setViewportSize({width:390,height:844})
  const weekStart=addDateDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)+7)
  const tuesday=addDateDays(weekStart,1),thursday=addDateDays(weekStart,3)
  api.records[0]!.inicioProgramado=fromBogotaInput(tuesday+'T09:00')
  api.records[0]!.finProgramado=fromBogotaInput(tuesday+'T10:30')
  api.records[1]!.inicioProgramado=fromBogotaInput(thursday+'T11:30')
  api.records[1]!.finProgramado=fromBogotaInput(thursday+'T12:00')
  await page.goto('/agenda?view=week&from='+weekStart)
  const strip=page.getByRole('navigation',{name:'Días de la semana'})
  await expect(strip).toBeVisible()
  await expect(strip.locator('[aria-pressed="true"]')).toHaveAttribute('data-date',tuesday)
  await expect(page.getByRole('region',{name:'Servicios del día'})).toContainText('Casa Verde')
  await expect(page.getByRole('region',{name:'Servicios del día'})).toContainText('09:00')
  const before=api.calls.filter(call=>call.method==='GET' && call.path==='/api/admin/services').length
  await strip.locator('[data-date="'+thursday+'"]').click()
  await expect(page).toHaveURL(new RegExp('day='+thursday))
  await expect(strip.locator('[aria-pressed="true"]')).toHaveAttribute('data-date',thursday)
  await expect(page.getByRole('region',{name:'Servicios del día'})).toContainText('11:30')
  expect(api.calls.filter(call=>call.method==='GET' && call.path==='/api/admin/services')).toHaveLength(before)
  await page.getByRole('button',{name:'Horario',exact:true}).click()
  const timeline=page.getByRole('region',{name:'Horario del día'})
  await expect(timeline).toBeVisible()
  await expect(timeline.locator('.svc-week-calendar__day')).toHaveCount(1)
  await expect(timeline.locator('[data-service-id="'+ids.refuerzo+'"]')).toBeVisible()
  await page.getByRole('button',{name:'Lista',exact:true}).click()
  await expect(page.getByRole('region',{name:'Servicios del día'})).toBeVisible()
  await expect(strip.locator('[aria-pressed="true"]')).toHaveAttribute('data-date',thursday)
  await page.screenshot({path:info.outputPath('mobile-week-day-list.png'),fullPage:true})
  for(const width of [320,360,390]) {
    await page.setViewportSize({width,height:844})
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  }
})

test('mobile week keeps selected date for creation and return navigation',async({page})=>{
  await setup(page)
  await page.setViewportSize({width:390,height:844})
  const weekStart=addDateDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)+7)
  const emptyDay=addDateDays(weekStart,4)
  await page.goto('/agenda?view=week&from='+weekStart)
  await page.locator('.svc-day-strip__day[data-date="'+emptyDay+'"]').click()
  await expect(page.getByRole('region',{name:'Servicios del día'})).toContainText('No hay servicios')
  await page.getByRole('button',{name:'Programar servicio',exact:true}).click()
  await expect(page).toHaveURL(/\/servicios\/nuevo/)
  const url=new URL(page.url())
  const requested=url.searchParams.get('start')
  expect(requested).toBeTruthy()
  expect(toBogotaInput(requested!).slice(0,10)).toBe(emptyDay)
  expect(decodeURIComponent(url.searchParams.get('returnTo') ?? '')).toContain('day='+emptyDay)
  await page.getByRole('button',{name:'Volver',exact:true}).first().click()
  await expect(page).toHaveURL(new RegExp('day='+emptyDay))
  await expect(page.locator('.svc-day-strip__day[aria-pressed="true"]')).toHaveAttribute('data-date',emptyDay)
})

test('short mobile timeline events remain accessible while desktop uses seven columns',async({page})=>{
  const api=await setup(page)
  const weekStart=addDateDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)+7)
  const target=addDateDays(weekStart,2)
  for(const [index,minutes] of [15,30].entries()){
    const item=api.records[index]!
    item.inicioProgramado=fromBogotaInput(target+'T08:'+String(index*15).padStart(2,'0'))
    item.finProgramado=new Date(new Date(item.inicioProgramado).getTime()+minutes*60_000).toISOString()
  }
  await page.setViewportSize({width:320,height:844})
  await page.goto('/agenda?view=week&from='+weekStart+'&day='+target+'&mobileView=hours')
  const timeline=page.getByRole('region',{name:'Horario del día'})
  await expect(timeline.locator('.svc-week-calendar__day')).toHaveCount(1)
  await expect(timeline.locator('.svc-week-calendar__event-main--brief')).toHaveCount(2)
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
  await timeline.getByRole('button',{name:/Reprogramar SR-0101/}).click()
  await expect(page.getByRole('dialog',{name:'Reprogramar servicio'})).toBeVisible()
  await page.getByRole('dialog',{name:'Reprogramar servicio'}).getByRole('button',{name:'Volver'}).click()
  await page.setViewportSize({width:1440,height:900})
  const weekly=page.getByRole('region',{name:'Agenda semanal por horas'})
  await expect(weekly).toBeVisible()
  await expect(weekly.locator('.svc-week-calendar__day')).toHaveCount(7)
})

test('weekly view fetches beyond 100 services so no selected day is falsely empty',async({page})=>{
  const api=await setup(page)
  const weekStart=addDateDays(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7)+7)
  const target=addDateDays(weekStart,4)
  for(let index=0;index<105;index++){
    const item=record(uid(500+index))
    item.solicitud='SR-'+String(500+index)
    item.inicioProgramado=fromBogotaInput(target+'T'+String(9+Math.floor(index/60)).padStart(2,'0')+':'+String(index%60).padStart(2,'0'))
    item.finProgramado=new Date(new Date(item.inicioProgramado).getTime()+15*60_000).toISOString()
    api.records.push(item)
  }
  await page.setViewportSize({width:390,height:844})
  await page.goto('/agenda?view=week&from='+weekStart)
  await expect(page.locator('.svc-day-strip__day[data-date="'+target+'"]')).toHaveAttribute('aria-label',/105 servicios/)
  await expect(page.locator('.svc-day-list__items [data-service-id]')).toHaveCount(105)
  expect(api.calls.some(call=>call.path==='/api/admin/services' && call.query?.includes('page=2'))).toBe(true)
  await page.locator('.svc-day-strip__day[data-date="'+target+'"]').click()
  await expect(page.locator('.svc-day-list__items [data-service-id]')).toHaveCount(105)
})
