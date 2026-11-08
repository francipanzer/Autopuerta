## Reestructura clientes / ubicaciones / rutas / revisiones (nov 2026)

**Modelo**
- Cliente **individual**: una nave; sus puertas cuelgan de él.
- Cliente **central** (`clientes.central`): varias naves = **ubicaciones** (tabla `ubicaciones`, con todos los datos de un cliente: dirección, contacto, teléfono, email, notas, coordenadas). Cada ubicación tiene sus puertas (`puertas.ubicacionId`). Las ubicaciones solo se ven dentro de la ficha del cliente padre (no engordan la lista de clientes).
- **Ruta** (`rutas.clienteId`): pertenece a un central y agrupa ubicaciones (`ubicaciones.rutaId` + `ordenRuta`); se crea marcando casillas.
- **Mantenimiento contratado** (`clientes.mantenimiento`): solo estos clientes salen en Revisiones, en el aviso del panel y en el badge del menú.
- **Periodicidad por puerta**, sin depender de la ruta: tabla de la foto en `js/tipos-puerta.js` (`Periodicidad`). Uso (garaje/industrial/comercial) + criterio (nº vehículos, estacional, ciclos/día, rápida, enrollable). Si la puerta no tiene uso se asume el habitual de su tipo (`USO_POR_TIPO`). Resultado en `puertas.frecuenciaMeses`.
- Se eliminaron las **cadenas** (tabla `cadenas` y pantallas) y las revisiones programadas por ruta. Historial/PDF antiguos siguen leyendo las claves `cadena`/`cadenaId` de las notas.

**Código**
- `js/central.js` (carga inicial): acceso a datos, motor `getEstadoRevisiones()` (cliente → rutas → ubicaciones → puertas), avisos, `reprogramarPuerta()` (técnico por RPC, admin directo), pantallas de ubicaciones / rutas / puertas y tabla de periodicidades en Configuración.
- `js/informe-revisiones-cliente.js`: página Revisiones (Próximas / Historial). Individual → puertas; central → rutas → ubicaciones.
- `js/pages_gestion.js`: formulario de revisión (`abrirFormularioRevision({clienteId, rutaId, ubicacionIds})`), guardado y DOTICS.
- `js/pages_import.js`: importar desde foto ahora crea **ubicaciones** de un cliente central.

**Botones (nov 2026)**: todos los botones de acción son verdes (bloque «BOTONES UNIFICADOS» al final de `css/styles.css`, también cubre `.btn-outline`, pestañas, `.icon-btn` y los de medidas). Rojo solo para eliminar/quitar (`.btn-danger`). Siguen con su propio color los selectores que codifican un valor (OK/X, Bueno/Operativo/No usar, casillas y pastillas de medidas), la X de cerrar y los adornos dentro de campos (ojo de contraseña, micrófono). Para un botón nuevo: `btn btn-primary` (verde) o `btn btn-danger` (eliminar).

**DOTICS**: cliente especial, formato «Informe visita de mantenimiento» (modelo en papel: `modelodotics.jpg`, ejemplo relleno `informerevisiondotics.jpg`). La revisión de una ruta es UNA pantalla con todas las tiendas (como Hiperber): cada tienda = su informe (Cliente = la tienda, nº de intervención, equipos con tipo / denominación / nº de serie ya escritos; el técnico solo marca Bueno / Operativo / No usar y observaciones; «Todo bueno»). Casilla «Marcar finalizada» por tienda: al marcarla se GUARDA ese informe como su propio parte (una revisión + PDF por tienda; se puede reabrir y se actualiza el mismo parte). Casilla final «ruta completada» (bloqueada hasta finalizar todas) → resumen con PDF por tienda. Lo escrito sin finalizar queda como borrador en el dispositivo. Código: `abrirRevisionDotics()` y funciones `dr*` en pages_gestion.js; estilos `.dotics-*` al final de styles.css (solo variables del tema, una columna en móvil).

**Borradores**: la revisión de una ruta (varias tiendas) guarda su progreso en el dispositivo (IndexedDB, `Central.Borradores`; clave usuario|cliente|alcance, caduca a los 30 días). Se guarda al marcar cada tienda y poco después de cada cambio; al reabrir la ruta se ofrece continuar. Se borra al guardar la revisión. No se sincroniza entre dispositivos.

**Base de datos**: ejecutar `SUPABASE_REESTRUCTURA_CLIENTES.sql` (idempotente; hace copias `bk_reestructura_*`, añade columnas, migra cadenas→centrales y tiendas→ubicaciones y redirige puertas/partes/presupuestos/albaranes; define la nueva `update_door_revision_schedule` de 4 parámetros que usan los técnicos).

# NOTAS / PENDIENTES DEL PROYECTO (autopuerta-pro)

## Lectura de documentos con OCR (nov 2026) — ESTADO Y PENDIENTES

