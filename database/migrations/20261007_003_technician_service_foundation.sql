-- Fundación autoritativa para iniciar y reconstruir un Servicio Principal.

alter table public.productos_aplicados
  add column producto_nombre_snapshot text,
  add column principio_activo_snapshot text,
  add column registro_sanitario_snapshot text,
  add column dosis_referencia_snapshot text,
  add column metodo_aplicacion_nombre_snapshot text;

alter table private.sync_operations
  add column result_json jsonb;

create table public.servicio_areas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  area_id uuid not null references public.areas(id) on delete restrict,
  nombre_snapshot text not null check (btrim(nombre_snapshot) <> ''),
  es_externa_snapshot boolean not null,
  posicion_inicial integer not null check (posicion_inicial >= 0),
  posicion_recorrido integer not null check (posicion_recorrido >= 0),
  sin_acceso boolean not null default false,
  sin_acceso_descripcion text,
  sin_acceso_foto_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (servicio_id, area_id),
  unique (servicio_id, posicion_inicial) deferrable initially immediate,
  unique (servicio_id, posicion_recorrido) deferrable initially immediate,
  constraint servicio_areas_sin_acceso_check check (
    (
      sin_acceso
      and nullif(btrim(sin_acceso_descripcion), '') is not null
      and nullif(btrim(sin_acceso_foto_storage_path), '') is not null
    )
    or (
      not sin_acceso
      and sin_acceso_descripcion is null
      and sin_acceso_foto_storage_path is null
    )
  )
);

create index servicio_areas_servicio_recorrido_idx
  on public.servicio_areas (servicio_id, posicion_recorrido);
create index servicio_areas_area_idx on public.servicio_areas (area_id);

create trigger servicio_areas_touch
before update on public.servicio_areas
for each row execute function private.touch_updated_at_and_version();

create table public.evaluaciones_mip_area (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  servicio_area_id uuid not null references public.servicio_areas(id) on delete restrict,
  area_id uuid not null references public.areas(id) on delete restrict,
  criterio_id uuid not null references public.criterios_mip(id) on delete restrict,
  criterio_nombre_snapshot text not null check (btrim(criterio_nombre_snapshot) <> ''),
  solo_area_externa_snapshot boolean not null,
  evaluacion text check (evaluacion is null or evaluacion in ('C', 'CP', 'NC', 'NA')),
  observacion text,
  evidencias_storage_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidencias_storage_paths) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (servicio_area_id, criterio_id)
);

create index evaluaciones_mip_area_servicio_idx
  on public.evaluaciones_mip_area (servicio_id, servicio_area_id);
create index evaluaciones_mip_area_area_idx on public.evaluaciones_mip_area (area_id);
create index evaluaciones_mip_area_criterio_idx on public.evaluaciones_mip_area (criterio_id);

create trigger evaluaciones_mip_area_touch
before update on public.evaluaciones_mip_area
for each row execute function private.touch_updated_at_and_version();

create table public.servicio_dispositivos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  servicio_area_id uuid not null references public.servicio_areas(id) on delete restrict,
  dispositivo_id uuid not null references public.dispositivos(id) on delete restrict,
  numero_snapshot text not null check (btrim(numero_snapshot) <> ''),
  ubicacion_snapshot text not null check (btrim(ubicacion_snapshot) <> ''),
  tipo_dispositivo_codigo_snapshot text not null check (btrim(tipo_dispositivo_codigo_snapshot) <> ''),
  estado_anterior_snapshot text not null
    check (estado_anterior_snapshot in ('ACTIVO', 'FUERA_DE_USO', 'DANADO')),
  created_at timestamptz not null default now(),
  unique (servicio_id, dispositivo_id)
);

create index servicio_dispositivos_area_idx
  on public.servicio_dispositivos (servicio_area_id, dispositivo_id);
create index servicio_dispositivos_dispositivo_idx
  on public.servicio_dispositivos (dispositivo_id);

create table private.service_execution_locks (
  service_id uuid primary key references public.servicios(id) on delete cascade,
  user_id uuid not null references public.usuarios(id) on delete restrict,
  device_id uuid not null,
  lock_token uuid not null unique default gen_random_uuid(),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_execution_locks_user_idx
  on private.service_execution_locks (user_id, updated_at);
create index service_execution_locks_device_idx
  on private.service_execution_locks (device_id, updated_at);

create trigger service_execution_locks_touch
before update on private.service_execution_locks
for each row execute function private.touch_updated_at();

create function private.validate_service_execution_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'servicio_areas' then
    if not exists (
      select 1 from public.servicios s
      join public.areas a on a.sede_id = s.sede_id
      where s.id = new.servicio_id and s.tipo_servicio = 'PRINCIPAL' and a.id = new.area_id
    ) then
      raise exception 'El Área no pertenece al Servicio Principal';
    end if;
  elsif tg_table_name = 'evaluaciones_mip_area' then
    if not exists (
      select 1 from public.servicio_areas sa
      where sa.id = new.servicio_area_id and sa.servicio_id = new.servicio_id and sa.area_id = new.area_id
    ) then
      raise exception 'La evaluación no pertenece al Área congelada del Servicio';
    end if;
  elsif tg_table_name = 'servicio_dispositivos' then
    if not exists (
      select 1 from public.servicio_areas sa
      join public.dispositivos d on d.area_id = sa.area_id
      where sa.id = new.servicio_area_id and sa.servicio_id = new.servicio_id and d.id = new.dispositivo_id
    ) then
      raise exception 'El Dispositivo no pertenece al Área congelada del Servicio';
    end if;
  end if;
  return new;
end;
$$;

create trigger servicio_areas_snapshot_domain
before insert or update of servicio_id, area_id on public.servicio_areas
for each row execute function private.validate_service_execution_snapshot();
create trigger evaluaciones_mip_area_snapshot_domain
before insert or update of servicio_id, servicio_area_id, area_id on public.evaluaciones_mip_area
for each row execute function private.validate_service_execution_snapshot();
create trigger servicio_dispositivos_snapshot_domain
before insert or update of servicio_id, servicio_area_id, dispositivo_id on public.servicio_dispositivos
for each row execute function private.validate_service_execution_snapshot();

alter table public.servicio_areas enable row level security;
alter table public.evaluaciones_mip_area enable row level security;
alter table public.servicio_dispositivos enable row level security;

revoke all on public.servicio_areas from public, anonymous, authenticated;
revoke all on public.evaluaciones_mip_area from public, anonymous, authenticated;
revoke all on public.servicio_dispositivos from public, anonymous, authenticated;

grant select on public.servicio_areas to authenticated;
grant select on public.evaluaciones_mip_area to authenticated;
grant select on public.servicio_dispositivos to authenticated;

create policy servicio_areas_select on public.servicio_areas
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create policy evaluaciones_mip_area_select on public.evaluaciones_mip_area
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create policy servicio_dispositivos_select on public.servicio_dispositivos
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

revoke all on private.service_execution_locks from public, anonymous, authenticated;
revoke all on function private.validate_service_execution_snapshot() from public, anonymous, authenticated;
