-- Seguimiento por visita; el estado del hallazgo continúa representando su condición actual.
create table public.hallazgo_seguimientos (
  id uuid primary key default gen_random_uuid(),
  hallazgo_id uuid not null references public.hallazgos(id) on delete restrict,
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  resultado text not null check (resultado in ('SIN_CAMBIOS', 'EN_PROCESO', 'CERRADO')),
  estado_anterior text not null check (estado_anterior in ('ABIERTO', 'EN_PROCESO')),
  tecnico_id uuid not null references public.usuarios(id) on delete restrict,
  registrado_at timestamptz not null default now(),
  unique (hallazgo_id, servicio_id)
);
create index hallazgo_seguimientos_servicio_idx on public.hallazgo_seguimientos (servicio_id);
create index hallazgo_seguimientos_hallazgo_fecha_idx on public.hallazgo_seguimientos (hallazgo_id, registrado_at desc);

alter table public.hallazgo_seguimientos enable row level security;
revoke all on public.hallazgo_seguimientos from public, anonymous, authenticated;
grant select on public.hallazgo_seguimientos to authenticated;
create policy hallazgo_seguimientos_select on public.hallazgo_seguimientos
for select to authenticated using (
  (select private.can_access_service(servicio_id, auth.user_id(), auth.session()))
);
