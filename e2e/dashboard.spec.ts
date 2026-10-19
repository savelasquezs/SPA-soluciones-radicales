import { test, expect, type Page } from '@playwright/test'
import type { DashboardSnapshot } from '../src/types/dashboard'
const uid=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const clientId=uid(1),siteId=uid(2),serviceId=uid(3),findingId=uid(4)
const date='2026-10-19T15:00:00.000Z'
const sample:DashboardSnapshot={
  generatedAt:date,period:{id:'30d',from:'2026-09-20',to:'2026-10-19'},
  filters:{clients:[{id:clientId,name:'Cliente MIP'}],sites:[{id:siteId,clientId,name:'Sede central'}]},
  kpis:{today:{scheduled:2,ongoing:1,completed:2},delayed:1,upcoming:3,upcomingOverdue:1,
    performedValue:400000,performedDelta:10,outstandingValue:100000,outstandingPayments:1,
    findings:{open:1,ongoing:1}},
  alerts:{expiringCertificates:1,calendarErrors:1},
  charts:{services:[{date:'2026-10-19',scheduled:2,ongoing:1,completed:2,cancelled:0}],
    value:[{date:'2026-10-19',value:400000}],
    compliance:[{date:'2026-10-19',percentage:75,visits:1}]},
  tables:{
    upcoming:[{id:serviceId,reference:'SR-0003',clientName:'Cliente MIP',siteName:'Sede central',
      clientId,siteId,date,technician:'Técnica Ana',status:'PROGRAMADO',value:200000,payment:'PENDIENTE'}],
    latest:[{id:serviceId,reference:'SR-0002',clientName:'Cliente MIP',siteName:'Sede central',
      clientId,siteId,date,technician:'Técnica Ana',status:'FINALIZADO',value:200000,payment:'CONFIRMADO'}],
    findings:[{id:findingId,clientId,siteId,clientName:'Cliente MIP',siteName:'Sede central',
      area:'Cocina',description:'Cerrar punto de ingreso',openedAt:date,status:'ABIERTO'}]
  }
}
async function setup(page:Page){
  const requests:string[]=[]
  await page.route('**/get-session',route=>route.fulfill({json:{
    session:{id:'session-1',userId:'auth-1',token:'test-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:date,updatedAt:date},
    user:{id:'auth-1',name:'Admin de prueba',email:'admin@example.test',emailVerified:true,createdAt:date,updatedAt:date}
  }}))
  await page.route('https://api.example.test/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204});return}
    if(path==='/api/session'){
      await route.fulfill({json:{id:uid(8),nombreCompleto:'Admin de prueba',correoGoogle:'admin@example.test',
        esAdmin:true,esTecnico:false,rolActivo:'ADMINISTRADOR',requiereSeleccionRol:false}});return
    }
    if(path==='/api/admin/dashboard'){
      requests.push(url.search)
      await route.fulfill({json:{...sample,period:{...sample.period,id:url.searchParams.get('period')||'30d'}}});return
    }
    if(path.endsWith('/pending-count')){await route.fulfill({json:{count:3}});return}
    await route.fulfill({status:404,json:{error:'No esperado'}})
  })
  return requests
}
test('dashboard renders all charts, three record tables and filters without overflow',async ({page})=>{
  const requests=await setup(page)
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible()
  await expect(page.getByText('Valor de servicios realizados',{exact:true}).first()).toBeVisible()
  await expect(page.getByRole('heading',{name:'Próximos servicios'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Últimos servicios realizados'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Últimos hallazgos'})).toBeVisible()
  await expect(page.getByText('Cerrar punto de ingreso')).toBeVisible()
  await expect(page.locator('.dashboard-chart').first()).toBeVisible()
  await page.getByLabel('Período').selectOption('7d')
  await expect.poll(()=>requests.some(x=>x.includes('period=7d'))).toBeTruthy()
  await page.getByLabel('Cliente',{exact:true}).selectOption(clientId)
  await page.getByLabel('Sede',{exact:true}).selectOption(siteId)
  await expect.poll(()=>requests.some(x=>x.includes('siteId='+siteId))).toBeTruthy()
  await page.getByLabel('Apariencia').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.getByLabel('Apariencia').selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme','light')
  await page.setViewportSize({width:390,height:860})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
})
