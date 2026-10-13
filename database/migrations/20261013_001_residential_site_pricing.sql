-- The implicit residential site can hold an optional default price.
-- Existing services keep their own original valor_servicio.
-- Keep the current constraints from 20261006_011 (legacy MIP columns were removed).
alter table public.sedes
  drop constraint sedes_configuracion_tipo_check,
  add constraint sedes_configuracion_tipo_check check (
    (
      tipo_sede = 'NEGOCIO'
      and valor_servicio >= 0
      and periodicidad_meses > 0
      and duracion_servicio_minutos > 0
    )
    or (
      tipo_sede = 'RESIDENCIAL'
      and (valor_servicio is null or valor_servicio >= 0)
      and periodicidad_meses is null
      and not maneja_refuerzo
      and not maneja_vehiculos
      and not genera_certificado_vehiculo
      and duracion_servicio_minutos is null
    )
  );
