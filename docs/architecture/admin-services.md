# Servicios administrativos

Implementación de `docs/product/service-scheduling.md`. La ejecución técnica MIP y los servicios residenciales conservan su alcance separado.

## Superficie y autoridad

La SPA usa `/api/admin/services`, protegido en servidor con `requireAdmin`, identidad autenticada y rol activo `ADMINISTRADOR`:

| Operación | Ruta relativa |
| --- | --- |
| Opciones de sedes, técnicos y productos | `GET /workspace` |
| Agenda e historial paginados | `GET /` |
| Detalle completo / actividad paginada | `GET /:id`, `GET /:id/audit` |
| Crear / editar | `POST /`, `PUT /:id` |
| Reprogramar / cancelar / registrar pago | `POST /:id/reschedule`, `POST /:id/cancel`, `POST /:id/payment` |
| Reintentar Calendar | `POST /:id/calendar/retry` |
| Preagenda / contador de siete días | `GET /upcoming`, `GET /pending-count` |
| Consultar / gestionar seguimiento | `GET /upcoming/:id`, `PATCH /upcoming/:id` |
| Preparar / solicitar correo | `GET /upcoming/:id/email-preview`, `POST /upcoming/:id/email` |
| Recuperar creación cuya respuesta se perdió | `GET /commands/:requestId` |

`GET /api/services` permanece como lectura autorizada de asignaciones para el Técnico. Las antiguas escrituras `POST /api/services` y `POST /api/services/:id/calendar/retry` fueron retiradas: no existe una segunda vía administrativa sin control de versión ni una sincronización síncrona paralela.

La UI no asigna consecutivos, precios, estados de ejecución ni relaciones arbitrarias. El valor del Principal se copia de la Sede al crearlo, conserva el histórico y el Refuerzo vale cero. El cobro previsto no equivale a pago confirmado. `tecnico_recaudo_previsto_id` conserva al Técnico esperado para cobrar, mientras `recaudado_por_id` identifica a quien recibió realmente el efectivo: Técnico o el Administrador que registra el pago. Este dato tampoco equivale a una entrega de caja Técnico → Administrador. `tecnico_que_recauda_id` se mantiene temporalmente espejado solo para permitir rollback durante el despliegue; el código nuevo no debe consumirlo.

## Transacciones, versiones y reintentos

Todas las mutaciones requieren `requestId` UUID. `private.service_admin_commands` conserva actor, operación, hash del payload y respuesta; el bloqueo transaccional de esa clave serializa reintentos. Un mismo identificador con otro contenido devuelve `REQUEST_REUSED`, nunca crea otra visita.

Las modificaciones requieren `version`; las conjuntas incluyen la versión del Refuerzo. Se bloquea la familia en orden estable y se valida antes de escribir. Un conflicto devuelve `VERSION_CONFLICT` y conserva el borrador de la UI. Principal y Refuerzo se guardan juntos o ninguno se guarda. Los cruces de técnicos devuelven una advertencia `SCHEDULE_CONFLICT`; continuar requiere una aceptación explícita que queda auditada.

Crear un Principal en una Sede con Refuerzo genera ambos registros en una transacción. La sugerencia inicial es +21 días; no es una restricción permanente. Editar solamente el Refuerzo no modifica al Principal. Cancelar el Principal afecta únicamente al Refuerzo todavía Programado, manteniendo el histórico, evidencias y pagos.

## Calendar y Gmail

La migración agrega una outbox duradera en `private.integration_jobs`, con `scope=ADMIN_SERVICES`. Guardar una visita no depende de Google. Después del commit, `waitUntil` procesa un lote acotado; el trigger Neon `services-outbox` recupera pendientes cada quince minutos mediante `/jobs/services`. La entrega interna valida el tipo, nombre y cabeceras confiables con `parseTriggerDelivery`; no es un endpoint administrativo público.

Calendar usa un evento por visita con ID determinista, asistentes del equipo y zona `America/Bogota`. Las actualizaciones leen el evento, preservan respuestas de asistentes que continúan asignados y hacen PATCH condicional con ETag. Las cancelaciones usan DELETE, considerando ausencias 404/410 como resultado idempotente. No se recrea un evento cancelado mediante un reintento de cancelación.

