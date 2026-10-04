# Bootstrap

Contiene datos mínimos requeridos para que un entorno sea funcional: configuración global, catálogos aprobados, formularios oficiales y el alta autorizada inicial cuando corresponda.

Los scripts deben ser idempotentes y no contener secretos.

No colocar aquí datos demostrativos.

`20261004_001_initial_admin.sql` autoriza la cuenta empresarial como Administrador inicial. Es idempotente y no crea la identidad de Neon Auth; la vinculación ocurre en el primer inicio de sesión Google válido.
