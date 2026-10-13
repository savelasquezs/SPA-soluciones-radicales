-- Report delivery: multiple independent, expiring public links per finalized service.
-- Tokens are generated server-side and only their SHA-256 digest is persisted.
-- No public SQL grants; the Neon Function mediates all reads.
create table private.service_report_links (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id) on delete cascade,
  job_id uuid not null unique references private.integration_jobs(id),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_by_id uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  revoked_at timestamptz,
  recipients_json jsonb not null default '[]'::jsonb,
  certificate_ids_json jsonb not null default '[]'::jsonb,
  constraint service_report_links_expiry check (expires_at > created_at),
  constraint service_report_links_recipients check (jsonb_typeof(recipients_json) = 'array'),
  constraint service_report_links_certificates check (jsonb_typeof(certificate_ids_json) = 'array')
);
create index service_report_links_active_idx
  on private.service_report_links(servicio_id, expires_at desc)
  where revoked_at is null and sent_at is not null;

revoke all on private.service_report_links from public;
