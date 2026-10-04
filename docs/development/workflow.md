# Flujo de desarrollo

## Inicio de una tarea

1. Confirmar la issue y su alcance real.
2. Leer `AGENTS.md` y la documentación aplicable.
3. Verificar dependencias y decisiones pendientes.
4. Revisar el código y el flujo actual antes de diseñar una solución.
5. Buscar piezas reutilizables existentes.
6. Definir pruebas y evidencia necesaria antes de editar.

Si la issue y la descripción se contradicen, no elegir una interpretación silenciosamente.

## Secuencia de implementación frontend

Para una funcionalidad nueva:

1. definir o reutilizar tipos de dominio;
2. definir o reutilizar el service remoto;
3. ubicar el estado local, composable o store;
4. crear o ampliar primitivas compartidas necesarias;
5. crear componentes de dominio cuando exista reutilización real;
6. componer la vista y ruta;
7. agregar pruebas por capa;
8. validar el flujo completo en navegador.

No comenzar copiando una pantalla existente para luego corregir duplicación. Compartir primero el comportamiento común y mantener las diferencias como props, slots o composición.

## Cambios de base de datos

1. Crear una migración nueva; no modificar una migración ya aplicada.
2. Revisar restricciones, índices, RLS, grants y funciones afectadas.
3. Ejecutar `npm run db:lint`.
4. Revisar el SQL y confirmar el proyecto remoto enlazado.
5. Ejecutar `npm run db:push` solo sobre el entorno autorizado.
6. Verificar el comportamiento con los roles relevantes.
7. Limpiar los datos temporales usados en la prueba.

No se usa Docker. No se ejecutan `supabase start`, `supabase status` ni flujos que dependan del stack local.

## Seeds y bootstrap

- Bootstrap contiene únicamente datos estructurales necesarios en producción.
- Seeds contienen datos ficticios o provenientes de los Spreadsheets de prueba.
- Un seed debe ser repetible y no depender de IDs generados en una ejecución previa.
- Nunca ejecutar seeds demostrativos sobre producción.
- No incluir archivos reales de clientes, tokens ni direcciones sensibles.

## Validación local

Ejecutar como mínimo:

```bash
npm run lint
npm run test:unit:run
npm run build
```

Cuando cambie SQL:

```bash
npm run db:lint
```

Cuando cambie un flujo navegable, ejecutar las pruebas E2E afectadas y revisar visualmente desktop y mobile.

## Validación visual

Comprobar:

- carga inicial;
- contenido con datos;
- estado vacío;
- error y reintento;
- guardado exitoso;
- fallo conservando la entrada;
- prevención de doble acción;
- navegación y retorno;
- teclado y foco;
- viewport móvil sin overflow horizontal;
- ausencia de errores en consola.

No reutilizar selectores o referencias DOM obtenidos antes de una navegación o recarga.

## Validación remota

Distinguir siempre:

- pruebas unitarias locales;
- build local;
- base remota de desarrollo;
- preview de Cloudflare;
- producción.

Una validación en una capa no demuestra las demás. En autenticación o Google APIs se debe completar el flujo real antes de declararlo funcional.

## Datos temporales

- Usar identificadores reconocibles y únicos.
- Crear los datos mínimos.
- Limpiarlos incluso si la prueba falla.
- Verificar que no queden filas, archivos, jobs o usuarios temporales.
- No modificar registros reales para facilitar una prueba.

## Mejoras fuera de alcance

Si durante una tarea aparece una mejora:

- corregirla directamente solo si es local, segura, no cambia reglas y evita deuda inmediata;
- solicitar decisión cuando cambie comportamiento o arquitectura;
- si se aprueba para después, registrarla en `tasks.md` y continuar la tarea actual.

## Pull requests

- Una issue por PR salvo decisión explícita.
- El PR incluye código, pruebas y documentación correspondiente.
- No incluir refactors generales no necesarios.
- No hacer merge sin autorización.
- No modificar producción como parte de una validación de desarrollo.

## Entrega

Informar únicamente:

1. rama o URL del PR;
2. commit final;
3. pruebas ejecutadas y resultado;
4. validación remota o visual realizada;
5. estado de producción y merge;
6. bloqueos o decisiones pendientes.
