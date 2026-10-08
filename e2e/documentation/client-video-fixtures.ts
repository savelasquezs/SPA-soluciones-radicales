import type { Page } from '@playwright/test'

export const clientId = '61000000-0000-4000-8000-000000000001'
export const siteId = '62000000-0000-4000-8000-000000000001'

export const client = {
  id: clientId,
  tipoCliente: 'NEGOCIO',
  nombre: 'Industrias Demo SAS',
  nit: '901777000',
  correos: ['administracion@industrias-demo.test'],
  activo: true,
  version: 1,
  vigenciaCertificadoMeses: 12,
  residenciaDireccion: null,
  residenciaCelular: null,
  sedesCount: 0,
}

const profile = {
  id: '90000000-0000-4000-8000-000000000001',
  nombreCompleto: 'Administrador de demostración',
  correoGoogle: 'demo@solucionesradicales.test',
  esAdmin: true,
  esTecnico: false,
  rolActivo: 'ADMINISTRADOR',
  requiereSeleccionRol: false,
}

export async function setupSiteDemo(page: Page) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites: any[] = []
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))

  await page.route('**/get-session', async route => {
    await route.fulfill({
      json: {
        session: { id:'demo-session', userId:'demo-auth', token:'demo-token', expiresAt:'2099-01-01T00:00:00.000Z', createdAt:'2026-10-08T00:00:00.000Z', updatedAt:'2026-10-08T00:00:00.000Z' },
        user: { id:'demo-auth', name:profile.nombreCompleto, email:profile.correoGoogle, emailVerified:true, createdAt:'2026-10-08T00:00:00.000Z', updatedAt:'2026-10-08T00:00:00.000Z' },
      },
    })
  })

  await page.route('https://api.example.test/api/**', async route => {
    const request=route.request(), url=new URL(request.url()), path=url.pathname, method=request.method()
    if (method==='OPTIONS') { await route.fulfill({status:204}); return }
    if (path==='/api/session') { await route.fulfill({json:profile}); return }
    if (path==='/api/clients' && method==='GET') { await route.fulfill({json:url.searchParams.get('active')==='false' ? [] : [client]}); return }
    if (path===`/api/clients/${clientId}` && method==='GET') { await route.fulfill({json:{...client,sedesCount:sites.length}}); return }
    if (path===`/api/clients/${clientId}/sites` && method==='GET') { await route.fulfill({json:sites}); return }

    if (path===`/api/clients/${clientId}/sites` && method==='POST') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body=request.postDataJSON() as any
      await new Promise(resolve=>setTimeout(resolve,500))
      const created={
        id:siteId, clientId, nombre:body.nombre, direccion:body.direccion,
        correos:body.correos??[], heredaCorreosCliente:body.heredaCorreosCliente,
        contactoPrincipalNombre:body.contactoPrincipalNombre,
        contactoPrincipalCorreo:body.contactoPrincipalCorreo,
        contactoPrincipalCelular:body.contactoPrincipalCelular,
        valorServicio:body.valorServicio, periodicidadMeses:body.periodicidadMeses,
        manejaRefuerzo:body.manejaRefuerzo, tipoSede:'NEGOCIO',
        planoStoragePath:body.planoStoragePath??null, manejaVehiculos:body.manejaVehiculos,
        generaCertificadoVehiculo:body.generaCertificadoVehiculo,
        vigenciaCertificadoVehiculoMeses:body.vigenciaCertificadoVehiculoMeses,
        duracionServicioMinutos:body.duracionServicioMinutos, activo:true, version:1,
        areasCount:0, proximoServicio:null,
      }
      sites.push(created)
      await route.fulfill({status:201,json:created}); return
    }

    if (path===`/api/sites/${siteId}` && method==='GET') { await route.fulfill({json:sites[0]}); return }
    if (path===`/api/sites/${siteId}` && method==='PATCH') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body=request.postDataJSON() as any
      Object.assign(sites[0],body,{version:sites[0].version+1})
      await route.fulfill({json:sites[0]}); return
    }

    await route.fulfill({status:404,json:{error:`Ruta de demostración no preparada: ${path}`}})
  })
}
