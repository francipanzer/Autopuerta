# Instrucciones para activar albaranes y la aprobación online de presupuestos

Guía paso a paso. Sigue los pasos **en orden** y marca cada uno cuando lo termines.
Tiempo estimado: 20-30 minutos la primera vez.

> Lo que ya tienes funcionando (albaranes básicos) no se rompe. Todo lo nuevo
> (aprobación online) viene **apagado** y solo se enciende cuando tú lo decides.

---

## Resumen de lo que hay que hacer

| Parte | Qué es | ¿Obligatoria? |
|---|---|---|
| A | Publicar los archivos del programa | Sí |
| B | Ejecutar los SQL en Supabase | Sí |
| C | Subir las funciones de Supabase | Sí (para avisos push y recordatorios) |
| D | Activar `pg_cron` (recordatorios) | Solo si quieres recordatorios |
| E | Configurar el email (Resend) | Solo si quieres recordatorios por email |
| F | Encender la función dentro del programa | Sí |
| G | Probarlo todo | Muy recomendable |

---

## PARTE A · Publicar los archivos del programa

Sube (publica) estos archivos como siempre haces con tu programa, **sobrescribiendo** los antiguos.
Están todos en la carpeta `autopuerta-pro`.

**Archivos nuevos:**
- [ ] `aprobar.html`
- [ ] `js/aprobar.js`
- [ ] `js/public-config.js`
- [ ] `js/aprobacion-online.js`
- [ ] `js/albaranes.js`

**Archivos modificados (súbelos también):**
- [ ] `index.html`
- [ ] `sw.js`
- [ ] `js/pages.js`
- [ ] `js/db.js`
- [ ] `js/auth.js`
- [ ] `js/app.js`
- [ ] `js/pdf-generator.js`

Después de publicar, abre el programa y pulsa **Ctrl + F5** (en el móvil, cierra la app y vuelve a abrirla)
para que cargue la versión nueva.

---

## PARTE B · Ejecutar los SQL en Supabase

Aquí se crean las tablas y reglas en la base de datos.

### Cómo se abre el editor SQL (se hace igual todas las veces)
1. Entra en <https://supabase.com/dashboard> e inicia sesión.
2. Pulsa en tu proyecto.
3. En el menú de la izquierda pulsa **SQL Editor** (icono `>_`).
4. Pulsa **New query** (nueva consulta).
5. Abre el archivo SQL en tu ordenador (con el Bloc de notas o con VS Code), **selecciona todo el texto** (Ctrl + A), cópialo (Ctrl + C).
6. Pégalo en el editor de Supabase (Ctrl + V).
7. Pulsa el botón verde **Run** (o Ctrl + Intro).
8. Debe aparecer abajo **"Success. No rows returned"**. Si sale un error en rojo, copia el mensaje y pásamelo.

### Qué archivos ejecutar y en qué orden

Ejecuta **uno por uno**, cada uno en una consulta nueva. Si ya ejecutaste alguno antes, no pasa nada: se pueden repetir sin problema.

1. [ ] `SUPABASE_DATOS_EMPRESA.sql` (solo si aún no lo habías ejecutado; guarda los datos de tu empresa)
2. [ ] `SUPABASE_ALBARANES.sql` (**vuelve a ejecutarlo aunque ya lo hicieras**: tiene mejoras nuevas)
3. [ ] `SUPABASE_APROBACION_ONLINE.sql` (la aprobación online; **vuelve a ejecutarlo si ya lo hiciste antes**, está actualizado)

> Si al ejecutar el tercero sale un aviso (WARNING) sobre `pg_cron`, no es un error:
> significa que aún no has activado `pg_cron`. Se arregla en la Parte D y luego vuelves a ejecutar este mismo SQL.

---

## PARTE C · Subir las funciones de Supabase

Las funciones son pequeños programas que viven en Supabase y se encargan de los avisos
(notificaciones al móvil) y de los recordatorios.

