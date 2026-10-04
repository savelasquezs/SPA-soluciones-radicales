# AGENTS.md

## Propósito

Este repositorio reconstruye Soluciones Radicales MIP como una SPA rápida, mantenible y orientada al trabajo de campo.

La arquitectura aprobada es:

- Cloudflare Pages para el frontend.
- Supabase Auth, PostgreSQL y Storage para identidad, datos y archivos.
- RPC y Edge Functions para operaciones privilegiadas e integraciones.
- Google APIs para Gmail y Calendar mediante la cuenta empresarial.

La aplicación anterior es referencia funcional, no referencia técnica. No se deben trasladar patrones de Apps Script o Google Sheets a la nueva implementación.

## Fuentes de verdad

Consultar en este orden:

1. `docs/product/` para comportamiento funcional y reglas de negocio.
2. `docs/ux-guidelines.md` para interacción y arquitectura de información.
3. `docs/design-system.md` para componentes, tokens, responsive y accesibilidad visual.
4. `docs/frontend/reuse.md` para reutilización, componentes, composables y stores.
5. `docs/architecture/` para decisiones técnicas vigentes.
6. Linear para alcance, prioridad, dependencias y estado de la tarea.
7. Código y pruebas como evidencia de lo implementado.

No inventar requisitos para completar vacíos. Si existe una contradicción, informar y detener únicamente la parte afectada.

## Antes de implementar

- Partir de `main` actualizado salvo instrucción contraria.
- Leer la issue completa y comprobar que su identificador coincide con el comportamiento solicitado.
- Revisar reglas, entidades y criterios de aceptación afectados.
- Inspeccionar el flujo existente en el navegador cuando ya sea ejecutable.
- Buscar componentes, composables, stores, helpers, servicios y tipos reutilizables antes de crear otros.
- Identificar qué estado es local, compartido, remoto o persistido antes de escribir código.
- No adelantar issues ni funcionalidades futuras.
- Registrar en `tasks.md` una mejora aprobada que quede fuera del alcance, sin abandonar el trabajo actual.

## Reutilización obligatoria en frontend

La reutilización se diseña desde el inicio. Las vistas ensamblan comportamiento; no concentran acceso a datos, reglas repetidas ni componentes completos.

- Crear primitivas visuales compartidas para botones, campos, selectores, diálogos, estados de carga, estados vacíos, errores, toasts y confirmaciones.
- Extraer a `composables` el comportamiento Vue reutilizable: estado asíncrono, formularios modificados, filtros, paginación, conectividad, autosave, carga de archivos y sincronización.
- Usar stores Pinia para estado compartido entre rutas o módulos: sesión, rol activo, notificaciones, conectividad, sincronización y catálogos reutilizados.
- Mantener en el componente el estado efímero que no necesite sobrevivir ni compartirse.
- Mantener helpers como funciones puras y sin dependencias de Vue.
- Centralizar acceso a Supabase y servicios externos en la capa `services`; componentes y vistas no ejecutan consultas directas.
- Centralizar tipos de dominio y contratos de entrada/salida.
- Extraer una segunda implementación equivalente antes de aceptar duplicación.
- No crear abstracciones genéricas sin un contrato real ni stores para estado exclusivamente local.

Las responsabilidades y dependencias permitidas están definidas en `docs/frontend/reuse.md`.

## Autoridad y seguridad

- La interfaz nunca es autoridad para roles, permisos, precios, consecutivos, estados o relaciones.
- Toda tabla expuesta debe tener RLS y permisos mínimos.
- Las operaciones sensibles se ejecutan mediante RPC o Edge Functions.
- La SPA nunca contiene `service_role`, refresh tokens de Google ni secretos.
- El acceso público usa únicamente RPC limitada y token aleatorio, hasheado, revocable y con vencimiento.
- Los archivos permanecen privados; se entregan mediante autorización o URL firmada de corta duración.
- No confiar en IDs, roles, correos o relaciones enviados por el navegador cuando puedan derivarse de la sesión o de datos persistidos.
- Mantener auditoría append-only para eventos sensibles.

