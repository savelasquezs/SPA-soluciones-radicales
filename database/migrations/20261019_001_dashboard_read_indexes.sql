-- Read-only dashboard drilldowns: keep global newest-first finding lists and
-- unconfirmed completed payments indexable as historical data grows.
create index if not exists hallazgos_fecha_apertura_global_idx
  on public.hallazgos (fecha_apertura desc, id desc);

create index if not exists servicios_cobro_pendiente_finalizado_idx
  on public.servicios (fin_real desc, id desc)
  where estado = 'FINALIZADO'
    and valor_servicio > 0
    and estado_pago <> 'CONFIRMADO';