### C.1 Instalar la herramienta (solo la primera vez)
1. Abre **PowerShell** (tecla Windows, escribe `powershell`, Intro).
2. Escribe esto y pulsa Intro para ver si ya la tienes:
   ```
   supabase --version
   ```
   - Si sale un número de versión, ya la tienes: pasa a C.2.
   - Si sale un error, instálala con:
     ```
     npm install -g supabase
     ```
     (necesitas tener Node.js instalado; si no, descárgalo de <https://nodejs.org>).

### C.2 Entrar en tu cuenta y en tu proyecto
En PowerShell, una línea cada vez:
```
cd C:\Users\Portatil\Desktop\autopuerta-pro
supabase login
```
Se abrirá el navegador: acepta. Después:
```
supabase link --project-ref ziimllianelsocrdeeut
```
Si te pide la contraseña de la base de datos, es la que pusiste al crear el proyecto en Supabase.

### C.3 Subir las dos funciones
```
supabase functions deploy send-push
supabase functions deploy recordatorios-presupuestos
```
Debe terminar con un mensaje de "Deployed". Hazlo **siempre que yo te diga que se ha modificado una función**.

### C.4 Comprobar que existen los secretos de los avisos (normalmente ya los tienes)
1. En Supabase: menú izquierdo → **Edge Functions** → **Secrets** (o *Project Settings → Edge Functions → Secrets*).
2. Deben existir estos nombres: `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
3. Si ya te funcionaban los avisos de partes e incidencias, **ya están**. No los toques.

---

## PARTE D · Activar `pg_cron` (solo para los recordatorios automáticos)

Es lo que hace que cada día a las 8:00 (hora UTC) Supabase revise qué presupuestos siguen sin respuesta.

1. En Supabase: menú izquierdo → **Database**.
2. Pulsa **Extensions**.
3. En el buscador escribe `pg_cron`.
4. Activa el interruptor de **pg_cron** (se pone verde).
5. Vuelve al **SQL Editor** y ejecuta de nuevo `SUPABASE_APROBACION_ONLINE.sql` (como en la Parte B).
   Así queda programada la tarea diaria.

Para comprobarlo, en el SQL Editor ejecuta:
```sql
select jobname, schedule from cron.job;
```
Debe aparecer una fila `recordatorios-aprobacion`.

---

## PARTE E · Configurar el email (Resend) — opcional

Solo hace falta para que **los recordatorios lleguen por email al cliente**.
Sin esto todo funciona igual, pero los recordatorios se convierten en un aviso para ti
(para que reenvíes el enlace tú mismo).

1. Crea una cuenta gratuita en <https://resend.com>.
2. En Resend: **Domains** → **Add Domain** → escribe tu dominio y sigue sus instrucciones (añadir unos registros DNS donde tengas el dominio). Espera a que ponga **Verified**.
3. En Resend: **API Keys** → **Create API Key** → copia la clave (empieza por `re_`).
4. En Supabase: **Edge Functions → Secrets → Add new secret**:
   - Nombre: `RESEND_API_KEY` · Valor: la clave que copiaste.
   - Nombre: `RESEND_FROM_EMAIL` · Valor: por ejemplo `Valgom <avisos@tudominio.es>` (debe ser de tu dominio verificado).
5. Pulsa **Save**.

---

## PARTE F · Encender la función dentro del programa

1. Abre el programa e inicia sesión **como administrador**.
2. Menú → **Configuración**.
3. Pulsa **Aprobación online de presupuestos**.
4. Marca **Activar aprobación online**.
5. Ajusta lo que quieras:
   - **El enlace caduca a los (días):** por defecto 30.
   - **Firma obligatoria para aceptar:** marcada por defecto (recomendado).
   - **Recordatorios automáticos:** márcalo si los quieres; elige **cada cuántos días** y el **máximo de recordatorios**. Si no lo marcas, no se envía ninguno.
6. Pulsa **Guardar**. Verás el mensaje "Configuración guardada".

**Para apagarlo del todo:** repite los pasos y desmarca "Activar aprobación online". Los enlaces ya enviados dejan de funcionar y el programa vuelve a ser como antes.

---

## PARTE G · Cómo se usa (y cómo probarlo)

### G.1 Probar el envío de un presupuesto
1. Menú → **Presupuestos** → pulsa un presupuesto que esté en **borrador** o **enviado**.
2. Pulsa el botón verde **Aprobación online**.
3. Elige cómo mandarlo:
   - **WhatsApp:** comprueba el teléfono (sale el de la ficha del cliente; si no tiene o es otro, escríbelo).
   - **Email:** comprueba el correo.
   - Puedes marcar **los dos**.
   - Marca **Recordatorios automáticos** si quieres para este envío.
4. Pulsa **Generar enlace**.
5. Aparece una ventana con el mensaje. Pulsa **Enviar por WhatsApp** y/o **Enviar por email**; se abre la aplicación correspondiente con el mensaje ya escrito: solo falta que pulses enviar.

> Prueba la primera vez con **tu propio teléfono**, no con un cliente real.

### G.2 Lo que ve y hace el cliente
1. Abre el enlace en su móvil u ordenador (no necesita usuario ni contraseña).
2. Ve el presupuesto con los precios.
3. Escribe su nombre y **firma** en el recuadro (con el dedo en el móvil, con el ratón en el ordenador).
4. Pulsa **Aceptar presupuesto** (o **Rechazar**).

### G.3 Lo que pasa después (automático)
- El presupuesto pasa a **Aprobado**.
- Se crea solo el **albarán** (sin técnico asignado todavía).
- A los administradores les llega un **aviso** en el móvil.
- Si lo rechaza, también te llega un aviso.

### G.4 Qué haces tú después
1. Menú → **Albaranes**. Arriba verás los presupuestos aprobados que aún no tengan albarán (si hubiera alguno) y, en la lista, el albarán nuevo.
2. Pulsa el albarán. Se abre con la vista del documento y una fila de iconos:
   - **Ver grande**: ver el documento a pantalla completa.
   - **Compartir**: mandar el PDF.
   - **Material**: ver qué material hace falta, qué hay en el almacén y qué falta. Desde ahí, **Pedir material** prepara un pedido por proveedor para copiar o compartir.
   - **Editar**: aquí **asignas el técnico** (marca su nombre y pulsa *Guardar y asignar*). Le llegará un aviso.
   - **Eliminar** (rojo).
3. El técnico, al terminar la obra, abre el albarán desde su móvil, se lo enseña al cliente y pulsa **Firmar** para recoger su firma.

---

## Si algo no funciona

| Síntoma | Qué mirar |
|---|---|
| No aparece el menú "Aprobación online" en Configuración | No has publicado `js/pages.js` o falta Ctrl + F5. |
| Al guardar la configuración sale un error | No has ejecutado `SUPABASE_APROBACION_ONLINE.sql` (Parte B). |
| No aparece el botón "Aprobación online" en el presupuesto | Está apagado en Configuración, o el presupuesto ya está aprobado/rechazado. |
| "Enlace no válido" en la página del cliente | El enlace se sustituyó por otro más nuevo, caducó, o la función está apagada. Genera uno nuevo. |
| No llegan avisos al móvil | Parte C: función `send-push` sin subir, o falta `push_config.webhook_secret` (ver `SUPABASE_PUSH.sql`). |
| No llegan recordatorios | Revisa que estén activados en Configuración (Parte F), que `pg_cron` esté activo (Parte D) y, para email, la Parte E. |
| La vista previa del albarán no sale | Necesita internet la primera vez (se descarga una librería). Si sigue, usa **Compartir** para abrir el PDF. |
| Un técnico no ve un albarán | Está asignado a otro técnico, o no se asignó. Edita el albarán y marca al técnico correcto. |

Si te atascas en cualquier paso, copia el mensaje de error exacto (o haz una captura) y pásamelo.
