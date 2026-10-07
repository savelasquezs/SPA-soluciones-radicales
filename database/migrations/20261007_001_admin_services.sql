-- Admin Services: editable reinforcement, durable Calendar outbox and preagenda.
-- No historical date is shifted and no external message is sent by this migration.

alter table public.servicios
  add column tecnico_recaudo_previsto_id uuid references public.usuarios(id) on delete restrict,
  add column calendar_revision bigint not null default 0 check (calendar_revision >= 0);
create index servicios_recaudo_previsto_idx on public.servicios(tecnico_recaudo_previsto_id)
  where tecnico_recaudo_previsto_id is not null;

-- Background Calendar metadata must not invalidate an administrator's edit snapshot.
create function private.touch_service_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.version <> old.version or
    (to_jsonb(new) - array['updated_at','version','calendar_revision','calendar_event_id','calendar_sync_estado','calendar_ultima_sync_at','calendar_sync_error'])
    is distinct from
    (to_jsonb(old) - array['updated_at','version','calendar_revision','calendar_event_id','calendar_sync_estado','calendar_ultima_sync_at','calendar_sync_error']) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;
drop trigger servicios_touch on public.servicios;
create trigger servicios_touch before update on public.servicios
  for each row execute function private.touch_service_version();

-- Preserve all non-scheduling invariants from the baseline. The former +20-day
-- equality is deliberately removed, not replaced with a permanent +21-day check.
create or replace function private.validate_service_domain()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_site public.sedes%rowtype;
  v_principal public.servicios%rowtype;
  v_user public.usuarios%rowtype;
  v_id_text text;
  v_schedule_changed boolean := true;
  v_payment_changed boolean := true;
