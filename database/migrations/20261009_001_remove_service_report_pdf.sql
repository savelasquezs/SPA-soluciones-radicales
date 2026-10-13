-- Informe MIP en HTML: eliminar solo el esquema de su generación PDF.
-- La migración es aditiva respecto al historial del Servicio y conserva certificados.
-- Bloquear si hubiera un documento real o un job de informe para no perder datos.
do $$
begin
  if exists (
    select 1 from public.servicios
    where informe_pdf_storage_path is not null
       or informe_fuente_storage_path is not null
       or informe_generado_at is not null
       or informe_enviado_at is not null
       or informe_destinatarios_json is not null
  ) then
    raise exception 'Hay informes PDF o metadatos de informe existentes: conservar y revisar antes de limpiar';
  end if;
  if exists (
    select 1 from private.integration_jobs
    where payload->>'scope' = 'SERVICE_REPORT'
       or (job_type = 'DOCUMENT' and idempotency_key like 'mip-report:%')
  ) then
    raise exception 'Hay trabajos de informe pendientes o históricos: conciliar antes de limpiar';
  end if;
end;
$$;

-- Reemplazar la vista de vencimientos sin alterar fotos, hallazgos ni retenciones.
create or replace view private.storage_retention_candidates as
with raw_files as (
  select 'sr-service-media'::text as bucket,
         'DEVICE_REVIEW'::text as category, r.id as source_id,
         r.foto_storage_path as storage_path,
         s.fin_real + interval '3 months' as expires_at
  from public.revisiones_dispositivos r
  join public.servicios s on s.id = r.servicio_id
  where s.estado = 'FINALIZADO' and s.fin_real is not null

  union all
  select 'sr-service-media', 'AREA_NO_ACCESS', a.id,
         a.sin_acceso_foto_storage_path,
         s.fin_real + interval '3 months'
  from public.servicio_areas a
  join public.servicios s on s.id = a.servicio_id
  where s.estado = 'FINALIZADO' and s.fin_real is not null

  union all
  select 'sr-service-media', 'CRITERION', e.id,
         photo.value,
         s.fin_real + interval '3 months'
  from public.evaluaciones_mip_area e
  join public.servicios s on s.id = e.servicio_id
  cross join lateral jsonb_array_elements_text(e.evidencias_storage_paths) as photo(value)
  where s.estado = 'FINALIZADO' and s.fin_real is not null

  union all
  select 'sr-service-media', 'FINDING_OPENING', h.id, photo.value,
         case
           when h.estado = 'CERRADO' and h.fecha_cierre <= h.fecha_apertura + interval '1 year'
           then h.fecha_cierre + interval '3 months'
           else h.fecha_apertura + interval '1 year'
         end
  from public.hallazgos h
  join public.servicios s on s.id = h.servicio_apertura_id
  cross join lateral jsonb_array_elements_text(coalesce(h.evidencias_apertura_storage_paths,'[]'::jsonb)) as photo(value)
  where s.estado = 'FINALIZADO' and s.fin_real is not null

  union all
  select 'sr-service-media', 'FINDING_CLOSURE', h.id, photo.value,
         h.fecha_cierre + interval '3 months'
  from public.hallazgos h
  join public.servicios s on s.id = h.servicio_cierre_id
  cross join lateral jsonb_array_elements_text(coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb)) as photo(value)
  where h.estado = 'CERRADO' and h.fecha_cierre is not null
    and s.estado = 'FINALIZADO' and s.fin_real is not null

)
select f.bucket, f.category, f.source_id, f.storage_path, f.expires_at
from raw_files f
where nullif(btrim(f.storage_path),'') is not null
  and f.expires_at is not null
  and not exists (
    select 1 from private.storage_retention_deleted d
    where d.bucket=f.bucket and d.storage_path=f.storage_path
  )
  and not exists (
    select 1 from private.storage_retention_holds h
    where h.bucket=f.bucket and h.storage_path=f.storage_path
      and (h.ends_at is null or h.ends_at > now())
  )
  and not exists (
    select 1 from private.storage_retention_failures x
    where x.bucket=f.bucket and x.storage_path=f.storage_path
      and x.retry_after > now()
  );

-- La función pública histórica dependía de informe_pdf_storage_path.
-- Mantener token hasheado, revocación y expiración; retirar solo el indicador PDF.
create or replace function public.get_public_service(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'solicitud', s.solicitud,
    'tipoServicio', s.tipo_servicio,
    'fechaFinalizacion', s.fin_real,
    'negocio', n.nombre,
    'sede', se.nombre
  )
  from public.servicios s
  join public.sedes se on se.id = s.sede_id
  join public.negocios n on n.id = se.negocio_id
  where s.token_publico_hash = encode(
      extensions.digest(coalesce(p_token, ''), 'sha256'),
      'hex'
    )
    and not s.token_revocado
    and s.token_expira_at > now()
    and s.estado = 'FINALIZADO'
$function$;

-- Las cinco columnas fueron creadas para el informe PDF descartado.
alter table public.servicios
  drop column if exists informe_pdf_storage_path,
  drop column if exists informe_fuente_storage_path,
  drop column if exists informe_generado_at,
  drop column if exists informe_enviado_at,
  drop column if exists informe_destinatarios_json;
