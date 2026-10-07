-- Catálogo administrativo de criterios MIP.
-- No usa clave, orden ni versión: el UUID identifica el criterio y la UI se ordena por nombre.

create table public.criterios_mip (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  solo_area_externa boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index criterios_mip_nombre_uidx
  on public.criterios_mip (lower(btrim(nombre)));

create index criterios_mip_activo_nombre_idx
  on public.criterios_mip (activo, lower(nombre));

create trigger criterios_mip_touch
before update on public.criterios_mip
for each row execute function private.touch_updated_at();

alter table public.criterios_mip enable row level security;

revoke all on public.criterios_mip from public, anonymous, authenticated;
grant select, insert, update, delete on public.criterios_mip to authenticated;

create policy criterios_mip_admin on public.criterios_mip
for all to authenticated
using (private.is_admin(auth.user_id(), auth.session()))
with check (private.is_admin(auth.user_id(), auth.session()));
