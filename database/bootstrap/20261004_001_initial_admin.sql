insert into public.usuarios (
  nombre_completo,
  correo_google,
  es_admin,
  es_tecnico,
  activo
)
values (
  'Administrador Soluciones Radicales',
  'solucionesradicales1@gmail.com',
  true,
  false,
  true
)
on conflict do nothing;

update public.usuarios
set es_admin = true,
    activo = true
where correo_google = 'solucionesradicales1@gmail.com'
  and (not es_admin or not activo);
