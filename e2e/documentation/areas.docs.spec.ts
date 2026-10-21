import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  clearCaption, demoClick, demoType, installRecordingUi, loadAudioTimings, loadNarration,
  pointAt, segmentDuration, segmentText, showCaption, showIntro, showOutro, type SceneClock,
} from './video-helpers'
import { setupAreaDemo } from './areas-video-fixtures'

const narration=loadNarration(new URL('./areas.narration.json',import.meta.url))
const timings=loadAudioTimings()

test('video: gestión y reutilización de Áreas por Sede',async({page})=>{
  await setupAreaDemo(page)
  const startedAt=Date.now()
  const timeline:{narration:Array<{id:string;startMs:number}>}={narration:[]}
  async function narrate(id:string,action:(clock:SceneClock)=>Promise<void>) {
    const startMs=Date.now()-startedAt
    const durationMs=segmentDuration(narration,timings,id)
    const sceneStart=Date.now()
    timeline.narration.push({id,startMs})
    await showCaption(page,segmentText(narration,id))
    const clock:SceneClock={durationMs,until:async fraction=>{
      const target=sceneStart+Math.max(0,Math.min(1,fraction))*durationMs
      const remaining=target-Date.now()
      if(remaining>0)await page.waitForTimeout(remaining)
    }}
    await action(clock)
    const remaining=sceneStart+durationMs+200-Date.now()
    if(remaining>0)await page.waitForTimeout(remaining)
    await clearCaption(page)
    await page.waitForTimeout(110)
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
  await narrate('open-areas',async clock=>{
    await clock.until(.35)
    await demoClick(page.getByRole('button',{name:'Áreas',exact:true}))
    await expect(page.getByRole('cell',{name:'Cocina',exact:true})).toBeVisible()
  })
  await narrate('area-types',async clock=>{
    await clock.until(.15)
    await pointAt(page.getByRole('cell',{name:'Exterior / perímetro',exact:true}),550)
    await clock.until(.66)
    await pointAt(page.getByRole('cell',{name:'Interior',exact:true}).first(),450)
  })
  await narrate('open-create',async clock=>{
    await clock.until(.35)
    await demoClick(page.getByRole('button',{name:'Agregar Área',exact:true}).first())
    await expect(page.getByRole('dialog',{name:'Agregar Área',exact:true})).toBeVisible()
  })
  const formCreate=page.getByRole('dialog',{name:'Agregar Área',exact:true})
  await narrate('name-create',async clock=>{
    await clock.until(.25)
    await demoType(formCreate.getByRole('textbox',{name:'Nombre del Área',exact:true}),'Zona de carga')
    await expect(formCreate.getByRole('textbox',{name:'Nombre del Área',exact:true})).toHaveValue('Zona de carga')
  })
  await narrate('mark-exterior',async clock=>{
    await clock.until(.30)
    await demoClick(formCreate.getByRole('checkbox',{name:'Zona exterior o perimetral',exact:true}))
    await expect(formCreate.getByRole('checkbox',{name:'Zona exterior o perimetral',exact:true})).toBeChecked()
  })
  await narrate('save-create',async clock=>{
    await clock.until(.35)
    await demoClick(formCreate.getByRole('button',{name:'Agregar Área',exact:true}))
    await expect(formCreate).toBeHidden()
    await expect(page.getByRole('cell',{name:'Zona de carga',exact:true})).toBeVisible()
  })
  await narrate('show-details',async clock=>{
    await clock.until(.29)
    await demoClick(page.getByRole('button',{name:'Cocina',exact:true}))
    const detail=page.getByRole('complementary',{name:'Detalle del Área'})
    await expect(detail).toBeVisible()
    await expect(detail.getByText('2', {exact:true})).toBeVisible()
  })
  await narrate('open-edit',async clock=>{
    await clock.until(.16)
    await demoClick(page.getByRole('button',{name:'Cerrar detalle'}))
    await clock.until(.48)
    await demoClick(page.getByRole('button',{name:'Editar Zona de carga'}))
    const dialog=page.getByRole('dialog',{name:'Editar Área',exact:true})
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('checkbox',{name:'Zona exterior o perimetral',exact:true})).toBeChecked()
  })
  const formEdit=page.getByRole('dialog',{name:'Editar Área',exact:true})
  await narrate('save-edit',async clock=>{
    await clock.until(.20)
    await demoType(formEdit.getByRole('textbox',{name:'Nombre del Área',exact:true}),'Patio de carga')
    await clock.until(.68)
    await demoClick(formEdit.getByRole('button',{name:'Guardar cambios',exact:true}))
    await expect(formEdit).toBeHidden()
    await expect(page.getByRole('cell',{name:'Patio de carga',exact:true})).toBeVisible()
  })
  await narrate('reuse',async clock=>{
    await clock.until(.14)
    await pointAt(page.getByRole('cell',{name:'Cocina',exact:true}),510)
    await clock.until(.61)
    await pointAt(page.getByRole('cell',{name:'Patio de carga',exact:true}),510)
  })
  await narrate('snapshots',async clock=>{
    await clock.until(.20)
    await pointAt(page.getByRole('cell',{name:'Cocina',exact:true}),700)
  })
  await narrate('delete-attempt',async clock=>{
    await clock.until(.30)
    await demoClick(page.getByRole('button',{name:'Eliminar Cocina'}))
    const confirm=page.getByRole('dialog',{name:'Eliminar Área'})
    await expect(confirm).toBeVisible()
    await clock.until(.59)
    const remove=confirm.getByRole('button',{name:'Eliminar',exact:true})
    await pointAt(remove,240)
    // Evita la espera provocada por la superposición transitoria de los diálogos.
    await remove.click({force:true})
    await expect(page.getByRole('dialog',{name:'Desactivar Área'})).toBeVisible()
  })
  await narrate('deactivate',async clock=>{
    const confirm=page.getByRole('dialog',{name:'Desactivar Área'})
    const action=confirm.getByRole('button',{name:'Desactivar',exact:true})
    await clock.until(.34)
    await pointAt(action,260)
    // El diálogo precedente puede seguir interceptando el puntero durante su transición.
    // La acción visible y habilitada se activa directamente para no introducir silencios.
    await expect(action).toBeVisible()
    await action.click({force:true})
    await expect(confirm).toBeHidden()
  })
  await narrate('inactive',async clock=>{
    await expect(page.getByRole('button',{name:'Reactivar Cocina'})).toBeVisible()
    await clock.until(.30)
    await pointAt(page.getByRole('button',{name:'Reactivar Cocina'}),850)
  })
  await narrate('reactivate',async clock=>{
    await clock.until(.34)
    await demoClick(page.getByRole('button',{name:'Reactivar Cocina'}))
    await expect(page.getByRole('button',{name:'Eliminar Cocina'})).toBeVisible()
  })
  await narrate('delete-empty',async clock=>{
    await clock.until(.25)
    await demoClick(page.getByRole('button',{name:'Eliminar Patio de carga'}))
    const confirm=page.getByRole('dialog',{name:'Eliminar Área'})
    await expect(confirm).toBeVisible()
    await clock.until(.72)
    await demoClick(confirm.getByRole('button',{name:'Eliminar',exact:true}))
    await expect(page.getByRole('cell',{name:'Patio de carga',exact:true})).toHaveCount(0)
  })
  await showOutro(page)
  await narrate('outro',async clock=>clock.until(1))
  await page.waitForTimeout(550)
  mkdirSync(resolve(process.cwd(),'docs-media'),{recursive:true})
  writeFileSync(resolve(process.cwd(),'docs-media/timeline.json'),JSON.stringify({...timeline,durationMs:Date.now()-startedAt},null,2)+'\n')
})
