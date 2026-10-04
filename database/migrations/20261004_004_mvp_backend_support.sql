alter table public.usuarios
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column version bigint not null default 1 check (version > 0);

alter table public.usuarios
  add constraint usuarios_certificado_fechas_check check (
    certificado_fecha_vencimiento is null
    or certificado_fecha_emision is null
    or certificado_fecha_vencimiento >= certificado_fecha_emision
  );

create trigger usuarios_touch
before update on public.usuarios
for each row execute function private.touch_updated_at_and_version();

create or replace function private.ensure_active_admin_exists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.usuarios
    where activo and es_admin
  ) then
    raise exception 'Debe existir al menos un Administrador activo';
  end if;
  return null;
end;
$$;

revoke all on function private.ensure_active_admin_exists() from public, anonymous, authenticated;

create constraint trigger usuarios_active_admin_guard
after update of activo, es_admin or delete on public.usuarios
deferrable initially deferred
for each row execute function private.ensure_active_admin_exists();

create table private.google_integrations (
  singleton boolean primary key default true check (singleton),
  cuenta_correo text not null check (
    cuenta_correo = lower(btrim(cuenta_correo))
    and cuenta_correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  refresh_token_ciphertext bytea not null,
  refresh_token_iv bytea not null,
  refresh_token_tag bytea not null,
  scopes text[] not null,
  connected_by_id uuid not null references public.usuarios(id) on delete restrict,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.google_oauth_states (
  state_hash text primary key,
  requested_by_id uuid not null references public.usuarios(id) on delete cascade,
  return_url text not null check (btrim(return_url) <> ''),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint google_oauth_states_consumed_check check (
    consumed_at is null or consumed_at >= created_at
  )
);

create trigger google_integrations_touch
before update on private.google_integrations
for each row execute function private.touch_updated_at();

create index google_oauth_states_expiry_idx
  on private.google_oauth_states (expires_at)
  where consumed_at is null;

revoke all on table private.google_integrations from public, anonymous, authenticated;
revoke all on table private.google_oauth_states from public, anonymous, authenticated;

create or replace function private.claim_integration_job(p_job_type text)
returns private.integration_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.integration_jobs%rowtype;
begin
  update private.integration_jobs
  set status = 'RUNNING',
      attempts = attempts + 1,
      lease_until = now() + interval '5 minutes',
      updated_at = now()
  where id = (
    select id
    from private.integration_jobs
    where job_type = p_job_type
      and status in ('PENDING', 'FAILED')
      and run_after <= now()
      and (lease_until is null or lease_until <= now())
    order by run_after, created_at
    for update skip locked
    limit 1
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function private.claim_integration_job(text) from public, anonymous, authenticated;
