-- Espacio de trabajo técnico: evidencias múltiples y Puestos de monitoreo compuestos.

-- Las excepciones de acceso admiten varias evidencias y conservan la columna legacy como primera foto.
alter table public.servicio_areas
  add column sin_acceso_fotos_storage_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sin_acceso_fotos_storage_paths) = 'array');

update public.servicio_areas
set sin_acceso_fotos_storage_paths = case
  when sin_acceso_foto_storage_path is null then '[]'::jsonb
  else jsonb_build_array(sin_acceso_foto_storage_path)
end;

alter table public.servicio_areas drop constraint if exists servicio_areas_sin_acceso_check;
alter table public.servicio_areas add constraint servicio_areas_sin_acceso_check check (
  (
    sin_acceso
    and nullif(btrim(sin_acceso_descripcion), '') is not null
    and jsonb_array_length(sin_acceso_fotos_storage_paths) between 1 and 5
    and sin_acceso_foto_storage_path = sin_acceso_fotos_storage_paths ->> 0
  )
  or (
    not sin_acceso
    and sin_acceso_descripcion is null
    and sin_acceso_foto_storage_path is null
    and sin_acceso_fotos_storage_paths = '[]'::jsonb
  )
);

-- Correlativo estable por Sede. Los números históricos se conservan; los nuevos usan el correlativo.
alter table public.dispositivos add column numero_orden integer;
with ranked as (
  select id,row_number() over(partition by sede_id order by created_at,id)::integer as numero_orden
  from public.dispositivos
)
update public.dispositivos d set numero_orden=ranked.numero_orden from ranked where ranked.id=d.id;
alter table public.dispositivos alter column numero_orden set not null;
alter table public.dispositivos add constraint dispositivos_numero_orden_check check (numero_orden > 0);
create unique index dispositivos_sede_numero_orden_uidx on public.dispositivos(sede_id,numero_orden);

-- Un Puesto puede contener Trampa, Producto de cebo o ambos.
alter table public.dispositivos
  alter column tipo_dispositivo_codigo drop not null,
  alter column estado_actual drop not null,
  add column producto_cebo_id uuid references public.productos(id) on delete restrict;

alter table public.dispositivos add constraint dispositivos_componentes_check check (
  (tipo_dispositivo_codigo is not null or producto_cebo_id is not null)
  and ((tipo_dispositivo_codigo is null and estado_actual is null)
    or (tipo_dispositivo_codigo is not null and estado_actual is not null))
);
create index dispositivos_producto_cebo_idx on public.dispositivos(producto_cebo_id) where producto_cebo_id is not null;

-- El snapshot del Servicio conserva ambos componentes y admite edición optimista de altas del Servicio actual.
alter table public.servicio_dispositivos
  alter column tipo_dispositivo_codigo_snapshot drop not null,
  alter column tipo_dispositivo_nombre_snapshot drop not null,
  alter column clasificacion_snapshot drop not null,
  alter column estado_anterior_snapshot drop not null,
  add column producto_cebo_id_snapshot uuid,
  add column producto_cebo_nombre_snapshot text,
  add column producto_cebo_antidoto_snapshot text,
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);

alter table public.servicio_dispositivos add constraint servicio_dispositivos_componentes_check check (
  (tipo_dispositivo_codigo_snapshot is not null or producto_cebo_id_snapshot is not null)
  and ((tipo_dispositivo_codigo_snapshot is null
      and tipo_dispositivo_nombre_snapshot is null
      and clasificacion_snapshot is null
      and estado_anterior_snapshot is null
      and plagas_snapshot_json = '[]'::jsonb)
    or (tipo_dispositivo_codigo_snapshot is not null
      and tipo_dispositivo_nombre_snapshot is not null
      and clasificacion_snapshot is not null
      and estado_anterior_snapshot is not null))
  and ((producto_cebo_id_snapshot is null and producto_cebo_nombre_snapshot is null and producto_cebo_antidoto_snapshot is null)
    or (producto_cebo_id_snapshot is not null and nullif(btrim(producto_cebo_nombre_snapshot), '') is not null))
);

create trigger servicio_dispositivos_touch
before update on public.servicio_dispositivos
for each row execute function private.touch_updated_at_and_version();

-- La revisión separa el consumo del cebo y admite hasta cinco fotografías.
alter table public.revisiones_dispositivos
  alter column estado_observado drop not null,
  add column consumo_cebo_porcentaje integer check (consumo_cebo_porcentaje between 0 and 100),
  add column fotos_storage_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(fotos_storage_paths) = 'array' and jsonb_array_length(fotos_storage_paths) <= 5);

update public.revisiones_dispositivos
set fotos_storage_paths = case
  when foto_storage_path is null then '[]'::jsonb
  else jsonb_build_array(foto_storage_path)
end;

create or replace function private.validate_monitoring_point_review_components()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_point record;
  v_path text;
begin
  select tipo_dispositivo_codigo_snapshot,producto_cebo_id_snapshot
  into v_point
  from public.servicio_dispositivos
  where id=new.servicio_dispositivo_id and servicio_id=new.servicio_id
  for key share;

  if v_point is null then
    raise exception 'El Puesto de monitoreo no pertenece al Servicio';
  end if;

  if v_point.tipo_dispositivo_codigo_snapshot is null then
    if new.estado_observado is not null or jsonb_array_length(new.capturas_json) > 0 then
      raise exception 'Un Puesto sin Trampa no registra estado ni capturas';
    end if;
  elsif new.estado_observado is null then
    raise exception 'La Trampa requiere estado observado';
  end if;

  if v_point.producto_cebo_id_snapshot is null and new.consumo_cebo_porcentaje is not null then
    raise exception 'Un Puesto sin cebo no registra consumo';
  end if;

  if new.foto_storage_path is distinct from (new.fotos_storage_paths ->> 0) then
    raise exception 'La fotografía principal no coincide con las evidencias del Puesto';
  end if;

  for v_path in select jsonb_array_elements_text(new.fotos_storage_paths)
  loop
    if v_path not like 'services/' || new.servicio_id || '/devices/' || new.servicio_dispositivo_id || '/review/%' then
      raise exception 'La ruta de una fotografía del Puesto no es válida';
    end if;
  end loop;

  return new;
end;
$$;

create trigger revisiones_componentes_puesto
before insert or update of servicio_id,servicio_dispositivo_id,estado_observado,capturas_json,consumo_cebo_porcentaje,foto_storage_path,fotos_storage_paths
on public.revisiones_dispositivos
for each row execute function private.validate_monitoring_point_review_components();

revoke all on function private.validate_monitoring_point_review_components() from public,anonymous,authenticated;
