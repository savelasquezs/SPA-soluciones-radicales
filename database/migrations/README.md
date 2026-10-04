# Migraciones

Solo archivos SQL ejecutables con formato:

```text
YYYYMMDD_NNN_descripcion.sql
```

Reglas:

1. no editar una migración aplicada;
2. no incluir `BEGIN`, `COMMIT` ni `ROLLBACK`: el runner envuelve cada archivo en una transacción;
3. no incluir SQL específico de Supabase;
4. separar cambios independientes cuando simplifique rollback y revisión;
5. incluir RLS/grants en la misma migración que expone una tabla a Data API o inmediatamente después dentro del mismo cambio;
6. validar con `npm run db:check`.

El baseline Neon se generó después de configurar Auth/Data API y comprobar en `desarrollo` el payload real de sesión.
