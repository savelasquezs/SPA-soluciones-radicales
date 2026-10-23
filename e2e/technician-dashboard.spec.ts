import { test, expect, type Page } from '@playwright/test'
import type { TechnicianDashboardSnapshot } from '../src/types/technicianDashboard'

const date = '2026-10-20T15:00:00.000Z'
const uid = (n:number) => '31000000-0000-4000-8000-'+String(n).padStart(12,'0')
const serviceId = uid(1)
const sample: TechnicianDashboardSnapshot = {
  generatedAt:date,period:{id:'30d',from:'2026-09-21',to:'2026-10-20'},
  kpis:{completed:12,scheduled:3,ongoing:1,overdue:0,sites:8,clients:5,onTime:10,
    started:11,punctuality:91,avgMinutes:85},
  charts:{completed:[{date:'2026-10-12',count:3},{date:'2026-10-19',count:9}]},
  activity:{findings:4,followUps:3,findingsClosed:2,reviewedDevices:20,
    installedDevices:4,appliedProducts:6,mipCompliance:78.5},
  tables:{upcoming:[{id:serviceId,reference:'SR-0199',clientName:'Cliente MIP',siteName:'Sede central',
    scheduledAt:date,completedAt:null,status:'PROGRAMADO',role:'RESPONSABLE'}],
    recent:[{id:uid(2),reference:'SR-0198',clientName:'Cliente anterior',siteName:'Sede norte',
      scheduledAt:date,completedAt:date,status:'FINALIZADO',role:'COLABORADOR'}]},
}

async function setup(page:Page, empty = false, dualRole = false) {
  const requests:string[]=[],adminRequests:string[]=[]
  const profile = { id:uid(3),nombreCompleto:'Ana Técnica',correoGoogle:'ana@example.test',
    esAdmin:dualRole,esTecnico:true,rolActivo:dualRole?null:'TECNICO',requiereSeleccionRol:dualRole }
  await page.route('**/get-session',route=>route.fulfill({json:{
    session:{id:'session-tech',userId:'auth-tech',token:'test-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:date,updatedAt:date},
    user:{id:'auth-tech',name:'Ana Técnica',email:'ana@example.test',emailVerified:true,createdAt:date,updatedAt:date}
  }}))
  await page.route('https://api.example.test/api/**',async route=>{
    const url=new URL(route.request().url())
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204});return}
    if(url.pathname==='/api/session'){
      await route.fulfill({json:profile});return
    }
    if(url.pathname==='/api/session/role' && route.request().method()==='POST'){
      profile.rolActivo='TECNICO';profile.requiereSeleccionRol=false
      await route.fulfill({json:profile});return
    }
    if(url.pathname==='/api/technician/dashboard'){
      requests.push(url.search)
      await route.fulfill({json:{...sample,period:{id:url.searchParams.get('period')||'30d',
        from:url.searchParams.get('from')||sample.period.from,to:url.searchParams.get('to')||sample.period.to},
        ...(empty?{
          kpis:{...sample.kpis,completed:0,punctuality:null,started:0,avgMinutes:null},
          charts:{completed:[]},activity:{...sample.activity,mipCompliance:null}
        }:{})}});return
    }
    if(url.pathname.startsWith('/api/admin/dashboard'))adminRequests.push(url.pathname)
    await route.fulfill({status:404,json:{error:'Not mocked'}})
  })
  return {requests,adminRequests}
}

test('personal dashboard shows line chart, activity, filters and mobile view',async({page})=>{
  const {requests,adminRequests}=await setup(page)
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'Mi resumen'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Servicios realizados por semana'})).toBeVisible()
  await expect(page.locator('.technician-dashboard__history .dashboard-chart')).toBeVisible()
  await expect(page.getByRole('heading',{name:'Actividad técnica'})).toBeVisible()
  await expect(page.getByText('Hallazgos en mis visitas')).toBeVisible()
  await expect(page.getByText('Cumplimiento MIP observado en sedes')).toBeVisible()
  await expect(page.getByRole('heading',{name:'Próximos servicios'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Últimos servicios finalizados'})).toBeVisible()
  await expect(page.getByRole('link',{name:'Cliente MIP'})).toHaveAttribute('href','/servicios/'+serviceId+'/trabajo')
  await page.getByLabel('Período').selectOption('7d')
  await expect.poll(()=>requests.some(q=>q.includes('period=7d'))).toBeTruthy()
  await page.getByLabel('Apariencia').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.setViewportSize({width:390,height:860})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()
  expect(adminRequests).toEqual([])
})

test('custom dates use technician endpoint and missing statistics remain empty',async({page})=>{
  const {requests}=await setup(page,true)
  await page.goto('/?period=custom&from=2024-01-01&to=2026-10-20')
  await expect(page.getByRole('heading',{name:'Mi resumen'})).toBeVisible()
  await expect.poll(()=>requests.some(q=>q.includes('period=custom')&&
    q.includes('from=2024-01-01')&&q.includes('to=2026-10-20'))).toBeTruthy()
  await expect(page.locator('.technician-dashboard__history .dashboard-chart-empty')).toBeVisible()
  await expect(page.getByText('Sin evaluación')).toBeVisible()
  await expect(page.getByText('Sin inicios registrados')).toBeVisible()
})

for (const dualRole of [false, true]) {
test(`OAuth verifier is consumed once for technician with role selection ${dualRole}`, async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-23T15:00:00Z') })
  await page.setViewportSize({ width: 390, height: 860 })
  const { requests } = await setup(page, false, dualRole)
  let usedVerifier = false
  const repeatedVerifiers: string[] = []
  let documents = 0
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++
  })
  await page.route(/\/get-session(?:\?.*)?$/, async route => {
    const verifier = new URL(route.request().url()).searchParams.get('neon_auth_session_verifier')
    if (verifier && usedVerifier) {
      repeatedVerifiers.push(verifier)
      await route.fulfill({ status: 400, json: {} })
      return
    }
    if (verifier) usedVerifier = true
    await route.fulfill({ json: {
      session: { id: 'session-tech', userId: 'auth-tech', token: 'test-token', expiresAt: '2099-01-01T00:00:00Z', createdAt: date, updatedAt: date },
      user: { id: 'auth-tech', name: 'Ana Técnica', email: 'ana@example.test', emailVerified: true, createdAt: date, updatedAt: date },
    } })
  })
  await page.goto('/?neon_auth_session_verifier=consumed-once&period=7d')
  if (dualRole) await page.getByRole('button', { name: 'Técnico', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Actividad técnica' })).toBeVisible()
  await expect(page.locator('.dashboard-error')).toHaveCount(0)
  expect(usedVerifier).toBe(true)
  expect(repeatedVerifiers).toEqual([])
  expect(requests.some(query => query.includes('period=7d'))).toBe(true)
  await expect(page).toHaveURL('/?period=7d')
  await page.clock.fastForward(16 * 60_000)
  await page.getByRole('button', { name: 'Actualizar resumen' }).click()
  await expect.poll(() => requests.length).toBe(2)
  await expect(page.locator('.dashboard-error')).toHaveCount(0)
  expect(repeatedVerifiers).toEqual([])
  expect(documents).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('technician-oauth-recovered.png'), fullPage: true })
})
}