begin
  select * into v_site from public.sedes where id = new.sede_id;
  if not found then raise exception 'La Sede no existe'; end if;

  if tg_op = 'INSERT' then
    if not v_site.activo or v_site.tipo_sede <> 'NEGOCIO' or v_site.valor_servicio is null
      or not exists (select 1 from public.negocios where id = v_site.negocio_id and activo) then
      raise exception 'La Sede no está disponible para programación';
    end if;
    new.solicitud := 'SR-' || lpad(nextval('public.service_request_sequence')::text, 8, '0');
    new.valor_servicio := case when new.tipo_servicio = 'REFUERZO' then 0 else v_site.valor_servicio end;
    select * into v_user from public.usuarios where id = new.creado_por_id;
    if not found or not v_user.activo or not v_user.es_admin then
      raise exception 'El creador debe ser un Administrador activo';
    end if;
  else
    if (new.id,new.solicitud,new.sede_id,new.tipo_servicio,new.servicio_principal_id,new.creado_por_id,new.valor_servicio)
      is distinct from (old.id,old.solicitud,old.sede_id,old.tipo_servicio,old.servicio_principal_id,old.creado_por_id,old.valor_servicio) then
      raise exception 'La identidad, Sede, relación y valor del Servicio son inmutables';
    end if;
    v_schedule_changed := (new.inicio_programado,new.fin_programado,new.tecnico_responsable_id,new.tecnicos_colaboradores_ids_json)
      is distinct from (old.inicio_programado,old.fin_programado,old.tecnico_responsable_id,old.tecnicos_colaboradores_ids_json);
    v_payment_changed := (new.metodo_pago,new.estado_pago,new.tecnico_que_recauda_id,new.pago_confirmado_por_id,new.pago_confirmado_at)
      is distinct from (old.metodo_pago,old.estado_pago,old.tecnico_que_recauda_id,old.pago_confirmado_por_id,old.pago_confirmado_at);
    if v_schedule_changed and old.estado <> 'PROGRAMADO' then
      raise exception 'Solo se reprograman Servicios Programados';
    end if;
  end if;

  -- Historical payments, cancellation and synchronization remain possible when
  -- the original creator or a formerly assigned technician has been deactivated.
  if v_schedule_changed then
    select * into v_user from public.usuarios where id = new.tecnico_responsable_id;
    if not found or not v_user.activo or not v_user.es_tecnico then
      raise exception 'El Técnico responsable no es válido';
    end if;
    if v_user.certificado_storage_path is not null and
      (v_user.certificado_fecha_vencimiento is null or v_user.certificado_fecha_vencimiento < (new.inicio_programado at time zone 'America/Bogota')::date) then
      raise exception 'El certificado del Técnico responsable no está vigente';
    end if;
    for v_id_text in select jsonb_array_elements_text(coalesce(new.tecnicos_colaboradores_ids_json, '[]'::jsonb)) loop
      if v_id_text::uuid = new.tecnico_responsable_id then
        raise exception 'El responsable no puede repetirse como colaborador';
      end if;
      if not exists (select 1 from public.usuarios where id = v_id_text::uuid and activo and es_tecnico) then
        raise exception 'La lista contiene un colaborador inválido';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements_text(coalesce(new.tecnicos_colaboradores_ids_json,'[]'::jsonb))) <>
       (select count(distinct value) from jsonb_array_elements_text(coalesce(new.tecnicos_colaboradores_ids_json,'[]'::jsonb))) then
      raise exception 'Los colaboradores no pueden repetirse';
    end if;
  end if;

  if new.tipo_servicio = 'REFUERZO' then
    if tg_op = 'INSERT' and not v_site.maneja_refuerzo then
      raise exception 'La Sede no permite Refuerzo';
    end if;
    select * into v_principal from public.servicios where id = new.servicio_principal_id;
    if not found or v_principal.tipo_servicio <> 'PRINCIPAL' or v_principal.sede_id <> new.sede_id then
      raise exception 'El Principal del Refuerzo no es válido';
    end if;
    if tg_op = 'INSERT' and v_principal.estado = 'CANCELADO' then
      raise exception 'No se crea Refuerzo de un Principal cancelado';
    end if;
    if v_payment_changed and (new.metodo_pago is not null or new.estado_pago <> 'SIN_REGISTRAR' or new.tecnico_que_recauda_id is not null) then
      raise exception 'El Refuerzo es gratuito y no registra recaudo';
    end if;
  end if;

  if v_payment_changed and new.estado_pago = 'CONFIRMADO' and
    (new.metodo_pago is null or new.pago_confirmado_por_id is null or new.pago_confirmado_at is null
      or (new.metodo_pago = 'EFECTIVO' and new.tecnico_que_recauda_id is null)) then
    raise exception 'El pago confirmado requiere método, confirmación administrativa y recaudo aplicable';
  end if;
  for v_id_text in select jsonb_array_elements_text(coalesce(new.vehiculos_atendidos_ids_json,'[]'::jsonb)) loop
    if not exists (select 1 from public.vehiculos where id = v_id_text::uuid and sede_id = new.sede_id) then
      raise exception 'El Vehículo no pertenece a la Sede';
    end if;
  end loop;
  if new.firma_tecnico_usuario_id is not null and new.firma_tecnico_usuario_id <> new.tecnico_responsable_id
    and not (coalesce(new.tecnicos_colaboradores_ids_json,'[]'::jsonb) ? new.firma_tecnico_usuario_id::text) then
    raise exception 'La firma técnica debe pertenecer a un Técnico asignado';
  end if;
  if new.estado = 'FINALIZADO' and (new.inicio_real is null or new.fin_real is null
    or new.firma_tecnico_storage_path is null or new.firma_cliente_storage_path is null) then
    raise exception 'No se puede finalizar sin tiempos reales y ambas firmas';
  end if;
  if new.token_publico_hash is not null and new.fin_real is not null and new.token_expira_at is null then
    new.token_expira_at := new.fin_real + interval '1 year';
  end if;
  return new;
end;
$$;

-- Backstop for every creation entry point. The new API inserts the explicitly
-- reviewed Refuerzo in the same transaction; legacy callers get the +21 default
-- at commit. Deferred execution does not overwrite an explicitly chosen team.
create function private.ensure_service_reinforcement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_service public.servicios%rowtype;
begin
  select * into v_service from public.servicios where id = new.id;
  if v_service.estado = 'PROGRAMADO'
    and exists (select 1 from public.sedes where id = v_service.sede_id and maneja_refuerzo)
    and not exists (select 1 from public.servicios where servicio_principal_id = v_service.id) then
    insert into public.servicios(sede_id,tipo_servicio,servicio_principal_id,inicio_programado,fin_programado,
      creado_por_id,tecnico_responsable_id,tecnicos_colaboradores_ids_json,valor_servicio)
    values(v_service.sede_id,'REFUERZO',v_service.id,v_service.inicio_programado + interval '21 days',
      v_service.fin_programado + interval '21 days',v_service.creado_por_id,v_service.tecnico_responsable_id,
      v_service.tecnicos_colaboradores_ids_json,0);
  end if;
  return null;
