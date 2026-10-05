alter table public.usuarios
  drop constraint usuarios_certificado_check;

alter table public.usuarios
  add constraint usuarios_certificado_check check (
    certificado_storage_path is null
    or (
      certificado_fecha_emision is not null
      and certificado_fecha_vencimiento is not null
    )
  );
