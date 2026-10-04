create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.usuarios (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nombre_completo text not null check (btrim(nombre_completo) <> ''),
  correo_google text not null check (correo_google = lower(btrim(correo_google)) and correo_google ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  es_admin boolean not null default false,
  es_tecnico boolean not null default false,
  activo boolean not null default true,
  certificado_storage_path text,
  certificado_fecha_emision date,
  certificado_fecha_vencimiento date,
  certificado_observaciones text,
  constraint usuarios_rol_check check (es_admin or es_tecnico),
  constraint usuarios_certificado_check check (
    certificado_storage_path is null
    or certificado_fecha_vencimiento is not null
  )
);

create unique index usuarios_correo_google_uidx on public.usuarios (lower(btrim(correo_google)));
create index usuarios_certificado_vencimiento_idx on public.usuarios (certificado_fecha_vencimiento);

create table public.negocios (
  id uuid primary key default extensions.gen_random_uuid(),
  nit text not null check (btrim(nit) <> ''),
  nombre text not null check (btrim(nombre) <> ''),
  correos_json jsonb check (correos_json is null or jsonb_typeof(correos_json) = 'array')
);

create unique index negocios_nit_uidx on public.negocios (lower(btrim(nit)));

create table public.sedes (
  id uuid primary key default extensions.gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) on delete restrict,
  nombre text not null check (btrim(nombre) <> ''),
  direccion text not null check (btrim(direccion) <> ''),
  correos_json jsonb check (correos_json is null or jsonb_typeof(correos_json) = 'array'),
  hereda_correos_negocio boolean not null default false,
  contacto_principal_nombre text not null check (btrim(contacto_principal_nombre) <> ''),
  contacto_principal_correo text check (
    contacto_principal_correo is null
    or contacto_principal_correo = lower(btrim(contacto_principal_correo))
  ),
  valor_servicio bigint not null check (valor_servicio >= 0),
  periodicidad_meses integer not null check (periodicidad_meses > 0),
  maneja_refuerzo boolean not null default false,
  tipo_sede text not null check (tipo_sede in ('NEGOCIO', 'RESIDENCIAL')),
  formularios_aplicables_json jsonb check (
    formularios_aplicables_json is null
    or jsonb_typeof(formularios_aplicables_json) = 'array'
  ),
  plano_storage_path text,
  maneja_vehiculos boolean not null default false,
  genera_certificado_establecimiento boolean not null default false,
  genera_certificado_vehiculo boolean not null default false,
  vigencia_cert_establecimiento_meses integer,
  vigencia_cert_vehiculo_meses integer,
  plantilla_cert_establecimiento_storage_path text,
  plantilla_cert_vehiculo_storage_path text,
  duracion_servicio_minutos integer not null default 120 check (duracion_servicio_minutos > 0),
  constraint sedes_certificado_establecimiento_check check (
    (not genera_certificado_establecimiento and vigencia_cert_establecimiento_meses is null and plantilla_cert_establecimiento_storage_path is null)
    or (genera_certificado_establecimiento and vigencia_cert_establecimiento_meses > 0 and plantilla_cert_establecimiento_storage_path is not null)
  ),
  constraint sedes_certificado_vehiculo_check check (
    (not genera_certificado_vehiculo and vigencia_cert_vehiculo_meses is null and plantilla_cert_vehiculo_storage_path is null)
    or (genera_certificado_vehiculo and vigencia_cert_vehiculo_meses > 0 and plantilla_cert_vehiculo_storage_path is not null)
  )
);

create index sedes_negocio_idx on public.sedes (negocio_id);

create table public.areas (
  id uuid primary key default extensions.gen_random_uuid(),
  sede_id uuid not null references public.sedes(id) on delete restrict,
  nombre text not null check (btrim(nombre) <> ''),
  es_externa boolean not null default false,
  activo boolean not null default true
);

create unique index areas_sede_nombre_uidx on public.areas (sede_id, lower(btrim(nombre)));
create index areas_sede_activo_idx on public.areas (sede_id, activo);

