# Páginas públicas para publicación OAuth de Google

Estas páginas HTML son archivos estáticos de `public/` servidos directamente por Cloudflare Workers Static Assets; **no dependen de Vue Router, Neon Auth ni JavaScript**. No exponen API privadas y deben abrirse en modo incógnito y con recarga directa.

| Campo de Google Auth Platform → Branding | Ruta pública |
| --- | --- |
| Página principal | `/informacion.html` |
| Política de privacidad | `/privacidad.html` |
| Condiciones del servicio | `/terminos.html` |

## Publicación

1. Fusionar esta rama en `develop` tras revisión y pruebas. Verificar públicamente las tres rutas en el entorno `develop` configurado en Cloudflare.
2. Promover las páginas al **dominio final y estable** que corresponda al proyecto OAuth. La URL de ejemplo del Worker productivo debe obtenerse del panel de Cloudflare, no suponerse.
3. Revisar el texto legal con el responsable de Soluciones Radicales, comprobando identificación del responsable, prácticas reales de tratamiento, plazos de retención y obligaciones en Colombia. Actualizar los HTML según corresponda antes de la publicación oficial.
4. Completar en Google Auth Platform → Branding los campos con URLs HTTPS **absolutas**, del mismo dominio accesible sin login; Guardar.
5. Si Google exige **verificación de la propiedad del dominio**, no basta con el subdominio compartido `workers.dev` ni con tenerlo en «Dominios autorizados». Puede requerirse un dominio propio verificable mediante Google Search Console.
6. Ir a Google Auth Platform → Audience y comprobar si se habilita **Publicar app**. La publicación podría requerir revisión adicional para los scopes sensibles (Gmail, Calendar, Drive).
7. Tras publicar, **volver a autorizar** la cuenta empresarial en SPA → Integraciones. Cambiar a Production no recupera un refresh token ya revocado.

**Nota:** las páginas de términos son adicionales y no sustituyen la revisión legal ni las exigencias específicas de verificación de Google. La página privada `/acceso` nunca debe usarse como sustituto de la página principal pública.
