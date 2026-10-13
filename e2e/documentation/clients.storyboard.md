# Storyboard · Gestión de clientes V1

**Módulo:** Clientes
**Salida:** `clientes-gestion-clientes-v1.mp4`

## Objetivo

Explicar la diferencia funcional entre **Negocio** y **Casa** y mostrar la creación de ambos tipos sin mezclar todavía la configuración de Sedes.

## Reglas funcionales

- Hay dos tipos de cliente: **Negocio** y **Casa**.
- El tipo no se cambia después de crear el cliente.
- Negocio usa:
  - nombre / razón social;
  - NIT;
  - correos generales;
  - vigencia del certificado de establecimiento.
- Casa usa un formulario simplificado:
  - nombre;
  - celular;
  - dirección.
- Casa no maneja certificado de establecimiento.
- Casa no se utiliza para el envío de informes.
- Solo Negocio administra Sedes.
- El celular de Casa se presenta con acceso rápido a WhatsApp.
- La eliminación solo corresponde a registros sin dependencias; en caso contrario se desactiva.

## Datos sintéticos

- Negocio: **Alimentos Demo SAS**
- NIT: **901234567**
- Correo: **calidad@alimentos-demo.test**
- Vigencia certificado: **12 meses**
- Casa: **Laura Demostración**
- Celular: **300 555 0198**
- Dirección: **Calle 25 # 10-20**

## Escenas

1. Portada.
2. Clientes y estados.
3. Búsqueda y filtro por tipo.
4. Nuevo cliente.
5. Explicar Negocio vs Casa.
6. Datos de Negocio.
7. Correos generales.
8. Certificado de establecimiento.
9. Crear Negocio.
10. Mostrar Negocio activo.
11. Abrir detalle y señalar NIT, Sedes y vigencia.
12. Volver a Clientes.
13. Nuevo cliente → Casa.
14. Mostrar formulario simplificado.
15. Explicar que Casa no tiene certificado ni informes.
16. Crear Casa.
17. Mostrar Casa en listado.
18. Señalar acceso a WhatsApp.
19. Abrir detalle de Casa y mostrar que no hay Sedes.
20. Señalar acciones de gestión.
21. Pestaña Inactivos.
22. Cierre.

## Aprobación

- [ ] Voz y subtítulos coinciden.
- [ ] Se muestra claramente el cambio de formulario Negocio → Casa.
- [ ] Se explica certificado solo para Negocio.
- [ ] Se explica que Casa no recibe informes.
- [ ] Se muestra acceso rápido a WhatsApp en Casa.
- [ ] No se adelanta la configuración de Sedes.
- [ ] Solo se usan datos sintéticos.