create table public.plantillas_areas (
  id uuid primary key default extensions.gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  alcance text not null check (alcance in ('PRIVADA', 'GLOBAL')),
  negocio_id uuid references public.negocios(id) on delete restrict,
  areas_json jsonb not null check (jsonb_typeof(areas_json) = 'array' and jsonb_array_length(areas_json) > 0),
  activo boolean not null default true,
  constraint plantillas_areas_contexto_alcance_check check (
    (alcance = 'PRIVADA' and negocio_id is not null)
    or (alcance = 'GLOBAL' and negocio_id is null)
  )
);

create index plantillas_areas_negocio_activo_idx on public.plantillas_areas (negocio_id, activo) where negocio_id is not null;
create index plantillas_areas_alcance_activo_idx on public.plantillas_areas (alcance, activo);

create table public.servicios (
  id uuid primary key default extensions.gen_random_uuid(),
  solicitud text not null check (btrim(solicitud) <> ''),
  sede_id uuid not null references public.sedes(id) on delete restrict,
  tipo_servicio text not null check (tipo_servicio in ('PRINCIPAL', 'REFUERZO')),
  servicio_principal_id uuid references public.servicios(id) on delete restrict,
  estado text not null default 'PROGRAMADO' check (estado in ('PROGRAMADO', 'EN_PROCESO', 'FINALIZADO', 'CANCELADO')),
  inicio_programado timestamptz not null,
  fin_programado timestamptz not null,
  inicio_real timestamptz,
  fin_real timestamptz,
  creado_por_id uuid not null references public.usuarios(id) on delete restrict,
  tecnico_responsable_id uuid not null references public.usuarios(id) on delete restrict,
  tecnicos_colaboradores_ids_json jsonb check (
    tecnicos_colaboradores_ids_json is null
    or jsonb_typeof(tecnicos_colaboradores_ids_json) = 'array'
  ),
  formularios_versiones_json jsonb check (
    formularios_versiones_json is null
    or jsonb_typeof(formularios_versiones_json) = 'array'
  ),
  valor_servicio bigint not null check (valor_servicio >= 0),
  observaciones text,
  motivo_cancelacion text,
  cancelado_at timestamptz,
  vehiculos_atendidos_ids_json jsonb check (
    vehiculos_atendidos_ids_json is null
    or jsonb_typeof(vehiculos_atendidos_ids_json) = 'array'
  ),
  firma_tecnico_storage_path text,
  firma_tecnico_usuario_id uuid references public.usuarios(id) on delete restrict,
  firma_cliente_storage_path text,
  firma_cliente_nombre text,
  firma_cliente_at timestamptz,
  metodo_pago text check (metodo_pago is null or metodo_pago in ('TRANSFERENCIA', 'EFECTIVO')),
  estado_pago text not null default 'SIN_REGISTRAR' check (estado_pago in ('SIN_REGISTRAR', 'PENDIENTE', 'CONFIRMADO', 'RECHAZADO')),
  pago_fecha timestamptz,
  pago_registrado_por_id uuid references public.usuarios(id) on delete restrict,
  pago_comprobante_storage_path text,
  pago_confirmado_por_id uuid references public.usuarios(id) on delete restrict,
  pago_confirmado_at timestamptz,
  tecnico_que_recauda_id uuid references public.usuarios(id) on delete restrict,
  evidencias_storage_prefix text,
  informe_fuente_storage_path text,
  informe_pdf_storage_path text,
  informe_generado_at timestamptz,
  informe_enviado_at timestamptz,
  informe_destinatarios_json jsonb check (
    informe_destinatarios_json is null
    or jsonb_typeof(informe_destinatarios_json) = 'array'
  ),
  token_publico_hash text,
  token_revocado boolean not null default false,
  token_expira_at timestamptz,
  calendar_event_id text,
  calendar_sync_estado text not null default 'NO_APLICA' check (calendar_sync_estado in ('NO_APLICA', 'PENDIENTE', 'SINCRONIZADO', 'ERROR')),
  calendar_ultima_sync_at timestamptz,
  calendar_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  constraint servicios_tipo_check check (
    (tipo_servicio = 'PRINCIPAL' and servicio_principal_id is null)
    or (tipo_servicio = 'REFUERZO' and servicio_principal_id is not null and valor_servicio = 0)
  ),
  constraint servicios_programacion_check check (fin_programado > inicio_programado),
  constraint servicios_ejecucion_check check (fin_real is null or (inicio_real is not null and fin_real >= inicio_real)),
  constraint servicios_cancelacion_check check (
    (estado = 'CANCELADO' and nullif(btrim(motivo_cancelacion), '') is not null and cancelado_at is not null)
    or (estado <> 'CANCELADO' and motivo_cancelacion is null and cancelado_at is null)
  ),
  constraint servicios_firma_cliente_check check (
    (firma_cliente_storage_path is null and firma_cliente_nombre is null and firma_cliente_at is null)
    or (firma_cliente_storage_path is not null and nullif(btrim(firma_cliente_nombre), '') is not null and firma_cliente_at is not null)
  ),
  constraint servicios_firma_tecnico_check check (
    (firma_tecnico_storage_path is null and firma_tecnico_usuario_id is null)
    or (firma_tecnico_storage_path is not null and firma_tecnico_usuario_id is not null)
  ),
  constraint servicios_pago_efectivo_check check (
    metodo_pago <> 'EFECTIVO'
    or estado_pago <> 'CONFIRMADO'
    or tecnico_que_recauda_id is not null
  )
);

