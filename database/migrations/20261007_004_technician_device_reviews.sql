do $$
begin
  if exists (
    select 1
    from public.dispositivos d
    left join public.trampas t on t.clave = d.tipo_dispositivo_codigo
    where t.id is null
  ) then
    raise exception 'Existen dispositivos cuyo tipo no está registrado en el catálogo de trampas MIP';
  end if;
end;
$$;

alter table public.dispositivos
  add constraint dispositivos_tipo_trampa_fk
  foreign key (tipo_dispositivo_codigo) references public.trampas(clave) on delete restrict;

create or replace function private.validate_device_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.trampas
    where clave = new.tipo_dispositivo_codigo
  ) then
    raise exception 'El tipo de dispositivo no existe';
  end if;
  return new;
end;
$$;

alter table public.servicio_dispositivos
  add column tipo_dispositivo_nombre_snapshot text,
  add column clasificacion_snapshot text,
  add column plagas_snapshot_json jsonb not null default '[]'::jsonb;

update public.servicio_dispositivos sd
set tipo_dispositivo_nombre_snapshot = t.nombre,
    clasificacion_snapshot = t.clasificacion,
    plagas_snapshot_json = coalesce((
      select jsonb_agg(
        jsonb_build_object('codigo', c.clave, 'nombre', c.nombre)
        order by lower(btrim(c.nombre)), c.clave
      )
      from public.configuracion c
      where c.categoria = 'PLAGA'
        and c.activo
        and c.clasificacion_mip = t.clasificacion
    ), '[]'::jsonb)
from public.trampas t
where t.clave = sd.tipo_dispositivo_codigo_snapshot;

do $$
begin
  if exists (
    select 1
    from public.servicio_dispositivos
    where tipo_dispositivo_nombre_snapshot is null
       or clasificacion_snapshot is null
  ) then
    raise exception 'Existen dispositivos históricos sin una trampa MIP válida';
  end if;
end;
$$;

alter table public.servicio_dispositivos
  alter column tipo_dispositivo_nombre_snapshot set not null,
  alter column clasificacion_snapshot set not null,
  add constraint servicio_dispositivos_tipo_nombre_check
    check (btrim(tipo_dispositivo_nombre_snapshot) <> ''),
  add constraint servicio_dispositivos_clasificacion_check
    check (clasificacion_snapshot in ('RASTREROS', 'VOLADORES')),
  add constraint servicio_dispositivos_plagas_snapshot_check
    check (jsonb_typeof(plagas_snapshot_json) = 'array');

alter table public.revisiones_dispositivos
  add column servicio_dispositivo_id uuid;

update public.revisiones_dispositivos r
set servicio_dispositivo_id = sd.id
from public.servicio_dispositivos sd
where sd.servicio_id = r.servicio_id
  and sd.dispositivo_id = r.dispositivo_id;

do $$
begin
  if exists (select 1 from public.revisiones_dispositivos where servicio_dispositivo_id is null) then
    raise exception 'Existen revisiones sin un dispositivo congelado del Servicio';
  end if;
  if exists (
    select 1
    from public.revisiones_dispositivos
    group by servicio_id, dispositivo_id
    having count(*) > 1
  ) then
    raise exception 'Existen revisiones duplicadas para un dispositivo del Servicio';
  end if;
end;
$$;

update public.revisiones_dispositivos
set capturas_json = '[]'::jsonb
where capturas_json is null;

alter table public.revisiones_dispositivos
  alter column servicio_dispositivo_id set not null,
  alter column capturas_json set default '[]'::jsonb,
  alter column capturas_json set not null,
  add constraint revisiones_servicio_dispositivo_fk
    foreign key (servicio_dispositivo_id) references public.servicio_dispositivos(id) on delete restrict,
  add constraint revisiones_servicio_dispositivo_uidx unique (servicio_dispositivo_id),
  add constraint revisiones_servicio_dispositivo_natural_uidx unique (servicio_id, dispositivo_id),
  add constraint revisiones_producto_quimico_length_check
    check (producto_quimico is null or length(producto_quimico) <= 500),
  add constraint revisiones_antidoto_length_check
    check (antidoto is null or length(antidoto) <= 500),
  add constraint revisiones_observaciones_length_check
    check (observaciones is null or length(observaciones) <= 2000),
  add constraint revisiones_foto_path_length_check
    check (foto_storage_path is null or length(foto_storage_path) <= 1000);

