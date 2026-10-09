# Informe técnico MIP — primera entrega

## Alcance
Un Servicio Principal de Sede Negocio genera un PDF cuando el servidor confirma la finalización. La intención de cierre puede guardarse sin conexión, pero el PDF se produce solo tras sincronizar los datos y las dos firmas. Refuerzos y residenciales no generan este informe MIP completo.

## Datos y diseño
El informe se deriva de los snapshots históricos del Servicio: áreas, criterios, revisiones de puestos, capturas, hallazgos, productos aplicados, horarios reales, firmas y evidencias. Se agrupan todas las fotografías por Área en celdas compactas de tres columnas, con proporción original y leyenda por registro. Las evidencias WebP/JPG/PNG se convierten a JPG optimizado dentro del backend únicamente para el PDF; no se modifican los originales.

La serie histórica consulta hasta seis Servicios Principales finalizados de la **misma Sede** hasta la fecha de cierre. El porcentaje es el promedio de las áreas accesibles: C=100 %, CP=50 %, NC=0 % y NA excluido. Las áreas sin acceso se excluyen aun cuando existan criterios persistidos. Los conteos de capturas se describen sin asumir comparabilidad entre tipos de dispositivos diferentes.

## Generación segura
La finalización registra un trabajo DOCUMENT con scope SERVICE_REPORT y clave idempotente por Servicio en la misma transacción que FINALIZADO. La cola de Servicios lo ejecuta y reintenta; una vez publicado un PDF no se genera otro silenciosamente. Los bytes se guardan en el bucket privado sr-generated-documents y la referencia y fecha quedan en la tabla servicios. El informe se conserva doce meses conforme a [file-retention.md](file-retention.md).

V1 admite hasta 80 fotografías y PDF máximo de 15 MiB. Si R2 no permite leer una evidencia requerida, el proceso falla y puede reintentarse; no crea un informe incompleto. Los Servicios antiguos finalizados pueden solicitar la primera generación desde el historial.

## Consulta
Servicios → Historial → Acciones → Ver resultados abre cuatro pestañas: Criterios, Hallazgos, Puestos de monitoreo y Detalles. Detalles presenta las horas reales, ambas firmas, certificados (módulo actual) y estado del informe: NO_GENERADO, PENDIENTE, GENERANDO, DISPONIBLE o ERROR. PDF y fotografías se abren mediante URLs firmadas autorizadas por el backend.

## Pendientes
- Pruebas reales de despliegue en Neon desarrollo con fotos del R2 privado, tamaños y errores.
- Selección offline de destinatarios al finalizar, envío opcional de informe y certificados, estados por documento y reenvío controlado.
- Conectar el generador de certificados existente a la finalización; no se modifica su generación manual actual.
- Página pública tokenizada con QR y regeneración con snapshot documental sin necesitar fotografías ya vencidas.