create unique index servicios_solicitud_uidx on public.servicios (lower(btrim(solicitud)));
create unique index servicios_refuerzo_principal_uidx on public.servicios (servicio_principal_id) where servicio_principal_id is not null;
create unique index servicios_token_publico_hash_uidx on public.servicios (token_publico_hash) where token_publico_hash is not null;
create unique index servicios_calendar_event_uidx on public.servicios (calendar_event_id) where calendar_event_id is not null;
create index servicios_estado_inicio_idx on public.servicios (estado, inicio_programado desc);
create index servicios_sede_inicio_idx on public.servicios (sede_id, inicio_programado desc);
create index servicios_tecnico_inicio_idx on public.servicios (tecnico_responsable_id, inicio_programado desc);
create index servicios_fin_real_idx on public.servicios (fin_real desc) where fin_real is not null;
create index servicios_colaboradores_gin_idx on public.servicios using gin (tecnicos_colaboradores_ids_json);
create index servicios_pago_idx on public.servicios (estado_pago, metodo_pago, pago_fecha);
create index servicios_calendar_error_idx on public.servicios (inicio_programado desc) where calendar_sync_estado = 'ERROR';

create table public.formularios (
  fila_id uuid primary key default extensions.gen_random_uuid(),
  formulario_id uuid not null,
  codigo_formulario text not null check (btrim(codigo_formulario) <> ''),
  nombre_formulario text not null check (btrim(nombre_formulario) <> ''),
  version text not null check (btrim(version) <> ''),
  estado_version text not null check (estado_version in ('BORRADOR', 'ACTIVA', 'INACTIVA')),
  fecha_actualizacion date not null,
  seccion_id text not null check (btrim(seccion_id) <> ''),
  seccion_nombre text not null check (btrim(seccion_nombre) <> ''),
  orden_seccion integer not null check (orden_seccion > 0),
  campo_id text not null check (btrim(campo_id) <> ''),
  campo_nombre text not null check (btrim(campo_nombre) <> ''),
  tipo_campo text not null check (btrim(tipo_campo) <> ''),
  obligatorio boolean not null default false,
  orden_campo integer not null check (orden_campo > 0),
  opciones_json jsonb check (opciones_json is null or jsonb_typeof(opciones_json) = 'array'),
  es_criterio_evaluacion boolean not null default false,
  solo_area_externa boolean not null default false,
  unique (formulario_id, version, campo_id)
);

create index formularios_formulario_version_idx on public.formularios (formulario_id, version);
create index formularios_estado_formulario_idx on public.formularios (estado_version, formulario_id);

