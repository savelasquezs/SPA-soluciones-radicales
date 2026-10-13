-- Global templates live in existing configuracion/SISTEMA rows. A null per-client/site
-- path means inheritance, never a public URL. No data, table, role or privilege changes.
alter table public.negocios drop constraint negocios_certificado_tipo_check;
alter table public.negocios add constraint negocios_certificado_tipo_check check (
  (tipo_cliente = 'NEGOCIO'
   and vigencia_cert_establecimiento_meses is not null and vigencia_cert_establecimiento_meses > 0
   and (plantilla_cert_establecimiento_storage_path is null
        or nullif(btrim(plantilla_cert_establecimiento_storage_path), '') is not null))
  or (tipo_cliente = 'RESIDENCIAL' and vigencia_cert_establecimiento_meses is null
      and plantilla_cert_establecimiento_storage_path is null)
) not valid; -- Preserve the legacy rows deliberately left unvalidated by migration 006.

alter table public.sedes drop constraint sedes_certificado_vehiculo_check;
alter table public.sedes add constraint sedes_certificado_vehiculo_check check (
  (not genera_certificado_vehiculo and vigencia_cert_vehiculo_meses is null
   and plantilla_cert_vehiculo_storage_path is null)
  or (genera_certificado_vehiculo and maneja_vehiculos
      and vigencia_cert_vehiculo_meses is not null and vigencia_cert_vehiculo_meses > 0
      and (plantilla_cert_vehiculo_storage_path is null
           or nullif(btrim(plantilla_cert_vehiculo_storage_path), '') is not null))
);
