update public.usuarios
set nombre_completo = 'Soluciones Radicales',
    es_admin = true,
    es_tecnico = true,
    activo = true
where correo_google = 'solucionesradicales1@gmail.com';

insert into public.usuarios (nombre_completo, correo_google, es_admin, es_tecnico, activo)
select 'Soluciones Radicales', 'solucionesradicales1@gmail.com', true, true, true
where not exists (
  select 1
  from public.usuarios
  where correo_google = 'solucionesradicales1@gmail.com'
);

insert into public.configuracion (categoria, clave, nombre, valor, activo, orden)
values
  ('PLAGA', 'POLILLA', 'Polilla', null, true, 1),
  ('PLAGA', 'MOSCA_DOMESTICA', 'Mosca doméstica', null, true, 2),
  ('PLAGA', 'MOSCA_FRUTA', 'Mosca de fruta', null, true, 3),
  ('PLAGA', 'ZANCUDO', 'Zancudo', null, true, 4),
  ('PLAGA', 'CUCARRONES', 'Cucarrones', null, true, 5),
  ('PLAGA', 'CUCARACHA', 'Cucaracha', null, true, 6),
  ('PLAGA', 'ROEDOR', 'Roedor', null, true, 7),
  ('PLAGA', 'OTROS', 'Otros', null, true, 8),
  ('SISTEMA', 'CUENTA_GOOGLE_EMPRESA', null, '"solucionesradicales1@gmail.com"'::jsonb, true, 1),
  ('SISTEMA', 'ZONA_HORARIA', null, '"America/Bogota"'::jsonb, true, 2),
  ('SISTEMA', 'RETENCION_IMAGENES_DIAS', null, '7'::jsonb, true, 3),
  ('SISTEMA', 'RETENCION_PDF_DIAS', null, '365'::jsonb, true, 4),
  ('SISTEMA', 'TOKEN_PUBLICO_DIAS', null, '365'::jsonb, true, 5)
on conflict (categoria, clave) do update
set nombre = excluded.nombre,
    valor = excluded.valor,
    activo = excluded.activo,
    orden = excluded.orden;

select setval('public.service_request_sequence', 1, false);
