-- Evidencias múltiples de Áreas sin acceso, sin alterar los snapshots existentes.
alter table public.servicio_areas
  add column if not exists sin_acceso_evidencias_storage_paths jsonb not null default '[]'::jsonb;

update public.servicio_areas
set sin_acceso_evidencias_storage_paths = jsonb_build_array(sin_acceso_foto_storage_path)
where sin_acceso_foto_storage_path is not null
  and sin_acceso_evidencias_storage_paths = '[]'::jsonb;

alter table public.servicio_areas
  add constraint servicio_areas_sin_acceso_evidencias_check
  check (jsonb_typeof(sin_acceso_evidencias_storage_paths) = 'array'
    and jsonb_array_length(sin_acceso_evidencias_storage_paths) <= 5);