create table public.respuestas_mip (
  id uuid primary key default extensions.gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  formulario_id uuid not null,
  version_formulario text not null,
  campo_id text not null,
  area_id uuid references public.areas(id) on delete restrict,
  valor jsonb,
  estado_evaluacion text check (estado_evaluacion is null or estado_evaluacion in ('C', 'CP', 'NC', 'NA')),
  observacion text,
  evidencias_storage_paths jsonb check (
    evidencias_storage_paths is null
    or jsonb_typeof(evidencias_storage_paths) = 'array'
  ),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  foreign key (formulario_id, version_formulario, campo_id)
    references public.formularios(formulario_id, version, campo_id) on delete restrict
);

create index respuestas_servicio_formulario_idx on public.respuestas_mip (servicio_id, formulario_id, version_formulario);
create index respuestas_formulario_ref_idx on public.respuestas_mip (formulario_id, version_formulario, campo_id);
create index respuestas_servicio_area_idx on public.respuestas_mip (servicio_id, area_id);
create index respuestas_area_idx on public.respuestas_mip (area_id) where area_id is not null;

create table public.productos (
  id uuid primary key default extensions.gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  principio_activo_composicion text not null check (btrim(principio_activo_composicion) <> ''),
  unidad_aplicacion text not null check (btrim(unidad_aplicacion) <> ''),
  fabricante text,
  registro_sanitario text,
  ficha_tecnica_storage_path text,
  antidoto text,
  activo boolean not null default true
);

create index productos_activo_nombre_idx on public.productos (activo, nombre);

create table public.productos_aplicados (
  id uuid primary key default extensions.gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  aplicado boolean not null default false,
  lote text,
  fecha_fabricacion date,
  fecha_vencimiento date,
  dosis jsonb,
  metodo_aplicacion_codigo text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (servicio_id, producto_id),
  constraint productos_aplicados_fechas_check check (
    fecha_vencimiento is null
    or fecha_fabricacion is null
    or fecha_vencimiento >= fecha_fabricacion
  )
);

create index productos_aplicados_servicio_idx on public.productos_aplicados (servicio_id);
create index productos_aplicados_producto_idx on public.productos_aplicados (producto_id);
create index productos_aplicados_servicio_aplicado_idx on public.productos_aplicados (servicio_id, aplicado);

create table public.configuracion (
  id uuid primary key default extensions.gen_random_uuid(),
  categoria text not null check (categoria in ('METODO_APLICACION', 'PLAGA', 'TIPO_DISPOSITIVO', 'SISTEMA')),
  clave text not null check (btrim(clave) <> ''),
  nombre text,
  valor jsonb,
  datos_json jsonb,
  activo boolean not null default true,
  orden integer check (orden is null or orden >= 0),
  unique (categoria, clave),
  constraint configuracion_nombre_check check (
    categoria = 'SISTEMA'
    or nullif(btrim(nombre), '') is not null
  )
);

create index configuracion_catalogo_idx on public.configuracion (categoria, activo, orden);

