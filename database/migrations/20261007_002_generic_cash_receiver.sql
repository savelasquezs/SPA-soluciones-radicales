-- A cash payment may be received by the assigned Technician or by the Administrator
-- who is registering the payment. The historical receiver is therefore a User,
-- while tecnico_recaudo_previsto_id intentionally remains Technician-specific.

alter table public.servicios
  rename column tecnico_que_recauda_id to recaudado_por_id;

comment on column public.servicios.recaudado_por_id is
  'Usuario que recibió realmente el efectivo; puede ser Técnico o Administrador.';

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
    v_payment_changed := (new.metodo_pago,new.estado_pago,new.recaudado_por_id,new.pago_confirmado_por_id,new.pago_confirmado_at)
      is distinct from (old.metodo_pago,old.estado_pago,old.recaudado_por_id,old.pago_confirmado_por_id,old.pago_confirmado_at);
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
    if v_payment_changed and (new.metodo_pago is not null or new.estado_pago <> 'SIN_REGISTRAR' or new.recaudado_por_id is not null) then
      raise exception 'El Refuerzo es gratuito y no registra recaudo';
    end if;
  end if;

  if v_payment_changed and new.estado_pago = 'CONFIRMADO' and
    (new.metodo_pago is null or new.pago_confirmado_por_id is null or new.pago_confirmado_at is null
      or (new.metodo_pago = 'EFECTIVO' and new.recaudado_por_id is null)) then
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
