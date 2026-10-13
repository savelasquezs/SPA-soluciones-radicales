alter table public.negocios
  alter column nit drop not null,
  add column tipo_cliente text not null default 'NEGOCIO',
  add column activo boolean not null default true,
  add column vigencia_cert_establecimiento_meses integer,
  add column plantilla_cert_establecimiento_storage_path text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);

alter table public.negocios
  add constraint negocios_tipo_cliente_check check (tipo_cliente in ('NEGOCIO', 'RESIDENCIAL')),
  add constraint negocios_nit_tipo_check check (
    (tipo_cliente = 'NEGOCIO' and nullif(btrim(nit), '') is not null)
    or (tipo_cliente = 'RESIDENCIAL' and nit is null)
  );

do $$
declare
  v_conflicting_clients text;
begin
  select string_agg(negocio_id::text, ', ' order by negocio_id::text)
  into v_conflicting_clients
  from (
    select negocio_id
    from public.sedes
    group by negocio_id
    having count(distinct row(
      genera_certificado_establecimiento,
      vigencia_cert_establecimiento_meses,
      plantilla_cert_establecimiento_storage_path
    )) > 1
  ) conflicts;

  if v_conflicting_clients is not null then
    raise exception 'Configuración de certificado diferente entre Sedes de los clientes: %', v_conflicting_clients;
  end if;
end;
$$;

update public.negocios n
set vigencia_cert_establecimiento_meses = source.vigencia,
    plantilla_cert_establecimiento_storage_path = source.plantilla
from (
  select distinct on (negocio_id)
    negocio_id,
    case when genera_certificado_establecimiento then vigencia_cert_establecimiento_meses end as vigencia,
    case when genera_certificado_establecimiento then plantilla_cert_establecimiento_storage_path end as plantilla
  from public.sedes
  order by negocio_id, id
) source
where source.negocio_id = n.id;

alter table public.negocios
  add constraint negocios_certificado_tipo_check check (
    (
      tipo_cliente = 'NEGOCIO'
      and vigencia_cert_establecimiento_meses > 0
      and nullif(btrim(plantilla_cert_establecimiento_storage_path), '') is not null
    )
    or (
      tipo_cliente = 'RESIDENCIAL'
      and vigencia_cert_establecimiento_meses is null
      and plantilla_cert_establecimiento_storage_path is null
    )
  ) not valid;

create trigger negocios_touch
before update on public.negocios
for each row execute function private.touch_updated_at_and_version();

create index negocios_activo_tipo_nombre_idx
  on public.negocios (activo, tipo_cliente, lower(nombre));

alter table public.sedes
  drop constraint sedes_certificado_establecimiento_check,
  drop column genera_certificado_establecimiento,
  drop column vigencia_cert_establecimiento_meses,
  drop column plantilla_cert_establecimiento_storage_path,
  add column contacto_principal_celular text,
  add column activo boolean not null default true,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);

alter table public.sedes
  alter column valor_servicio drop not null,
  alter column periodicidad_meses drop not null,
  alter column duracion_servicio_minutos drop not null,
  drop constraint sedes_valor_servicio_check,
  drop constraint sedes_periodicidad_meses_check,
  drop constraint sedes_duracion_servicio_minutos_check;

update public.sedes
set valor_servicio = null,
    periodicidad_meses = null,
    maneja_refuerzo = false,
    formularios_aplicables_json = null,
    maneja_vehiculos = false,
    genera_certificado_vehiculo = false,
    vigencia_cert_vehiculo_meses = null,
    plantilla_cert_vehiculo_storage_path = null,
    duracion_servicio_minutos = null
where tipo_sede = 'RESIDENCIAL';

alter table public.sedes
  add constraint sedes_configuracion_tipo_check check (
    (
      tipo_sede = 'NEGOCIO'
      and valor_servicio >= 0
      and periodicidad_meses > 0
      and duracion_servicio_minutos > 0
    )
    or (
      tipo_sede = 'RESIDENCIAL'
      and valor_servicio is null
      and periodicidad_meses is null
      and not maneja_refuerzo
      and formularios_aplicables_json is null
      and not maneja_vehiculos
      and not genera_certificado_vehiculo
      and duracion_servicio_minutos is null
    )
  ),
  add constraint sedes_contacto_celular_check check (
    contacto_principal_celular is not null
    and contacto_principal_celular ~ '^\+[1-9][0-9]{7,14}$'
  ) not valid;

create unique index sedes_residencial_cliente_uidx
  on public.sedes (negocio_id)
  where tipo_sede = 'RESIDENCIAL';

create index sedes_negocio_activo_nombre_idx
  on public.sedes (negocio_id, activo, lower(nombre));

create index sedes_contacto_celular_idx
  on public.sedes (contacto_principal_celular)
  where contacto_principal_celular is not null;

create trigger sedes_touch
before update on public.sedes
for each row execute function private.touch_updated_at_and_version();

alter table public.areas
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);

create trigger areas_touch
before update on public.areas
for each row execute function private.touch_updated_at_and_version();

create or replace function private.validate_client_site_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client_type text;
begin
  select tipo_cliente into v_client_type
  from public.negocios
  where id = new.negocio_id;

  if v_client_type is null then
    raise exception 'El Cliente de la Sede no existe';
  end if;
  if v_client_type <> new.tipo_sede then
    raise exception 'El tipo de la Sede no corresponde al tipo de Cliente';
  end if;
  return new;
end;
$$;

create trigger sedes_client_context
before insert or update of negocio_id, tipo_sede on public.sedes
for each row execute function private.validate_client_site_context();

create or replace function private.prevent_residential_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sedes
    where id = new.sede_id and tipo_sede = 'RESIDENCIAL'
  ) then
    raise exception 'Una residencia no puede tener Áreas';
  end if;
  return new;
end;
$$;

create trigger areas_non_residential
before insert or update of sede_id on public.areas
for each row execute function private.prevent_residential_area();

create or replace function private.block_residential_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sedes
    where id = new.sede_id and tipo_sede = 'RESIDENCIAL'
  ) then
    raise exception 'La programación de Servicios residenciales todavía no está habilitada';
  end if;
  return new;
end;
$$;

create trigger servicios_non_residential
before insert or update of sede_id on public.servicios
for each row execute function private.block_residential_service();

revoke all on function private.validate_client_site_context() from public, anonymous, authenticated;
revoke all on function private.prevent_residential_area() from public, anonymous, authenticated;
revoke all on function private.block_residential_service() from public, anonymous, authenticated;
