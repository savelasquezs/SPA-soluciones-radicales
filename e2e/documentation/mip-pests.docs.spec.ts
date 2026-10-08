import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import {
  clearCaption,
  demoClick,
  demoType,
  installRecordingUi,
  loadAudioTimings,
  loadNarration,
  localZoom,
  moveCursor,
  pointAt,
  resetLocalZoom,
  segmentDuration,
  segmentText,
  showCaption,
  showIntro,
  showOutro,
  type SceneClock,
} from './video-helpers'

type DemoPest = {
  id: string
  clave: string
  nombre: string
  clasificacion: 'RASTREROS' | 'VOLADORES'
  categoriaProducto: 'INSECTOS_RASTREROS' | 'INSECTOS_VOLADORES' | 'ROEDORES'
  activo: boolean
  version: number
}

const narration = loadNarration(new URL('./mip-pests.narration.json', import.meta.url))
const audioTimings = loadAudioTimings()
const createdPestId = '42000000-0000-4000-8000-000000000099'

const pests: DemoPest[] = [
  { id:'42000000-0000-4000-8000-000000000001', clave:'CUCARACHA', nombre:'Cucaracha', clasificacion:'RASTREROS', categoriaProducto:'INSECTOS_RASTREROS', activo:true, version:1 },
  { id:'42000000-0000-4000-8000-000000000002', clave:'ROEDOR', nombre:'Roedor', clasificacion:'RASTREROS', categoriaProducto:'ROEDORES', activo:true, version:1 },
  { id:'42000000-0000-4000-8000-000000000003', clave:'MOSCA_DOMESTICA', nombre:'Mosca doméstica', clasificacion:'VOLADORES', categoriaProducto:'INSECTOS_VOLADORES', activo:true, version:1 },
]

const profile = {
  id:'90000000-0000-4000-8000-000000000001',
  nombreCompleto:'Administrador de demostración',
  correoGoogle:'demo@solucionesradicales.test',
  esAdmin:true,
  esTecnico:false,
  rolActivo:'ADMINISTRADOR',
  requiereSeleccionRol:false,
}

async function setupDemo(page: Page) {
  const records = pests.map(item => structuredClone(item))
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))

  await page.route('**/get-session', async route => {
    await route.fulfill({ json:{
      session:{ id:'demo-session', userId:'demo-auth', token:'demo-token', expiresAt:'2099-01-01T00:00:00.000Z', createdAt:'2026-10-07T00:00:00.000Z', updatedAt:'2026-10-07T00:00:00.000Z' },
      user:{ id:'demo-auth', name:profile.nombreCompleto, email:profile.correoGoogle, emailVerified:true, createdAt:'2026-10-07T00:00:00.000Z', updatedAt:'2026-10-07T00:00:00.000Z' },
    }})
  })

  await page.route('https://api.example.test/api/**', async route => {
    const request=route.request(), url=new URL(request.url()), path=url.pathname, method=request.method()
    if (method==='OPTIONS') { await route.fulfill({status:204}); return }
    if (path==='/api/session') { await route.fulfill({json:profile}); return }
    if (path==='/api/mip/options') { await route.fulfill({json:{methods:[],pests:records.filter(r=>r.activo)}}); return }
    if (path==='/api/mip/products' && method==='GET') { await route.fulfill({json:[]}); return }

    if (path==='/api/mip/pests' && method==='GET') {
      const active=url.searchParams.get('active')!=='false'
      await route.fulfill({json:records.filter(row=>row.activo===active)})
      return
    }

    if (path==='/api/mip/pests' && method==='POST') {
      const body=request.postDataJSON() as {nombre:string; clasificacion:'RASTREROS'|'VOLADORES'; categoriaProducto:DemoPest['categoriaProducto']}
      await new Promise(resolve=>setTimeout(resolve,520))
      const created:DemoPest={id:createdPestId,clave:'PLAGA_DEMO',nombre:body.nombre,clasificacion:body.clasificacion,categoriaProducto:body.categoriaProducto,activo:true,version:1}
      records.push(created)
      await route.fulfill({status:201,json:created})
      return
    }

    const itemMatch=path.match(/^\/api\/mip\/pests\/([^/]+)$/)
    if (itemMatch && method==='PATCH') {
      const id=decodeURIComponent(itemMatch[1])
      const body=request.postDataJSON() as {nombre:string; clasificacion:'RASTREROS'|'VOLADORES'; categoriaProducto:DemoPest['categoriaProducto']}
      const row=records.find(r=>r.id===id)
      if (!row) { await route.fulfill({status:404,json:{error:'Plaga no encontrada.'}}); return }
      await new Promise(resolve=>setTimeout(resolve,480))
      row.nombre=body.nombre; row.clasificacion=body.clasificacion; row.categoriaProducto=body.categoriaProducto; row.version+=1
      await route.fulfill({json:row}); return
    }

    const stateMatch=path.match(/^\/api\/mip\/pests\/([^/]+)\/state$/)
    if (stateMatch && method==='PATCH') {
      const id=decodeURIComponent(stateMatch[1]), body=request.postDataJSON() as {activo:boolean}
      const row=records.find(r=>r.id===id)
      if (!row) { await route.fulfill({status:404,json:{error:'Plaga no encontrada.'}}); return }
      await new Promise(resolve=>setTimeout(resolve,460))
      row.activo=body.activo; row.version+=1
      await route.fulfill({json:row}); return
    }

    if (itemMatch && method==='DELETE') {
      const id=decodeURIComponent(itemMatch[1]), index=records.findIndex(r=>r.id===id)
      if (index<0) { await route.fulfill({status:404,json:{error:'Plaga no encontrada.'}}); return }
      await new Promise(resolve=>setTimeout(resolve,420))
      records.splice(index,1)
      await route.fulfill({status:204,body:''}); return
    }

    await route.fulfill({status:404,json:{error:`Ruta de demostración no preparada: ${path}`}})
  })
}

