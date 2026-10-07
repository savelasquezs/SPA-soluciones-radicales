alter table public.hallazgos drop constraint hallazgos_cierre_check;

alter table public.hallazgos add constraint hallazgos_cierre_check check (
  (
    estado = 'CERRADO'
    and servicio_cierre_id is not null
    and fecha_cierre is not null
    and evidencias_cierre_storage_paths is not null
    and jsonb_array_length(evidencias_cierre_storage_paths) > 0
  )
  or (
    estado <> 'CERRADO'
    and servicio_cierre_id is null
    and fecha_cierre is null
    and evidencias_cierre_storage_paths is null
  )
);

drop policy hallazgos_select on public.hallazgos;
create policy hallazgos_select on public.hallazgos
for select to authenticated
using (
  (select private.can_access_service(servicio_apertura_id, auth.user_id(), auth.session()))
  or (
    servicio_cierre_id is not null
    and (select private.can_access_service(servicio_cierre_id, auth.user_id(), auth.session()))
  )
  or (
    estado in ('ABIERTO', 'EN_PROCESO')
    and (select private.can_access_site(sede_id, auth.user_id(), auth.session()))
  )
);
