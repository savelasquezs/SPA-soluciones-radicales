-- Certificate templates are system-wide. Clients and sites only keep validity settings.
alter table public.negocios drop constraint if exists negocios_certificado_tipo_check;
alter table public.sedes drop constraint if exists sedes_certificado_vehiculo_check;

alter table public.negocios
  drop column if exists plantilla_cert_establecimiento_storage_path;

alter table public.sedes
  drop column if exists plantilla_cert_vehiculo_storage_path;

alter table public.negocios add constraint negocios_certificado_tipo_check check (
  (tipo_cliente = 'NEGOCIO'
   and vigencia_cert_establecimiento_meses is not null
   and vigencia_cert_establecimiento_meses > 0)
  or (tipo_cliente = 'RESIDENCIAL'
      and vigencia_cert_establecimiento_meses is null)
) not valid;

alter table public.sedes add constraint sedes_certificado_vehiculo_check check (
  (not genera_certificado_vehiculo and vigencia_cert_vehiculo_meses is null)
  or (genera_certificado_vehiculo and maneja_vehiculos
      and vigencia_cert_vehiculo_meses is not null
      and vigencia_cert_vehiculo_meses > 0)
);