**Importar clientes desde foto de rutas (hecho).** Clientes → «Importar datos». Código: `js/folio-ocr.js` (preprocesado:
rotulador verde fuera, enderezado, OCR Tesseract en modo texto disperso, parser por columnas, recuperación de filas
perdidas) + ventana en `js/pages_import.js`. Fotos de prueba reales en `fotos/ruta*.jpg` (hiperber bien; dotics regular).
Todo editable antes de guardar; crea/reutiliza rutas ("RUTA n") y asigna cadena + `ordenRuta`.

**Entrada de material en Almacén desde albarán/factura (hecho, falta afinar con fotos reales).** Almacén (solo admin) →
«Entrada de material» y «Entradas» (historial). Código: `js/albaran-ocr.js` (parser puro + emparejado + PDF con pdf.js),
`js/almacen-entradas.js` (ventana), tests en `tests/albaran-ocr.test.mjs`. **Antes de usarlo hay que ejecutar
`SUPABASE_ENTRADAS_MATERIAL.sql`** (tablas `entradas_material`, `almacen_alias` y bucket privado `entradas_material`); sin él
funciona el stock, pero no el historial/duplicados/memoria. Qué hace: foto o PDF → cabecera (proveedor, nº, fecha, total) +
líneas (ref, descripción, cantidad, precio, importe) → revisión editable → suma stock / crea artículos (precio venta =
compra + margen %) → guarda historial y documento. Empareja cada línea con un artículo por memoria del proveedor
(`almacen_alias`), referencia o nombre parecido; avisa de duplicados (proveedor + nº) y si las líneas no suman el total.
PDF digital: texto nativo (sin errores de OCR); PDF escaneado y fotos: OCR.

**PENDIENTE al tener fotos reales de albaranes/facturas de proveedor (4-6 de proveedores distintos, en `fotos/`):**
- Afinar `parseAlbaranLines`/`parseLineItem` con los formatos reales (columnas, descuentos, unidades, IVA por línea,
  albaranes sin precios, líneas partidas); probado solo con documentos sintéticos y un PDF generado.
- Si algún proveedor falla mucho, extractor específico por proveedor.
- Medir el OCR en el móvil (rendimiento/memoria con fotos grandes; ahora se reescala a 2400 px de ancho).
- Fase 2 opcional si el OCR se resiste: Edge Function de Supabase + Gemini (capa gratuita; ojo: en la gratuita Google puede
  usar los datos para mejorar sus productos → para albaranes/facturas con datos de clientes activar facturación) o OpenAI,
  clave solo como secreto del servidor (`supabase secrets set GEMINI_API_KEY=...`). Solo cambia quién extrae los datos:
  la ventana de revisión y el guardado se reutilizan. Mismo motor válido para presupuestos (hoy `importarPresupuestoFoto`
  usa un OCR simple), proveedores, etc.
- Ideas no hechas: botón «Leer desde foto» en Presupuestos con el nuevo lector; crear proveedor desde factura; permitir
  borrar/anular una entrada del historial (hoy no revierte el stock).

**Pruebas del OCR:** en Node (`node --test tests/albaran-ocr.test.mjs`) para los parsers; para el OCR real hay que probarlo
en navegador (Tesseract de Node y de navegador dan lecturas algo distintas).

## Integración con CONTABILIDAD (Sage 50): Opción A implementada (nov 2026)

Botón **Exportar a Sage** (solo admin) en *Presupuestos* y en *Partes de Trabajo*; código en
`js/exportar-contabilidad.js`. CSV genérico: UTF-8 con BOM, separador `;`, decimales con coma, fechas
dd/mm/aaaa, IVA fijo 21 %. Respeta los filtros visibles (cliente, técnico, fechas; no el buscador).
- Presupuestos: solo estado *aprobado*, una fila por línea (código Sage y NIF del cliente, referencia de almacén).
- Partes: solo de clientes (no internos); líneas de mano de obra (horas), desplazamiento (km) y material.
  El precio solo se rellena en el material con precio de venta en almacén; horas y km salen sin precio.
- Pendiente: adaptar las columnas a la plantilla de importación real de Sage 50, marcar lo ya exportado
  (evitar duplicados al reimportar) y, si se quiere, un módulo de facturas (numeración/serie/vencimientos).

Opciones evaluadas originalmente (de menor a mayor esfuerzo):
- **Opción A — Exportación CSV/Excel manual o programada** (~1 día):
  botón "Exportar contabilidad" que genera CSV con: fecha, cliente, concepto,
  base, IVA, total, nº factura. Importable en FacturaOne/Holded/Sage/A3.
- **Opción B — Facturación electrónica Facturae/UBL** (~2-3 días):
  generar facturas en formato Facturae desde un Edge Function de Supabase,
  dejarlas en bucket o enviarlas por email.
