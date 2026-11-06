# Despliegue de acceso y roles

La aplicación de navegador no contiene la clave `service_role`. Las operaciones administrativas se realizan exclusivamente mediante la Edge Function `team-admin`.

## Antes de desplegar

1. Haz una copia de seguridad de las tablas de Supabase.
2. Comprueba que `partes_trabajo` es la tabla de partes que usa la aplicación. El formulario espera sus columnas de empleado, ubicación, DNI, fotos y firmas; `partesTrabajo` es una tabla distinta y no contiene esos campos.
3. Ejecuta `SUPABASE_AUTH_ROLES.sql` en el SQL Editor.
4. Confirma que la migración termina sin errores antes de desplegar el cliente nuevo. La migración activa RLS y revoca el acceso anónimo a los datos.

La migración elimina las políticas abiertas actuales de las tablas de la aplicación. Desde ese momento, la versión anterior dejará de acceder a esos datos; despliega `team-admin` y la interfaz actualizada inmediatamente después. No ejecutes el SQL sin una copia de seguridad y tiempo para completar estos pasos.

La tabla `partes_trabajo` usa un ID `bigint` generado por la secuencia de PostgreSQL. La aplicación omite el ID al crear un parte y utiliza el ID devuelto por Supabase; por ello, crear un parte requiere conexión.

## Desplegar la función

Desde la raíz del proyecto, con Supabase CLI autenticado y el proyecto enlazado:

```powershell
npx.cmd supabase@latest functions deploy team-admin --project-ref ziimllianelsocrdeeut --no-verify-jwt
```

Supabase proporciona `SUPABASE_URL` y las claves del proyecto al entorno de Edge Functions. El único secreto adicional necesario para el primer administrador es `ADMIN_BOOTSTRAP_CODE`, que se configura en Dashboard → Edge Functions → Secrets. Nunca pongas la clave `service_role` ni el código de activación en `index.html`, JavaScript del cliente, Git o una captura pública.

La función comprueba el token de sesión en cada operación administrativa y el SQL permite consumir el bootstrap una sola vez. Tras crear la primera cuenta administradora, elimina el secreto `ADMIN_BOOTSTRAP_CODE`:

```powershell
npx.cmd supabase@latest secrets unset ADMIN_BOOTSTRAP_CODE --project-ref ziimllianelsocrdeeut
```

El primer administrador podrá invitar a los otros administradores y técnicos desde Configuración. Supabase Auth debe tener configurado el envío de invitaciones y recuperación de contraseña para el equipo.

## Activación

Después de migrar SQL y desplegar la función, publica/recarga la aplicación. La pantalla inicial ofrecerá la creación del administrador mientras no exista ninguno; después solo mostrará el inicio de sesión.

## Funciones incluidas

- Inicio de sesión por cuenta, restablecimiento de contraseña e invitaciones gestionadas por administración.
- Panel de usuarios en Configuración para asignar rol, ficha de empleado y activar/desactivar cuentas.
- Cada usuario activo puede corregir su correo de acceso desde el pie de la barra lateral; el cambio se sincroniza entre Supabase Auth y su perfil.
- Perfiles técnicos con acceso a partes, solicitudes de material, informes de kilómetros, revisiones, consulta segura de almacén y Ayuda.
- La solicitud de material no incluye precios; al convertirla se crea un presupuesto en borrador para que oficina complete la valoración.
- Los cambios de permisos de pantalla son solo una capa de UX: RLS y las funciones SQL son los controles efectivos de datos.

## Albaranes de obra

1. Si aún no están configurados los datos de empresa, ejecuta `SUPABASE_DATOS_EMPRESA.sql` después de `SUPABASE_AUTH_ROLES.sql`.
2. Ejecuta (o vuelve a ejecutar; es idempotente) `SUPABASE_ALBARANES.sql` después de `SUPABASE_AUTH_ROLES.sql` y `SUPABASE_PUSH.sql`. La versión actual añade también el vínculo único entre presupuesto y albarán. Comprueba que `push_config.webhook_secret` coincide con el secreto `PUSH_WEBHOOK_SECRET` de la función.
3. Despliega la versión actualizada de `send-push` para que los técnicos reciban un aviso al ser asignados:

```powershell
npx.cmd supabase@latest functions deploy send-push --project-ref ziimllianelsocrdeeut --no-verify-jwt
```

