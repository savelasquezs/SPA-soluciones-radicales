import { expect,test,type Page } from '@playwright/test'
import { addDateDays,todayBogota } from '../src/helpers/adminServices'
import type { TechnicianServiceSummary } from '../src/types/technicianServices'

const uid=(n:number)=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0')
const now='2026-10-20T15:00:00.000Z'
function monday(day:string){
  return addDateDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7))
}
const today=todayBogota()
function service(n:number,estado:TechnicianServiceSummary['estado'],day=today,
  tipoServicio:TechnicianServiceSummary['tipoServicio']='PRINCIPAL'):TechnicianServiceSummary{
  return {
    id:uid(n),solicitud:'SR-'+String(n).padStart(5,'0'),tipoServicio,estado,version:1,
    inicioProgramado:day+'T14:00:00.000Z',finProgramado:day+'T15:00:00.000Z',
    inicioReal:estado==='PROGRAMADO'?null:day+'T14:00:00.000Z',
    finReal:estado==='FINALIZADO'?day+'T15:00:00.000Z':null,
    clienteNombre:'Cliente '+n,sedeNombre:'Sede '+n,direccion:'Dirección de prueba',
    contactoPrincipalNombre:'Contacto '+n,contactoPrincipalCelular:'+573001112233',
    contactoPrincipalCorreo:'contacto@example.test',
    contactEmails:['contacto@example.test','gerencia@example.test'],
    autoPrepareEligible:false,
  }
}
async function setup(page:Page){
  const requests:string[]=[]
  const pending=[
    service(1,'EN_PROCESO'),service(2,'PROGRAMADO',addDateDays(today,1)),
    service(3,'PROGRAMADO',addDateDays(today,2)),
    service(4,'PROGRAMADO',addDateDays(today,3)),
    service(5,'PROGRAMADO',addDateDays(today,4)),
    service(6,'FINALIZADO',addDateDays(today,-1)),
  ]
  const historical=Array.from({length:22},(_,i)=>service(i+30,'FINALIZADO',addDateDays(today,-i-1)))
  const agenda=[
    service(1,'EN_PROCESO'),
    service(11,'PROGRAMADO',today,'REFUERZO'),
    service(2,'PROGRAMADO',addDateDays(today,1)),
  ]
  await page.route('**/get-session',route=>route.fulfill({json:{
    session:{id:'session-tech',userId:'auth-tech',token:'e2e-token',expiresAt:'2099-01-01T00:00:00.000Z',
      createdAt:now,updatedAt:now},
    user:{id:'auth-tech',name:'Ana Técnica',email:'ana@example.test',emailVerified:true,createdAt:now,updatedAt:now}
  }}))
  await page.route('https://api.example.test/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204});return}
    if(path==='/api/session'){
      await route.fulfill({json:{id:uid(99),nombreCompleto:'Ana Técnica',correoGoogle:'ana@example.test',
        esAdmin:false,esTecnico:true,rolActivo:'TECNICO',requiereSeleccionRol:false}});return
    }
    if(path.startsWith('/api/technician/')){
      requests.push(path+url.search)
      if(path==='/api/technician/services'){
        await route.fulfill({json:pending});return
      }
      if(path==='/api/technician/services/history'){
        const pg=Number(url.searchParams.get('page')||1)
        const q=url.searchParams.get('q')?.toLowerCase()||''
        const matches=historical.filter(x=>
          [x.solicitud,x.clienteNombre,x.sedeNombre].join(' ').toLowerCase().includes(q))
        await route.fulfill({json:{items:matches.slice((pg-1)*20,pg*20),total:matches.length,page:pg,pageSize:20}});return
      }
      if(path==='/api/technician/services/'+uid(11)+'/contact'){
        await route.fulfill({json:agenda[1]});return
      }
      if(path==='/api/technician/services/agenda'){
        const start=url.searchParams.get('from')||'',end=url.searchParams.get('to')||''
        await route.fulfill({json:agenda.filter(x=>x.inicioProgramado.slice(0,10)>=start&&x.inicioProgramado.slice(0,10)<=end)});return
      }
      if(path==='/api/technician/dashboard'){await route.fulfill({json:{}});return}
    }
    await route.fulfill({status:404,json:{error:'Unexpected endpoint: '+path}})
  })
  return {requests,pending,historical}
}
test('five compact pending cards fit in one 390px-wide viewport and history is separate',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  const {requests}=await setup(page)
  await page.goto('/servicios')
  await expect(page.getByRole('heading',{name:'Mis servicios'})).toBeVisible()
  await expect(page.getByRole('tab',{name:/Pendientes/})).toHaveAttribute('aria-selected','true')
  await expect(page.locator('.technician-service-card')).toHaveCount(5)
  await expect(page.getByText('Cliente 6')).toHaveCount(0)
  const bounds=await page.locator('.technician-service-card').last().boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.getByRole('tab',{name:'Historial'}).click()
  await expect(page.getByText('Cliente 30')).toBeVisible()
  await expect(page.getByText('Página 1 de 2')).toBeVisible()
  await page.getByRole('button',{name:'Siguiente'}).click()
  await expect(page.getByText('Página 2 de 2')).toBeVisible()
  await expect.poll(()=>requests.some(x=>x.includes('/history?page=2'))).toBe(true)
  await page.getByLabel('Buscar servicio').fill('Cliente 41')
  await expect.poll(()=>requests.some(x=>x.includes('q=Cliente+41'))).toBe(true)
})
test('technician agenda shows weekly assignments including read-only reinforcements',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  const {requests}=await setup(page)
  await page.goto('/agenda')
  await expect(page.getByRole('heading',{name:'Mi agenda'})).toBeVisible()
  await expect(page.getByRole('navigation',{name:'Días de la semana'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Cliente 1',exact:true}).first()).toBeVisible()
  await expect(page.getByText('Refuerzo (solo consulta)').first()).toBeVisible()
  await expect(page.getByRole('button',{name:'Ver cliente'}).first()).toBeVisible()
  await page.getByRole('button',{name:'Ver cliente'}).first().click()
  await expect(page).toHaveURL(new RegExp('/servicios/'+uid(11)+'/cliente'))
  await expect(page.getByRole('heading',{name:'Datos del cliente'})).toBeVisible()
  await expect(page.getByText('Refuerzo · información de solo consulta.',{exact:false})).toBeVisible()
  await expect(page.getByText('Contacto 11')).toBeVisible()
  await expect(page.getByRole('link',{name:/Hablar por WhatsApp con/})).toHaveAttribute('href','https://wa.me/573001112233')
  await expect(page.getByRole('link',{name:'Llamar'})).toHaveAttribute('href','tel:+573001112233')
  await expect(page.getByRole('link',{name:'contacto@example.test'})).toHaveAttribute('href','mailto:contacto%40example.test')
  await expect(page.getByRole('button',{name:'Iniciar servicio'})).toHaveCount(0)
  await page.goto('/agenda')
  await expect(page.getByRole('button',{name:'Continuar'}).first()).toBeVisible()
  const week=monday(today)
  expect(requests.some(x=>x.includes('/agenda?from='+week))).toBe(true)
  await page.getByRole('button',{name:'Semana siguiente'}).click()
  await expect.poll(()=>requests.filter(x=>x.includes('/agenda?')).length).toBeGreaterThan(1)
  await expect(page.getByText('No tienes servicios agendados para este día.')).toBeVisible()
  await page.getByRole('button',{name:'Hoy'}).click()
  await expect(page.getByRole('heading',{name:'Cliente 1',exact:true}).first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
