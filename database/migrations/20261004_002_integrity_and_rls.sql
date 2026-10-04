create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.touch_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger servicios_touch
before update on public.servicios
for each row execute function private.touch_updated_at_and_version();

create trigger respuestas_formulario_touch
before update on public.respuestas_formulario
for each row execute function private.touch_updated_at_and_version();

create trigger productos_aplicados_touch
before update on public.productos_aplicados
for each row execute function private.touch_updated_at_and_version();

create trigger dispositivos_touch
before update on public.dispositivos
for each row execute function private.touch_updated_at();

create trigger revisiones_dispositivos_touch
before update on public.revisiones_dispositivos
for each row execute function private.touch_updated_at_and_version();

create trigger hallazgos_touch
before update on public.hallazgos
for each row execute function private.touch_updated_at_and_version();

create trigger sync_operations_touch
before update on private.sync_operations
for each row execute function private.touch_updated_at();

create trigger integration_jobs_touch
before update on private.integration_jobs
for each row execute function private.touch_updated_at();

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Auditoria es append-only';
end;
$$;

create trigger auditoria_append_only
before update or delete on public.auditoria
for each row execute function private.reject_audit_mutation();

create or replace function private.protect_published_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado_version <> 'BORRADOR' then
    raise exception 'Una versión publicada del formulario es inmutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger formularios_inmutables
before update or delete on public.formularios
for each row execute function private.protect_published_form();

