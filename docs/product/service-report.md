# Informe técnico MIP — datos históricos y futura página pública

## Decisión aprobada · 9 de octubre de 2026

No generar, subir, conservar ni enviar un **PDF de informe** desde Neon o Google Drive. El informe será una página HTML con una vista pública para el cliente y una versión imprimible. Al futuro botón «Guardar como PDF» le corresponderá abrir la impresión del navegador; no se almacenará una copia de PDF en R2.

Esta entrega retira el motor automático anterior. **La página pública y la impresión se implementarán después de comprobar el despliegue limpio de Neon.**

## Funcionalidad conservada

- Un Servicio Principal finalizado conserva sus snapshots, fechas reales, criterios MIP, hallazgos, productos, revisiones de puestos, capturas, fotografías y ambas firmas.
- El administrador consulta resultados desde Servicios → Historial → Ver resultados. El backend ofrece `GET /api/admin/services/:id/results` y URL privada de lectura para las evidencias autorizadas.
- El cálculo histórico compara hasta seis Servicios Principales finalizados de la misma Sede: C=100 %, CP=50 %, NC=0 %, NA excluido. Las áreas sin acceso se excluyen del porcentaje.
- Los archivos originales permanecen en R2 `sr-service-media` bajo su política actual de retención; el historial estructurado permanece en PostgreSQL.
- Los certificados **sí** continúan utilizando Word → Google Drive → PDF y el bucket privado `sr-generated-documents`.

## Entrega posterior: informe web del cliente

Diseñar una ruta pública de solo lectura con enlace aleatorio, revocable, con expiración y autorización limitada al Servicio. Mostrar fotografías, resultados, productos, hallazgos, firmas y comparativa histórica mediante el mismo origen de datos. Agregar diseño CSS `@media print` A4, ocultar navegación y botón «Guardar como PDF» mediante `window.print()`, con instrucciones breves para guardar en móvil/escritorio.

No exponer identificadores internos ni URLs permanentes de R2. Cuando una fotografía expire, comunicar «Evidencia vencida» sin alterar los datos del Servicio. No generar un PDF automático ni otro renderizador de documentos.