create table public.dispositivos (
  id uuid primary key default extensions.gen_random_uuid(),
  sede_id uuid not null references public.sedes(id) on delete restrict,
  area_id uuid not null references public.areas(id) on delete restrict,
  numero text not null check (btrim(numero) <> ''),
  tipo_dispositivo_codigo text not null check (btrim(tipo_dispositivo_codigo) <> ''),
  ubicacion text not null check (btrim(ubicacion) <> ''),
  estado_actual text not null check (estado_actual in ('ACTIVO', 'FUERA_DE_USO', 'DANADO')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index dispositivos_sede_numero_uidx on public.dispositivos (sede_id, lower(btrim(numero)));
create index dispositivos_area_activo_idx on public.dispositivos (area_id, activo);
create index dispositivos_sede_estado_idx on public.dispositivos (sede_id, estado_actual);
create index dispositivos_tipo_idx on public.dispositivos (tipo_dispositivo_codigo);

create table public.revisiones_dispositivos (
  id uuid primary key default extensions.gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  dispositivo_id uuid not null references public.dispositivos(id) on delete restrict,
  area_id uuid not null references public.areas(id) on delete restrict,
  numero_snapshot text not null check (btrim(numero_snapshot) <> ''),
  ubicacion_snapshot text not null check (btrim(ubicacion_snapshot) <> ''),
  tipo_dispositivo_codigo text not null check (btrim(tipo_dispositivo_codigo) <> ''),
  estado_observado text not null check (estado_observado in ('ACTIVO', 'FUERA_DE_USO', 'DANADO')),
  capturas_json jsonb check (capturas_json is null or jsonb_typeof(capturas_json) = 'array'),
  consumo jsonb,
  producto_quimico text,
  antidoto text,
  observaciones text,
  foto_storage_path text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create index revisiones_servicio_idx on public.revisiones_dispositivos (servicio_id);
create index revisiones_dispositivo_fecha_idx on public.revisiones_dispositivos (dispositivo_id, updated_at desc);
create index revisiones_area_fecha_idx on public.revisiones_dispositivos (area_id, updated_at desc);
create index revisiones_capturas_gin_idx on public.revisiones_dispositivos using gin (capturas_json);

create table public.hallazgos (
  id uuid primary key default extensions.gen_random_uuid(),
  sede_id uuid not null references public.sedes(id) on delete restrict,
  area_id uuid not null references public.areas(id) on delete restrict,
  servicio_apertura_id uuid not null references public.servicios(id) on delete restrict,
  fecha_apertura timestamptz not null,
  descripcion text not null check (btrim(descripcion) <> ''),
  recomendacion_accion text not null check (btrim(recomendacion_accion) <> ''),
  evidencias_apertura_storage_paths jsonb check (
    evidencias_apertura_storage_paths is null
    or jsonb_typeof(evidencias_apertura_storage_paths) = 'array'
  ),
  estado text not null check (estado in ('ABIERTO', 'EN_PROCESO', 'CERRADO')),
  responsable_nombre text not null check (btrim(responsable_nombre) <> ''),
  responsable_correo text,
  servicio_cierre_id uuid references public.servicios(id) on delete restrict,
  fecha_cierre timestamptz,
  evidencias_cierre_storage_paths jsonb check (
    evidencias_cierre_storage_paths is null
    or jsonb_typeof(evidencias_cierre_storage_paths) = 'array'
  ),
  observacion_cierre text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  constraint hallazgos_cierre_check check (
    (estado = 'CERRADO' and servicio_cierre_id is not null and fecha_cierre is not null and evidencias_cierre_storage_paths is not null)
    or (estado <> 'CERRADO' and servicio_cierre_id is null and fecha_cierre is null and evidencias_cierre_storage_paths is null)
  ),
  constraint hallazgos_servicios_check check (
    servicio_cierre_id is null or servicio_cierre_id <> servicio_apertura_id
  ),
  constraint hallazgos_fechas_check check (
    fecha_cierre is null or fecha_cierre >= fecha_apertura
  )
);

create index hallazgos_sede_estado_fecha_idx on public.hallazgos (sede_id, estado, fecha_apertura desc);
create index hallazgos_area_estado_idx on public.hallazgos (area_id, estado);
create index hallazgos_servicio_apertura_idx on public.hallazgos (servicio_apertura_id);
create index hallazgos_servicio_cierre_idx on public.hallazgos (servicio_cierre_id) where servicio_cierre_id is not null;

create table public.vehiculos (
  id uuid primary key default extensions.gen_random_uuid(),
  sede_id uuid not null references public.sedes(id) on delete restrict,
  placa text not null check (btrim(placa) <> ''),
  activo boolean not null default true
);

create unique index vehiculos_sede_placa_uidx on public.vehiculos (sede_id, lower(btrim(placa)));
create index vehiculos_sede_activo_idx on public.vehiculos (sede_id, activo);

create table public.certificados (
  id uuid primary key default extensions.gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  tipo_certificado text not null check (tipo_certificado in ('ESTABLECIMIENTO', 'VEHICULO')),
  vehiculo_id uuid references public.vehiculos(id) on delete restrict,
  fecha_expedicion date not null,
  vigencia_meses integer not null check (vigencia_meses > 0),
  fecha_vencimiento date not null,
  plantilla_storage_path_usada text not null check (btrim(plantilla_storage_path_usada) <> ''),
  pdf_storage_path text not null check (btrim(pdf_storage_path) <> ''),
  destinatarios_json jsonb check (destinatarios_json is null or jsonb_typeof(destinatarios_json) = 'array'),
  enviado_at timestamptz,
  estado_generacion text not null check (estado_generacion in ('PENDIENTE', 'GENERADO', 'ENVIADO', 'ERROR')),
  error text,
  created_at timestamptz not null default now(),
  constraint certificados_tipo_check check (
    (tipo_certificado = 'VEHICULO' and vehiculo_id is not null)
    or (tipo_certificado = 'ESTABLECIMIENTO' and vehiculo_id is null)
  )
);

create index certificados_servicio_idx on public.certificados (servicio_id);
create index certificados_vehiculo_idx on public.certificados (vehiculo_id) where vehiculo_id is not null;
create index certificados_vencimiento_idx on public.certificados (fecha_vencimiento);
create index certificados_estado_generacion_idx on public.certificados (estado_generacion);
create unique index certificados_establecimiento_servicio_uidx on public.certificados (servicio_id) where tipo_certificado = 'ESTABLECIMIENTO';
create unique index certificados_vehiculo_servicio_uidx on public.certificados (servicio_id, vehiculo_id) where tipo_certificado = 'VEHICULO';

create table public.movimientos_efectivo (
  id uuid primary key default extensions.gen_random_uuid(),
  tecnico_id uuid not null references public.usuarios(id) on delete restrict,
  monto bigint not null check (monto > 0),
  fecha_hora timestamptz not null,
  registrado_por_id uuid not null references public.usuarios(id) on delete restrict,
  observacion text,
  created_at timestamptz not null default now()
);

create index movimientos_efectivo_tecnico_fecha_idx on public.movimientos_efectivo (tecnico_id, fecha_hora desc);
create index movimientos_efectivo_registrador_fecha_idx on public.movimientos_efectivo (registrado_por_id, fecha_hora desc);

create table public.auditoria (
  id uuid primary key default extensions.gen_random_uuid(),
  fecha_hora timestamptz not null default now(),
  usuario_id uuid not null references public.usuarios(id) on delete restrict,
  accion text not null check (btrim(accion) <> ''),
  entidad text not null check (btrim(entidad) <> ''),
  registro_id uuid not null,
  detalle_json jsonb
);

create index auditoria_usuario_fecha_idx on public.auditoria (usuario_id, fecha_hora desc);
create index auditoria_entidad_registro_fecha_idx on public.auditoria (entidad, registro_id, fecha_hora desc);

create table private.user_sessions (
  session_id text primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  active_role text not null check (active_role in ('ADMINISTRADOR', 'TECNICO')),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index user_sessions_auth_user_idx on private.user_sessions (auth_user_id);
create index user_sessions_expiry_idx on private.user_sessions (expires_at);

create table private.service_edit_leases (
  service_id uuid primary key references public.servicios(id) on delete cascade,
  user_id uuid not null references public.usuarios(id) on delete cascade,
  lease_token uuid not null unique default extensions.gen_random_uuid(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index service_edit_leases_expiry_idx on private.service_edit_leases (expires_at);

create table private.sync_operations (
  id uuid primary key,
  user_id uuid not null references public.usuarios(id) on delete restrict,
  entity text not null check (btrim(entity) <> ''),
  record_id uuid not null,
  base_version bigint,
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPLIED', 'CONFLICT', 'REJECTED')),
  conflict_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_operations_conflict_check check (
    (status = 'CONFLICT' and conflict_json is not null)
    or (status <> 'CONFLICT')
  )
);

create index sync_operations_user_status_idx on private.sync_operations (user_id, status, created_at);

create table private.integration_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  job_type text not null check (job_type in ('CALENDAR', 'EMAIL', 'DOCUMENT', 'STORAGE_CLEANUP')),
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_type, idempotency_key)
);

create index integration_jobs_ready_idx on private.integration_jobs (status, run_after) where status in ('PENDING', 'FAILED');

create sequence public.service_request_sequence start with 1 increment by 1 no cycle;
revoke all on sequence public.service_request_sequence from public, anon, authenticated;
