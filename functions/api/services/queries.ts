import type { PoolClient } from 'pg'
import type { AdminService, PagedResult, ServiceFilter, ServiceProductOption, ServiceSite, ServiceTechnician, ServiceWorkspace, UpcomingFilter, UpcomingService } from '../../../src/types/adminServices'
import { normalizeServiceSearch } from '../../../src/helpers/adminServices'
import { ApiError } from '../auth'

const technicianJson = (alias: string) => `jsonb_build_object('id',${alias}.id,'nombreCompleto',${alias}.nombre_completo,
  'correoGoogle',${alias}.correo_google,'activo',${alias}.activo,'tieneCertificado',${alias}.certificado_storage_path is not null,
  'certificadoFechaVencimiento',${alias}.certificado_fecha_vencimiento)`
const contactJson = `jsonb_build_object('nombre',se.contacto_principal_nombre,'celular',se.contacto_principal_celular,
  'correos',(select coalesce(jsonb_agg(email order by email),'[]'::jsonb) from (
    select distinct lower(btrim(value)) as email from jsonb_array_elements_text(
      coalesce(case when se.hereda_correos_negocio then n.correos_json else se.correos_json end,'[]'::jsonb))
    union select lower(btrim(se.contacto_principal_correo)) where nullif(btrim(se.contacto_principal_correo),'') is not null
  ) emails where nullif(email,'') is not null))`
const linkJson = (alias: string) => `jsonb_build_object('id',${alias}.id,'solicitud',${alias}.solicitud,'tipoServicio',${alias}.tipo_servicio,
  'estado',${alias}.estado,'version',${alias}.version,'inicioProgramado',${alias}.inicio_programado,'finProgramado',${alias}.fin_programado,
  'tecnicoResponsableId',${alias}.tecnico_responsable_id,'tecnicosColaboradoresIds',coalesce(${alias}.tecnicos_colaboradores_ids_json,'[]'::jsonb))`

export const SERVICE_FROM = `from public.servicios s join public.sedes se on se.id=s.sede_id
  join public.negocios n on n.id=se.negocio_id join public.usuarios responsible on responsible.id=s.tecnico_responsable_id`
