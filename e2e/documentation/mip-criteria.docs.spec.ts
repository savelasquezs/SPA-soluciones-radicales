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
  pointAt,
  resetLocalZoom,
  segmentDuration,
  segmentText,
  showCaption,
  showIntro,
  showOutro,
  type SceneClock,
} from './video-helpers'

type DemoCriterion = {
  id: string
  nombre: string
  soloAreaExterna: boolean
  activo: boolean
}

const narration=loadNarration(new URL('./mip-criteria.narration.json',import.meta.url))
const audioTimings=loadAudioTimings()
const createdCriterionId='43000000-0000-4000-8000-000000000099'

const criteria:DemoCriterion[]=[
  {id:'43000000-0000-4000-8000-000000000001',nombre:'Instalación de barreras físicas',soloAreaExterna:false,activo:true},
  {id:'43000000-0000-4000-8000-000000000002',nombre:'Disposición adecuada de residuos sólidos y líquidos',soloAreaExterna:false,activo:true},
  {id:'43000000-0000-4000-8000-000000000003',nombre:'Mantenimiento higiénico',soloAreaExterna:false,activo:true},
  {id:'43000000-0000-4000-8000-000000000004',nombre:'Mantenimiento locativo interno y externo',soloAreaExterna:false,activo:true},
  {id:'43000000-0000-4000-8000-000000000005',nombre:'Mantenimiento de zonas verdes',soloAreaExterna:true,activo:true},
]

const profile={
  id:'90000000-0000-4000-8000-000000000001',
  nombreCompleto:'Administrador de demostración',
  correoGoogle:'demo@solucionesradicales.test',
  esAdmin:true,
  esTecnico:false,
  rolActivo:'ADMINISTRADOR',
  requiereSeleccionRol:false,
}

async function setupDemo(page:Page) {
  const records=criteria.map(item=>structuredClone(item))
  await page.addInitScript(()=>localStorage.setItem('theme','dark'))
  await page.route('**/get-session',async route=>{
    await route.fulfill({json:{
      session:{id:'demo-session',userId:'demo-auth',token:'demo-token',expiresAt:'2099-01-01T00:00:00.000Z',createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z'},
      user:{id:'demo-auth',name:profile.nombreCompleto,email:profile.correoGoogle,emailVerified:true,createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z'},
    }})
  })

  await page.route('https://api.example.test/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method()
    if(method==='OPTIONS'){await route.fulfill({status:204});return}
    if(path==='/api/session'){await route.fulfill({json:profile});return}
    if(path==='/api/mip/options'){await route.fulfill({json:{methods:[],pests:[]}});return}
    if(path==='/api/mip/products'&&method==='GET'){await route.fulfill({json:[]});return}

    if(path==='/api/mip/criteria'&&method==='GET'){
      const active=url.searchParams.get('active')!=='false'
      await route.fulfill({json:records.filter(row=>row.activo===active).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))})
      return
    }

    if(path==='/api/mip/criteria'&&method==='POST'){
      const body=request.postDataJSON() as {nombre:string;soloAreaExterna:boolean}
      await new Promise(resolve=>setTimeout(resolve,500))
      const created:DemoCriterion={id:createdCriterionId,nombre:body.nombre,soloAreaExterna:body.soloAreaExterna,activo:true}
      records.push(created);await route.fulfill({status:201,json:created});return
    }

    const itemMatch=path.match(/^\/api\/mip\/criteria\/([^/]+)$/)
    if(itemMatch&&method==='PATCH'){
      const id=decodeURIComponent(itemMatch[1]),body=request.postDataJSON() as {nombre:string;soloAreaExterna:boolean}
      const row=records.find(r=>r.id===id)
      if(!row){await route.fulfill({status:404,json:{error:'Criterio no encontrado.'}});return}
      await new Promise(resolve=>setTimeout(resolve,460))
      row.nombre=body.nombre;row.soloAreaExterna=body.soloAreaExterna
      await route.fulfill({json:row});return
    }

    const stateMatch=path.match(/^\/api\/mip\/criteria\/([^/]+)\/state$/)
    if(stateMatch&&method==='PATCH'){
      const id=decodeURIComponent(stateMatch[1]),body=request.postDataJSON() as {activo:boolean}
      const row=records.find(r=>r.id===id)
      if(!row){await route.fulfill({status:404,json:{error:'Criterio no encontrado.'}});return}
      await new Promise(resolve=>setTimeout(resolve,440))
      row.activo=body.activo;await route.fulfill({json:row});return
    }

    if(itemMatch&&method==='DELETE'){
      const id=decodeURIComponent(itemMatch[1]),index=records.findIndex(r=>r.id===id)
      if(index<0){await route.fulfill({status:404,json:{error:'Criterio no encontrado.'}});return}
      await new Promise(resolve=>setTimeout(resolve,420))
      records.splice(index,1);await route.fulfill({status:204,body:''});return
    }

    await route.fulfill({status:404,json:{error:`Ruta de demostración no preparada: ${path}`}})
  })
}