end;
$$;
create constraint trigger servicios_refuerzo_por_defecto after insert on public.servicios
  deferrable initially deferred for each row when (new.tipo_servicio = 'PRINCIPAL')
  execute function private.ensure_service_reinforcement();

create function private.cancel_programmed_reinforcement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo_servicio = 'PRINCIPAL' and new.estado = 'CANCELADO' and old.estado <> new.estado then
    update public.servicios set estado = 'CANCELADO', motivo_cancelacion = new.motivo_cancelacion,
      cancelado_at = new.cancelado_at
    where servicio_principal_id = new.id and estado = 'PROGRAMADO';
  end if;
  return null;
end;
$$;
create trigger servicios_cancelar_refuerzo after update of estado on public.servicios
  for each row execute function private.cancel_programmed_reinforcement();

create function private.queue_service_calendar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_actor uuid;
begin
  if tg_op = 'UPDATE' and
    (new.inicio_programado,new.fin_programado,new.tecnico_responsable_id,new.tecnicos_colaboradores_ids_json,new.estado)
    is not distinct from
    (old.inicio_programado,old.fin_programado,old.tecnico_responsable_id,old.tecnicos_colaboradores_ids_json,old.estado) then
    return null;
  end if;
  -- Starting/finishing a visit does not change the Calendar appointment.
  if tg_op = 'UPDATE' and new.estado <> 'CANCELADO' and
    (new.inicio_programado,new.fin_programado,new.tecnico_responsable_id,new.tecnicos_colaboradores_ids_json)
    is not distinct from (old.inicio_programado,old.fin_programado,old.tecnico_responsable_id,old.tecnicos_colaboradores_ids_json) then
    return null;
  end if;
  v_actor := coalesce(nullif(current_setting('app.admin_actor',true),'')::uuid, private.current_user_id(auth.user_id()), new.creado_por_id);
  update public.servicios set calendar_revision = calendar_revision + 1, calendar_sync_estado = 'PENDIENTE', calendar_sync_error = null
    where id = new.id returning calendar_revision into v_revision;
  insert into private.integration_jobs(job_type,idempotency_key,payload)
  values('CALENDAR','admin-service:calendar:' || new.id::text || ':' || v_revision::text,
    jsonb_build_object('scope','ADMIN_SERVICES','serviceId',new.id,'revision',v_revision,'actorId',v_actor))
  on conflict(job_type,idempotency_key) do nothing;
  return null;
end;
$$;
create trigger servicios_calendar_outbox after insert or update of inicio_programado,fin_programado,tecnico_responsable_id,tecnicos_colaboradores_ids_json,estado
  on public.servicios for each row execute function private.queue_service_calendar();
create index integration_jobs_admin_services_idx on private.integration_jobs(status,run_after)
  where payload ->> 'scope' = 'ADMIN_SERVICES';

