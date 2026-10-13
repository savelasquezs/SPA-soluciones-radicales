create function private.cleanup_cancelled_service_execution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'CANCELADO' and old.estado <> new.estado then
    update public.dispositivos device
    set activo = false, updated_at = now()
    from public.servicio_dispositivos snapshot
    where snapshot.servicio_id = new.id
      and snapshot.dispositivo_id = device.id
      and snapshot.creado_durante_servicio
      and device.activo;

    delete from private.service_execution_locks where service_id = new.id;
  end if;
  return null;
end;
$$;

create trigger servicios_limpiar_ejecucion_cancelada
after update of estado on public.servicios
for each row execute function private.cleanup_cancelled_service_execution();

update public.dispositivos device
set activo = false, updated_at = now()
where device.activo
  and exists (
    select 1
    from public.servicio_dispositivos snapshot
    join public.servicios service on service.id = snapshot.servicio_id
    where snapshot.dispositivo_id = device.id
      and snapshot.creado_durante_servicio
      and service.estado = 'CANCELADO'
  )
  and not exists (
    select 1
    from public.servicio_dispositivos snapshot
    join public.servicios service on service.id = snapshot.servicio_id
    where snapshot.dispositivo_id = device.id
      and service.estado <> 'CANCELADO'
  );

delete from private.service_execution_locks execution_lock
using public.servicios service
where service.id = execution_lock.service_id
  and service.estado = 'CANCELADO';

revoke all on function private.cleanup_cancelled_service_execution() from public;
