-- Criterios iniciales aprobados desde FO-PS-02.
-- IDs fijos hacen el bootstrap idempotente sin exponer claves de negocio ni sobrescribir cambios.

with reference(id, nombre, solo_area_externa) as (
  values
    ('c1000000-0000-4000-8000-000000000001'::uuid, 'Instalación de barreras físicas', false),
    ('c1000000-0000-4000-8000-000000000002'::uuid, 'Disposición adecuada de residuos sólidos y líquidos', false),
    ('c1000000-0000-4000-8000-000000000003'::uuid, 'Mantenimiento higiénico', false),
    ('c1000000-0000-4000-8000-000000000004'::uuid, 'Mantenimiento locativo interno y externo', false),
    ('c1000000-0000-4000-8000-000000000005'::uuid, 'Mantenimiento de zonas verdes', true)
)
insert into public.criterios_mip (id, nombre, solo_area_externa)
select r.* from reference r
where not exists (
  select 1
  from public.criterios_mip c
  where c.id = r.id
     or lower(btrim(c.nombre)) = lower(btrim(r.nombre))
)
on conflict do nothing;
