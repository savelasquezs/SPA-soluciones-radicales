-- Approved reference catalogs only. No customer data, chemical dosages or stock are seeded.
-- Stable keys preserve existing references. Never reactivate or overwrite an administrator's changes on rerun.
insert into public.configuracion (categoria, clave, nombre, clasificacion_mip, orden)
values
  ('METODO_APLICACION', 'ASPERSION', 'Aspersión', null, 10),
  ('METODO_APLICACION', 'NEBULIZACION', 'Nebulización', null, 20),
  ('METODO_APLICACION', 'TERMONEBULIZACION', 'Termonebulización', null, 30),
  ('METODO_APLICACION', 'PUNTEO', 'Punteo', null, 40),
  ('METODO_APLICACION', 'INSTALACION_ESTRATEGICA', 'Instalación estratégica', null, 50),
  ('PLAGA', 'CUCARACHA', 'Cucaracha', 'RASTREROS', 10),
  ('PLAGA', 'ROEDOR', 'Roedor', 'RASTREROS', 20),
  ('PLAGA', 'HORMIGA', 'Hormiga', 'RASTREROS', 30),
  ('PLAGA', 'OTROS_RASTREROS', 'Otros rastreros', 'RASTREROS', 90),
  ('PLAGA', 'POLILLA', 'Polilla', 'VOLADORES', 10),
  ('PLAGA', 'MOSCA_DOMESTICA', 'Mosca doméstica', 'VOLADORES', 20),
  ('PLAGA', 'MOSCA_FRUTA', 'Mosca de fruta', 'VOLADORES', 30),
  ('PLAGA', 'ZANCUDO', 'Zancudo', 'VOLADORES', 40),
  ('PLAGA', 'CUCARRONES', 'Cucarrones', 'VOLADORES', 50),
  ('PLAGA', 'OTROS_VOLADORES', 'Otros voladores', 'VOLADORES', 90)
on conflict (categoria, clave) do nothing;

insert into public.trampas (clave, nombre, clasificacion)
values ('TRAMPA_ADHESIVA', 'Trampa adhesiva', 'RASTREROS'), ('LAMPARA_UV', 'Lámpara UV', 'VOLADORES')
on conflict (clave) do nothing;
