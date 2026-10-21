-- La placa se normaliza en la propia BD para cualquier consumidor.
-- Versionado y control optimista compatibles con los CRUD existentes.
alter table public.vehiculos
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1 check (version > 0);

update public.vehiculos set placa = upper(btrim(placa))
where placa is distinct from upper(btrim(placa));

create or replace function private.normalize_vehicle_plate()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.placa := upper(btrim(new.placa));
  return new;
end;
$$;

create trigger vehiculos_normalize_plate
before insert or update of placa on public.vehiculos
for each row execute function private.normalize_vehicle_plate();

create trigger vehiculos_touch
before update on public.vehiculos
for each row execute function private.touch_updated_at_and_version();

alter table public.vehiculos add constraint vehiculos_placa_uppercase_check
  check (placa = upper(btrim(placa)));
