-- Product coverage distinguishes insects from rodents while monitoring keeps RASTREROS/VOLADORES.
-- Migration 009 is already applied in development and remains immutable.

alter table public.configuracion
  add column categoria_producto text
    check (categoria_producto in ('INSECTOS_RASTREROS', 'INSECTOS_VOLADORES', 'ROEDORES'));

-- Only mappings supported by the approved operational formats are inferred automatically.
update public.configuracion
set categoria_producto = case
  when upper(clave) in ('CUCARACHA', 'HORMIGA', 'OTROS_RASTREROS') then 'INSECTOS_RASTREROS'
  when upper(clave) = 'ROEDOR' then 'ROEDORES'
  when upper(clave) in ('POLILLA', 'MOSCA_DOMESTICA', 'MOSCA_FRUTA', 'MOSCA_DE_FRUTA', 'ZANCUDO', 'CUCARRONES', 'OTROS_VOLADORES') then 'INSECTOS_VOLADORES'
end
where categoria = 'PLAGA'
  and categoria_producto is null;

alter table public.configuracion
  add constraint configuracion_plaga_categoria_producto_check
  check (
    categoria <> 'PLAGA'
    or (
      categoria_producto is not null
      and (
        (clasificacion_mip = 'VOLADORES' and categoria_producto = 'INSECTOS_VOLADORES')
        or (
          clasificacion_mip = 'RASTREROS'
          and categoria_producto in ('INSECTOS_RASTREROS', 'ROEDORES')
        )
      )
    )
  ) not valid;

-- Preserve existing product selections without pretending that RASTREROS means rodents.
alter table public.producto_categorias_plaga
  drop constraint if exists producto_categorias_plaga_clasificacion_check;

alter table public.producto_categorias_plaga
  rename column clasificacion to categoria_producto;

update public.producto_categorias_plaga
set categoria_producto = case categoria_producto
  when 'RASTREROS' then 'INSECTOS_RASTREROS'
  when 'VOLADORES' then 'INSECTOS_VOLADORES'
  else categoria_producto
end;

alter table public.producto_categorias_plaga
  add constraint producto_categorias_plaga_categoria_producto_check
  check (categoria_producto in ('INSECTOS_RASTREROS', 'INSECTOS_VOLADORES', 'ROEDORES'));

create index configuracion_plaga_categoria_producto_idx
  on public.configuracion (categoria_producto, activo)
  where categoria = 'PLAGA';

-- A pest category is semantic identity: changing it can silently alter whole-category product coverage.
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
       or (
         tg_op = 'UPDATE'
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

revoke all on function private.protect_mip_catalog_identity() from public;