export const SERVICE_SELECT = `select ${linkJson('s')} || jsonb_build_object(
  'clientId',n.id,'clienteNombre',n.nombre,'sedeId',se.id,'sedeNombre',se.nombre,'tipoSede',se.tipo_sede,'direccion',se.direccion,
  'servicioPrincipalId',s.servicio_principal_id,'inicioReal',s.inicio_real,'finReal',s.fin_real,
  'responsable',${technicianJson('responsible')},
  'colaboradores',(select coalesce(jsonb_agg(${technicianJson('u')} order by u.nombre_completo),'[]'::jsonb)
    from public.usuarios u where coalesce(s.tecnicos_colaboradores_ids_json,'[]'::jsonb) ? u.id::text),
  'contacto',${contactJson},'valorServicio',s.valor_servicio,'observaciones',coalesce(s.observaciones,''),
  'productos',(select coalesce(jsonb_agg(jsonb_build_object('id',pa.id,'productoId',p.id,'nombre',coalesce(pa.producto_nombre_snapshot,p.nombre),
    'activo',p.activo,'aplicado',pa.aplicado,'lote',coalesce(pa.lote,''),'fechaVencimiento',pa.fecha_vencimiento,
    'dosis',case when pa.aplicado then coalesce(pa.dosis_referencia_snapshot,p.dosis_aplicacion,'') else coalesce(p.dosis_aplicacion,'') end,
    'metodoAplicacionNombre',case when pa.aplicado then coalesce(pa.metodo_aplicacion_nombre_snapshot,
      (select c.nombre from public.configuracion c where c.categoria='METODO_APLICACION' and c.clave=pa.metodo_aplicacion_codigo),'')
      else coalesce((select string_agg(c.nombre,', ' order by coalesce(c.orden,2147483647),c.nombre,c.id)
        from public.producto_metodos pm join public.configuracion c on c.id=pm.metodo_id
        where pm.producto_id=p.id and c.categoria='METODO_APLICACION' and c.activo),'') end)
    order by p.nombre,p.id),'[]'::jsonb) from public.productos_aplicados pa join public.productos p on p.id=pa.producto_id where pa.servicio_id=s.id),
  'refuerzo',(select ${linkJson('r')} from public.servicios r where r.servicio_principal_id=s.id),
  'principal',(select ${linkJson('r')} from public.servicios r where r.id=s.servicio_principal_id),
  'pago',jsonb_build_object('metodoPago',s.metodo_pago,'estadoPago',s.estado_pago,'tecnicoRecaudoPrevistoId',s.tecnico_recaudo_previsto_id,
    'recaudadoPorId',s.recaudado_por_id,'recaudadoPorNombre',(select nombre_completo from public.usuarios where id=s.recaudado_por_id),
    'pagoFecha',s.pago_fecha,'confirmadoAt',s.pago_confirmado_at,'confirmadoPor',(select nombre_completo from public.usuarios where id=s.pago_confirmado_por_id),
    'comprobanteStoragePath',s.pago_comprobante_storage_path),
  'calendar',jsonb_build_object('estado',s.calendar_sync_estado,'ultimaSyncAt',s.calendar_ultima_sync_at,
    'error',case when s.calendar_sync_estado='ERROR' then 'No fue posible sincronizar Calendar. La programación está guardada.' else null end),
  'executionLock',(select jsonb_build_object('userId',l.user_id,'userName',u.nombre_completo,'acquiredAt',l.acquired_at)
    from private.service_execution_locks l join public.usuarios u on u.id=l.user_id where l.service_id=s.id),
  'motivoCancelacion',s.motivo_cancelacion,'canceladoAt',s.cancelado_at
) as record ${SERVICE_FROM}`

