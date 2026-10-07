create table public.servicio_tipos_dispositivo (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  tipo_dispositivo_codigo_snapshot text not null check (btrim(tipo_dispositivo_codigo_snapshot) <> ''),
  tipo_dispositivo_nombre_snapshot text not null check (btrim(tipo_dispositivo_nombre_snapshot) <> ''),
  clasificacion_snapshot text not null check (clasificacion_snapshot in ('RASTREROS', 'VOLADORES')),
  plagas_snapshot_json jsonb not null default '[]'::jsonb check (jsonb_typeof(plagas_snapshot_json) = 'array'),
  created_at timestamptz not null default now(),
  unique (servicio_id, tipo_dispositivo_codigo_snapshot)
);

create index servicio_tipos_dispositivo_servicio_idx
  on public.servicio_tipos_dispositivo (servicio_id, tipo_dispositivo_codigo_snapshot);

insert into public.servicio_tipos_dispositivo(
  servicio_id,tipo_dispositivo_codigo_snapshot,tipo_dispositivo_nombre_snapshot,clasificacion_snapshot,plagas_snapshot_json
)
select distinct s.id,t.clave,t.nombre,t.clasificacion,
  coalesce((select jsonb_agg(jsonb_build_object('codigo',c.clave,'nombre',c.nombre)
    order by lower(btrim(c.nombre)),c.clave)
    from public.configuracion c
    where c.categoria='PLAGA' and c.activo and c.clasificacion_mip=t.clasificacion),'[]'::jsonb)
from public.servicios s
join public.servicio_areas sa on sa.servicio_id=s.id
cross join public.trampas t
where s.tipo_servicio='PRINCIPAL' and t.activo
on conflict(servicio_id,tipo_dispositivo_codigo_snapshot) do nothing;

alter table public.servicio_dispositivos
  add column creado_durante_servicio boolean not null default false;

alter table public.servicio_tipos_dispositivo enable row level security;
revoke all on public.servicio_tipos_dispositivo from public, anonymous, authenticated;
grant select on public.servicio_tipos_dispositivo to authenticated;

create policy servicio_tipos_dispositivo_select on public.servicio_tipos_dispositivo
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create or replace function private.protect_mip_catalog_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (old.categoria <> new.categoria or old.clave <> new.clave) then
    raise exception using errcode = '23514', message = 'La identidad del catálogo no se modifica';
  end if;

  if old.categoria = 'PLAGA'
     and (
       tg_op = 'DELETE'
       or old.clasificacion_mip is distinct from new.clasificacion_mip
       or old.categoria_producto is distinct from new.categoria_producto
     ) then
    if exists (
         select 1
         from public.revisiones_dispositivos
         where capturas_json @> jsonb_build_array(jsonb_build_object('plagaCodigo', old.clave))
       )
       or exists (
         select 1
         from public.producto_plagas
         where plaga_id = old.id
       )
       or exists (
         select 1
         from public.servicio_tipos_dispositivo
         where plagas_snapshot_json @> jsonb_build_array(jsonb_build_object('codigo', old.clave))
       )
       or (
         tg_op = 'UPDATE'
         and old.categoria_producto is not null
         and old.categoria_producto is distinct from new.categoria_producto
         and exists (
           select 1
           from public.producto_categorias_plaga
           where categoria_producto in (old.categoria_producto, new.categoria_producto)
         )
       ) then
      raise exception using errcode = '23503', message = 'La plaga tiene referencias; su identidad se conserva';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.protect_trap_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.clave <> new.clave then
    raise exception using errcode = '23514', message = 'La identidad del catálogo no se modifica';
  end if;
  if (tg_op = 'DELETE' or old.clasificacion is distinct from new.clasificacion)
     and (
       exists (
         select 1
         from public.servicio_dispositivos
         where tipo_dispositivo_codigo_snapshot = old.clave
       )
       or exists (
         select 1
         from public.servicio_tipos_dispositivo
         where tipo_dispositivo_codigo_snapshot = old.clave
       )
     ) then
    raise exception using errcode = '23503', message = 'La trampa tiene referencias históricas';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.protect_mip_catalog_identity() from public;
revoke all on function private.protect_trap_history() from public;