test('video: gestionar criterios MIP',async({page})=>{
  await setupDemo(page)
  const startedAt=Date.now()
  const timeline:{narration:Array<{id:string;startMs:number}>}={narration:[]}

  async function narrate(id:string,action:(clock:SceneClock)=>Promise<void>){
    const startMs=Date.now()-startedAt,durationMs=segmentDuration(narration,audioTimings,id),sceneStartedAt=Date.now()
    timeline.narration.push({id,startMs});await showCaption(page,segmentText(narration,id))
    const clock:SceneClock={durationMs,until:async fraction=>{
      const target=sceneStartedAt+Math.max(0,Math.min(1,fraction))*durationMs
      const remaining=target-Date.now()
      if(remaining>0)await page.waitForTimeout(remaining)
    }}
    await action(clock)
    const remaining=sceneStartedAt+durationMs+180-Date.now()
    if(remaining>0)await page.waitForTimeout(remaining)
    await clearCaption(page);await page.waitForTimeout(110)
  }

  await showIntro(page,narration)
  await narrate('intro',async clock=>clock.until(1))
  await page.goto('/configuracion')
  await expect(page.getByRole('heading',{name:'Configuración',exact:true})).toBeVisible()
  await installRecordingUi(page);await page.waitForTimeout(320)

  await narrate('open-catalogs',async clock=>{
    await clock.until(.38);await demoClick(page.getByRole('link',{name:/Catálogos MIP/}))
    await expect(page.getByRole('heading',{name:'Productos',exact:true})).toBeVisible()
  })

  await narrate('open-criteria',async clock=>{
    await clock.until(.42);await demoClick(page.getByRole('button',{name:'Criterios',exact:true}))
    await expect(page.getByRole('heading',{name:'Criterios',exact:true})).toBeVisible()
  })

  await narrate('criteria-list',async clock=>{
    await clock.until(.15);await pointAt(page.getByRole('button',{name:'Instalación de barreras físicas',exact:true}),500)
    await clock.until(.52);await pointAt(page.getByText('Todas las áreas',{exact:true}).first(),500)
    await clock.until(.80);await pointAt(page.getByRole('button',{name:'Editar Instalación de barreras físicas',exact:true}),420)
  })

  const search=page.getByRole('searchbox',{name:'Buscar criterios',exact:true})
  await narrate('search',async clock=>{
    await clock.until(.20);await pointAt(search,420)
    await clock.until(.52);await demoType(search,'zonas verdes')
    await expect(page.getByRole('button',{name:'Mantenimiento de zonas verdes',exact:true})).toBeVisible()
    await clock.until(.82);await search.fill('')
  })

  await narrate('new-criterion',async clock=>{
    await clock.until(.48);await demoClick(page.getByRole('button',{name:'Nuevo criterio',exact:true}))
  })
  const dialog=page.getByRole('dialog',{name:'Nuevo criterio',exact:true});await expect(dialog).toBeVisible()

  await narrate('criterion-name',async clock=>{
    await clock.until(.32);await demoType(dialog.getByRole('textbox',{name:'Nombre',exact:true}),'Criterio de demostración')
  })

  const all=dialog.getByRole('radio',{name:'Todas las áreas',exact:true})
  const external=dialog.getByRole('radio',{name:'Solo exterior / perímetro',exact:true})
  await narrate('scope-intro',async clock=>{
    await clock.until(.18);await pointAt(all,460);await clock.until(.58);await pointAt(external,460)
  })

  await narrate('scope-general',async clock=>{
    await expect(all).toBeChecked()
    await clock.until(.22);await localZoom(dialog.locator('fieldset'),1.022);await clock.until(.82);await resetLocalZoom(dialog.locator('fieldset'))
  })

  await narrate('scope-external',async clock=>{
    await clock.until(.26);await pointAt(external,700);await clock.until(1)
  })

  await narrate('fixed-states',async clock=>{
    await clock.until(.18);await localZoom(dialog.locator('fieldset'),1.018);await clock.until(.82);await resetLocalZoom(dialog.locator('fieldset'))
  })

  await narrate('create-criterion',async clock=>{
    await clock.until(.22);await demoClick(external);await expect(external).toBeChecked()
    await clock.until(.68);await demoClick(dialog.locator('button[form="mip-criterion-form"]'));await expect(dialog).toBeHidden()
  })

  const created=page.getByRole('button',{name:'Criterio de demostración',exact:true})
  await narrate('created-criterion',async clock=>{
    await expect(created).toBeVisible();await clock.until(.22);await localZoom(created,1.025);await clock.until(.82);await resetLocalZoom(created)
  })

  await narrate('open-detail',async clock=>{await clock.until(.48);await demoClick(created)})
  const detail=page.getByRole('dialog',{name:'Criterio de demostración',exact:true});await expect(detail).toBeVisible()
  await narrate('criterion-detail',async clock=>{
    const dl=detail.locator('.mip-detail');await expect(dl).toContainText('Solo exterior / perímetro')
    await clock.until(.18);await localZoom(dl,1.025);await clock.until(.82);await resetLocalZoom(dl)
  })

  await narrate('edit-criterion',async clock=>{
    await clock.until(.50);await demoClick(detail.getByRole('button',{name:'Editar',exact:true}))
  })
  const edit=page.getByRole('dialog',{name:'Editar criterio',exact:true});await expect(edit).toBeVisible()
  await narrate('save-edit',async clock=>{
    await clock.until(.18);await demoType(edit.getByRole('textbox',{name:'Nombre',exact:true}),'Criterio demostración perímetro')
    await clock.until(.70);await demoClick(edit.locator('button[form="mip-criterion-form"]'));await expect(edit).toBeHidden()
  })

  const updated=page.getByRole('button',{name:'Criterio demostración perímetro',exact:true});await expect(updated).toBeVisible()

  await narrate('row-actions',async clock=>{
    const editBtn=page.getByRole('button',{name:'Editar Criterio demostración perímetro',exact:true})
    const stateBtn=page.getByRole('button',{name:'Desactivar Criterio demostración perímetro',exact:true})
    const deleteBtn=page.getByRole('button',{name:'Eliminar Criterio demostración perímetro',exact:true})
    await clock.until(.18);await pointAt(editBtn,420);await clock.until(.48);await pointAt(stateBtn,420);await clock.until(.76);await pointAt(deleteBtn,420)
  })

  await narrate('deactivate-criterion',async clock=>{
    await clock.until(.30);await demoClick(page.getByRole('button',{name:'Desactivar Criterio demostración perímetro',exact:true}))
    await expect(page.getByRole('dialog',{name:'Desactivar criterio',exact:true})).toBeVisible()
  })
  const deactivate=page.getByRole('dialog',{name:'Desactivar criterio',exact:true})
  await narrate('confirm-deactivation',async clock=>{
    await clock.until(.50);await demoClick(deactivate.getByRole('button',{name:'Desactivar',exact:true}));await expect(deactivate).toBeHidden();await expect(updated).toBeHidden()
  })

  await narrate('inactive-criterion',async clock=>{
    await clock.until(.34);await demoClick(page.getByRole('button',{name:'Inactivos',exact:true}))
    const inactive=page.getByRole('button',{name:'Criterio demostración perímetro',exact:true});await expect(inactive).toBeVisible()
    await clock.until(.72);await localZoom(inactive,1.025);await clock.until(.92);await resetLocalZoom(inactive)
  })

  await narrate('reactivate-criterion',async clock=>{
    await clock.until(.28);await demoClick(page.getByRole('button',{name:'Reactivar Criterio demostración perímetro',exact:true}))
    const re=page.getByRole('dialog',{name:'Reactivar criterio',exact:true});await expect(re).toBeVisible()
    await clock.until(.70);await demoClick(re.getByRole('button',{name:'Reactivar',exact:true}));await expect(re).toBeHidden()
  })

  await narrate('active-again',async clock=>{
    await clock.until(.32);await demoClick(page.getByRole('button',{name:'Activos',exact:true}))
    const active=page.getByRole('button',{name:'Criterio demostración perímetro',exact:true});await expect(active).toBeVisible()
    await clock.until(.70);await localZoom(active,1.025);await clock.until(.92);await resetLocalZoom(active)
  })

  await narrate('delete-criterion',async clock=>{
    await clock.until(.22);await demoClick(page.getByRole('button',{name:'Eliminar Criterio demostración perímetro',exact:true}))
    const del=page.getByRole('dialog',{name:'Eliminar criterio',exact:true});await expect(del).toBeVisible()
    await clock.until(.48);await pointAt(del.getByText(/solo si no tiene referencias ni historial/i),Math.min(1400,Math.round(clock.durationMs*.34)));await clock.until(1)
  })

  const del=page.getByRole('dialog',{name:'Eliminar criterio',exact:true})
  await narrate('confirm-delete',async clock=>{
    await clock.until(.54);await demoClick(del.getByRole('button',{name:'Eliminar',exact:true}));await expect(del).toBeHidden()
  })

  await narrate('deleted-criterion',async clock=>{
    await expect(page.getByRole('button',{name:'Criterio demostración perímetro',exact:true})).toBeHidden()
    const original=page.getByRole('button',{name:'Instalación de barreras físicas',exact:true});await expect(original).toBeVisible()
    await clock.until(.30);await localZoom(original,1.018);await clock.until(.80);await resetLocalZoom(original)
  })

  await showOutro(page)
  await narrate('outro',async clock=>clock.until(1))
  await page.waitForTimeout(650)

  mkdirSync(resolve(process.cwd(),'docs-media'),{recursive:true})
  writeFileSync(resolve(process.cwd(),'docs-media/timeline.json'),JSON.stringify({...timeline,durationMs:Date.now()-startedAt},null,2)+'\n')
})