`calendar_revision` identifica cada programación. El worker lee contenido y revisión en una misma consulta, serializa entregas por servicio con **bloqueo advisory transaccional** compatible con pooling y no mantiene un bloqueo de fila durante la llamada externa acotada. Un cambio administrativo simultáneo deja pendiente su revisión nueva. Los metadatos de Calendar no invalidan la versión de edición del servicio.

Los fallos de Calendar quedan visibles y auditados, con hasta cinco intentos automáticos y reintento administrativo explícito. Los jobs en ejecución tienen lease para recuperación tras una interrupción.

El correo de próxima visita se prepara en servidor y se envía solo después de una solicitud explícita a un destinatario registrado. Antes de despacharlo se comprueba que la propuesta siga pendiente de agendar y se persiste la marca de despacho. Una entrega incierta o una interrupción después de esa marca no causa un reenvío automático: exige revisar Enviados en Gmail. Abrir WhatsApp no registra un contacto ni confirma una visita.

## Preagenda y formularios

`proximos_servicios` se genera al finalizar un Principal, conservando el origen, periodicidad y fecha sugerida. La suma de meses ajusta los fines de mes y usa hora de Bogotá. La propuesta no reserva técnicos ni produce consecutivo, Refuerzo o evento. Agendar exige confirmación del cliente y vincula el nuevo Principal en la misma transacción. La fila deja de aparecer como pendiente únicamente después del commit.

El contador incluye propuestas accionables no confirmadas cuya fecha sugerida cae entre hoy y los seis días siguientes; no cuenta confirmadas, rechazadas, ya agendadas ni pospuestas con recontacto futuro. El listado permite consultar otras fechas y estados independientemente del contador.

`ServiceForm`, `ServiceScheduleFields` y `ServiceProductsFields` comparten alta/edición. Los cambios breves usan editores por contexto; las altas y ediciones completas tienen rutas propias. El store reutiliza el detalle ya cargado y aplica las respuestas sin recargar toda la colección. Las lecturas anteriores a una mutación no pueden restaurar filas o contadores obsoletos. Los cambios de sesión/rol limpian snapshots administrativos.

Los borradores de creación se guardan en IndexedDB por usuario y origen de propuesta, junto con su `requestId`. Al recuperarlos se consulta primero el resultado de esa operación, evitando duplicar una creación cuya respuesta se perdió. Un Refuerzo personalizado recuperado no vuelve a sincronizarse automáticamente con la fecha del Principal.

El detalle enlaza el servicio Principal finalizado con el módulo existente de certificados. Se precargan cliente, sede y servicio mediante una consulta puntual, sin recorrer todo el historial y sin generar ni enviar documentos automáticamente.

## Migración y activación

Nueva migración: `database/migrations/20261007_001_admin_services.sql`. No modifica migraciones anteriores ni desplaza fechas históricas. El bootstrap crea propuestas pasivas del último Principal finalizado cuando no existe otro ya programado; no envía mensajes ni invitaciones.

La implementación en el PR no equivale a un despliegue. Para activar en la rama Neon autorizada: revisar el diff de esquema y respaldo, aplicar migraciones, desplegar la API con su trigger y luego publicar el frontend. Verificar que se mantienen las variables privadas ya configuradas; no enviar valores vacíos al runtime ni registrar secretos.

La validación real de OAuth, asistentes de Calendar, Gmail y ejecución del trigger en Neon queda como smoke test de desarrollo pendiente de autorización; las pruebas automatizadas usan proveedores simulados y datos sintéticos. No ejecutar pruebas destructivas contra Neon real ni enviar correos de prueba a clientes.

## Verificación reproducible

```sh
npm run lint
npm run test:unit:run
npm run build
npm run db:check
```

En PostgreSQL efímero de CI, con `TEST_DATABASE_URL` apuntando a `localhost`/`127.0.0.1` y base `sr_certificates_test`:

```sh
node scripts/database/test-certificates.mjs
npx vitest run --config vitest.services.config.ts
npx playwright test e2e/admin-services.spec.ts --project=chromium --retries=0
```

La suite SQL verifica creación, precio histórico, idempotencia concurrente, rollback conjunto, cruces, cancelación, pago, preagenda, roles RLS, fallos externos, revisión superada y entregas simultáneas. Playwright cubre flujos administrativos, borradores, errores, claro/oscuro y móvil; no valida la integración real de Google. El workflow solo verifica y adjunta evidencias: no corrige archivos ni escribe commits.
