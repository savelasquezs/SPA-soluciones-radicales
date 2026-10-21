-- Cartera por cliente, abonos y entregas de caja. No se generan mensualidades automáticas.
-- Mantener fuentes originales de pago para reconciliar el histórico sin cobrar dos veces.
alter table public.negocios
  add column modalidad_cobro text not null default 'POR_SERVICIO'
    check (modalidad_cobro in ('POR_SERVICIO','CREDITO')),
  add column plazo_pago_dias integer not null default 0
    check (plazo_pago_dias between 0 and 365);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  cliente_id uuid not null references public.negocios(id) on delete restrict,
  monto bigint not null check (monto > 0),
  metodo text not null check (metodo in ('EFECTIVO','TRANSFERENCIA')),
  estado text not null check (estado in ('PENDIENTE','CONFIRMADO','RECHAZADO','ANULADO')),
  recaudado_por_id uuid references public.usuarios(id) on delete restrict,
  registrado_por_id uuid not null references public.usuarios(id) on delete restrict,
  confirmado_por_id uuid references public.usuarios(id) on delete restrict,
  confirmado_at timestamptz,
  comprobante_storage_path text,
  observacion text not null default '',
  motivo_revision text,
  fecha_pago timestamptz not null default now(),
  creado_at timestamptz not null default now(),
  origen_legacy_servicio_id uuid unique references public.servicios(id) on delete restrict,
  constraint pagos_confirmacion_check check (
    (estado = 'CONFIRMADO' and confirmado_por_id is not null and confirmado_at is not null)
    or (estado <> 'CONFIRMADO')
  ),
  constraint pagos_receptor_check check (
    (metodo = 'EFECTIVO' and recaudado_por_id is not null)
    or (metodo = 'TRANSFERENCIA' and recaudado_por_id is null)
  )
);
create index pagos_cliente_estado_idx on public.pagos(cliente_id,estado,fecha_pago desc);
create index pagos_recaudador_idx on public.pagos(recaudado_por_id,fecha_pago desc)
  where metodo='EFECTIVO' and estado='CONFIRMADO';
create index pagos_estado_idx on public.pagos(estado,creado_at desc);

create table public.pago_aplicaciones (
  pago_id uuid not null references public.pagos(id) on delete restrict,
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  monto bigint not null check (monto > 0),
  primary key (pago_id,servicio_id)
);
create index pago_aplicaciones_servicio_idx on public.pago_aplicaciones(servicio_id);

-- La tabla existente registra entregas; esta extensión permite reintentos seguros y
-- anulación auditada sin borrar jamás el arqueo original.
alter table public.movimientos_efectivo
  add column request_id uuid unique,
  add column anulado_at timestamptz,
  add column anulado_por_id uuid references public.usuarios(id) on delete restrict,
  add column motivo_anulacion text,
  add constraint movimientos_anulacion_check check (
    (anulado_at is null and anulado_por_id is null and motivo_anulacion is null)
    or (anulado_at is not null and anulado_por_id is not null and nullif(btrim(motivo_anulacion),'') is not null)
  );

-- Pago por servicio previamente confirmado: un solo asiento por visita.
-- Pago anticipado también se conserva. Refuerzos gratuitos no generan asientos.
do $$
begin
  if exists (
    select 1 from public.servicios
    where tipo_servicio='PRINCIPAL' and estado_pago='CONFIRMADO'
      and valor_servicio>0 and (metodo_pago is null
      or (metodo_pago='EFECTIVO' and recaudado_por_id is null))
  ) then
    raise exception 'Revisar pagos confirmados sin método o receptor antes de migrar';
  end if;
end $$;

insert into public.pagos (
  request_id,cliente_id,monto,metodo,estado,recaudado_por_id,registrado_por_id,
  confirmado_por_id,confirmado_at,comprobante_storage_path,fecha_pago,
  observacion,origen_legacy_servicio_id
)
select gen_random_uuid(),se.negocio_id,s.valor_servicio,s.metodo_pago,'CONFIRMADO',
  case when s.metodo_pago='EFECTIVO' then s.recaudado_por_id else null end,
  coalesce(s.pago_registrado_por_id,s.creado_por_id),
  coalesce(s.pago_confirmado_por_id,s.creado_por_id),
  coalesce(s.pago_confirmado_at,s.pago_fecha,s.created_at),
  s.pago_comprobante_storage_path,
  coalesce(s.pago_fecha,s.pago_confirmado_at,s.created_at),
  'Importado desde el pago confirmado del servicio',s.id
from public.servicios s join public.sedes se on se.id=s.sede_id
where s.tipo_servicio='PRINCIPAL' and s.estado_pago='CONFIRMADO' and s.valor_servicio>0;

insert into public.pago_aplicaciones(pago_id,servicio_id,monto)
select p.id,p.origen_legacy_servicio_id,p.monto from public.pagos p
where p.origen_legacy_servicio_id is not null;

alter table public.pagos enable row level security;
alter table public.pago_aplicaciones enable row level security;
create policy pagos_lectura on public.pagos for select to authenticated using (
  (select private.is_admin(auth.user_id(),auth.session()))
  or registrado_por_id=(select private.current_user_id(auth.user_id()))
);
create policy pago_aplicaciones_lectura on public.pago_aplicaciones for select to authenticated using (
  exists (select 1 from public.pagos p where p.id=pago_id and
    ((select private.is_admin(auth.user_id(),auth.session()))
     or p.registrado_por_id=(select private.current_user_id(auth.user_id()))))
);
revoke all on public.pagos,public.pago_aplicaciones from public,anonymous,authenticated;
comment on table public.pagos is 'Cobros identificables, confirmados solo por Administrador; no equivalen a facturación.';
comment on table public.pago_aplicaciones is 'Abonos aplicados a servicios de un mismo cliente, incluso sedes distintas.';
