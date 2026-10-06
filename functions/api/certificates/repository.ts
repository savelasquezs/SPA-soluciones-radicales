import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { ApiError } from '../auth'
import type { CertificateContext, CertificateData, CertificateDocument, CertificateSettings, CertificateTemplate, CertificateType } from '../../../src/types/certificates'
import { CERTIFICATE_TYPES } from '../../../src/types/certificates'

const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function templateKey(type: CertificateType): string { return `CERTIFICADO_PLANTILLA_${type}` }
export function targetKey(type: CertificateType, vehicleId: string | null): string { return type === 'VEHICULO' ? vehicleId! : 'ESTABLECIMIENTO' }

export async function loadSettings(client: PoolClient): Promise<CertificateSettings> {
  const { rows } = await client.query<{ clave: string; valor: { storagePath?: string; revision?: string; fileName?: string } | null }>(
    `select clave, valor from public.configuracion where categoria = 'SISTEMA' and clave = any($1::text[]) and activo`,
    [CERTIFICATE_TYPES.map(templateKey)],
  )
  const converter = await client.query<{ ready: boolean }>(
    `select exists (
       select 1 from private.google_integrations
       where singleton and scopes @> array[$1]::text[]
     ) as ready`,
    [GOOGLE_DRIVE_FILE_SCOPE],
  )
  return {
    converterReady: converter.rows[0]?.ready ?? false,
    templates: CERTIFICATE_TYPES.map((type): CertificateTemplate => {
      const value = rows.find((row) => row.clave === templateKey(type))?.valor
      return { type, storagePath: value?.storagePath ?? null, revision: value?.revision ?? null, fileName: value?.fileName ?? null }
    }),
  }
}

export type ServiceSource = {
  id: string; version: string; solicitud: string; state: string; serviceType: string; siteType: string; clientType: string
  siteId: string; clientName: string; nit: string; siteName: string; address: string; technicianName: string
  issuedOn: string | null; businessMonths: number | null; vehicleMonths: number | null
  establishmentTemplate: string | null; vehicleTemplate: string | null; vehicleEnabled: boolean
  businessEmails: string[] | null; siteEmails: string[] | null; contactEmail: string | null
}
export type LoadedCertificateContext = {
  context: CertificateContext; source: ServiceSource; settings: CertificateSettings; products: Record<string, string>[]; historicalData: Record<string, CertificateData>
}

