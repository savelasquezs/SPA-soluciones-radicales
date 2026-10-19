import { test, expect, type Page } from '@playwright/test'
import type { DashboardSnapshot } from '../src/types/dashboard'
const uid=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const clientId=uid(1),siteId=uid(2),serviceId=uid(3),findingId=uid(4)
const date='2026-10-19T15:00:00.000Z'
const sample:DashboardSnapshot={
  generatedAt:date,period:{id:'30d',from:'2026-09-20',to:'2026-10-19'},
  filters:{clients:[{id:clientId,name:'Cliente MIP'}],sites:[{id:siteId,clientId,name:'Sede central'}]},
  kpis:{today:{scheduled:2,ongoing:1,completed:2},delayed:3,upcoming:3,upcomingOverdue:1,
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
    requests.push(path+url.search)
    if(path==='/api/admin/dashboard'){
      const selected=url.searchParams.get('period')||'30d'
      await route.fulfill({json:{...sample,period:{id:selected,from:url.searchParams.get('from')||sample.period.from,
        to:url.searchParams.get('to')||sample.period.to}}});return
    }
    if(path==='/api/admin/dashboard/details'){
      const kind=url.searchParams.get('kind')
      await route.fulfill({json:{page:1,pageSize:20,total:1,items:[{
        id:findingId,kind:kind==='certificates'?'technician':'finding',
        title:kind==='certificates'?'Técnica Ana':'Cerrar punto de ingreso',
        description:kind==='certificates'?'Certificado técnico':'Cocina',date,
        state:kind==='certificates'?'TÉCNICO':'ABIERTO',
        clientName:'Cliente MIP',siteName:'Sede central',clientId,siteId,serviceId
      }]}});return
    }
    if(path==='/api/admin/services/workspace'){
      await route.fulfill({json:{sedes:[],tecnicos:[],productos:[]}});return
    }
    if(path==='/api/admin/services'){
      const metric=url.searchParams.get('metric')
      const make=(i:number)=>({
        id:uid(i),solicitud:'SR-0'+i,tipoServicio:'PRINCIPAL',estado:'PROGRAMADO',version:1,
        inicioProgramado:'2026-10-10T10:00:00Z',finProgramado:'2026-10-10T11:00:00Z',inicioReal:null,finReal:null,
        tecnicoResponsableId:uid(7),tecnicosColaboradoresIds:[],clientId,clienteNombre:'Cliente MIP',sedeId:siteId,
        sedeNombre:'Sede central',tipoSede:'NEGOCIO',direccion:'Calle 1',servicioPrincipalId:null,
        responsable:{id:uid(7),nombreCompleto:'Técnica Ana',correoGoogle:'test@example.test',activo:true,tieneCertificado:false,certificadoFechaVencimiento:null},
        colaboradores:[],contacto:{nombre:'Contacto',celular:null,correos:[]},valorServicio:200000,observaciones:'',
        productos:[],refuerzo:null,principal:null,
        pago:{metodoPago:null,estadoPago:'PENDIENTE',tecnicoRecaudoPrevistoId:null,recaudadoPorId:null,
          recaudadoPorNombre:null,pagoFecha:null,confirmadoAt:null,confirmadoPor:null,comprobanteStoragePath:null},
        calendar:{estado:'SINCRONIZADO',ultimaSyncAt:null,error:null},executionLock:null,motivoCancelacion:null,canceladoAt:null
      })
      const items=metric==='delayed'?[make(10),make(11),make(12)]:[]
      await route.fulfill({json:{items,total:items.length,page:1,pageSize:25,pendingCount:0}});return
    }
    if(path==='/api/admin/services/upcoming'){
      await route.fulfill({json:{items:[],total:3,page:1,pageSize:25,pendingCount:3}});return
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
  await page.locator('.dashboard-filters select').nth(1).selectOption(clientId)
  await page.locator('.dashboard-filters select').nth(2).selectOption(siteId)
  await expect.poll(()=>requests.some(x=>x.includes('siteId='+siteId))).toBeTruthy()
  await page.getByLabel('Apariencia').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.getByLabel('Apariencia').selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme','light')
  await page.setViewportSize({width:390,height:860})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
})

test('three delayed services open the exact filtered list without a one-year cutoff',async({page})=>{
  const requests=await setup(page)
  await page.goto('/?clientId='+clientId+'&siteId='+siteId)
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible()
  await page.locator('.dashboard-kpis .dashboard-kpi').filter({hasText:'Servicios retrasados'}).click()
  await expect(page).toHaveURL(/metric=delayed/)
  await expect(page.getByText('Filtro activo:')).toBeVisible()
  await expect(page.getByText('SR-010',{exact:true})).toBeVisible()
  await expect(page.getByText('SR-011',{exact:true})).toBeVisible()
  await expect(page.getByText('SR-012',{exact:true})).toBeVisible()
  expect(requests.some(x=>x.startsWith('/api/admin/services?')&&x.includes('metric=delayed')&&
    x.includes('clientId='+clientId)&&x.includes('siteId='+siteId))).toBeTruthy()
})
test('a custom range longer than a year reaches the completion-date drilldown',async({page})=>{
  const requests=await setup(page)
  await page.goto('/?period=custom&from=2024-01-01&to=2026-10-19')
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible()
  expect(requests.some(x=>x.includes('period=custom')&&x.includes('from=2024-01-01')&&x.includes('to=2026-10-19'))).toBeTruthy()
  await page.locator('.dashboard-kpis .dashboard-kpi').filter({hasText:'Valor de servicios realizados'}).click()
  await expect(page).toHaveURL(/metric=performed/)
  await expect.poll(()=>requests.some(x=>x.startsWith('/api/admin/services?')&&x.includes('metric=performed')&&x.includes('from=2024-01-01'))).toBeTruthy()
})
test('pending findings and expiring certificates show their underlying records',async({page})=>{
  await setup(page)
  await page.goto('/')
  await page.locator('.dashboard-kpis .dashboard-kpi').filter({hasText:'Hallazgos pendientes'}).click()
  await expect(page.getByRole('heading',{name:'Hallazgos pendientes'})).toBeVisible()
  await expect(page.getByText('Cerrar punto de ingreso')).toBeVisible()
  await page.getByRole('link',{name:'Volver al resumen'}).click()
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible()
  await page.locator('.dashboard-attention__item').filter({hasText:'Certificados próximos a vencer'}).click()
  await expect(page.getByRole('heading',{name:'Certificados próximos a vencer'})).toBeVisible()
  await expect(page.getByText('Técnica Ana')).toBeVisible()
})
