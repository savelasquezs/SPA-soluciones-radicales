-- Política aprobada 2026-10-08. No elimina archivos al aplicar la migración.
-- Registro de vencimientos evaluado dinámicamente: las fotos de Hallazgos
-- cambian su fecha de vencimiento al cerrarse antes de cumplir un año.
create table if not exists private.storage_retention_auth (
  name text primary key check (name = 'cloudflare-cron'),
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists private.storage_retention_deleted (
  bucket text not null check (bucket in ('sr-service-media','sr-generated-documents')),
  storage_path text not null,
  category text not null,
  source_id uuid not null,
  expired_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  primary key(bucket, storage_path)
);

create index if not exists storage_retention_deleted_at_idx on private.storage_retention_deleted(deleted_at desc);

create table if not exists private.storage_retention_holds (
  bucket text not null check (bucket in ('sr-service-media','sr-generated-documents')),
  storage_path text not null,
  reason text not null check (btrim(reason) <> ''),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (bucket,storage_path)
);

create table if not exists private.storage_retention_failures (
  bucket text not null,
  storage_path text not null,
  attempts integer not null default 0,
  error text,
  retry_after timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(bucket,storage_path)
);

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
  select 'sr-generated-documents', 'SERVICE_REPORT', s.id,
         s.informe_pdf_storage_path,
         s.informe_generado_at + interval '12 months'
  from public.servicios s
  where s.estado = 'FINALIZADO' and s.informe_generado_at is not null
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

revoke all on private.storage_retention_auth from public;
revoke all on private.storage_retention_deleted from public;
revoke all on private.storage_retention_holds from public;
revoke all on private.storage_retention_failures from public;
revoke all on private.storage_retention_candidates from public;
