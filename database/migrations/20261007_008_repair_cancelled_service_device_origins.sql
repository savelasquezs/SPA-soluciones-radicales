update public.dispositivos device
set activo = false, updated_at = now()
where device.activo
  and exists (
    select 1
    from public.servicio_dispositivos origin_snapshot
    join public.servicios cancelled_service on cancelled_service.id = origin_snapshot.servicio_id
    where origin_snapshot.dispositivo_id = device.id
      and origin_snapshot.creado_durante_servicio
      and cancelled_service.estado = 'CANCELADO'
  );
