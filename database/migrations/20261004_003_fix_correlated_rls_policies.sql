drop policy negocios_select on public.negocios;

create policy negocios_select on public.negocios
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or exists (
    select 1
    from public.sedes se
    where se.negocio_id = negocios.id
      and private.can_access_site(se.id, auth.user_id(), auth.session())
  )
);

drop policy productos_select on public.productos;

create policy productos_select on public.productos
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or exists (
    select 1
    from public.productos_aplicados pa
    where pa.producto_id = productos.id
      and private.can_access_service(pa.servicio_id, auth.user_id(), auth.session())
  )
);

create index service_edit_leases_user_idx
  on private.service_edit_leases (user_id);