create index revisiones_servicio_dispositivo_idx
  on public.revisiones_dispositivos (servicio_dispositivo_id);

drop trigger revisiones_lock_catalog on public.revisiones_dispositivos;
drop function private.lock_review_catalog_references();

create or replace function private.validate_device_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_snapshot record;
  v_capture jsonb;
  v_code text;
  v_name text;
  v_quantity integer;
begin
  select sd.*, sa.sin_acceso as area_without_access
  into v_snapshot
  from public.servicio_dispositivos sd
  join public.servicio_areas sa on sa.id = sd.servicio_area_id
  where sd.id = new.servicio_dispositivo_id
  for key share of sd, sa;

  if v_snapshot.id is null
     or v_snapshot.servicio_id <> new.servicio_id
     or v_snapshot.dispositivo_id <> new.dispositivo_id
     or not exists (
       select 1
       from public.servicio_areas
       where id = v_snapshot.servicio_area_id
         and area_id = new.area_id
     ) then
    raise exception 'La revisión no corresponde al dispositivo congelado del Servicio';
  end if;

  if v_snapshot.area_without_access then
    raise exception 'El Área está registrada sin acceso';
  end if;

  if new.numero_snapshot <> v_snapshot.numero_snapshot
     or new.ubicacion_snapshot <> v_snapshot.ubicacion_snapshot
     or new.tipo_dispositivo_codigo <> v_snapshot.tipo_dispositivo_codigo_snapshot then
    raise exception 'La revisión no conserva los datos congelados del dispositivo';
  end if;

  if jsonb_typeof(new.capturas_json) <> 'array' then
    raise exception 'Las capturas de la revisión no son válidas';
  end if;

  if jsonb_array_length(new.capturas_json) > 200 then
    raise exception 'La revisión supera el número máximo de plagas';
  end if;

  for v_capture in select value from jsonb_array_elements(new.capturas_json)
  loop
    v_code := v_capture ->> 'plagaCodigo';
    v_name := v_capture ->> 'plagaNombreSnapshot';
    if jsonb_typeof(v_capture) <> 'object'
       or v_code is null
       or v_name is null
       or jsonb_typeof(v_capture -> 'cantidad') <> 'number'
       or (v_capture ->> 'cantidad') !~ '^[0-9]+$' then
      raise exception 'La revisión contiene una captura inválida';
    end if;
    v_quantity := (v_capture ->> 'cantidad')::integer;
    if v_quantity < 1 or v_quantity > 1000000 then
      raise exception 'La cantidad capturada no es válida';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_snapshot.plagas_snapshot_json) pest
      where pest ->> 'codigo' = v_code
        and pest ->> 'nombre' = v_name
    ) then
      raise exception 'La revisión contiene una plaga que no pertenece al dispositivo congelado';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(new.capturas_json) capture
    group by capture ->> 'plagaCodigo'
    having count(*) > 1
  ) then
    raise exception 'La revisión contiene capturas duplicadas';
  end if;

  if new.estado_observado <> v_snapshot.estado_anterior_snapshot
     and new.estado_observado in ('DANADO', 'FUERA_DE_USO')
     and nullif(btrim(new.foto_storage_path), '') is null then
    raise exception 'El cambio de estado del dispositivo requiere una fotografía';
  end if;

  if new.foto_storage_path is not null
     and new.foto_storage_path not like
       'services/' || new.servicio_id || '/devices/' || new.servicio_dispositivo_id || '/review/%' then
    raise exception 'La ruta de la fotografía del dispositivo no es válida';
  end if;

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
     and exists (
       select 1
       from public.servicio_dispositivos
       where tipo_dispositivo_codigo_snapshot = old.clave
     ) then
    raise exception using errcode = '23503', message = 'La trampa tiene referencias históricas';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trampas_history_identity
before update or delete on public.trampas
for each row execute function private.protect_trap_history();

revoke all on function private.protect_trap_history() from public;
