-- Los servicios almacenan lote y vencimiento. La dosis y los métodos se toman
-- del catálogo MIP y se congelan como snapshots al iniciar la visita.
-- Los campos históricos de dosis y método por visita permanecen para compatibilidad
-- con servicios anteriores, pero ya no son obligatorios en las nuevas ejecuciones.
create or replace function private.validate_product_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.metodo_aplicacion_codigo is not null and not exists (
    select 1 from public.configuracion
    where categoria = 'METODO_APLICACION'
      and clave = new.metodo_aplicacion_codigo
  ) then
    raise exception 'El método de aplicación no existe';
  end if;
  if new.aplicado and (
    nullif(btrim(coalesce(new.lote,'')),'') is null
    or ((new.dosis is null or new.dosis = 'null'::jsonb)
        and nullif(btrim(coalesce(new.dosis_referencia_snapshot,'')),'') is null)
    or (nullif(btrim(coalesce(new.metodo_aplicacion_codigo,'')),'') is null
        and nullif(btrim(coalesce(new.metodo_aplicacion_nombre_snapshot,'')),'') is null)
  ) then
    raise exception 'Un Producto aplicado requiere lote y la dosis y los métodos congelados desde el catálogo';
  end if;
  return new;
end;
$$;
