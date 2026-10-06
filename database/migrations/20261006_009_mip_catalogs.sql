-- Catalogs reuse existing method/pest IDs and keys; operational monitoring is not migrated here.
alter table public.productos
  add column dosis_aplicacion text check (dosis_aplicacion is null or btrim(dosis_aplicacion) <> ''),
  add column grado_toxicologico text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);
-- A dose includes its own unit, as in the operational spreadsheet. Do not invent doses from legacy units.
alter table public.productos alter column unidad_aplicacion drop not null;
create unique index productos_nombre_uidx on public.productos (lower(btrim(nombre)));
create trigger productos_touch before update on public.productos
  for each row execute function private.touch_updated_at_and_version();

alter table public.configuracion
  add column clasificacion_mip text check (clasificacion_mip in ('RASTREROS', 'VOLADORES')),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0),
  add constraint configuracion_id_categoria_key unique (id, categoria);
-- Only classifications explicitly supported by the company's formats. Ambiguous legacy "Otros" stays untouched.
update public.configuracion set clasificacion_mip = case
  when upper(clave) in ('CUCARACHA', 'ROEDOR', 'HORMIGA', 'OTROS_RASTREROS') then 'RASTREROS'
  when upper(clave) in ('POLILLA', 'MOSCA_DOMESTICA', 'MOSCA_FRUTA', 'MOSCA_DE_FRUTA', 'ZANCUDO', 'CUCARRONES', 'OTROS_VOLADORES') then 'VOLADORES'
end where categoria = 'PLAGA';
alter table public.configuracion add constraint configuracion_plaga_clasificacion_check
  check (categoria <> 'PLAGA' or (clasificacion_mip is not null and clasificacion_mip in ('RASTREROS', 'VOLADORES'))) not valid;
create unique index configuracion_mip_nombre_uidx
  on public.configuracion (categoria, lower(btrim(nombre)), coalesce(clasificacion_mip, ''))
  where categoria in ('PLAGA', 'METODO_APLICACION');
create trigger configuracion_touch before update on public.configuracion
  for each row execute function private.touch_updated_at_and_version();

create table public.trampas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (btrim(clave) <> ''),
  nombre text not null check (btrim(nombre) <> ''),
  clasificacion text not null check (clasificacion in ('RASTREROS', 'VOLADORES')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);
create unique index trampas_nombre_uidx on public.trampas (lower(btrim(nombre)));
create index trampas_activo_clasificacion_idx on public.trampas (activo, clasificacion);
create trigger trampas_touch before update on public.trampas
  for each row execute function private.touch_updated_at_and_version();

create table public.producto_metodos (
  producto_id uuid not null references public.productos(id) on delete cascade,
  metodo_id uuid not null,
  categoria text not null default 'METODO_APLICACION' check (categoria = 'METODO_APLICACION'),
  primary key (producto_id, metodo_id),
  foreign key (metodo_id, categoria) references public.configuracion(id, categoria) on delete restrict
);
create index producto_metodos_metodo_idx on public.producto_metodos (metodo_id);
create table public.producto_categorias_plaga (
  producto_id uuid not null references public.productos(id) on delete cascade,
  clasificacion text not null check (clasificacion in ('RASTREROS', 'VOLADORES')),
  primary key (producto_id, clasificacion)
);
create table public.producto_plagas (
  producto_id uuid not null references public.productos(id) on delete cascade,
  plaga_id uuid not null,
  categoria text not null default 'PLAGA' check (categoria = 'PLAGA'),
  primary key (producto_id, plaga_id),
  foreign key (plaga_id, categoria) references public.configuracion(id, categoria) on delete restrict
);
create index producto_plagas_plaga_idx on public.producto_plagas (plaga_id);

-- Protect method history with a real FK, including callers outside this API.
alter table public.productos_aplicados
  add column metodo_categoria text not null default 'METODO_APLICACION' check (metodo_categoria = 'METODO_APLICACION'),
  add constraint productos_aplicados_metodo_fk foreign key (metodo_categoria, metodo_aplicacion_codigo)
    references public.configuracion(categoria, clave) on delete restrict;
create index productos_aplicados_metodo_idx on public.productos_aplicados (metodo_aplicacion_codigo);

create or replace function private.protect_mip_catalog_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (old.categoria <> new.categoria or old.clave <> new.clave) then
    raise exception using errcode = '23514', message = 'La identidad del catálogo no se modifica';
  end if;
  if old.categoria = 'PLAGA' and (tg_op = 'DELETE' or old.clasificacion_mip is distinct from new.clasificacion_mip) then
    if exists (select 1 from public.revisiones_dispositivos where capturas_json @> jsonb_build_array(jsonb_build_object('plagaCodigo', old.clave)))
       or exists (select 1 from public.producto_plagas where plaga_id = old.id) then
      raise exception using errcode = '23503', message = 'La plaga tiene referencias; su identidad se conserva';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger configuracion_mip_identity before update or delete on public.configuracion
  for each row when (old.categoria in ('PLAGA', 'METODO_APLICACION'))
  execute function private.protect_mip_catalog_identity();

-- Lock catalog references for the duration of a review write, so a concurrent delete cannot orphan JSON history.
create or replace function private.lock_review_catalog_references()
returns trigger language plpgsql set search_path = '' as $$
declare v_key text;
begin
  for v_key in select value->>'plagaCodigo' from jsonb_array_elements(coalesce(new.capturas_json, '[]'::jsonb)) loop
    perform 1 from public.configuracion where categoria = 'PLAGA' and clave = v_key for key share;
    if not found then raise exception using errcode = '23503', message = 'La plaga de la revisión no existe'; end if;
  end loop;
  return new;
end;
$$;
create trigger revisiones_lock_catalog before insert or update of capturas_json on public.revisiones_dispositivos
  for each row execute function private.lock_review_catalog_references();

-- No public/anonymous exposure. Administration uses the real active role, not the union of assigned roles.
do $$
declare t text;
begin
  foreach t in array array['trampas', 'producto_metodos', 'producto_categorias_plaga', 'producto_plagas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anonymous, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_admin(auth.user_id(), auth.session())) with check (private.is_admin(auth.user_id(), auth.session()))', t || '_admin', t);
  end loop;
end;
$$;
revoke all on function private.protect_mip_catalog_identity() from public;
revoke all on function private.lock_review_catalog_references() from public;