export async function getService(client: PoolClient, id: string): Promise<AdminService> {
  const { rows } = await client.query<{ record: AdminService }>(`${SERVICE_SELECT} where s.id=$1::uuid`, [id])
  if (!rows[0]) throw new ApiError(404, 'El servicio no está disponible.')
  return rows[0].record
}
/** Read event metadata and its domain payload from the same MVCC statement. */
export async function getCalendarSnapshot(client: PoolClient, id: string): Promise<{
  record: AdminService; calendar_revision: string; calendar_event_id: string | null
}> {
  const { rows } = await client.query<{
    record: AdminService; calendar_revision: string; calendar_event_id: string | null
  }>(`select payload.record, metadata.calendar_revision, metadata.calendar_event_id
    from (${SERVICE_SELECT} where s.id=$1::uuid) payload
    join public.servicios metadata on metadata.id=$1::uuid`, [id])
  if (!rows[0]) throw new ApiError(404, 'El servicio no está disponible.')
  return rows[0]
}
export async function getServices(client: PoolClient, ids: string[]): Promise<AdminService[]> {
  if (!ids.length) return []
  return (await client.query<{ record: AdminService }>(`${SERVICE_SELECT} where s.id=any($1::uuid[]) order by s.inicio_programado,s.id`, [ids])).rows.map(row => row.record)
}
export async function pendingCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: number }>(`select count(*)::integer as count from public.proximos_servicios p
    join public.sedes se on se.id=p.sede_id join public.negocios n on n.id=se.negocio_id
    where se.activo and n.activo and p.servicio_agendado_id is null and p.estado in ('PENDIENTE','CONTACTADO','POSPUESTO')
      and p.fecha_sugerida >= ((now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota')
      and p.fecha_sugerida < (((now() at time zone 'America/Bogota')::date + 7)::timestamp at time zone 'America/Bogota')
      and (p.estado <> 'POSPUESTO' or p.fecha_recontacto <= (now() at time zone 'America/Bogota')::date)`)
  return rows[0]?.count ?? 0
}
export async function listServices(client: PoolClient, filter: ServiceFilter): Promise<PagedResult<AdminService>> {
  const params: unknown[] = []
  const conditions: string[] = []
  if (!filter.clientId && !filter.siteId && (!filter.from || !filter.to)) throw new ApiError(422,'Selecciona un rango válido.','VALIDATION')
  if (filter.from && filter.to) {
    params.push(filter.from,filter.to)
    conditions.push(`s.inicio_programado >= ($1::date::timestamp at time zone 'America/Bogota')`,
      `s.inicio_programado < (($2::date+1)::timestamp at time zone 'America/Bogota')`)
  }
  if (filter.clientId) { params.push(filter.clientId); conditions.push(`se.negocio_id=$${params.length}::uuid`) }
  if (filter.siteId) { params.push(filter.siteId); conditions.push(`s.sede_id=$${params.length}::uuid`) }
  if (filter.tab === 'history') conditions.push(`s.estado in ('FINALIZADO','CANCELADO')`)
  if (filter.estado) { params.push(filter.estado); conditions.push(`s.estado=$${params.length}`) }
  if (filter.tipo) { params.push(filter.tipo); conditions.push(`s.tipo_servicio=$${params.length}`) }
  if (filter.tecnicoId) { params.push(filter.tecnicoId); conditions.push(`(s.tecnico_responsable_id=$${params.length}::uuid or coalesce(s.tecnicos_colaboradores_ids_json,'[]'::jsonb) ? $${params.length}::text)`) }
  if (filter.query) { params.push(normalizeServiceSearch(filter.query)); conditions.push(`strpos(translate(lower(concat_ws(' ',n.nombre,se.nombre,s.solicitud,se.direccion)),'áéíóúüñ','aeiouun'),$${params.length}) > 0`) }
  const where = `where ${conditions.join(' and ')}`
  const total = (await client.query<{ count: number }>(`select count(*)::integer as count ${SERVICE_FROM} ${where}`, params)).rows[0]?.count ?? 0
  params.push(filter.pageSize, (filter.page-1)*filter.pageSize)
  const { rows } = await client.query<{ record: AdminService }>(`${SERVICE_SELECT} ${where}
    order by s.inicio_programado ${filter.clientId || filter.siteId ? 'desc' : 'asc'},case s.estado when 'EN_PROCESO' then 0 when 'PROGRAMADO' then 1 when 'FINALIZADO' then 2 else 3 end,s.id ${filter.clientId || filter.siteId ? 'desc' : 'asc'}
    limit $${params.length-1} offset $${params.length}`, params)
  return { items: rows.map(row => row.record), total, page: filter.page, pageSize: filter.pageSize, pendingCount:filter.clientId || filter.siteId ? 0 : await pendingCount(client) }
}
export async function workspace(client: PoolClient): Promise<ServiceWorkspace> {
  const sedes = (await client.query<{ record: ServiceSite }>(`select jsonb_build_object('id',se.id,'clientId',n.id,'clienteNombre',n.nombre,
    'nombre',se.nombre,'direccion',se.direccion,'tipoSede',se.tipo_sede,'valorServicio',se.valor_servicio,'periodicidadMeses',se.periodicidad_meses,
    'duracionServicioMinutos',se.duracion_servicio_minutos,'manejaRefuerzo',se.maneja_refuerzo,'contacto',${contactJson}) as record
    from public.sedes se join public.negocios n on n.id=se.negocio_id
    where se.activo and n.activo and ((se.tipo_sede='NEGOCIO' and n.tipo_cliente='NEGOCIO' and se.valor_servicio is not null) or (se.tipo_sede='RESIDENCIAL' and n.tipo_cliente='RESIDENCIAL')) order by n.nombre,se.nombre`)).rows.map(row => row.record)
  const tecnicos = (await client.query<{ record: ServiceTechnician }>(`select ${technicianJson('u')} as record from public.usuarios u where u.activo and u.es_tecnico order by u.nombre_completo`)).rows.map(row => row.record)
  const productos = (await client.query<{ record: ServiceProductOption }>(`select jsonb_build_object('id',p.id,'nombre',p.nombre,'principioActivo',p.principio_activo_composicion,
    'dosisAplicacion',p.dosis_aplicacion,'metodos',(select coalesce(jsonb_agg(jsonb_build_object('codigo',c.clave,'nombre',c.nombre) order by coalesce(c.orden,2147483647),c.nombre,c.id),'[]'::jsonb)
      from public.producto_metodos pm join public.configuracion c on c.id=pm.metodo_id where pm.producto_id=p.id and c.categoria='METODO_APLICACION' and c.activo),
    'activo',p.activo) as record from public.productos p where p.activo order by p.nombre`)).rows.map(row => row.record)
  return { sedes, tecnicos, productos }
}

