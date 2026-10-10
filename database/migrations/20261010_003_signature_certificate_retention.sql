-- Retención aprobada: firmas de servicio (1 año calendario) y PDF generado (1 mes calendario).
-- Conserva rutas y metadatos para historial; jamás modifica ni elimina archivos por sí misma.

alter table public.certificados add column if not exists pdf_generado_at timestamptz;

-- Recupera la fecha real de creación del PDF vigente desde auditoría; si es legado sin
-- auditoría compatible, utiliza created_at (opción conservadora para registros antiguos).
update public.certificados c set pdf_generado_at=coalesce((
  select a.fecha_hora from public.auditoria a
  where a.accion='CERTIFICADO_GENERADO' and a.registro_id=c.id
    and a.detalle_json->'current'->>'storagePath'=c.pdf_storage_path
  order by a.fecha_hora desc limit 1
), c.created_at)
where c.pdf_generado_at is null;

alter table public.certificados
  alter column pdf_generado_at set default now(),
  alter column pdf_generado_at set not null;

-- El cron de desarrollo ya ejecuta modo delete para fotografías antiguas.
-- Estas categorías quedan protegidas hasta confirmar dry-run y tests.
create table if not exists private.storage_retention_controls (
  category text primary key check (category in ('SERVICE_SIGNATURE','CERTIFICATE_PDF')),
  delete_enabled boolean not null default false
);
insert into private.storage_retention_controls(category,delete_enabled)
values ('SERVICE_SIGNATURE',false),('CERTIFICATE_PDF',false)
on conflict(category) do nothing;
revoke all on private.storage_retention_controls from public;

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

  union all
  select 'sr-service-media', 'FINDING_FOLLOWUP', h.id, photo.value,
    case when h.estado='CERRADO' and h.fecha_cierre is not null
      then h.fecha_cierre + interval '3 months'
      else seg.registrado_at + interval '1 year' end
  from public.hallazgo_seguimientos seg
  join public.hallazgos h on h.id=seg.hallazgo_id
  join public.servicios visit on visit.id=seg.servicio_id
  cross join lateral jsonb_array_elements_text(seg.evidencias_storage_paths) as photo(value)
  where visit.estado='FINALIZADO' and visit.fin_real is not null
    -- Las fotos de cierre se procesan en su categoría original, nunca dos veces.
    and not (coalesce(h.evidencias_cierre_storage_paths,'[]'::jsonb) ? photo.value)

  union all
  -- Las firmas solo vencen desde la finalización confirmada (año calendario).
  select 'sr-service-media', 'SERVICE_SIGNATURE', s.id,
    s.firma_tecnico_storage_path, s.fin_real + interval '1 year'
  from public.servicios s
  where s.estado='FINALIZADO' and s.fin_real is not null
    and s.firma_tecnico_storage_path is not null

  union all
  select 'sr-service-media', 'SERVICE_SIGNATURE', s.id,
    s.firma_cliente_storage_path, s.fin_real + interval '1 year'
  from public.servicios s
  where s.estado='FINALIZADO' and s.fin_real is not null
    and s.firma_cliente_storage_path is not null

  union all
  -- Los PDF caducan un mes calendario después de su generación/última regeneración.
  select 'sr-generated-documents', 'CERTIFICATE_PDF', c.id,
    c.pdf_storage_path, c.pdf_generado_at + interval '1 month'
  from public.certificados c
  join public.servicios s on s.id=c.servicio_id
  where s.estado='FINALIZADO' and c.estado_generacion in ('GENERADO','ENVIADO')

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
