-- Perfil autogestionable y cambio de identidad Google con prueba temporal de posesión.
alter table public.usuarios
  add column telefono text,
  add column foto_storage_path text;

alter table public.usuarios
  add constraint usuarios_telefono_check check (
    telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$'
  ),
  add constraint usuarios_foto_storage_path_check check (
    foto_storage_path is null or foto_storage_path ~ '^users/avatars/[a-f0-9-]{36}/[a-f0-9-]{36}-[^/]+$'
  );

create table private.user_google_change_requests (
  state_hash text primary key,
  user_id uuid not null references public.usuarios(id) on delete cascade,
  old_auth_user_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index user_google_change_requests_user_idx
  on private.user_google_change_requests(user_id, expires_at);
revoke all on table private.user_google_change_requests from public, anonymous, authenticated;