const UPCOMING_FROM = `from public.proximos_servicios p join public.sedes se on se.id=p.sede_id
  join public.negocios n on n.id=se.negocio_id join public.servicios previous on previous.id=p.principal_anterior_id`
const UPCOMING_SELECT = `select jsonb_build_object('id',p.id,'clientId',n.id,'clienteNombre',n.nombre,'sedeId',se.id,'sedeNombre',se.nombre,
  'direccion',se.direccion,'contacto',${contactJson},'principalAnteriorId',previous.id,'principalAnteriorSolicitud',previous.solicitud,
  'ultimoServicioAt',coalesce(previous.inicio_real,previous.inicio_programado),'periodicidadMeses',p.periodicidad_meses,'fechaSugerida',p.fecha_sugerida,
  'estado',p.estado,'ultimoContactoAt',p.ultimo_contacto_at,'canalUltimoContacto',p.canal_ultimo_contacto,'fechaRecontacto',p.fecha_recontacto,
  'nota',p.nota,'version',p.version,'servicioAgendadoId',p.servicio_agendado_id,'correoEstado',p.correo_estado,
  'correoError',case when p.correo_estado='INCIERTO' then 'Revisa Enviados en Gmail antes de iniciar otro envío.'
    when p.correo_estado='ERROR' then 'No fue posible enviar el correo. Revisa la integración y reintenta.' else null end) as record ${UPCOMING_FROM}`
export async function getUpcoming(client: PoolClient, id: string): Promise<UpcomingService> {
  const { rows } = await client.query<{ record: UpcomingService }>(`${UPCOMING_SELECT} where p.id=$1::uuid`, [id])
  if (!rows[0]) throw new ApiError(404, 'La próxima visita no está disponible.')
  return rows[0].record
}
export async function listUpcoming(client: PoolClient, filter: UpcomingFilter): Promise<PagedResult<UpcomingService>> {
  const params: unknown[] = [filter.from, filter.to]
  const conditions = [`se.activo`, `n.activo`, `p.servicio_agendado_id is null`, `p.fecha_sugerida >= ($1::date::timestamp at time zone 'America/Bogota')`, `p.fecha_sugerida < (($2::date+1)::timestamp at time zone 'America/Bogota')`]
  if (filter.estado) { params.push(filter.estado); conditions.push(`p.estado=$${params.length}`) }
  else conditions.push(`p.estado <> 'NO_DESEA'`)
  if (filter.query) { params.push(normalizeServiceSearch(filter.query)); conditions.push(`strpos(translate(lower(concat_ws(' ',n.nombre,se.nombre,se.direccion)),'áéíóúüñ','aeiouun'),$${params.length})>0`) }
  const where = `where ${conditions.join(' and ')}`
  const total = (await client.query<{ count: number }>(`select count(*)::integer as count ${UPCOMING_FROM} ${where}`, params)).rows[0]?.count ?? 0
  params.push(filter.pageSize, (filter.page-1)*filter.pageSize)
  const { rows } = await client.query<{ record: UpcomingService }>(`${UPCOMING_SELECT} ${where} order by p.fecha_sugerida,p.id limit $${params.length-1} offset $${params.length}`, params)
  return { items: rows.map(row => row.record), total, page: filter.page, pageSize: filter.pageSize, pendingCount: await pendingCount(client) }
}
