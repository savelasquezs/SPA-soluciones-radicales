-- Cada visita conserva el último resultado editable y todas las evidencias incorporadas.
alter table public.hallazgo_seguimientos
  add column observacion text check (observacion is null or length(observacion) <= 2000),
  add column evidencias_storage_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidencias_storage_paths) = 'array' and jsonb_array_length(evidencias_storage_paths) <= 10);

-- Preservar las fotografías/observaciones de cierres registrados antes de esta migración.
update public.hallazgo_seguimientos seg
set observacion = h.observacion_cierre,
    evidencias_storage_paths = coalesce(h.evidencias_cierre_storage_paths, '[]'::jsonb)
from public.hallazgos h
where seg.hallazgo_id=h.id and seg.servicio_id=h.servicio_cierre_id
  and seg.resultado='CERRADO' and jsonb_array_length(seg.evidencias_storage_paths)=0;
