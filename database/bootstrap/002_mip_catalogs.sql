-- Approved reference data only. Never overwrite, reactivate, duplicate an alias or infer chemical dosages.
with reference(categoria, clave, nombre, clasificacion_mip, categoria_producto, orden) as (
  values
    ('METODO_APLICACION', 'ASPERSION', 'Aspersión', null, null, 10),
    ('METODO_APLICACION', 'NEBULIZACION', 'Nebulización', null, null, 20),
    ('METODO_APLICACION', 'TERMONEBULIZACION', 'Termonebulización', null, null, 30),
    ('METODO_APLICACION', 'PUNTEO', 'Punteo', null, null, 40),
    ('METODO_APLICACION', 'INSTALACION_ESTRATEGICA', 'Instalación estratégica', null, null, 50),
    ('PLAGA', 'CUCARACHA', 'Cucaracha', 'RASTREROS', 'INSECTOS_RASTREROS', 10),
    ('PLAGA', 'ROEDOR', 'Roedor', 'RASTREROS', 'ROEDORES', 20),
    ('PLAGA', 'HORMIGA', 'Hormiga', 'RASTREROS', 'INSECTOS_RASTREROS', 30),
    ('PLAGA', 'OTROS_RASTREROS', 'Otros rastreros', 'RASTREROS', 'INSECTOS_RASTREROS', 90),
    ('PLAGA', 'POLILLA', 'Polilla', 'VOLADORES', 'INSECTOS_VOLADORES', 10),
    ('PLAGA', 'MOSCA_DOMESTICA', 'Mosca doméstica', 'VOLADORES', 'INSECTOS_VOLADORES', 20),
    ('PLAGA', 'MOSCA_FRUTA', 'Mosca de fruta', 'VOLADORES', 'INSECTOS_VOLADORES', 30),
    ('PLAGA', 'ZANCUDO', 'Zancudo', 'VOLADORES', 'INSECTOS_VOLADORES', 40),
    ('PLAGA', 'CUCARRONES', 'Cucarrones', 'VOLADORES', 'INSECTOS_VOLADORES', 50),
    ('PLAGA', 'OTROS_VOLADORES', 'Otros voladores', 'VOLADORES', 'INSECTOS_VOLADORES', 90)
)
insert into public.configuracion (categoria, clave, nombre, clasificacion_mip, categoria_producto, orden)
select r.* from reference r where not exists (
  select 1 from public.configuracion c where c.categoria = r.categoria
    and (
      c.clave = r.clave
      or (
        lower(btrim(c.nombre)) = lower(btrim(r.nombre))
        and c.clasificacion_mip is not distinct from r.clasificacion_mip
      )
    )
)
on conflict (categoria, clave) do nothing;

with reference(clave,nombre,clasificacion) as (
  values
    ('TRAMPA_ADHESIVA','Trampa adhesiva','RASTREROS'),
    ('LAMPARA_UV','Lámpara UV','VOLADORES')
)
insert into public.trampas(clave,nombre,clasificacion)
select r.* from reference r where not exists (
  select 1 from public.trampas t
  where t.clave = r.clave
     or lower(btrim(t.nombre)) = lower(btrim(r.nombre))
)
on conflict (clave) do nothing;
