-- Aprovecha el catálogo existente y suma control de concurrencia.
alter table public.plantillas_areas
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);

create trigger plantillas_areas_touch
before update on public.plantillas_areas
for each row execute function private.touch_updated_at_and_version();

create unique index plantillas_areas_global_nombre_uidx
  on public.plantillas_areas (lower(btrim(nombre)))
  where alcance = 'GLOBAL';

create unique index plantillas_areas_privada_nombre_uidx
  on public.plantillas_areas (negocio_id, lower(btrim(nombre)))
  where alcance = 'PRIVADA';