create table private.service_admin_commands (
  request_id uuid primary key,
  actor_id uuid not null references public.usuarios(id) on delete restrict,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.service_admin_commands from public, anonymous, authenticated;

create table public.proximos_servicios (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes(id) on delete restrict,
  principal_anterior_id uuid not null unique references public.servicios(id) on delete restrict,
  periodicidad_meses integer not null check (periodicidad_meses > 0),
  fecha_sugerida timestamptz not null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','CONTACTADO','CONFIRMADO','POSPUESTO','NO_DESEA')),
  ultimo_contacto_at timestamptz,
  canal_ultimo_contacto text check (canal_ultimo_contacto in ('WHATSAPP','CORREO')),
  fecha_recontacto date,
  nota text not null default '' check (char_length(nota) <= 5000),
  confirmado_at timestamptz,
  confirmado_por_id uuid references public.usuarios(id) on delete restrict,
  servicio_agendado_id uuid unique references public.servicios(id) on delete restrict,
  correo_estado text not null default 'SIN_ENVIAR' check (correo_estado in ('SIN_ENVIAR','PENDIENTE','ENVIADO','ERROR','INCIERTO')),
  correo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (estado <> 'POSPUESTO' or fecha_recontacto is not null),
  check (servicio_agendado_id is null or (estado = 'CONFIRMADO' and confirmado_at is not null and confirmado_por_id is not null))
);
create index proximos_servicios_pendientes_idx on public.proximos_servicios(fecha_sugerida,estado)
  where servicio_agendado_id is null;
create index proximos_servicios_recontacto_idx on public.proximos_servicios(fecha_recontacto)
  where estado = 'POSPUESTO' and servicio_agendado_id is null;
create trigger proximos_servicios_touch before update on public.proximos_servicios
  for each row execute function private.touch_updated_at_and_version();

create function private.validate_upcoming_service()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.servicios where id = new.principal_anterior_id and sede_id = new.sede_id and tipo_servicio = 'PRINCIPAL' and estado = 'FINALIZADO') then
    raise exception 'La propuesta debe partir de un Principal finalizado de la misma Sede';
  end if;
  if tg_op = 'UPDATE' and (new.sede_id,new.principal_anterior_id) is distinct from (old.sede_id,old.principal_anterior_id) then
    raise exception 'El origen de la propuesta es inmutable';
  end if;
  if new.servicio_agendado_id is not null and (new.servicio_agendado_id = new.principal_anterior_id or not exists(
    select 1 from public.servicios where id = new.servicio_agendado_id and sede_id = new.sede_id and tipo_servicio = 'PRINCIPAL')) then
    raise exception 'La propuesta debe resolverse con un nuevo Principal de la misma Sede';
  end if;
  return new;
end;
$$;
create trigger proximos_servicios_domain before insert or update on public.proximos_servicios
  for each row execute function private.validate_upcoming_service();

create function private.suggest_next_service()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo_servicio = 'PRINCIPAL' and new.estado = 'FINALIZADO' and old.estado <> new.estado then
    insert into public.proximos_servicios(sede_id,principal_anterior_id,periodicidad_meses,fecha_sugerida)
    select s.id,new.id,s.periodicidad_meses,
      ((coalesce(new.inicio_real,new.inicio_programado) at time zone 'America/Bogota') + make_interval(months => s.periodicidad_meses)) at time zone 'America/Bogota'
    from public.sedes s join public.negocios n on n.id = s.negocio_id
    where s.id = new.sede_id and s.activo and n.activo and s.tipo_sede = 'NEGOCIO' and s.periodicidad_meses > 0
    on conflict(principal_anterior_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger servicios_proxima_visita after update of estado on public.servicios
  for each row execute function private.suggest_next_service();

-- Passive bootstrap of the last completed cycle, without duplicating an already
-- scheduled next Principal. It creates follow-up records, not appointments.
insert into public.proximos_servicios(sede_id,principal_anterior_id,periodicidad_meses,fecha_sugerida)
select s.id,previous.id,s.periodicidad_meses,
  ((coalesce(previous.inicio_real,previous.inicio_programado) at time zone 'America/Bogota') + make_interval(months => s.periodicidad_meses)) at time zone 'America/Bogota'
from public.sedes s join public.negocios n on n.id = s.negocio_id
join lateral (select v.* from public.servicios v where v.sede_id = s.id and v.tipo_servicio = 'PRINCIPAL' and v.estado = 'FINALIZADO'
  order by coalesce(v.inicio_real,v.inicio_programado) desc,v.id limit 1) previous on true
where s.activo and n.activo and s.tipo_sede = 'NEGOCIO' and s.periodicidad_meses > 0
  and not exists (select 1 from public.servicios future where future.sede_id = s.id and future.tipo_servicio = 'PRINCIPAL'
    and future.estado in ('PROGRAMADO','EN_PROCESO') and future.inicio_programado > coalesce(previous.inicio_real,previous.inicio_programado))
on conflict(principal_anterior_id) do nothing;

alter table public.proximos_servicios enable row level security;
revoke all on public.proximos_servicios from public,anonymous,authenticated;
grant select on public.proximos_servicios to authenticated;
create policy proximos_servicios_admin_read on public.proximos_servicios for select to authenticated
  using (private.is_admin(auth.user_id(),auth.session()));

revoke all on function private.ensure_service_reinforcement() from public,anonymous,authenticated;
revoke all on function private.cancel_programmed_reinforcement() from public,anonymous,authenticated;
revoke all on function private.queue_service_calendar() from public,anonymous,authenticated;
revoke all on function private.suggest_next_service() from public,anonymous,authenticated;
