import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import {
  clearCaption, demoClick, demoType, installRecordingUi, loadAudioTimings, loadNarration,
  localZoom, pointAt, resetLocalZoom, segmentDuration, segmentText, showCaption,
  showIntro, showOutro, type SceneClock,
} from './video-helpers'
import { setupSiteDemo } from './client-video-fixtures'

const narration = loadNarration(new URL('./sites.narration.json', import.meta.url))
const audioTimings = loadAudioTimings()

test('video: gestión de Sedes', async ({ page }) => {
  await setupSiteDemo(page)
  const startedAt=Date.now()
  const timeline:{narration:Array<{id:string;startMs:number}>}={narration:[]}

  async function narrate(id:string, action:(clock:SceneClock)=>Promise<void>) {
    const startMs=Date.now()-startedAt
    const durationMs=segmentDuration(narration,audioTimings,id)
    const sceneStartedAt=Date.now()
    timeline.narration.push({id,startMs})
    await showCaption(page,segmentText(narration,id))
    const clock:SceneClock={durationMs,until:async fraction=>{
      const target=sceneStartedAt+Math.max(0,Math.min(1,fraction))*durationMs
      const remaining=target-Date.now()
      if(remaining>0) await page.waitForTimeout(remaining)
    }}
    await action(clock)
    const remaining=sceneStartedAt+durationMs+180-Date.now()
    if(remaining>0) await page.waitForTimeout(remaining)
    await clearCaption(page)
    await page.waitForTimeout(110)
  }

  await showIntro(page,narration)
  await narrate('intro',async clock=>clock.until(1))

  await page.goto('/clientes')
  await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible()
  await installRecordingUi(page)

  await narrate('open-client',async clock=>{
    await clock.until(.36)
    await demoClick(page.getByRole('button',{name:'Industrias Demo SAS',exact:true}))
    await expect(page.getByRole('heading',{name:'Industrias Demo SAS',exact:true})).toBeVisible()
  })

  await narrate('sites-section',async clock=>{
    await clock.until(.18)
    await pointAt(page.getByRole('button',{name:'Sedes',exact:true}),420)
    await clock.until(.58)
    await pointAt(page.getByRole('button',{name:'Agregar Sede',exact:true}).first(),620)
  })

  await narrate('new-site',async clock=>{
    await clock.until(.48)
    await demoClick(page.getByRole('button',{name:'Agregar Sede',exact:true}).first())
  })

  const dialog=page.getByRole('dialog',{name:'Crear Sede',exact:true})
  await expect(dialog).toBeVisible()

  await narrate('site-data',async clock=>{
    await clock.until(.10)
    await demoType(dialog.getByRole('textbox',{name:'Nombre',exact:true}),'Sede Norte')
    await clock.until(.38)
    await demoType(dialog.getByRole('textbox',{name:'Dirección',exact:true}),'Calle 50 # 20-30')
    await clock.until(.68)
    await demoType(dialog.getByRole('textbox',{name:'Contacto principal',exact:true}),'Ana Demostración')
  })

  await narrate('contact-phone',async clock=>{
    const phone=dialog.getByRole('textbox',{name:'Celular',exact:true})
    await clock.until(.28)
    await demoType(phone,'3007770101')
    await clock.until(.78)
    await pointAt(phone,380)
  })

  await narrate('contact-email',async clock=>{
    const email=dialog.getByRole('textbox',{name:'Correo',exact:true})
    await clock.until(.28)
    await demoType(email,'ana@sede-demo.test')
    await clock.until(.78)
    await pointAt(email,380)
  })

  await narrate('extra-emails',async clock=>{
    const extra=dialog.getByRole('textbox',{name:'Correos adicionales',exact:true})
    const inherit=dialog.getByRole('checkbox',{name:'Incluir correos generales del cliente',exact:true})
    await clock.until(.18)
    await demoType(extra,'operaciones@sede-demo.test')
    await clock.until(.64)
    await pointAt(inherit,480)
  })

  await narrate('operation',async clock=>{
    const value=dialog.getByRole('spinbutton',{name:'Valor en COP',exact:true})
    const periodicity=dialog.getByRole('spinbutton',{name:'Periodicidad en meses',exact:true})
    const duration=dialog.getByRole('spinbutton',{name:'Duración en minutos',exact:true})
    await clock.until(.10); await value.fill('180000'); await pointAt(value,260)
    await clock.until(.42); await periodicity.fill('1'); await pointAt(periodicity,260)
    await clock.until(.72); await duration.fill('120'); await pointAt(duration,260)
  })

  await narrate('reinforcement',async clock=>{
    const input=dialog.getByRole('checkbox',{name:'Maneja visita de refuerzo',exact:true})
    await clock.until(.48)
    await demoClick(input)
    await expect(input).toBeChecked()
  })

  const vehicles=dialog.getByRole('checkbox',{name:'Maneja vehículos',exact:true})
  await narrate('vehicles-toggle',async clock=>{
    await clock.until(.48)
    await demoClick(vehicles)
    await expect(vehicles).toBeChecked()
    await expect(dialog.getByText('Certificado vehicular',{exact:true})).toBeVisible()
  })

  const cert=dialog.getByRole('checkbox',{name:'Genera certificado para vehículos',exact:true})
  await narrate('vehicle-certificate',async clock=>{
    await clock.until(.48)
    await demoClick(cert)
    await expect(cert).toBeChecked()
  })

  const months=dialog.getByRole('spinbutton',{name:'Vigencia en meses',exact:true})
  await narrate('vehicle-validity',async clock=>{
    await clock.until(.28)
    await months.fill('6')
    await pointAt(months,680)
  })

  await narrate('future-vehicles',async clock=>{
    const section=dialog.getByText('Certificado vehicular',{exact:true}).locator('..')
    await clock.until(.16)
    await localZoom(section,1.015)
    await clock.until(.84)
    await resetLocalZoom(section)
  })

  await narrate('plan',async clock=>{
    const section=dialog.getByText('Plano',{exact:true}).locator('..')
    await clock.until(.20)
    await localZoom(section,1.01)
    await clock.until(.82)
    await resetLocalZoom(section)
  })

  await narrate('create-site',async clock=>{
    await clock.until(.48)
    await demoClick(dialog.getByRole('button',{name:'Crear Sede',exact:true}))
    await expect(dialog).toBeHidden()
  })

  const site=page.getByRole('button',{name:'Sede Norte',exact:true})
  await narrate('site-created',async clock=>{
    await expect(site).toBeVisible()
    const card=site.locator('..').locator('..')
    await clock.until(.18)
    await localZoom(card,1.015)
    await clock.until(.82)
    await resetLocalZoom(card)
  })

  await narrate('whatsapp-action',async clock=>{
    const link=page.getByRole('link',{name:/Hablar por WhatsApp con 300 777 0101/})
    await clock.until(.38)
    await pointAt(link,860)
  })

  await narrate('email-action',async clock=>{
    const link=page.getByRole('link',{name:'Enviar correo',exact:true})
    await clock.until(.38)
    await pointAt(link,860)
  })

  await narrate('open-site-detail',async clock=>{
    await clock.until(.48)
    await demoClick(site)
    await expect(page.getByRole('heading',{name:'Sede Norte',exact:true})).toBeVisible()
  })

  await narrate('site-summary',async clock=>{
    const summary=page.locator('.summary-grid')
    await expect(summary).toContainText('Maneja vehículos')
    await clock.until(.18)
    await localZoom(summary,1.012)
    await clock.until(.84)
    await resetLocalZoom(summary)
  })

  await narrate('edit-site',async clock=>{
    await clock.until(.32)
    await demoClick(page.getByRole('button',{name:'Editar Sede',exact:true}))
    const edit=page.getByRole('dialog',{name:'Editar Sede',exact:true})
    await expect(edit).toBeVisible()
    await expect(edit.getByRole('checkbox',{name:'Maneja vehículos',exact:true})).toBeChecked()
    await expect(edit.getByRole('checkbox',{name:'Genera certificado para vehículos',exact:true})).toBeChecked()
    await clock.until(.72)
    await pointAt(edit.getByRole('spinbutton',{name:'Vigencia en meses',exact:true}),520)
  })

  await showOutro(page)
  await narrate('outro',async clock=>clock.until(1))
  await page.waitForTimeout(650)

  mkdirSync(resolve(process.cwd(),'docs-media'),{recursive:true})
  writeFileSync(resolve(process.cwd(),'docs-media/timeline.json'),JSON.stringify({...timeline,durationMs:Date.now()-startedAt},null,2)+'\n')
})