test('video: gestionar plagas en Catálogos MIP', async ({ page }) => {
  await setupDemo(page)
  const startedAt=Date.now()
  const timeline:{narration:Array<{id:string;startMs:number}>}={narration:[]}

  async function narrate(id:string, action:(clock:SceneClock)=>Promise<void>) {
    const startMs=Date.now()-startedAt, durationMs=segmentDuration(narration,audioTimings,id), sceneStartedAt=Date.now()
    timeline.narration.push({id,startMs})
    await showCaption(page,segmentText(narration,id))
    const clock:SceneClock={durationMs,until:async fraction=>{
      const target=sceneStartedAt+Math.max(0,Math.min(1,fraction))*durationMs
      const remaining=target-Date.now()
      if (remaining>0) await page.waitForTimeout(remaining)
    }}
    await action(clock)
    const remaining=sceneStartedAt+durationMs+180-Date.now()
    if (remaining>0) await page.waitForTimeout(remaining)
    await clearCaption(page); await page.waitForTimeout(110)
  }

  await showIntro(page,narration)
  await narrate('intro',async clock=>clock.until(1))
  await page.goto('/configuracion')
  await expect(page.getByRole('heading',{name:'Configuración',exact:true})).toBeVisible()
  await installRecordingUi(page); await page.waitForTimeout(320)

  await narrate('open-catalogs',async clock=>{
    await clock.until(.38)
    await demoClick(page.getByRole('link',{name:/Catálogos MIP/}))
    await expect(page.getByRole('heading',{name:'Productos',exact:true})).toBeVisible()
  })

  await narrate('open-pests',async clock=>{
    await clock.until(.42)
    await demoClick(page.getByRole('button',{name:'Plagas',exact:true}))
    await expect(page.getByRole('heading',{name:'Plagas',exact:true})).toBeVisible()
  })

  await narrate('pest-list',async clock=>{
    await clock.until(.15)
    await pointAt(page.getByRole('button',{name:'Cucaracha',exact:true}),520)
    await clock.until(.56)
    await pointAt(page.getByText('Insectos rastreros',{exact:true}).first(),520)
    await clock.until(.82)
    await pointAt(page.getByRole('button',{name:'Editar Cucaracha',exact:true}),420)
  })

  const search=page.getByRole('searchbox',{name:'Buscar plagas',exact:true})
  const monitoring=page.locator('.mip-filter select')
  await narrate('search-filter',async clock=>{
    await clock.until(.20); await pointAt(search,420)
    await clock.until(.50); await moveCursor(monitoring); await monitoring.selectOption('VOLADORES')
    await expect(page.getByRole('button',{name:'Mosca doméstica',exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Cucaracha',exact:true})).toBeHidden()
    await clock.until(.84); await monitoring.selectOption('')
  })

  await narrate('new-pest',async clock=>{
    await clock.until(.48)
    await demoClick(page.getByRole('button',{name:'Nueva plaga',exact:true}))
  })

  const dialog=page.getByRole('dialog',{name:'Nueva plaga',exact:true})
  await expect(dialog).toBeVisible()
  await narrate('pest-name',async clock=>{
    await clock.until(.32)
    await demoType(dialog.getByRole('textbox',{name:'Nombre',exact:true}),'Roedor de demostración')
  })

  const rastreros=dialog.getByRole('radio',{name:'Rastreros',exact:true})
  const voladores=dialog.getByRole('radio',{name:'Voladores',exact:true})
  await narrate('two-dimensions',async clock=>{
    await clock.until(.18)
    await localZoom(dialog.locator('fieldset').first(),1.022)
    await clock.until(.78)
    await resetLocalZoom(dialog.locator('fieldset').first())
  })

  await narrate('choose-voladores',async clock=>{
    await clock.until(.52)
    await demoClick(voladores)
    await expect(voladores).toBeChecked()
  })

  await narrate('auto-category',async clock=>{
    const fixed=dialog.locator('.item-form__fixed-category')
    await expect(fixed).toContainText('Insectos voladores')
    await clock.until(.18); await localZoom(fixed,1.025); await clock.until(.82); await resetLocalZoom(fixed)
  })

  await narrate('switch-rastreros',async clock=>{
    await clock.until(.08)
    await demoClick(rastreros)
    await expect(rastreros).toBeChecked()
    await expect(dialog.getByRole('radio',{name:'Insectos rastreros',exact:true})).toBeVisible()
    await expect(dialog.getByRole('radio',{name:'Roedores',exact:true})).toBeVisible()
  })

  const roedores=dialog.getByRole('radio',{name:'Roedores',exact:true})
  await narrate('choose-roedores',async clock=>{
    await clock.until(.24)
    await demoClick(roedores)
    await expect(roedores).toBeChecked()
  })

  await narrate('create-pest',async clock=>{
    await clock.until(.48)
    await demoClick(dialog.locator('button[form="mip-item-form"]'))
    await expect(dialog).toBeHidden()
  })

  const created=page.getByRole('button',{name:'Roedor de demostración',exact:true})
  await narrate('created-pest',async clock=>{
    await expect(created).toBeVisible()
    await clock.until(.22); await localZoom(created,1.025); await clock.until(.82); await resetLocalZoom(created)
  })

  await narrate('open-detail',async clock=>{
    await clock.until(.48); await demoClick(created)
  })
  const detail=page.getByRole('dialog',{name:'Roedor de demostración',exact:true})
  await expect(detail).toBeVisible()
  await narrate('pest-detail',async clock=>{
    const dl=detail.locator('.mip-detail')
    await expect(dl).toContainText('Rastreros')
    await expect(dl).toContainText('Roedores')
    await clock.until(.18); await localZoom(dl,1.025); await clock.until(.82); await resetLocalZoom(dl)
  })

  await narrate('edit-pest',async clock=>{
    await clock.until(.5); await demoClick(detail.getByRole('button',{name:'Editar',exact:true}))
  })
  const edit=page.getByRole('dialog',{name:'Editar plaga',exact:true})
  await expect(edit).toBeVisible()
  await narrate('save-edit',async clock=>{
    await clock.until(.18); await demoType(edit.getByRole('textbox',{name:'Nombre',exact:true}),'Roedor demostración bodega')
    await clock.until(.70); await demoClick(edit.locator('button[form="mip-item-form"]'))
    await expect(edit).toBeHidden()
  })

  const updated=page.getByRole('button',{name:'Roedor demostración bodega',exact:true})
  await expect(updated).toBeVisible()

  await narrate('row-actions',async clock=>{
    const editBtn=page.getByRole('button',{name:'Editar Roedor demostración bodega',exact:true})
    const stateBtn=page.getByRole('button',{name:'Desactivar Roedor demostración bodega',exact:true})
    const deleteBtn=page.getByRole('button',{name:'Eliminar Roedor demostración bodega',exact:true})
    await clock.until(.18); await pointAt(editBtn,420)
    await clock.until(.48); await pointAt(stateBtn,420)
    await clock.until(.76); await pointAt(deleteBtn,420)
  })

  await narrate('deactivate-pest',async clock=>{
    await clock.until(.3)
    await demoClick(page.getByRole('button',{name:'Desactivar Roedor demostración bodega',exact:true}))
    await expect(page.getByRole('dialog',{name:'Desactivar plaga',exact:true})).toBeVisible()
  })
  const deactivate=page.getByRole('dialog',{name:'Desactivar plaga',exact:true})
  await narrate('confirm-deactivation',async clock=>{
    await clock.until(.5); await demoClick(deactivate.getByRole('button',{name:'Desactivar',exact:true}))
    await expect(deactivate).toBeHidden(); await expect(updated).toBeHidden()
  })

  await narrate('inactive-pest',async clock=>{
    await clock.until(.34); await demoClick(page.getByRole('button',{name:'Inactivas',exact:true}))
    const inactive=page.getByRole('button',{name:'Roedor demostración bodega',exact:true})
    await expect(inactive).toBeVisible()
    await clock.until(.72); await localZoom(inactive,1.025); await clock.until(.92); await resetLocalZoom(inactive)
  })

  await narrate('reactivate-pest',async clock=>{
    await clock.until(.28)
    await demoClick(page.getByRole('button',{name:'Reactivar Roedor demostración bodega',exact:true}))
    const re=page.getByRole('dialog',{name:'Reactivar plaga',exact:true}); await expect(re).toBeVisible()
    await clock.until(.70); await demoClick(re.getByRole('button',{name:'Reactivar',exact:true})); await expect(re).toBeHidden()
  })

  await narrate('active-again',async clock=>{
    await clock.until(.32); await demoClick(page.getByRole('button',{name:'Activas',exact:true}))
    const active=page.getByRole('button',{name:'Roedor demostración bodega',exact:true}); await expect(active).toBeVisible()
    await clock.until(.70); await localZoom(active,1.025); await clock.until(.92); await resetLocalZoom(active)
  })

  await narrate('delete-pest',async clock=>{
    await clock.until(.22); await demoClick(page.getByRole('button',{name:'Eliminar Roedor demostración bodega',exact:true}))
    const del=page.getByRole('dialog',{name:'Eliminar plaga',exact:true}); await expect(del).toBeVisible()
    await clock.until(.48); await pointAt(del.getByText(/solo si no tiene referencias ni historial/i),Math.min(1400,Math.round(clock.durationMs*.34)))
    await clock.until(1)
  })

  const del=page.getByRole('dialog',{name:'Eliminar plaga',exact:true})
  await narrate('confirm-delete',async clock=>{
    await clock.until(.54); await demoClick(del.getByRole('button',{name:'Eliminar',exact:true})); await expect(del).toBeHidden()
  })

  await narrate('deleted-pest',async clock=>{
    await expect(page.getByRole('button',{name:'Roedor demostración bodega',exact:true})).toBeHidden()
    const original=page.getByRole('button',{name:'Cucaracha',exact:true}); await expect(original).toBeVisible()
    await clock.until(.30); await localZoom(original,1.018); await clock.until(.80); await resetLocalZoom(original)
  })

  await showOutro(page)
  await narrate('outro',async clock=>clock.until(1))
  await page.waitForTimeout(650)

  mkdirSync(resolve(process.cwd(),'docs-media'),{recursive:true})
  writeFileSync(resolve(process.cwd(),'docs-media/timeline.json'),JSON.stringify({...timeline,durationMs:Date.now()-startedAt},null,2)+'\n')
})