- **Opción C — Integración por API REST directa** (~3-5 días):
  Edge Function que al cerrar un parte/factura haga POST a la API del
  programa (Holded, Anfix, Sage...) mapeando conceptos a su plan de cuentas.

Recomendación: empezar por A (CSV) y evolucionar a C si se elige Holded.
Infraestructura disponible: Supabase + Edge Functions ya configuradas en `supabase/functions/`.

## Revisión de errores y hojas de medidas (nov 2026)

**Tipos de puerta: un solo catálogo.** `js/tipos-puerta.js` es la única fuente. Todos los selects
(hojas de medidas, editor, presupuestos, revisiones, puertas de clientes, partes, almacén, manuales)
salen de ahí; los tipos que añada el admin en la tabla `tipos_puerta` se suman solos.

**Hojas de medidas: un solo módulo.** `js/medidas.js` + `js/medidas-datos.js` + `css/medidas.css`
sustituyen a `hoja-medidas.js`, `plantillas-medidas.js`, `plantillas-medidas-v2.js` y `mediciones-v3.js`
(guardados en `_obsoletos/`). Las casillas están medidas sobre cada imagen; para cambiarlas usar el
editor (admin) o regenerar `medidas-datos.js`. Las imágenes originales PNG están en
`_obsoletos/plantillas-originales/` (las de `plantillas/` ahora son WebP, 6,4 MB → 0,65 MB).

**Otros arreglos:** una sola `escapeHtml` (utils.js) · `updateSyncStatus` única · títulos
«Últimos presupuestos» / «Últimas tareas en curso» · las mediciones guardadas sin conexión ahora se
reenvían solas al volver la señal.

**Al desplegar:** subir la versión de caché del service worker ya está hecho (`autopuerta-v111`).

## Robustez (nov 2026): sincronización, concurrencia y offline

**Pruebas:** `node --test tests/*.test.mjs` (63 tests, sin dependencias; Node ≥ 20). Ejecutan el `db.js`, `sw.js`
y `outbox-mediciones.js` reales sobre un navegador/Supabase simulados. Pasarlas antes de cada despliegue.

**Mediciones sin cobertura (`js/outbox-mediciones.js` + `js/sync-utils.js`).** La bandeja ya no vive en
`medidas.js` (carga diferida) ni guarda fotos en base64 en `localStorage` (cuota ~5 MB): las fotos van a IndexedDB.
Cada medición lleva un `id` generado en el móvil y se envía con `upsert … ignoreDuplicates`, así que reintentar
nunca duplica. Estados `pendiente`/`fallida`: un rechazo permanente (RLS, datos inválidos) ya no se reintenta
eternamente ni bloquea a las demás; queda visible en *Mediciones* con «Reintentar / Eliminar». Reintentos con espera
exponencial; las fotos ya subidas no se vuelven a subir. Cada usuario solo envía lo suyo (`ownerId`). Se quitó el
recorte silencioso a 60.

**Cola de `db.js`.** Clasifica los errores (`SyncUtils.classifyError`): sin red/sesión → para y conserva; temporal
→ reintenta con tope; permanente → pasa a *fallidas* y continúa. Conserva la hora real de edición. Cerrar sesión ya
**no borra** lo pendiente (pertenece a cada usuario) y `confirmedSignOut()` avisa si hay trabajo sin enviar.
El indicador de estado (barra lateral) es pulsable: *Estado de sincronización* (reintentar / descartar).

**Más de 1000 filas.** `refreshStoreCache` lee por páginas (`selectAllRows`, con recuento exacto y orden por `id`);
antes PostgREST cortaba en silencio en 1000 filas (clientes, puertas, revisiones…). Los RPC de partes y almacén
devuelven `jsonb` y no tenían ese límite.

**Ediciones simultáneas.** `dbPut` envía solo los campos que cambió el usuario, con bloqueo optimista por
`updatedat`; si otro editó mientras tanto fusiona campo a campo (los contadores como `stock` suman la diferencia) y
avisa si se pisó un mismo campo. Partes de trabajo conservan su propia fusión.

**Service worker (`autopuerta-v122`).** Precachea todos los JS/CSS que enumera `index.html` (incluido `LAZY_SCRIPTS`),
las 9 hojas de medidas (faltaban 3), jsPDF y las fuentes de Font Awesome; abre offline con `?page=…`; con cobertura
mala sirve la copia tras 5 s en vez de colgarse. Al cambiar `index.html` no hay que tocar listas: se deriva solo.

**Mapeo `REN_OUT`/`REN_IN`.** El inverso se completa automáticamente (antes `tecnicoId` se escribía bien pero al
leer volvía como `tecnicoid`, dejando vacío el técnico de las revisiones). Se quitó el par heredado `cliente_Id` y
`toDB` avisa en consola de claves con mayúsculas sin mapear.