export async function loadCertificateContext(client: PoolClient, serviceId: string): Promise<LoadedCertificateContext> {
  const { rows } = await client.query<ServiceSource>(
    `select sv.id, sv.version::text, sv.solicitud, sv.estado as state, sv.tipo_servicio as "serviceType",
     s.tipo_sede as "siteType", n.tipo_cliente as "clientType", s.id as "siteId",
     n.nombre as "clientName", n.nit, s.nombre as "siteName", s.direccion as address,
     u.nombre_completo as "technicianName", (sv.fin_real at time zone 'America/Bogota')::date::text as "issuedOn",
     n.vigencia_cert_establecimiento_meses as "businessMonths", s.vigencia_cert_vehiculo_meses as "vehicleMonths",
     n.plantilla_cert_establecimiento_storage_path as "establishmentTemplate",
     s.plantilla_cert_vehiculo_storage_path as "vehicleTemplate",
     (s.maneja_vehiculos and s.genera_certificado_vehiculo) as "vehicleEnabled",
     n.correos_json as "businessEmails", s.correos_json as "siteEmails", s.contacto_principal_correo as "contactEmail"
     from public.servicios sv join public.sedes s on s.id = sv.sede_id
     join public.negocios n on n.id = s.negocio_id join public.usuarios u on u.id = sv.tecnico_responsable_id
     where sv.id = $1`, [serviceId],
  )
  const source = rows[0]
  if (!source) throw new ApiError(404, 'El servicio no existe')
  if (source.state !== 'FINALIZADO' || source.serviceType !== 'PRINCIPAL' || source.siteType !== 'NEGOCIO' || source.clientType !== 'NEGOCIO' || !source.issuedOn) {
    throw new ApiError(422, 'Selecciona un servicio principal finalizado de un negocio, con fecha real de finalización')
  }
  const settings = await loadSettings(client)
  const vehicles = await client.query<{ id: string; placa: string }>(
    `select v.id, v.placa from public.vehiculos v join public.servicios sv on sv.sede_id = v.sede_id
     where sv.id = $1 and coalesce(sv.vehiculos_atendidos_ids_json, '[]'::jsonb) ? v.id::text order by v.placa`, [serviceId],
  )
  const documents = await client.query<CertificateDocument>(
    `select c.id, c.tipo_certificado as type, c.vehiculo_id as "vehicleId", coalesce(v.placa, 'Establecimiento') as label,
     c.pdf_storage_path as "storagePath", c.fecha_expedicion::text as "issuedOn", c.fecha_vencimiento::text as "expiresOn"
     from public.certificados c left join public.vehiculos v on v.id = c.vehiculo_id where c.servicio_id = $1`, [serviceId],
  )
  const products = await client.query<Record<string, string>>(
    `select p.nombre, p.principio_activo_composicion as principio_activo,
     coalesce(p.registro_sanitario, '') as registro_sanitario, coalesce(pa.lote, '') as lote,
     coalesce(m.nombre, pa.metodo_aplicacion_codigo, '') as metodo
     from public.productos_aplicados pa join public.productos p on p.id = pa.producto_id
     left join public.configuracion m on m.categoria = 'METODO_APLICACION' and m.clave = pa.metodo_aplicacion_codigo
     where pa.servicio_id = $1 and pa.aplicado order by p.nombre, pa.id`, [serviceId],
  )
  const historical = await client.query<{ id: string; data: CertificateData }>(
    `select distinct on (entry->>'id') entry->>'id' as id, entry->'data' as data
     from private.integration_jobs j cross join lateral jsonb_array_elements(coalesce(j.payload->'snapshot'->'certificates', '[]'::jsonb)) entry
     where j.job_type = 'DOCUMENT' and j.status = 'COMPLETED' and j.payload->'request'->>'serviceId' = $1
     order by entry->>'id', j.created_at asc, j.id`, [serviceId],
  )
  const availability = Object.fromEntries(CERTIFICATE_TYPES.map((type) => {
    const custom = type === 'ESTABLECIMIENTO' ? source.establishmentTemplate : source.vehicleTemplate
    const global = settings.templates.find((template) => template.type === type)?.storagePath
    const months = type === 'ESTABLECIMIENTO' ? source.businessMonths : source.vehicleMonths
    const reason = type === 'VEHICULO' && !source.vehicleEnabled ? 'Esta sede no tiene certificados vehiculares habilitados.'
      : !months || months <= 0 ? 'Configura la vigencia en el negocio o la sede.'
        : !(custom || global) ? 'Configura una plantilla Word para este tipo de certificado.'
          : type === 'VEHICULO' && !vehicles.rows.length ? 'No hay vehículos registrados como atendidos en este servicio.' : null
    return [type, { available: !reason, reason, templateSource: custom ? 'PERSONALIZADA' : global ? 'GLOBAL' : null }]
  })) as CertificateContext['availability']
  const recipients = [...new Set([...(source.businessEmails ?? []), ...(source.siteEmails ?? []), source.contactEmail]
    .filter((value): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    .map((value) => value.toLowerCase().trim()))]
  return {
    source, settings, products: products.rows, historicalData: Object.fromEntries(historical.rows.map((row) => [row.id, row.data])),
    context: { serviceId, solicitud: source.solicitud, clientName: source.clientName, siteName: source.siteName, recipients, vehicles: vehicles.rows, documents: documents.rows, availability },
  }
}

export function effectiveTemplate(loaded: LoadedCertificateContext, type: CertificateType): string {
  const availability = loaded.context.availability[type]
  if (!availability.available) throw new ApiError(422, availability.reason ?? 'El certificado no está habilitado')
  return (type === 'ESTABLECIMIENTO' ? loaded.source.establishmentTemplate : loaded.source.vehicleTemplate)
    || loaded.settings.templates.find((template) => template.type === type)!.storagePath!
}

export function addCalendarMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(day, last))
  return first.toISOString().slice(0, 10)
}
function displayDate(date: string): string { return date.split('-').reverse().join('/') }

export function certificateSnapshot(loaded: LoadedCertificateContext, type: CertificateType, vehicleId: string | null) {
  const previous = loaded.context.documents.find((doc) => doc.type === type && doc.vehicleId === vehicleId)
  const vehicle = loaded.context.vehicles.find((item) => item.id === vehicleId)
  if (type === 'VEHICULO' && !vehicle) throw new ApiError(422, 'El vehículo no fue atendido en este servicio')
  const issuedOn = previous?.issuedOn ?? loaded.source.issuedOn!
  // Regeneration does not extend validity. Preserve the original certificate's dates.
  const expiresOn = previous?.expiresOn ?? addCalendarMonths(issuedOn, type === 'ESTABLECIMIENTO' ? loaded.source.businessMonths! : loaded.source.vehicleMonths!)
  const data: CertificateData = previous && loaded.historicalData[previous.id] ? { ...loaded.historicalData[previous.id]!, fecha_expedicion: displayDate(issuedOn), fecha_vencimiento: displayDate(expiresOn) } : {
    negocio_nombre: loaded.source.clientName, nit: loaded.source.nit, sede_nombre: loaded.source.siteName,
    sede_direccion: loaded.source.address, tecnico_nombre: loaded.source.technicianName, solicitud: loaded.source.solicitud,
    fecha_expedicion: displayDate(issuedOn), fecha_vencimiento: displayDate(expiresOn),
    ...(vehicle ? { vehiculo_placa: vehicle.placa } : {}), productos: loaded.products,
    metodos: [...new Set(loaded.products.map((product) => product.metodo).filter((name): name is string => Boolean(name)))].map((nombre) => ({ nombre })),
  }
  return { id: previous?.id ?? randomUUID(), type, vehicleId, label: vehicle?.placa ?? 'Establecimiento', issuedOn, expiresOn, data, previous }
}