4. En **Configuración → Datos de empresa**, comprueba que estén completos los datos que deben aparecer en el PDF.

Desde un presupuesto aprobado, administración puede crear un albarán que copia cliente y conceptos sin precios, asociándolo al presupuesto para impedir duplicados. Después asigna el documento a uno o varios técnicos. RLS permite a cada técnico consultar únicamente los albaranes asignados a su ficha; desde ahí puede firmar con el cliente y compartir/descargar el PDF. La firma se guarda mediante una función SQL que comprueba la asignación.

## Aprobación online de presupuestos (opcional)

1. Ejecuta `SUPABASE_APROBACION_ONLINE.sql` en el SQL Editor (después de los scripts de roles, push y albaranes; es idempotente, puedes volver a ejecutarlo) y despliega `send-push` y `recordatorios-presupuestos`. Para los recordatorios, activa la extensión `pg_cron` en Database → Extensions (el script programa una ejecución diaria a las 8:00 UTC).
2. Publica `aprobar.html`, `js/aprobar.js` y `js/public-config.js` junto al resto de archivos.
3. En **Configuración → Aprobación online de presupuestos** activa el interruptor y ajusta: caducidad del enlace, firma obligatoria y recordatorios (cada cuántos días y máximo, o desactivados).
4. En un presupuesto borrador o enviado aparece el botón **Aprobación online**: eliges WhatsApp, email o ambos (con teléfono y email editables) y si quieres recordatorios para ese envío. El cliente firma con el dedo (móvil) o el ratón (PC). Los recordatorios salen por email si hay Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`); si no hay email o Resend, se avisa a administración para reenviar el enlace. Al aceptar el cliente, el presupuesto pasa a aprobado, se crea el albarán sin asignar y administración recibe un aviso. En el albarán, el icono **Material** compara las líneas con el almacén y permite pedir lo que falta.

## Compartir PDFs de revisiones

1. Ejecuta `SUPABASE_REVISIONES_STORAGE.sql` en el SQL Editor después de `SUPABASE_AUTH_ROLES.sql`. El bucket `revision-pdfs` queda privado y solo admite PDFs de hasta 20 MB.
2. Configura una cuenta en Resend y verifica un dominio remitente. Añade `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (por ejemplo, `AutoPuerta Pro <avisos@tu-dominio.es>`) y, opcionalmente, `REVISION_NOTIFICATION_EMAIL` como secretos de Edge Functions. Si no se indica destinatario, se usa `franmerino78@gmail.com`.
3. Despliega la función:

```powershell
npx.cmd supabase@latest functions deploy share-revision --project-ref ziimllianelsocrdeeut --no-verify-jwt
```

Al guardar una revisión, la aplicación descarga el PDF como hasta ahora, lo sube al bucket privado y solicita un enlace firmado válido durante 7 días. Con Resend configurado, el enlace se envía automáticamente a administración. Sin Resend, el PDF se guarda y la aplicación ofrece copiar el enlace. Un fallo al compartir no revierte la revisión guardada.

## Datos de empresa en presupuestos

1. Ejecuta `SUPABASE_DATOS_EMPRESA.sql` en el SQL Editor después de `SUPABASE_AUTH_ROLES.sql`.
2. En la aplicación, abre **Configuración → Datos de empresa** y guarda nombre comercial, razón social, CIF/NIF, dirección y datos de contacto.
3. Los datos se guardan en Supabase para que el presupuesto muestre la misma ficha aunque se genere desde otro dispositivo. Solo un administrador puede modificarlos; los usuarios activos pueden consultarlos para generar PDF.

La app requiere conexión para crear, modificar o eliminar datos autenticados. Las cachés locales y la cola pendiente anterior se limpian al cambiar o cerrar la sesión para impedir que otra cuenta del mismo dispositivo herede datos locales. La consulta offline solo puede usar la caché del usuario que sigue autenticado en ese dispositivo.

Antes de publicar la nueva interfaz, valida en un proyecto de pruebas que existen las tablas referenciadas por `SUPABASE_AUTH_ROLES.sql` y que `partesTrabajo` (o `partes_trabajo`) incluye el campo de empleado esperado por la app. La migración habilita RLS únicamente en las tablas conocidas de Valgom y sustituye sus políticas anteriores; revisa cualquier política personalizada de esas tablas antes de ejecutarla.