create or replace function private.session_key(p_auth_user_id text, p_session jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(
    extensions.digest(
      p_auth_user_id || ':' || (p_session ->> 'iat') || ':' || (p_session ->> 'exp'),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function private.current_user_id(p_auth_user_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.usuarios u
  where u.auth_user_id = p_auth_user_id
    and u.activo
  limit 1
$$;

create or replace function private.current_role(p_auth_user_id text, p_session jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.active_role
  from private.user_sessions s
  where s.session_id = private.session_key(p_auth_user_id, p_session)
    and s.auth_user_id = p_auth_user_id
    and s.expires_at > now()
  limit 1
$$;

create or replace function private.is_admin(p_auth_user_id text, p_session jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = p_auth_user_id
      and u.activo
      and u.es_admin
      and private.current_role(p_auth_user_id, p_session) = 'ADMINISTRADOR'
  )
$$;

create or replace function private.is_technician(p_auth_user_id text, p_session jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = p_auth_user_id
      and u.activo
      and u.es_tecnico
      and private.current_role(p_auth_user_id, p_session) = 'TECNICO'
  )
$$;

create or replace function private.can_access_service(
  p_service_id uuid,
  p_auth_user_id text,
  p_session jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(p_auth_user_id, p_session) or exists (
    select 1
    from public.servicios s
    where s.id = p_service_id
      and private.is_technician(p_auth_user_id, p_session)
      and (
        s.tecnico_responsable_id = private.current_user_id(p_auth_user_id)
        or coalesce(s.tecnicos_colaboradores_ids_json, '[]'::jsonb)
          ? private.current_user_id(p_auth_user_id)::text
      )
  )
$$;

create or replace function private.can_access_site(
  p_site_id uuid,
  p_auth_user_id text,
  p_session jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(p_auth_user_id, p_session) or exists (
    select 1
    from public.servicios s
    where s.sede_id = p_site_id
      and private.can_access_service(s.id, p_auth_user_id, p_session)
  )
$$;

create or replace function private.can_access_area(
  p_area_id uuid,
  p_auth_user_id text,
  p_session jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(p_auth_user_id, p_session) or exists (
    select 1
    from public.areas a
    where a.id = p_area_id
      and private.can_access_site(a.sede_id, p_auth_user_id, p_session)
  )
$$;

create or replace function private.has_google_identity(p_auth_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from neon_auth.account a
    where a."userId"::text = p_auth_user_id
      and a."providerId" = 'google'
  )
$$;

create or replace function private.bootstrap_current_user(
  p_auth_user_id text,
  p_session jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_session ->> 'email', '')));
  v_session_id text := private.session_key(p_auth_user_id, p_session);
  v_exp bigint := (p_session ->> 'exp')::bigint;
  v_user public.usuarios%rowtype;
  v_role text;
begin
  if p_auth_user_id is null or v_email = '' or v_session_id is null or v_exp is null then
    raise exception 'Sesión de Neon Auth inválida';
  end if;
  if not private.has_google_identity(p_auth_user_id) then
    raise exception 'El acceso requiere una cuenta Google';
  end if;

  update public.usuarios
  set auth_user_id = p_auth_user_id
  where auth_user_id is null
    and correo_google = v_email
    and activo;

  select * into v_user
  from public.usuarios
  where auth_user_id = p_auth_user_id
    and correo_google = v_email
    and activo;

  if not found then
    raise exception 'La cuenta no está autorizada';
  end if;

  if v_user.es_admin <> v_user.es_tecnico then
    v_role := case when v_user.es_admin then 'ADMINISTRADOR' else 'TECNICO' end;
    insert into private.user_sessions (session_id, auth_user_id, active_role, expires_at)
    values (v_session_id, p_auth_user_id, v_role, to_timestamp(v_exp))
    on conflict (session_id) do update
      set auth_user_id = excluded.auth_user_id,
          active_role = excluded.active_role,
          expires_at = excluded.expires_at,
          updated_at = now();
  else
    select active_role into v_role
    from private.user_sessions
    where session_id = v_session_id
      and auth_user_id = p_auth_user_id
      and expires_at > now();
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'nombreCompleto', v_user.nombre_completo,
    'correoGoogle', v_user.correo_google,
    'esAdmin', v_user.es_admin,
    'esTecnico', v_user.es_tecnico,
    'rolActivo', v_role,
    'requiereSeleccionRol', v_role is null
  );
end;
$$;

create or replace function private.set_active_role(
  p_auth_user_id text,
  p_session jsonb,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id text := private.session_key(p_auth_user_id, p_session);
  v_exp bigint := (p_session ->> 'exp')::bigint;
  v_role text := upper(btrim(coalesce(p_role, '')));
  v_user public.usuarios%rowtype;
begin
  if v_session_id is null or v_exp is null then
    raise exception 'Sesión de Neon Auth inválida';
  end if;
  if v_role not in ('ADMINISTRADOR', 'TECNICO') then
    raise exception 'Rol activo inválido';
  end if;

  select * into v_user
  from public.usuarios
  where auth_user_id = p_auth_user_id
    and activo;

  if not found
    or (v_role = 'ADMINISTRADOR' and not v_user.es_admin)
    or (v_role = 'TECNICO' and not v_user.es_tecnico) then
    raise exception 'El usuario no tiene asignado el rol solicitado';
  end if;

  delete from private.service_edit_leases where user_id = v_user.id;

  insert into private.user_sessions (session_id, auth_user_id, active_role, expires_at)
  values (v_session_id, p_auth_user_id, v_role, to_timestamp(v_exp))
  on conflict (session_id) do update
    set auth_user_id = excluded.auth_user_id,
        active_role = excluded.active_role,
        expires_at = excluded.expires_at,
        updated_at = now();

  return jsonb_build_object('rolActivo', v_role);
end;
$$;

create or replace function private.acquire_service_lease(
  p_service_id uuid,
  p_auth_user_id text,
  p_session jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id(p_auth_user_id);
  v_lease private.service_edit_leases%rowtype;
begin
  if not private.is_technician(p_auth_user_id, p_session)
    or not private.can_access_service(p_service_id, p_auth_user_id, p_session) then
    raise exception 'No autorizado para editar el Servicio';
  end if;

  select * into v_lease
  from private.service_edit_leases
  where service_id = p_service_id
  for update;

  if found and v_lease.expires_at > now() and v_lease.user_id <> v_user_id then
    raise exception 'El Servicio está siendo editado por otro Técnico';
  end if;

  insert into private.service_edit_leases (service_id, user_id, lease_token, expires_at)
  values (p_service_id, v_user_id, gen_random_uuid(), now() + interval '5 minutes')
  on conflict (service_id) do update
    set user_id = excluded.user_id,
        lease_token = excluded.lease_token,
        expires_at = excluded.expires_at,
        updated_at = now()
  returning * into v_lease;

  return jsonb_build_object('token', v_lease.lease_token, 'expiresAt', v_lease.expires_at);
end;
$$;

create or replace function private.renew_service_lease(
  p_service_id uuid,
  p_token uuid,
  p_auth_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease private.service_edit_leases%rowtype;
begin
  update private.service_edit_leases
  set expires_at = now() + interval '5 minutes', updated_at = now()
  where service_id = p_service_id
    and user_id = private.current_user_id(p_auth_user_id)
    and lease_token = p_token
    and expires_at > now()
  returning * into v_lease;

  if not found then
    raise exception 'Lease inválido o vencido';
  end if;

  return jsonb_build_object('token', v_lease.lease_token, 'expiresAt', v_lease.expires_at);
end;
$$;

create or replace function private.release_service_lease(
  p_service_id uuid,
  p_token uuid,
  p_auth_user_id text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from private.service_edit_leases
    where service_id = p_service_id
      and user_id = private.current_user_id(p_auth_user_id)
      and lease_token = p_token
    returning 1
  )
  select exists(select 1 from deleted)
$$;

create or replace function private.validate_service_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = new.estado then
    return new;
  end if;
  if old.estado = 'PROGRAMADO' and new.estado in ('EN_PROCESO', 'CANCELADO') then
    return new;
  end if;
  if old.estado = 'EN_PROCESO' and new.estado in ('FINALIZADO', 'CANCELADO') then
    return new;
  end if;
  raise exception 'Transición de estado inválida: % → %', old.estado, new.estado;
end;
$$;

create trigger servicios_transition
before update of estado on public.servicios
for each row execute function private.validate_service_transition();

create or replace function private.validate_service_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_site public.sedes%rowtype;
  v_principal public.servicios%rowtype;
  v_user public.usuarios%rowtype;
  v_id_text text;
  v_vehicle_id uuid;
begin
  select * into v_site from public.sedes where id = new.sede_id;
  if not found then
    raise exception 'La Sede no existe';
  end if;

  if tg_op = 'INSERT' then
    new.solicitud := 'SR-' || lpad(nextval('public.service_request_sequence')::text, 8, '0');
    new.valor_servicio := case when new.tipo_servicio = 'REFUERZO' then 0 else v_site.valor_servicio end;
  end if;

  select * into v_user from public.usuarios where id = new.creado_por_id;
  if not found or not v_user.activo or not v_user.es_admin then
    raise exception 'creado_por_id debe ser un Administrador activo';
  end if;

  select * into v_user from public.usuarios where id = new.tecnico_responsable_id;
  if not found or not v_user.activo or not v_user.es_tecnico then
    raise exception 'El Técnico responsable no es válido';
  end if;
  if v_user.certificado_storage_path is not null
    and (
      v_user.certificado_fecha_vencimiento is null
      or v_user.certificado_fecha_vencimiento
        < (new.inicio_programado at time zone 'America/Bogota')::date
    ) then
    raise exception 'El certificado del Técnico responsable no está vigente';
  end if;

  for v_id_text in
    select jsonb_array_elements_text(coalesce(new.tecnicos_colaboradores_ids_json, '[]'::jsonb))
  loop
    if v_id_text::uuid = new.tecnico_responsable_id then
      raise exception 'El Técnico responsable no puede repetirse como colaborador';
    end if;
    select * into v_user from public.usuarios where id = v_id_text::uuid;
    if not found or not v_user.activo or not v_user.es_tecnico then
      raise exception 'La lista contiene un Técnico colaborador inválido';
    end if;
  end loop;

  if (
    select count(*)
    from jsonb_array_elements_text(coalesce(new.tecnicos_colaboradores_ids_json, '[]'::jsonb))
  ) <> (
    select count(distinct value)
    from jsonb_array_elements_text(coalesce(new.tecnicos_colaboradores_ids_json, '[]'::jsonb))
  ) then
    raise exception 'Los Técnicos colaboradores no pueden repetirse';
  end if;

  if new.tipo_servicio = 'REFUERZO' then
    if not v_site.maneja_refuerzo then
      raise exception 'La Sede no permite Servicios de Refuerzo';
    end if;
    select * into v_principal from public.servicios where id = new.servicio_principal_id;
    if not found
      or v_principal.tipo_servicio <> 'PRINCIPAL'
      or v_principal.sede_id <> new.sede_id then
      raise exception 'El Servicio Principal del Refuerzo no es válido';
    end if;
    if new.inicio_programado <> v_principal.inicio_programado + interval '20 days'
      or new.fin_programado <> v_principal.fin_programado + interval '20 days' then
      raise exception 'El Refuerzo debe programarse exactamente 20 días después del Principal';
    end if;
  end if;

  for v_id_text in
    select jsonb_array_elements_text(coalesce(new.vehiculos_atendidos_ids_json, '[]'::jsonb))
  loop
    v_vehicle_id := v_id_text::uuid;
    if not exists (
      select 1 from public.vehiculos where id = v_vehicle_id and sede_id = new.sede_id
    ) then
      raise exception 'La lista contiene un Vehículo que no pertenece a la Sede';
    end if;
  end loop;

  if new.firma_tecnico_usuario_id is not null
    and new.firma_tecnico_usuario_id <> new.tecnico_responsable_id
    and not (
      coalesce(new.tecnicos_colaboradores_ids_json, '[]'::jsonb)
        ? new.firma_tecnico_usuario_id::text
    ) then
    raise exception 'La firma técnica debe pertenecer a un Técnico asignado';
  end if;

  if new.estado = 'FINALIZADO' and (
    new.inicio_real is null
    or new.fin_real is null
    or new.firma_tecnico_storage_path is null
    or new.firma_cliente_storage_path is null
  ) then
    raise exception 'No se puede finalizar el Servicio sin tiempos reales y ambas firmas';
  end if;

  if new.token_publico_hash is not null and new.fin_real is not null and new.token_expira_at is null then
    new.token_expira_at := new.fin_real + interval '1 year';
  end if;

  return new;
end;
$$;

create trigger servicios_domain
before insert or update on public.servicios
for each row execute function private.validate_service_domain();

create or replace function private.validate_form_response()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service_site_id uuid;
begin
  select sede_id into v_service_site_id
  from public.servicios
  where id = new.servicio_id
    and tipo_servicio = 'PRINCIPAL';

  if v_service_site_id is null then
    raise exception 'Las respuestas solo pertenecen a un Servicio Principal válido';
  end if;
  if new.area_id is not null and not exists (
    select 1 from public.areas where id = new.area_id and sede_id = v_service_site_id
  ) then
    raise exception 'El Área de respuestas no pertenece a la Sede del Servicio';
  end if;
  if not exists (
    select 1
    from public.formularios f
    where f.formulario_id = new.formulario_id
      and f.version = new.version_formulario
  ) then
    raise exception 'La versión del Formulario no existe';
  end if;
  if exists (
    select 1
    from jsonb_each(new.respuestas_jsonb) r(campo_id, respuesta)
    where jsonb_typeof(r.respuesta) <> 'object'
  ) then
    raise exception 'Cada respuesta debe ser un objeto JSON';
  end if;
  if exists (
    select 1
    from jsonb_each(new.respuestas_jsonb) r(campo_id, respuesta)
    where not exists (
      select 1
      from public.formularios f
      where f.formulario_id = new.formulario_id
        and f.version = new.version_formulario
        and f.campo_id = r.campo_id
    )
  ) then
    raise exception 'Las respuestas contienen un campo que no pertenece a la versión del Formulario';
  end if;
  if exists (
    select 1
    from jsonb_each(new.respuestas_jsonb) r(campo_id, respuesta)
    where r.respuesta ? 'evaluacion'
      and r.respuesta ->> 'evaluacion' not in ('C', 'CP', 'NC', 'NA')
  ) then
    raise exception 'Las respuestas contienen una evaluación inválida';
  end if;
  if exists (
    select 1
    from jsonb_each(new.respuestas_jsonb) r(campo_id, respuesta)
    where r.respuesta ? 'evidencias'
      and jsonb_typeof(r.respuesta -> 'evidencias') <> 'array'
  ) then
    raise exception 'Las evidencias de una respuesta deben ser un arreglo';
  end if;
  return new;
end;
$$;

create trigger respuestas_formulario_domain
before insert or update on public.respuestas_formulario
for each row execute function private.validate_form_response();

create or replace function private.validate_area_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.areas where id = new.area_id and sede_id = new.sede_id
  ) then
    raise exception 'El Área no pertenece a la Sede';
  end if;
  return new;
end;
$$;

create trigger dispositivos_area_context
before insert or update of sede_id, area_id on public.dispositivos
for each row execute function private.validate_area_context();

create or replace function private.validate_device_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.configuracion
    where categoria = 'TIPO_DISPOSITIVO'
      and clave = new.tipo_dispositivo_codigo
  ) then
    raise exception 'El tipo de dispositivo no existe';
  end if;
  return new;
end;
$$;

create trigger dispositivos_catalog
before insert or update of tipo_dispositivo_codigo on public.dispositivos
for each row execute function private.validate_device_catalog();

create or replace function private.validate_product_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.metodo_aplicacion_codigo is not null and not exists (
    select 1
    from public.configuracion
    where categoria = 'METODO_APLICACION'
      and clave = new.metodo_aplicacion_codigo
  ) then
    raise exception 'El método de aplicación no existe';
  end if;
  if new.aplicado and (
    new.lote is null
    or new.dosis is null
    or new.metodo_aplicacion_codigo is null
  ) then
    raise exception 'Un Producto aplicado requiere lote, dosis y método de aplicación';
  end if;
  return new;
end;
$$;

create trigger productos_aplicados_domain
before insert or update on public.productos_aplicados
for each row execute function private.validate_product_application();

create or replace function private.validate_device_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service_site uuid;
  v_device_site uuid;
  v_plague text;
begin
  select sede_id into v_service_site
  from public.servicios
  where id = new.servicio_id
    and tipo_servicio = 'PRINCIPAL';
  select sede_id into v_device_site
  from public.dispositivos
  where id = new.dispositivo_id
    and area_id = new.area_id;
  if v_service_site is null or v_device_site is null or v_service_site <> v_device_site then
    raise exception 'La revisión no corresponde al Servicio, Dispositivo y Área indicados';
  end if;
  if not exists (
    select 1
    from public.configuracion
    where categoria = 'TIPO_DISPOSITIVO'
      and clave = new.tipo_dispositivo_codigo
  ) then
    raise exception 'El tipo de dispositivo no existe';
  end if;
  for v_plague in
    select value ->> 'plagaCodigo'
    from jsonb_array_elements(coalesce(new.capturas_json, '[]'::jsonb))
  loop
    if v_plague is null or not exists (
      select 1
      from public.configuracion
      where categoria = 'PLAGA'
        and clave = v_plague
    ) then
      raise exception 'La revisión contiene una plaga inválida';
    end if;
  end loop;
  return new;
end;
$$;

create trigger revisiones_dispositivos_domain
before insert or update on public.revisiones_dispositivos
for each row execute function private.validate_device_review();

create or replace function private.validate_finding_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.areas where id = new.area_id and sede_id = new.sede_id
  ) then
    raise exception 'El Área del Hallazgo no pertenece a la Sede';
  end if;
  if not exists (
    select 1
    from public.servicios
    where id = new.servicio_apertura_id
      and sede_id = new.sede_id
  ) then
    raise exception 'El Servicio de apertura no pertenece a la Sede';
  end if;
  if new.servicio_cierre_id is not null and not exists (
    select 1
    from public.servicios
    where id = new.servicio_cierre_id
      and sede_id = new.sede_id
      and inicio_programado > (
        select inicio_programado
        from public.servicios
        where id = new.servicio_apertura_id
      )
  ) then
    raise exception 'El Servicio de cierre debe pertenecer a la Sede y ser posterior al de apertura';
  end if;
  return new;
end;
$$;

create trigger hallazgos_context
before insert or update on public.hallazgos
for each row execute function private.validate_finding_context();

create or replace function private.validate_certificate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_site_id uuid;
begin
  select sede_id into v_site_id from public.servicios where id = new.servicio_id;
  if v_site_id is null then
    raise exception 'El Servicio del Certificado no existe';
  end if;
  if new.vehiculo_id is not null and not exists (
    select 1 from public.vehiculos where id = new.vehiculo_id and sede_id = v_site_id
  ) then
    raise exception 'El Vehículo del Certificado no pertenece a la Sede';
  end if;
  if new.fecha_vencimiento
    <> (new.fecha_expedicion + make_interval(months => new.vigencia_meses))::date then
    raise exception 'La fecha de vencimiento del Certificado es inválida';
  end if;
  return new;
end;
$$;

create trigger certificados_domain
before insert or update on public.certificados
for each row execute function private.validate_certificate();

create or replace function private.validate_cash_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.usuarios where id = new.tecnico_id and activo and es_tecnico
  ) then
    raise exception 'El Técnico del movimiento no es válido';
  end if;
  if not exists (
    select 1 from public.usuarios where id = new.registrado_por_id and activo and es_admin
  ) then
    raise exception 'El registrador del movimiento no es un Administrador activo';
  end if;
  return new;
end;
$$;

create trigger movimientos_efectivo_domain
before insert or update on public.movimientos_efectivo
for each row execute function private.validate_cash_movement();

create or replace function private.issue_public_token(
  p_service_id uuid,
  p_auth_user_id text,
  p_session jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_user_id uuid := private.current_user_id(p_auth_user_id);
begin
  if not private.is_admin(p_auth_user_id, p_session) then
    raise exception 'Se requiere el rol Administrador';
  end if;
  if not exists (
    select 1
    from public.servicios
    where id = p_service_id
      and estado = 'FINALIZADO'
      and fin_real is not null
  ) then
    raise exception 'Solo un Servicio finalizado puede publicarse';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.servicios
  set token_publico_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      token_revocado = false,
      token_expira_at = fin_real + interval '1 year'
  where id = p_service_id;

  insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
  values (v_user_id, 'TOKEN_PUBLICO_EMITIDO', 'Servicios', p_service_id, null);

  return v_token;
end;
$$;

create or replace function private.revoke_public_token(
  p_service_id uuid,
  p_auth_user_id text,
  p_session jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id(p_auth_user_id);
begin
  if not private.is_admin(p_auth_user_id, p_session) then
    raise exception 'Se requiere el rol Administrador';
  end if;
  update public.servicios
  set token_revocado = true
  where id = p_service_id
    and token_publico_hash is not null;
  if not found then
    return false;
  end if;
  insert into public.auditoria (usuario_id, accion, entidad, registro_id, detalle_json)
  values (v_user_id, 'TOKEN_PUBLICO_REVOCADO', 'Servicios', p_service_id, null);
  return true;
end;
$$;

create or replace function public.get_public_service(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'solicitud', s.solicitud,
    'tipoServicio', s.tipo_servicio,
    'fechaFinalizacion', s.fin_real,
    'negocio', n.nombre,
    'sede', se.nombre,
    'informeDisponible', s.informe_pdf_storage_path is not null
  )
  from public.servicios s
  join public.sedes se on se.id = s.sede_id
  join public.negocios n on n.id = se.negocio_id
  where s.token_publico_hash = encode(
      extensions.digest(coalesce(p_token, ''), 'sha256'),
      'hex'
    )
    and not s.token_revocado
    and s.token_expira_at > now()
    and s.estado = 'FINALIZADO'
$$;

alter table public.usuarios enable row level security;
alter table public.negocios enable row level security;
alter table public.sedes enable row level security;
alter table public.areas enable row level security;
alter table public.plantillas_areas enable row level security;
alter table public.servicios enable row level security;
alter table public.formularios enable row level security;
alter table public.respuestas_formulario enable row level security;
alter table public.productos enable row level security;
alter table public.productos_aplicados enable row level security;
alter table public.configuracion enable row level security;
alter table public.dispositivos enable row level security;
alter table public.revisiones_dispositivos enable row level security;
alter table public.hallazgos enable row level security;
alter table public.vehiculos enable row level security;
alter table public.certificados enable row level security;
alter table public.movimientos_efectivo enable row level security;
alter table public.auditoria enable row level security;

create policy usuarios_select on public.usuarios
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or id = (select private.current_user_id(auth.user_id()))
);

create policy negocios_select on public.negocios
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or exists (
    select 1
    from public.sedes se
    where se.negocio_id = id
      and private.can_access_site(se.id, auth.user_id(), auth.session())
  )
);

create policy sedes_select on public.sedes
for select to authenticated
using ((select private.can_access_site(id, auth.user_id(), auth.session())));

create policy areas_select on public.areas
for select to authenticated
using ((select private.can_access_area(id, auth.user_id(), auth.session())));

create policy plantillas_areas_select on public.plantillas_areas
for select to authenticated
using ((select private.is_admin(auth.user_id(), auth.session())));

create policy servicios_select on public.servicios
for select to authenticated
using ((select private.can_access_service(id, auth.user_id(), auth.session())));

create policy formularios_select on public.formularios
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or (select private.is_technician(auth.user_id(), auth.session()))
);

create policy respuestas_formulario_select on public.respuestas_formulario
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create policy productos_select on public.productos
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or exists (
    select 1
    from public.productos_aplicados pa
    where pa.producto_id = id
      and private.can_access_service(pa.servicio_id, auth.user_id(), auth.session())
  )
);

create policy productos_aplicados_select on public.productos_aplicados
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create policy configuracion_select on public.configuracion
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or (
    (select private.is_technician(auth.user_id(), auth.session()))
    and categoria <> 'SISTEMA'
    and activo
  )
);

create policy dispositivos_select on public.dispositivos
for select to authenticated
using ((select private.can_access_site(sede_id, auth.user_id(), auth.session())));

create policy revisiones_dispositivos_select on public.revisiones_dispositivos
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create policy hallazgos_select on public.hallazgos
for select to authenticated
using (
  (select private.can_access_service(servicio_apertura_id, auth.user_id(), auth.session()))
  or (
    servicio_cierre_id is not null
    and (select private.can_access_service(servicio_cierre_id, auth.user_id(), auth.session()))
  )
);

create policy vehiculos_select on public.vehiculos
for select to authenticated
using ((select private.can_access_site(sede_id, auth.user_id(), auth.session())));

create policy certificados_select on public.certificados
for select to authenticated
using ((select private.can_access_service(servicio_id, auth.user_id(), auth.session())));

create policy movimientos_efectivo_select on public.movimientos_efectivo
for select to authenticated
using (
  (select private.is_admin(auth.user_id(), auth.session()))
  or (
    (select private.is_technician(auth.user_id(), auth.session()))
    and tecnico_id = (select private.current_user_id(auth.user_id()))
  )
);

create policy auditoria_select on public.auditoria
for select to authenticated
using ((select private.is_admin(auth.user_id(), auth.session())));

revoke all on all tables in schema public from public, anonymous, authenticated;
revoke all on all sequences in schema public from public, anonymous, authenticated;
alter default privileges for role neondb_owner in schema public
  revoke all on tables from public, anonymous, authenticated;
alter default privileges for role neondb_owner in schema public
  revoke all on sequences from public, anonymous, authenticated;
alter default privileges for role neondb_owner in schema public
  revoke execute on functions from public, anonymous, authenticated;

grant usage on schema public to authenticated, anonymous;
grant select on public.usuarios, public.negocios, public.sedes, public.areas,
  public.plantillas_areas, public.servicios, public.formularios,
  public.respuestas_formulario, public.productos, public.productos_aplicados,
  public.configuracion, public.dispositivos, public.revisiones_dispositivos,
  public.hallazgos, public.vehiculos, public.certificados,
  public.movimientos_efectivo, public.auditoria to authenticated;

revoke all on function public.get_public_service(text) from public, authenticated, anonymous;
grant execute on function public.get_public_service(text) to authenticated, anonymous;

revoke all on all functions in schema private from public, authenticated, anonymous;
grant execute on function private.current_user_id(text) to authenticated;
grant execute on function private.is_admin(text, jsonb) to authenticated;
grant execute on function private.is_technician(text, jsonb) to authenticated;
grant execute on function private.can_access_service(uuid, text, jsonb) to authenticated;
grant execute on function private.can_access_site(uuid, text, jsonb) to authenticated;
grant execute on function private.can_access_area(uuid, text, jsonb) to authenticated;
