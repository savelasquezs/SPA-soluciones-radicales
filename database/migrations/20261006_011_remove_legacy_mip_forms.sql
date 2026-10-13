-- Elimina el modelo legacy de formularios MIP.
-- La ejecución técnica se compone directamente desde Servicio, Áreas, Criterios,
-- Productos, Dispositivos, Plagas, Hallazgos, Evidencias y Firmas.
-- Las migraciones anteriores permanecen inmutables; esta migración retira su
-- estructura transitoria.

drop trigger if exists respuestas_formulario_domain on public.respuestas_formulario;
drop trigger if exists respuestas_formulario_touch on public.respuestas_formulario;
drop trigger if exists formularios_inmutables on public.formularios;

drop function if exists private.validate_form_response();
drop function if exists private.protect_published_form();

drop table if exists public.respuestas_formulario;
drop table if exists public.formularios;

alter table public.sedes
  drop constraint if exists sedes_configuracion_tipo_check;

alter table public.sedes
  drop column if exists formularios_aplicables_json;

alter table public.servicios
  drop column if exists formularios_versiones_json;

alter table public.sedes
  add constraint sedes_configuracion_tipo_check check (
    (
      tipo_sede = 'NEGOCIO'
      and valor_servicio >= 0
      and periodicidad_meses > 0
      and duracion_servicio_minutos > 0
    )
    or (
      tipo_sede = 'RESIDENCIAL'
      and valor_servicio is null
      and periodicidad_meses is null
      and not maneja_refuerzo
      and not maneja_vehiculos
      and not genera_certificado_vehiculo
      and duracion_servicio_minutos is null
    )
  );