## Supabase y datos

- No usar Docker ni depender de Supabase local.
- Trabajar con migraciones versionadas contra el proyecto remoto de desarrollo enlazado.
- No realizar cambios permanentes manuales desde el dashboard si pueden expresarse como migración.
- Ejecutar `npm run db:lint` después de modificar SQL.
- Aplicar migraciones con `npm run db:push` únicamente al entorno autorizado.
- Separar bootstrap productivo y seeds de prueba.
- Los Spreadsheets anteriores son datos de prueba; no se migran automáticamente a producción.
- Usar UUID estables, idempotencia y control de versión en operaciones sincronizables.
- Conservar los montos en COP como enteros.
- No agregar multitenancy: Soluciones Radicales es la única empresa operadora y los Negocios son clientes.

## Google APIs

- Gmail y Calendar operan exclusivamente desde backend con `solucionesradicales1@gmail.com`.
- Los usuarios no autorizan sus buzones o calendarios personales.
- Los efectos externos deben ser asíncronos, idempotentes y reintentables.
- Un fallo de Gmail o Calendar no debe impedir guardar la operación interna.
- No registrar tokens, destinatarios sensibles, contenido de correos ni secretos en logs.

## UX obligatoria

- Diseñar mobile-first para el trabajo del Técnico.
- No crear una página, ruta o entrada de navegación únicamente porque exista una tabla.
- Mantener el contexto Negocio → Sede → Área → Servicio.
- Usar el sistema global de loading, toast, confirmación y errores.
- Prevenir doble envío y mostrar progreso donde ocurre la acción.
- Preservar datos capturados cuando falle una operación.
- Toda pantalla de datos contempla carga, contenido, vacío, error y reintento.
- Los formularios largos no se implementan en modales.
- Validar teclado, foco, Escape, lector de pantalla y ausencia de overflow horizontal.
- Los controles táctiles deben medir al menos 44 px.

## Código

- Usar Vue 3, TypeScript, Composition API, Pinia y Vue Router.
- Preferir `<script setup lang="ts">`.
- Mantener componentes pequeños, con props y emits tipados.
- Evitar `any`, estado global mutable fuera de Pinia y efectos secundarios ocultos.
- No duplicar validaciones, formatos, mapeos de errores ni consultas.
- No introducir dependencias cuando la plataforma o una utilidad pequeña resuelvan el caso con claridad.
- No dejar código muerto, compatibilidad temporal, mocks o archivos de prueba sin uso.
- No hacer refactors generales fuera del alcance.

## Pruebas y validación

Antes de terminar una tarea:

- ejecutar `npm run lint`;
- ejecutar `npm run test:unit:run`;
- ejecutar `npm run build`;
- ejecutar `npm run db:lint` si cambió la base de datos;
- ejecutar las pruebas E2E afectadas cuando exista un flujo navegable;
- revisar visualmente las interfaces modificadas en desktop y mobile;
- comprobar loading, vacío, error, éxito, doble acción, navegación y consola;
- verificar autorización y RLS con el rol aplicable;
- eliminar datos y archivos temporales de validación.

No presentar un build, una respuesta HTTP o una pantalla de login como evidencia de que autenticación, autorización o integración funcionan de punta a punta.

## Git y entrega

- Mantener cambios pequeños, trazables y limitados a la tarea.
- No hacer merge ni desplegar a producción sin autorización explícita.
- No mezclar dos issues independientes en un mismo PR.
- Actualizar documentación y pruebas en el mismo cambio que modifica comportamiento.
- Informar al terminar: rama o PR, commit, pruebas ejecutadas, validación real, producción/merge y bloqueos.

## Definición de terminado

Una tarea termina cuando cumple sus criterios, reutiliza correctamente la arquitectura compartida, pasa las validaciones proporcionales al riesgo, no deja residuos temporales, actualiza la documentación afectada y no introduce alcance futuro.
