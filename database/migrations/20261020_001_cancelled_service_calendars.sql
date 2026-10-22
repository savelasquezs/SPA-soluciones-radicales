-- A cancelled Principal must not leave reinforcement appointments in Google Calendar.
-- Keep the execution status/history of in-progress or finalized reinforcements unchanged.
create or replace function private.cancel_programmed_reinforcement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_child record;
  v_revision bigint;
  v_actor uuid;
begin
  if new.tipo_servicio = 'PRINCIPAL' and new.estado = 'CANCELADO' and old.estado <> new.estado then
    update public.servicios
       set estado = 'CANCELADO', motivo_cancelacion = new.motivo_cancelacion,
           cancelado_at = new.cancelado_at
     where servicio_principal_id = new.id and estado = 'PROGRAMADO';

    -- Programmed children enqueue their own Calendar delete through the state
    -- trigger. Other children do not change status, so enqueue explicitly.
    v_actor := coalesce(nullif(current_setting('app.admin_actor',true),'')::uuid,
                        private.current_user_id(auth.user_id()),new.creado_por_id);
    for v_child in
      select id from public.servicios
       where servicio_principal_id = new.id and estado <> 'CANCELADO'
       for update
    loop
      update public.servicios
         set calendar_revision = calendar_revision + 1,
             calendar_sync_estado = 'PENDIENTE', calendar_sync_error = null
       where id = v_child.id
       returning calendar_revision into v_revision;
      insert into private.integration_jobs(job_type,idempotency_key,payload)
        values('CALENDAR','admin-service:calendar:' || v_child.id::text || ':' || v_revision::text,
          jsonb_build_object('scope','ADMIN_SERVICES','serviceId',v_child.id,
                             'revision',v_revision,'actorId',v_actor))
      on conflict(job_type,idempotency_key) do nothing;
    end loop;
  end if;
  return null;
end;
$$;

-- Backfill older parent cancellations without rewriting service execution states.
with updated as (
  update public.servicios child
     set calendar_revision = child.calendar_revision + 1,
         calendar_sync_estado = 'PENDIENTE',calendar_sync_error = null
    from public.servicios principal
   where child.servicio_principal_id = principal.id
     and principal.estado = 'CANCELADO'
     and child.estado <> 'CANCELADO'
   returning child.id,child.calendar_revision,child.creado_por_id
)
insert into private.integration_jobs(job_type,idempotency_key,payload)
select 'CALENDAR','admin-service:calendar:' || id::text || ':' || calendar_revision::text,
       jsonb_build_object('scope','ADMIN_SERVICES','serviceId',id,
                          'revision',calendar_revision,'actorId',creado_por_id)
from updated
on conflict(job_type,idempotency_key) do nothing;

revoke all on function private.cancel_programmed_reinforcement() from public,anonymous,authenticated;
