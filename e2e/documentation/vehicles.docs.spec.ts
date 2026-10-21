import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  clearCaption, demoClick, demoType, installRecordingUi, loadAudioTimings, loadNarration,
  pointAt, segmentDuration, segmentText, showCaption, showIntro, showOutro, type SceneClock,
} from './video-helpers'
import { setupVehicleDemo } from './vehicle-video-fixtures'

const narration = loadNarration(new URL('./vehicles.narration.json',import.meta.url))
const timings = loadAudioTimings()

test('video: vehículos de la Sede, placas y certificados', async ({ page }) => {
  await setupVehicleDemo(page)
  const startedAt = Date.now()
  const timeline:{narration:Array<{id:string;startMs:number}>}={narration:[]}
  async function narrate(id:string,action:(clock:SceneClock)=>Promise<void>) {
    const startMs=Date.now()-startedAt
    const durationMs=segmentDuration(narration,timings,id)
    const sceneStartedAt=Date.now()
    timeline.narration.push({id,startMs})
    await showCaption(page,segmentText(narration,id))
    const clock:SceneClock={durationMs,until:async fraction=>{
      const target=sceneStartedAt+Math.min(1,Math.max(0,fraction))*durationMs
      const remaining=target-Date.now()
      if(remaining>0) await page.waitForTimeout(remaining)
    }}
    await action(clock)
    const remaining=sceneStartedAt+durationMs+200-Date.now()
    if(remaining>0) await page.waitForTimeout(remaining)
    await clearCaption(page)
    await page.waitForTimeout(100)
  }

  await showIntro(page,narration)
  await narrate('intro',async clock=>clock.until(1))
  await page.goto('/clientes')
  await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible()
  await installRecordingUi(page)

  await narrate('open-client',async clock=>{
    await clock.until(.30)
    await demoClick(page.getByRole('button',{name:'Industrias Demo SAS',exact:true}))
    await expect(page.getByRole('heading',{name:'Industrias Demo SAS',exact:true})).toBeVisible()
  })
  await narrate('open-site',async clock=>{
    await clock.until(.30)
    await demoClick(page.getByRole('button',{name:'Sede Norte',exact:true}))
    await expect(page.getByRole('heading',{name:'Sede Norte',exact:true})).toBeVisible()
  })
  await narrate('vehicles-tab',async clock=>{
    await clock.until(.38)
    await demoClick(page.getByRole('button',{name:'Vehículos',exact:true}))
    await expect(page.getByRole('heading',{name:'Vehículos',exact:true})).toBeVisible()
  })
  await narrate('vehicles-list',async clock=>{
    await expect(page.getByRole('cell',{name:'ABC123'})).toBeVisible()
    await expect(page.getByRole('cell',{name:'GHI789'})).toBeVisible()
    await clock.until(.20)
    await pointAt(page.getByRole('cell',{name:'ABC123'}),430)
    await clock.until(.68)
    await pointAt(page.getByRole('cell',{name:'GHI789'}),420)
  })
  await narrate('new-vehicle',async clock=>{
    await clock.until(.34)
    await demoClick(page.getByRole('button',{name:'Agregar vehículo',exact:true}))
    await expect(page.getByRole('dialog',{name:'Agregar vehículo'})).toBeVisible()
  })
  let form=page.getByRole('dialog',{name:'Agregar vehículo'})
  await narrate('plate-input',async clock=>{
    await clock.until(.25)
    await demoType(form.getByRole('textbox',{name:'Placa'}),'jkl567')
    await expect(form.getByRole('textbox',{name:'Placa'})).toHaveValue('JKL567')
    await pointAt(form.getByRole('textbox',{name:'Placa'}),430)
  })
  await narrate('save-vehicle',async clock=>{
    await clock.until(.35)
    await demoClick(form.getByRole('button',{name:'Crear vehículo',exact:true}))
    await expect(form).toBeHidden()
    await expect(page.getByRole('cell',{name:'JKL567'})).toBeVisible()
  })
  const search=page.getByRole('textbox',{name:'Buscar por placa',exact:true})
  await narrate('search-vehicle',async clock=>{
    await clock.until(.20)
    await demoType(search,'jkl')
    await expect(page.getByRole('cell',{name:'JKL567'})).toBeVisible()
    await expect(page.getByRole('cell',{name:'ABC123'})).toHaveCount(0)
  })
  await narrate('edit-vehicle',async clock=>{
    await clock.until(.34)
    await demoClick(page.getByRole('button',{name:'Editar JKL567'}))
    form=page.getByRole('dialog',{name:'Editar vehículo'})
    await expect(form).toBeVisible()
    await expect(form.getByRole('textbox',{name:'Placa'})).toHaveValue('JKL567')
  })
  await narrate('change-plate',async clock=>{
    await clock.until(.24)
    await demoType(form.getByRole('textbox',{name:'Placa'}),'mno890')
    await expect(form.getByRole('textbox',{name:'Placa'})).toHaveValue('MNO890')
    await clock.until(.68)
    await demoClick(form.getByRole('button',{name:'Guardar cambios'}))
    await expect(form).toBeHidden()
    await search.fill('')
    await expect(page.getByRole('cell',{name:'MNO890'})).toBeVisible()
  })
  await narrate('open-certificates',async clock=>{
    await clock.until(.40)
    await demoClick(page.getByRole('button',{name:'Certificados de ABC123'}))
    await expect(page.getByRole('dialog',{name:'Certificados · ABC123'})).toBeVisible()
  })
  const history=page.getByRole('dialog',{name:'Certificados · ABC123'})
  await narrate('certificates-list',async clock=>{
    await expect(history.getByText('022',{exact:true})).toBeVisible()
    await clock.until(.22)
    await pointAt(history.getByText('022',{exact:true}),480)
    await clock.until(.68)
    await pointAt(history.getByRole('button',{name:'Ver',exact:true}),480)
  })
  await narrate('certificate-preview',async clock=>{
    await clock.until(.30)
    await demoClick(history.getByRole('button',{name:'Ver',exact:true}))
    await expect(history.locator('iframe.certificate-frame')).toBeVisible()
    await clock.until(.82)
  })
  await narrate('certificate-download',async clock=>{
    await clock.until(.34)
    await pointAt(history.getByRole('button',{name:'Descargar PDF'}),850)
  })
  await narrate('certificate-back',async clock=>{
    await clock.until(.25)
    await demoClick(history.getByRole('button',{name:/Volver a certificados/}))
    await expect(history.getByText('022',{exact:true})).toBeVisible()
    await clock.until(.58)
    await demoClick(history.getByRole('button',{name:'Cerrar',exact:true}).last())
    await expect(history).toBeHidden()
  })
  await narrate('delete-attempt',async clock=>{
    await clock.until(.26)
    await demoClick(page.getByRole('button',{name:'Eliminar ABC123'}))
    const confirm=page.getByRole('dialog',{name:'Eliminar vehículo'})
    await expect(confirm).toBeVisible()
    await clock.until(.70)
    await demoClick(confirm.getByRole('button',{name:'Eliminar',exact:true}))
    await expect(page.getByRole('dialog',{name:'Desactivar vehículo'})).toBeVisible()
  })
  await narrate('deactivate',async clock=>{
    const confirm=page.getByRole('dialog',{name:'Desactivar vehículo'})
    await clock.until(.38)
    await demoClick(confirm.getByRole('button',{name:'Desactivar',exact:true}))
    await expect(confirm).toBeHidden()
  })
  await narrate('inactive',async clock=>{
    await expect(page.getByRole('button',{name:'Reactivar ABC123'})).toBeVisible()
    await clock.until(.20)
    await pointAt(page.getByRole('button',{name:'Certificados de ABC123'}),650)
  })
  await narrate('reactivate',async clock=>{
    await clock.until(.36)
    await demoClick(page.getByRole('button',{name:'Reactivar ABC123'}))
    await expect(page.getByRole('button',{name:'Eliminar ABC123'})).toBeVisible()
  })
  await showOutro(page)
  await narrate('outro',async clock=>clock.until(1))
  await page.waitForTimeout(600)
  mkdirSync(resolve(process.cwd(),'docs-media'),{recursive:true})
  writeFileSync(resolve(process.cwd(),'docs-media/timeline.json'),
    JSON.stringify({...timeline,durationMs:Date.now()-startedAt},null,2)+'\n')
})
