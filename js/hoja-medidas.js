/* =========================================================
 * hoja-medidas.js v1.0
 * Sistema de HOJAS DE MEDIDAS sobre imagen real de plantilla.
 *
 * Concepto (lo pedido):
 *  - En el presupuesto se elige el TIPO DE PUERTA (tabla
 *    global tipos_puerta) y se abre la HOJA asociada a ese tipo:
 *    una imagen/PDF rasterizado de la plantilla de papel de
 *    siempre, con CAMPOS DE TEXTO superpuestos justo en los
 *    huecos donde se escribe a mano.
 *  - El técnico pasa de cuadro en cuadro (Tab / botón
 *    "Siguiente medida") apuntando los valores.
 *  - Al guardar, la hoja rellena queda adjunta al PRESUPUESTO
 *    (campo medidasPlanta, ya existente). Administración la ve
 *    en pantalla y en el PDF del presupuesto (página extra con
 *    la hoja rellena).
 *
 * Plantillas: tabla Supabase `plantillas_medidas` (ya creada),
 * columna imagenUrl (bucket medidas-fotos) y campos jsonb con
 * posición en % de la imagen: {id, etiqueta, x, y, w, h}.
 *
 * Editor: desde la propia hoja (para admins) — subir imagen,
 * hacer clic para añadir cuadros, arrastrar para colocarlos.
 * ========================================================= */
'use strict';

window.HOJA_MEDIDAS = window.HOJA_MEDIDAS || {}; // el IIFE de abajo devuelve este objeto (antes devolvía undefined)
window.HOJA_MEDIDAS = (function () {
  const T_PLANTILLAS = 'plantillas_medidas';
  const BUCKET = 'medidas-fotos';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Plantillas locales incluidas (respaldo si no hay red) ──
  // Las imágenes están en la carpeta plantillas/ del proyecto (PNG generados de los SVG de alta resolución)
  const PLANTILLAS_INCLUIDAS = {
    'Puerta Rápida de Lona': {
      imagenUrl: 'plantillas/plantillarapidas.webp',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho total de la puerta (A)', x: 87.8, y: 12.59, w: 10.14, h: 2.5,
          espejos: [{ x: 25.08, y: 12.59, w: 9.6, h: 2.25 }] },
        { id: 'alto', etiqueta: 'Alto total de la puerta (B)', x: 87.8, y: 15.76, w: 10.14, h: 2.5,
          espejos: [{ x: 2.06, y: 38.2, w: 7.39, h: 2.25 }, { x: 49.31, y: 80.73, w: 7.32, h: 2.09 }] },
        { id: 'alto_libre', etiqueta: 'Alto libre de paso (C)', x: 87.8, y: 18.93, w: 10.14, h: 2.5,
          espejos: [{ x: 51.52, y: 40.37, w: 6.55, h: 2.25 }] },
        { id: 'ancho_libre', etiqueta: 'Ancho libre de paso (D)', x: 87.8, y: 22.19, w: 10.14, h: 2.42,
          espejos: [{ x: 25.69, y: 56.3, w: 8.31, h: 2.25 }, { x: 13.19, y: 87.24, w: 7.55, h: 2.17 }] },
        { id: 'ancho_guias', etiqueta: 'Ancho entre guías (E)', x: 87.8, y: 25.35, w: 10.14, h: 2.5,
          espejos: [{ x: 25.69, y: 61.8, w: 8.31, h: 2.25 }, { x: 13.26, y: 75.48, w: 7.47, h: 2 }] },
        { id: 'fondo', etiqueta: 'Fondo disponible (motor y cuadro)', x: 87.8, y: 32.86, w: 10.14, h: 2.42,
          espejos: [{ x: 47.33, y: 91.49, w: 7.39, h: 2.09 }] },
        { id: 'lat_izq', etiqueta: 'Espacio lateral izquierdo', x: 87.8, y: 36.03, w: 10.14, h: 2.42 },
        { id: 'lat_der', etiqueta: 'Espacio lateral derecho', x: 87.8, y: 39.12, w: 10.14, h: 2.42 },
        { id: 'alt_techo', etiqueta: 'Altura de techo disponible', x: 87.8, y: 42.29, w: 10.14, h: 2.42 },
        { id: 'montaje', etiqueta: 'Tipo de montaje', x: 62.73, y: 51.38, w: 5.5, h: 2.0 },
        { id: 'apertura', etiqueta: 'Tipo de apertura', x: 76.07, y: 57.88, w: 21.88, h: 2.59 },
        { id: 'alimentacion', etiqueta: 'Alimentación eléctrica', x: 76.07, y: 61.63, w: 21.88, h: 2.25 },
        { id: 'ancho_guia', etiqueta: 'Ancho de guía', x: 67.3, y: 78.32, w: 7.09, h: 2.09 },
        { id: 'alto_guia', etiqueta: 'Alto de guía', x: 80.79, y: 86.41, w: 6.02, h: 2.17 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 76.07, y: 65.14, w: 21.88, h: 6.01 }
      ]
    },
    'Puerta Seccional': {
      imagenUrl: 'plantillas/plantillaseccional.webp',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho total de la puerta (A)', x: 87.96, y: 11.76, w: 10.14, h: 2.17,
          espejos: [{ x: 26.75, y: 12.01, w: 9.98, h: 1.75 }, { x: 12.88, y: 71.89, w: 8.23, h: 2 }] },
        { id: 'alto', etiqueta: 'Alto total de la puerta (B)', x: 87.96, y: 14.6, w: 10.14, h: 2.09,
          espejos: [{ x: 1.91, y: 34.95, w: 7.7, h: 2 }, { x: 51.83, y: 81.23, w: 5.79, h: 1.75 }] },
        { id: 'alto_libre', etiqueta: 'Alto libre de paso (C)', x: 87.96, y: 17.35, w: 10.14, h: 2.17,
          espejos: [{ x: 53.05, y: 37.03, w: 4.65, h: 2 }, { x: 50.08, y: 88.41, w: 7.16, h: 1.83 }] },
        { id: 'ancho_libre', etiqueta: 'Ancho libre de paso (D)', x: 87.96, y: 20.27, w: 10.14, h: 2.09,
          espejos: [{ x: 26.75, y: 53.29, w: 7.7, h: 2 }] },
        { id: 'ancho_guias', etiqueta: 'Ancho entre guías (E)', x: 87.96, y: 23.19, w: 10.14, h: 2.09,
          espejos: [{ x: 26.83, y: 59.05, w: 7.62, h: 2.09 }, { x: 13.41, y: 81.98, w: 7.32, h: 1.92 }] },
        { id: 'lat_izq', etiqueta: 'Espacio lateral izquierdo (F)', x: 87.96, y: 26.02, w: 10.14, h: 2.09,
          espejos: [{ x: 2.44, y: 59.88, w: 7.47, h: 2 }, { x: 3.28, y: 89.32, w: 6.48, h: 1.83 }] },
        { id: 'lat_der', etiqueta: 'Espacio lateral derecho (G)', x: 87.96, y: 28.86, w: 10.14, h: 2.09,
          espejos: [{ x: 50.08, y: 59.8, w: 6.86, h: 2.09 }, { x: 23.25, y: 89.32, w: 6.4, h: 1.83 }] },
        { id: 'fondo_motor', etiqueta: 'Fondo disponible para motor y eje (H)', x: 87.96, y: 35.28, w: 10.14, h: 2.17,
          espejos: [{ x: 49.77, y: 71.89, w: 7.16, h: 1.75 }] },
        { id: 'alt_techo', etiqueta: 'Altura de techo disponible (I)', x: 87.96, y: 38.12, w: 10.14, h: 2.17,
          espejos: [{ x: 33.54, y: 80.57, w: 6.02, h: 1.75 }] },
        { id: 'alt_dintel', etiqueta: 'Altura de dintel (J)', x: 87.96, y: 41.03, w: 10.14, h: 2.09 },
        { id: 'long_guias', etiqueta: 'Longitud de guías laterales (K)', x: 87.96, y: 43.87, w: 10.14, h: 2.09 },
        { id: 'montaje', etiqueta: 'Tipo de montaje', x: 62.16, y: 51.42, w: 5.5, h: 2.0 },
        { id: 'apertura', etiqueta: 'Tipo de apertura', x: 77.36, y: 56.88, w: 20.66, h: 2.17 },
        { id: 'alimentacion', etiqueta: 'Alimentación eléctrica (V/Hz)', x: 77.36, y: 59.72, w: 20.66, h: 2.17 },
        { id: 'motor', etiqueta: 'Tipo de motor / potencia', x: 77.36, y: 62.64, w: 20.66, h: 2.09 },
        { id: 'ancho_guia', etiqueta: 'Ancho de guía (aprox.)', x: 71.57, y: 82.49, w: 6.78, h: 2.0 },
        { id: 'grosor_panel', etiqueta: 'Grosor de panel (aprox.)', x: 90.85, y: 82.65, w: 6.86, h: 1.92 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 77.36, y: 65.39, w: 20.66, h: 4.67 }
      ]
    },
    'Puerta Cortafuegos': {
      imagenUrl: 'plantillas/plantillacortafuegos.webp',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho total de la puerta (A)', x: 87.58, y: 11.18, w: 10.52, h: 1.92,
          espejos: [{ x: 14.33, y: 13.34, w: 9.38, h: 1.83 }, { x: 12.35, y: 68.47, w: 7.39, h: 1.58 }] },
        { id: 'alto', etiqueta: 'Alto total de la puerta (B)', x: 87.58, y: 13.68, w: 10.52, h: 1.92,
          espejos: [{ x: 1.98, y: 34.86, w: 6.86, h: 1.83 }, { x: 48.25, y: 27.44, w: 7.09, h: 1.92 }] },
        { id: 'ancho_libre', etiqueta: 'Ancho libre de paso (C)', x: 87.58, y: 16.18, w: 10.52, h: 1.92,
          espejos: [{ x: 15.32, y: 58.72, w: 7.32, h: 1.92 }, { x: 12.35, y: 86.82, w: 7.39, h: 1.75 }] },
        { id: 'alto_libre', etiqueta: 'Alto libre de paso (D)', x: 87.58, y: 18.68, w: 10.52, h: 1.92,
          espejos: [{ x: 28.2, y: 34.61, w: 7.01, h: 1.92 }] },
        { id: 'fondo_marco', etiqueta: 'Fondo de marco, espesor de pared (E)', x: 87.58, y: 21.18, w: 10.52, h: 1.92,
          espejos: [{ x: 48.02, y: 16.18, w: 6.25, h: 1.75 }] },
        { id: 'fondo_hoja', etiqueta: 'Fondo de hoja, espesor de puerta (F)', x: 87.58, y: 23.69, w: 10.52, h: 1.92,
          espejos: [{ x: 46.72, y: 58.38, w: 6.86, h: 1.92 }, { x: 48.86, y: 88.07, w: 8.23, h: 1.83 }] },
        { id: 'lat_izq', etiqueta: 'Espacio lateral izquierdo (G)', x: 87.58, y: 29.44, w: 10.52, h: 1.92 },
        { id: 'lat_der', etiqueta: 'Espacio lateral derecho (H)', x: 87.58, y: 31.94, w: 10.52, h: 2 },
        { id: 'alt_dintel', etiqueta: 'Altura de dintel desde el suelo (I)', x: 87.58, y: 34.53, w: 10.52, h: 1.92 },
        { id: 'long_guias', etiqueta: 'Longitud de guías / marco (J)', x: 87.58, y: 37.03, w: 10.52, h: 2 },
        { id: 'alt_manilla', etiqueta: 'Altura de manilla (aprox.)', x: 48.48, y: 42.29, w: 6.71, h: 1.92 },
        { id: 'resistencia', etiqueta: 'Resistencia al fuego', x: 74.3, y: 44.04, w: 5.5, h: 2.0 },
        { id: 'sentido', etiqueta: 'Sentido de apertura', x: 74.48, y: 46.9, w: 5.5, h: 2.0 },
        { id: 'montaje', etiqueta: 'Tipo de instalación', x: 74.48, y: 49.76, w: 5.5, h: 2.0 },
        { id: 'accesorios', etiqueta: 'Accesorios y opciones', x: 61.32, y: 55.57, w: 5.5, h: 2.0 },
        { id: 'otros_acc', etiqueta: 'Otros accesorios', x: 92.38, y: 57.21, w: 5.87, h: 1.58 },
        { id: 'tipo_pared', etiqueta: 'Tipo de pared / obra', x: 77.06, y: 62.97, w: 21.19, h: 1.75 },
        { id: 'alimentacion', etiqueta: 'Alimentación eléctrica (si aplica)', x: 77.06, y: 65.39, w: 21.19, h: 1.83 },
        { id: 'bisagra', etiqueta: 'Bisagra (altura y nº de unidades)', x: 69.36, y: 83.4, w: 7.55, h: 1.83 },
        { id: 'cierrapuertas', etiqueta: 'Cierrapuertas (posición y brazo)', x: 91.84, y: 84.57, w: 6.4, h: 1.83 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 76.98, y: 68.06, w: 21.27, h: 4.42 }
      ]
    },
    'Puerta Corredera': {
      imagenUrl: 'plantillas/plantillacorredera.webp',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho total de la instalación (A)', x: 88.64, y: 11.68, w: 9.45, h: 1.83,
          espejos: [{ x: 19.28, y: 13.51, w: 10.67, h: 1.75 }, { x: 13.26, y: 66.47, w: 7.24, h: 1.75 }] },
        { id: 'alto', etiqueta: 'Alto total de la puerta (B)', x: 88.64, y: 14.35, w: 9.45, h: 1.92,
          espejos: [{ x: 1.52, y: 34.7, w: 5.18, h: 1.83 }] },
        { id: 'ancho_libre', etiqueta: 'Ancho libre de paso (C)', x: 88.64, y: 17.01, w: 9.45, h: 1.83,
          espejos: [{ x: 12.58, y: 29.86, w: 5.95, h: 1.75 }, { x: 10.9, y: 79.23, w: 6.78, h: 1.58 }] },
        { id: 'alto_libre', etiqueta: 'Alto libre de paso (D)', x: 88.64, y: 19.68, w: 9.45, h: 1.92,
          espejos: [{ x: 12.65, y: 39.03, w: 5.95, h: 1.83 }] },
        { id: 'solape', etiqueta: 'Espacio de solape (E)', x: 88.64, y: 22.44, w: 9.45, h: 1.83,
          espejos: [{ x: 23.93, y: 55.63, w: 7.16, h: 1.75 }] },
        { id: 'alt_caja', etiqueta: 'Altura de la caja de maniobra (F)', x: 88.64, y: 25.1, w: 9.45, h: 1.92,
          espejos: [{ x: 40.47, y: 42.2, w: 4.57, h: 1.83 }] },
        { id: 'fondo_g', etiqueta: 'Fondo disponible para motor (G)', x: 88.64, y: 28.02, w: 9.45, h: 1.92,
          espejos: [{ x: 56.25, y: 16.6, w: 6.71, h: 1.92 }] },
        { id: 'alto_h', etiqueta: 'Alto total, lado del motor (H)', x: 88.64, y: 30.78, w: 9.45, h: 1.92,
          espejos: [{ x: 56.25, y: 35.45, w: 6.25, h: 1.92 }] },
        { id: 'lat_i', etiqueta: 'Espacio lateral izq./der. (I)', x: 88.64, y: 33.53, w: 9.45, h: 1.92,
          espejos: [{ x: 54.42, y: 57.46, w: 7.39, h: 1.92 }] },
        { id: 'espacio_pared', etiqueta: 'Espacio de pared necesario (J)', x: 19.82, y: 88.24, w: 7.09, h: 1.67 },
        { id: 'espesor_hoja', etiqueta: 'Espesor de hoja (K)', x: 54.12, y: 76.9, w: 7.09, h: 1.83 },
        { id: 'alt_motor', etiqueta: 'Altura de motor (L)', x: 81.25, y: 84.82, w: 5.95, h: 1.75 },
        { id: 'fondo_cm', etiqueta: 'Fondo disponible para motor', x: 88.64, y: 39.95, w: 9.45, h: 2.09 },
        { id: 'lat_izq', etiqueta: 'Espacio lateral izquierdo', x: 88.64, y: 43.04, w: 9.45, h: 2.09 },
        { id: 'lat_der', etiqueta: 'Espacio lateral derecho', x: 88.64, y: 46.04, w: 9.45, h: 2.09 },
        { id: 'alt_techo', etiqueta: 'Altura de techo disponible', x: 88.64, y: 49.04, w: 9.45, h: 2.09 },
        { id: 'montaje', etiqueta: 'Tipo de montaje', x: 67.84, y: 56.96, w: 5.5, h: 2.0 },
        { id: 'apertura', etiqueta: 'Tipo de apertura', x: 83.46, y: 62.55, w: 14.63, h: 2.09 },
        { id: 'alimentacion', etiqueta: 'Alimentación eléctrica (V/Hz)', x: 83.46, y: 65.39, w: 14.63, h: 2.09 },
        { id: 'motor', etiqueta: 'Tipo de motor / potencia', x: 83.46, y: 68.22, w: 14.63, h: 2.09 },
        { id: 'tipo_motor', etiqueta: 'Tipo de motor (sistema)', x: 89.46, y: 82.35, w: 5.5, h: 2.0 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 83.46, y: 71.06, w: 14.71, h: 4.5 }
      ]
    },
    'Persiana Enrollable': {
      imagenUrl: 'plantillas/plantillaenrollable.webp',
      campos: [
        { id: 'a_ancho', etiqueta: 'Ancho total', x: 85.97, y: 21.73, w: 11.25, h: 3.25,
          espejos: [{ x: 29.02, y: 82.81, w: 11.49, h: 3.08 }] },
        { id: 'b_alto', etiqueta: 'Alto total', x: 85.97, y: 28.57, w: 11.25, h: 3.25 },
        { id: 'c_luz', etiqueta: 'Luz libre', x: 85.97, y: 35.41, w: 11.25, h: 3.25 },
        { id: 'd_cajon', etiqueta: 'Cajón', x: 85.97, y: 42.26, w: 11.25, h: 3.25 },
        { id: 'e_lama', etiqueta: 'Tipo de lama', x: 85.97, y: 49.1, w: 11.25, h: 3.25 },
        { id: 'f_notas', etiqueta: 'Observaciones', x: 68.44, y: 60.05, w: 27.57, h: 9.92 }
      ]
    },
    'Puerta Basculante': {
      imagenUrl: 'plantillas/plantillabasculante.webp',
      campos: [
        { id: 'a_ancho', etiqueta: 'Ancho hueco', x: 85.97, y: 21.73, w: 11.25, h: 3.25,
          espejos: [{ x: 29.02, y: 82.81, w: 11.49, h: 3.08 }] },
        { id: 'b_alto', etiqueta: 'Alto hueco', x: 85.97, y: 28.57, w: 11.25, h: 3.25 },
        { id: 'c_luz', etiqueta: 'Luz libre', x: 85.97, y: 35.41, w: 11.25, h: 3.25 },
        { id: 'd_muelles', etiqueta: 'Nº de muelles', x: 85.97, y: 42.26, w: 11.25, h: 3.25 },
        { id: 'e_motor', etiqueta: 'Motor / manual', x: 85.97, y: 49.1, w: 11.25, h: 3.25 },
        { id: 'f_notas', etiqueta: 'Observaciones', x: 68.44, y: 60.05, w: 27.57, h: 9.92 }
      ]
    },
    'Barrera': {
      imagenUrl: 'plantillas/plantillabarrera.webp',
      campos: [
        { id: 'ancho', etiqueta: 'ANCHO (A)', x: 85.0, y: 11.0, w: 13.0, h: 3.0 },
        { id: 'alto', etiqueta: 'ALTO (B)', x: 85.0, y: 15.0, w: 13.0, h: 3.0 },
        { id: 'alto_libre', etiqueta: 'LUZ LIBRE (C)', x: 85.0, y: 19.0, w: 13.0, h: 3.0 },
        { id: 'ancho_libre', etiqueta: 'ANCHO VANO (D)', x: 85.0, y: 23.0, w: 13.0, h: 3.0 },
        { id: 'lat_izq', etiqueta: 'LATERAL IZQ (E)', x: 85.0, y: 27.0, w: 13.0, h: 3.0 },
        { id: 'lat_der', etiqueta: 'LATERAL DCHO (F)', x: 85.0, y: 31.0, w: 13.0, h: 3.0 },
        { id: 'long_pluma', etiqueta: 'LONGITUD PLUMA (G)', x: 85.0, y: 35.0, w: 13.0, h: 3.0 },
        { id: 'alt_soporte', etiqueta: 'ALTURA SOPORTE (H)', x: 85.0, y: 39.0, w: 13.0, h: 3.0 },
        { id: 'tipo_barrera', etiqueta: 'TIPO BARRERA', x: 85.0, y: 43.0, w: 13.0, h: 3.0 },
        { id: 'apertura', etiqueta: 'APERTURA', x: 85.0, y: 47.0, w: 13.0, h: 3.0 },
        { id: 'motor', etiqueta: 'MOTOR/MANUAL', x: 85.0, y: 51.0, w: 13.0, h: 3.0 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 85.0, y: 55.0, w: 13.0, h: 12.0 }
      ]
    },
    'Puerta Corredera de Cristal': {
      imagenUrl: 'plantillas/plantillacorrederacristal.webp',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho total de la puerta (A)', x: 89.9, y: 14.8, w: 8.8, h: 2.9,
          espejos: [{ x: 24, y: 13.8, w: 7.8, h: 2.6 }] },
        { id: 'alto', etiqueta: 'Alto total de la puerta (B)', x: 89.9, y: 18.91, w: 8.8, h: 2.9,
          espejos: [{ x: 2.9, y: 41.5, w: 5.6, h: 2.6 }, { x: 53.5, y: 41.5, w: 5.2, h: 2.6 }] },
        { id: 'ancho_libre', etiqueta: 'Ancho libre de paso (D)', x: 89.9, y: 23.02, w: 8.8, h: 2.9,
          espejos: [{ x: 24.5, y: 37.7, w: 6.7, h: 2.6 }] },
        { id: 'alto_libre', etiqueta: 'Alto libre de paso (E)', x: 89.9, y: 27.13, w: 8.8, h: 2.9,
          espejos: [{ x: 43.6, y: 44.1, w: 5.9, h: 2.6 }] },
        { id: 'espacio_izq', etiqueta: 'Espacio lateral izquierdo (F)', x: 89.9, y: 31.24, w: 8.8, h: 2.9,
          espejos: [{ x: 3.1, y: 67.9, w: 5.7, h: 2.4 }] },
        { id: 'espacio_der', etiqueta: 'Espacio lateral derecho (G)', x: 89.9, y: 35.35, w: 8.8, h: 2.9,
          espejos: [{ x: 47.5, y: 67.9, w: 5.1, h: 2.4 }] },
        { id: 'fondo_guia', etiqueta: 'Fondo necesario con recogida (H)', x: 89.9, y: 39.46, w: 8.8, h: 2.9,
          espejos: [{ x: 58.9, y: 19, w: 5.2, h: 2.3 }] },
        { id: 'ancho_perfil', etiqueta: 'Ancho de perfil guía (I)', x: 89.9, y: 43.57, w: 8.8, h: 2.9,
          espejos: [{ x: 58.9, y: 68.8, w: 5.2, h: 2.5 }] },
        { id: 'alt_cajon', etiqueta: 'Altura del cajón (J)', x: 12.2, y: 87.3, w: 3.9, h: 2.6 },
        { id: 'alt_guia', etiqueta: 'Altura de la guía (K)', x: 28, y: 89.1, w: 4.9, h: 2.7 },
        { id: 'grosor_cristal', etiqueta: 'Grosor del cristal (L)', x: 42.4, y: 93.9, w: 7, h: 2.7 },
        { id: 'ancho_perfil_lat', etiqueta: 'Ancho del perfil lateral (M)', x: 65.8, y: 90.4, w: 7.8, h: 2.7 },
        { id: 'apertura', etiqueta: 'Tipo de apertura', x: 82.7, y: 53.8, w: 15.9, h: 3 },
        { id: 'velocidad', etiqueta: 'Velocidad aproximada', x: 82.7, y: 58.4, w: 15.9, h: 2.9 },
        { id: 'alimentacion', etiqueta: 'Alimentación eléctrica (V/Hz)', x: 82.7, y: 62.7, w: 15.9, h: 2.9 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 82.7, y: 67.3, w: 15.8, h: 9.8 }
      ]
    },
    'Puerta Rápida Apilable': {
      imagenUrl: 'plantillas/plantillarapidaapilable.webp',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho total de la puerta (A)', x: 91.5, y: 16.4, w: 7.2, h: 3.6,
          espejos: [{ x: 26.5, y: 17.3, w: 7.5, h: 2.7 }] },
        { id: 'alto', etiqueta: 'Alto total de la puerta (B)', x: 91.5, y: 21.7, w: 7.2, h: 3.6,
          espejos: [{ x: 1.5, y: 44, w: 6.3, h: 2.8 }] },
        { id: 'alto_libre', etiqueta: 'Alto libre de paso (C)', x: 91.5, y: 27, w: 7.2, h: 3.6,
          espejos: [{ x: 52.2, y: 42.7, w: 5.4, h: 2.7 }] },
        { id: 'ancho_libre', etiqueta: 'Ancho libre de paso (D)', x: 91.5, y: 32.3, w: 7.2, h: 3.6,
          espejos: [{ x: 24.5, y: 65.5, w: 7.8, h: 2.7 }] },
        { id: 'ancho_guias', etiqueta: 'Altura de mandos (E)', x: 91.5, y: 37.6, w: 7.2, h: 3.6,
          espejos: [{ x: 49.4, y: 53.3, w: 6, h: 2.9 }] },
        { id: 'fondo', etiqueta: 'Profundidad necesaria (F)', x: 91.5, y: 42.9, w: 7.2, h: 3.6,
          espejos: [{ x: 58.8, y: 70.8, w: 6.6, h: 2.8 }] },
        { id: 'ancho_guia', etiqueta: 'Ancho de guía (aprox.)', x: 11.6, y: 86.3, w: 7.6, h: 2.9 },
        { id: 'altura_panel', etiqueta: 'Altura de panel (aprox.)', x: 35.7, y: 88.2, w: 6.8, h: 2.9 },
        { id: 'altura_zocalo', etiqueta: 'Altura de zócalo (si lleva)', x: 60.7, y: 88.2, w: 6.4, h: 2.9 },
        { id: 'apertura', etiqueta: 'Tipo de apertura', x: 84.1, y: 53.3, w: 14.5, h: 3.3 },
        { id: 'velocidad', etiqueta: 'Velocidad aproximada', x: 84.1, y: 58.7, w: 14.5, h: 3.3 },
        { id: 'alimentacion', etiqueta: 'Alimentación eléctrica (V/Hz)', x: 84.1, y: 61.5, w: 14.5, h: 3.1 },
        { id: 'observaciones', etiqueta: 'OBSERVACIONES', x: 84.1, y: 68.6, w: 14.5, h: 14.6 }
      ]
    }
  };

  function supa() {
    const db = window.supabaseDB || window.sb;
    if (db && typeof db.from === 'function') return db;
    throw new Error('Supabase no disponible');
  }

  // ── Cargar plantilla de un tipo de puerta ──
  // Prioridad: Supabase → plantilla local de la carpeta plantillas/ (imágenes PNG generadas de los SVG)
  async function cargarPlantillaDeTipo(tipoNombre) {
    try {
      const { data, error } = await supa().from(T_PLANTILLAS)
        .select('*').eq('tipopuerta', tipoNombre).limit(1).maybeSingle();
      if (!error && data) {
        return {
          id: data.id, tipoPuerta: data.tipopuerta || tipoNombre,
          imagenUrl: data.imagenurl || '', campos: data.campos || []
        };
      }
    } catch (e) { console.warn('[HojaMedidas] sin conexión:', e.message || e); }
    const incluida = PLANTILLAS_INCLUIDAS[tipoNombre];
    return incluida ? { id: 'incluida', tipoPuerta: tipoNombre, ...incluida } : null;
  }

  async function guardarDefPlantilla(def) {
    const fila = {
      nombre: 'Hoja de medidas — ' + def.tipoPuerta,
      tipopuerta: def.tipoPuerta, descripcion: 'Plantilla de toma de medidas',
      campos: def.campos, imagenurl: def.imagenUrl || null,
      createdby: window.authState?.user?.id || null
    };
    const db = supa();
    if (def.id && def.id !== 'incluida') {
      const { error } = await db.from(T_PLANTILLAS).update({ ...fila, updatedat: new Date().toISOString() }).eq('id', def.id);
      if (error) throw error;
      return def.id;
    }
    const { data, error } = await db.from(T_PLANTILLAS).insert(fila).select().single();
    if (error) throw error;
    return data.id;
  }

  async function subirImagenHoja(dataUrl) {
    const userId = window.authState?.user?.id;
    if (!userId || !navigator.onLine || !window.supabaseDB) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const rand = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random()).replace(/-/g, '');
      const path = userId + '/hoja-' + rand + '.' + ext;
      const { error } = await window.supabaseDB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      return window.supabaseDB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) { console.warn('[HojaMedidas] imagen no subida:', e.message || e); return null; }
  }

  // ════════════════ MODAL DE RELLENADO ════════════════
  let estado = { plantilla: null, valores: {}, onGuardar: null, imagenCargada: false };

  function asegurarModal() {
    if (document.getElementById('hm-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="hm-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10000;display:none;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:980px;width:100%;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:pageIn .2s ease-out">
        <div class="modal-header">
          <h2 style="font-size:17px"><i class="fas fa-ruler-combined"></i> Hoja de medidas — <span id="hm-tipo-nombre"></span></h2>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-outline btn-sm" id="hm-btn-fs" title="Pantalla completa (ampliar imagen)"><i class="fas fa-expand"></i></button>
            <button type="button" class="btn btn-outline btn-sm" id="hm-btn-editor" title="Editar plantilla (admins)"><i class="fas fa-pen-to-square"></i> Editar plantilla</button>
            <button type="button" class="btn-close-x" onclick="HOJA_MEDIDAS.cerrar()">✕</button>
          </div>
        </div>
        <div style="overflow:auto;padding:14px;flex:1">
          <div id="hm-visor" style="position:relative;width:100%;max-width:860px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15)"></div>
        </div>
        <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <small style="color:var(--text-muted);flex:1;min-width:150px"><i class="fas fa-keyboard"></i> Pulsa <b>Tab</b> para pasar a la siguiente medida</small>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button type="button" class="btn btn-secondary" id="hm-btn-siguiente" style="min-height:40px"><i class="fas fa-forward"></i> Siguiente medida</button>
            <button type="button" class="btn btn-primary" id="hm-btn-guardar" style="min-height:40px;flex:0 1 auto;min-width:0"><i class="fas fa-paper-plane"></i> Adjuntar</button>
          </div>
        </div>
      </div>
    </div>`);
    document.getElementById('hm-btn-guardar').addEventListener('click', guardarHoja);
    document.getElementById('hm-btn-siguiente').addEventListener('click', siguienteCampo);
    document.getElementById('hm-btn-fs').addEventListener('click', () => {
      const m = document.getElementById('hm-modal');
      m.classList.toggle('hm-fs');
      document.getElementById('hm-btn-fs').innerHTML = m.classList.contains('hm-fs')
        ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
      ajustarVisorHoja();
    });
    document.getElementById('hm-btn-editor').addEventListener('click', () => {
      cerrar();
      abrirEditor(estado.plantilla);
    });
  }

  function siguienteCampo() {
    const inputs = [...document.querySelectorAll('#hm-visor .hm-input')];
    const vacio = inputs.find(i => !i.value.trim());
    (vacio || inputs[0])?.focus();
  }

  async function abrirHoja(tipoNombre, tipoId, valoresPrevios, onGuardar) {
    asegurarModal();
    document.getElementById('hm-tipo-nombre').textContent = tipoNombre;
    document.getElementById('hm-visor').innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i> Cargando hoja…</div>';
    document.getElementById('hm-btn-editor').style.display = window.isTechnician?.() ? 'none' : '';
    estado = { plantilla: null, valores: { ...(valoresPrevios || {}) }, onGuardar: onGuardar || null, imagenCargada: false };

    // Plantilla remota → si no hay, plantilla local incluida (carpeta plantillas/)
    let plantilla = null;
    try { plantilla = await cargarPlantillaDeTipo(tipoNombre); } catch (e) { console.warn('[HojaMedidas] remota:', e); }
    if (!plantilla) {
      const incluida = PLANTILLAS_INCLUIDAS[tipoNombre];
      if (incluida) plantilla = { id: 'incluida', tipoPuerta: tipoNombre, ...incluida };
    }
    estado.plantilla = plantilla;
    if (!plantilla) {
      document.getElementById('hm-visor').innerHTML =
        '<div style="padding:40px;text-align:center;color:#94a3b8">' +
        '<i class="fas fa-file-circle-plus" style="font-size:32px;display:block;margin-bottom:12px"></i>' +
        'Aún no hay hoja de medidas para <b>' + esc(tipoNombre) + '</b>.<br>' +
        '<small>Un administrador puede crearla con "Editar plantilla": sube el PDF/foto y marca los cuadros.</small></div>';
      document.getElementById('hm-btn-editor').style.display = '';
      document.getElementById('hm-modal').style.display = 'flex';
      return;
    }
    document.getElementById('hm-modal').style.display = 'flex';
    pintarHoja();
  }

  function ajustarVisorHoja() {
    // En pantalla completa: la imagen ocupa TODO el alto disponible (el ancho se adapta)
    const modal = document.getElementById('hm-modal');
    const visor = document.getElementById('hm-visor');
    if (!modal || !visor) return;
    const fs = modal.classList.contains('hm-fs');
    const header = modal.querySelector('.modal-header');
    const footH = fs ? 64 : 0; // pie con botones Siguiente/Adjuntar siempre visible
    const headH = header ? header.offsetHeight : 0;
    if (fs) {
      // el contenedor padre (#hm-modal>div) es flex-column; área disponible = alto pantalla - header - pie
      const disp = window.innerHeight - headH - footH - 8;
      visor.style.maxWidth = 'none';
      visor.style.maxHeight = disp + 'px';
      visor.style.width = 'auto';
      visor.style.height = disp + 'px';
      visor.style.aspectRatio = '';
      visor.style.margin = '0 auto';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'height:100%;width:auto;display:block;border-radius:10px;max-width:none';
    } else {
      visor.style.maxHeight = '';
      visor.style.height = '';
      visor.style.width = '100%';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
    }
  }

  function pintarHoja() {
    const visor = document.getElementById('hm-visor');
    const p = estado.plantilla;
    if (!visor || !p) return;
    visor.innerHTML = '';
    const img = new Image();
    img.onload = () => {
      estado.imagenCargada = true;
      visor.style.aspectRatio = img.width + ' / ' + img.height;
      visor.style.maxWidth = Math.min(860, img.width) + 'px';
      visor.style.margin = '0 auto';
      visor.style.padding = '0';
      visor.style.boxSizing = 'content-box';
      img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
      visor.appendChild(img);
      // Capa de campos superpuestos
      const capa = document.createElement('div');
      capa.style.cssText = 'position:absolute;inset:0';
      (p.campos || []).forEach((c, i) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;left:' + c.x + '%;top:' + c.y + '%;width:' + (c.w || 14) + '%;height:' + (c.h || 6) + '%;box-sizing:border-box';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'hm-input';
        inp.value = estado.valores[c.id] ?? '';
        inp.placeholder = c.etiqueta || '';
        inp.title = c.etiqueta || '';
        inp.dataset.idx = i;
        inp.style.cssText = 'width:100%;height:100%;font-size:clamp(10px,1.6vw,14px);font-weight:700;color:#0f172a;background:rgba(56,189,248,.14);border:1.5px solid rgba(14,165,233,.55);border-radius:4px;padding:2px 6px;text-align:center;outline:none;transition:background .15s';
        inp.addEventListener('focus', () => { inp.style.background = 'rgba(56,189,248,.32)'; });
        inp.addEventListener('blur', () => { estado.valores[c.id] = inp.value.trim(); inp.style.background = 'rgba(56,189,248,.14)'; });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); siguienteCampo(); } });
        wrap.appendChild(inp);
        capa.appendChild(wrap);
      });
      visor.appendChild(capa);
      ajustarVisorHoja();
    };
    img.onerror = () => {
      visor.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> No se pudo cargar la imagen de la plantilla</div>';
    };
    img.src = p.imagenUrl;
  }

  function guardarHoja() {
    // Recolectar valores actuales de los inputs
    const p = estado.plantilla;
    if (!p) return;
    document.querySelectorAll('#hm-visor .hm-input').forEach(inp => {
      const c = (p.campos || [])[+inp.dataset.idx];
      if (c) estado.valores[c.id] = inp.value.trim();
    });
    const llenos = Object.values(estado.valores).filter(v => String(v).trim() !== '').length;
    if (!llenos) { showToast('Rellena al menos una medida', 'error'); return; }
    const datos = {
      sistema: 'hoja-v1',
      tipoId: estado.tipoId || null,
      tipoNombre: p.tipoPuerta,
      imagenUrl: p.imagenUrl,
      campos: p.campos,
      valores: estado.valores,
      fecha: getToday(),
      tecnico: window.authState?.employee?.nombre || window.authState?.user?.email || ''
    };
    if (estado.onGuardar) estado.onGuardar(datos);
    cerrar();
  }

  function cerrar() { const m = document.getElementById('hm-modal'); if (m) m.style.display = 'none'; }

  // ════════════════ EDITOR DE PLANTILLA ════════════════
  let estadoEdit = { def: null, tipoNombre: '', arrastrando: null, imagenBase64: null, onGuardar: null };

  async function abrirEditor(defActual, onGuardar) {
    const tipos = (window.__tiposPuertaCache || await dbGetAll('tiposPuerta').catch(() => []));
    const opciones = tipos.map(t => '<option value="' + esc(t.nombre) + '" ' + ((defActual?.tipoPuerta) === t.nombre ? 'selected' : '') + '>' + esc(t.nombre) + '</option>').join('');
    const def = defActual || null;
    const html = `
    <div id="hm-edit-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:1050px;width:100%;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.45)">
        <div class="modal-header"><h2 style="font-size:17px"><i class="fas fa-pen-to-square"></i> Editor de hoja de medidas</h2>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-outline btn-sm" id="hme-btn-fs" title="Pantalla completa"><i class="fas fa-expand"></i></button>
            <button type="button" class="btn-close-x" onclick="document.getElementById('hm-edit-modal').remove()">✕</button>
          </div></div>
        <div style="display:grid;grid-template-columns:360px 1fr;overflow:hidden;flex:1;min-height:0">
          <div style="padding:16px;border-right:1px solid var(--border);overflow:auto;display:flex;flex-direction:column;gap:10px" id="hme-panel">
            <label style="font-size:12px;color:var(--text-muted)">Tipo de puerta (global)</label>
            <select id="hme-tipo">${opciones || '<option value="">— Sin tipos —</option>'}</select>
            <label style="font-size:12px;color:var(--text-muted)">Imagen de la plantilla (PDF/foto → PNG/JPG)</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-outline btn-sm" id="hme-btn-archivo"><i class="fas fa-file-import"></i> Subir imagen</button>
              <input type="file" id="hme-file" accept="image/*" style="display:none">
            </div>
            <small style="color:var(--text-muted)">Si es un PDF, hazle una captura o conviértelo a imagen (a mayor resolución, mejor).</small>
            <label style="font-size:12px;color:var(--text-muted);margin-top:4px">Cuadros de texto</label>
            <div id="hme-lista" style="display:flex;flex-direction:column;gap:6px"></div>
            <button type="button" class="btn btn-outline btn-sm" id="hme-add"><i class="fas fa-plus"></i> Añadir cuadro</button>
            <small id="hme-ayuda" style="color:var(--text-muted)">Arrastra cada cuadro sobre la imagen para colocarlo. Ajusta ancho y alto en la lista.</small>
            <button type="button" class="btn btn-primary" id="hme-guardar" style="margin-top:8px"><i class="fas fa-save"></i> Guardar plantilla</button>
          </div>
          <div style="overflow:auto;padding:14px">
            <div id="hme-visor" style="position:relative;width:100%;background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15)"></div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    estadoEdit = {
      def: def ? JSON.parse(JSON.stringify(def)) : null,
      tipoNombre: def?.tipoPuerta || (tipos[0]?.nombre || ''),
      arrastrando: null,
      imagenBase64: null,
      onGuardar: typeof onGuardar === 'function' ? onGuardar : null
    };
    if (!estadoEdit.def) {
      // ¿Hay plantilla guardada para este tipo?
      const existente = await cargarPlantillaDeTipo(estadoEdit.tipoNombre);
      estadoEdit.def = existente || { id: null, tipoPuerta: estadoEdit.tipoNombre, imagenUrl: '', campos: [] };
    }
    document.getElementById('hme-tipo').addEventListener('change', async e => {
      estadoEdit.tipoNombre = e.target.value;
      const existente = await cargarPlantillaDeTipo(estadoEdit.tipoNombre);
      estadoEdit.def = existente || { id: null, tipoPuerta: estadoEdit.tipoNombre, imagenUrl: '', campos: [] };
      estadoEdit.imagenBase64 = null;
      pintarEditor();
    });
    document.getElementById('hme-btn-archivo').addEventListener('click', () => document.getElementById('hme-file').click());
    document.getElementById('hme-file').addEventListener('change', e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { estadoEdit.imagenBase64 = r.result; pintarEditor(); };
      r.readAsDataURL(f);
    });
    document.getElementById('hme-add').addEventListener('click', () => {
      estadoEdit.def.campos.push({ id: 'c' + Date.now() + Math.floor(Math.random() * 99), etiqueta: 'Medida ' + (estadoEdit.def.campos.length + 1), x: 50, y: 50, w: 14, h: 6 });
      pintarLista(); pintarEditor();
    });
    document.getElementById('hme-guardar').addEventListener('click', guardarEditor);
    document.getElementById('hme-btn-fs').addEventListener('click', () => {
      const m = document.getElementById('hm-edit-modal');
      m.classList.toggle('hm-fs');
      document.getElementById('hme-btn-fs').innerHTML = m.classList.contains('hm-fs')
        ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
      ajustarVisorEdit();
    });
    pintarEditor();
  }

  // Pantalla completa del editor: imagen ocupa todo el alto disponible
  function ajustarVisorEdit() {
    const modal = document.getElementById('hm-edit-modal');
    const visor = document.getElementById('hme-visor');
    if (!modal || !visor) return;
    const fs = modal.classList.contains('hm-fs');
    if (fs) {
      const disp = window.innerHeight - 120;
      visor.style.maxWidth = 'none';
      visor.style.maxHeight = disp + 'px';
      visor.style.height = disp + 'px';
      visor.style.width = 'auto';
      visor.style.aspectRatio = '';
      visor.style.margin = '0 auto';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'height:100%;width:auto;display:block;border-radius:10px;max-width:none';
    } else {
      visor.style.maxHeight = ''; visor.style.height = ''; visor.style.width = '100%';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
    }
  }

  function pintarLista() {
    const cont = document.getElementById('hme-lista');
    if (!cont) return;
    cont.innerHTML = estadoEdit.def.campos.map((c, i) => `
      <div style="display:flex;gap:4px;align-items:center">
        <input type="text" value="${esc(c.etiqueta)}" data-i="${i}" data-f="etiqueta" class="hme-in" style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
        <input type="number" value="${esc(c.w || 14)}" data-i="${i}" data-f="w" class="hme-in" title="Ancho %" placeholder="Ancho" style="width:56px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
        <input type="number" value="${esc(c.h || 6)}" data-i="${i}" data-f="h" class="hme-in" title="Alto %" placeholder="Alto" style="width:52px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
        <button type="button" class="btn btn-outline btn-sm btn-icon" onclick="HOJA_MEDIDAS._delCampoHOJA(${i})"><i class="fas fa-minus"></i></button>
      </div>`).join('') || '<small style="color:var(--text-muted)">Sin cuadros aún: añade uno</small>';
    cont.querySelectorAll('.hme-in').forEach(inp => {
      inp.addEventListener('input', () => {
        const c = estadoEdit.def.campos[+inp.dataset.i];
        if (!c) return;
        c[inp.dataset.f] = inp.dataset.f === 'etiqueta'
          ? inp.value
          : (parseFloat(inp.value) || (inp.dataset.f === 'w' ? 14 : 6));
        // SIN re-render: se actualiza el chip en vivo y el foco/teclado se conserva (móvil incluido)
        const chip = visorChipDe(inp.dataset.i);
        if (chip) {
          if (inp.dataset.f === 'w' || inp.dataset.f === 'h') {
            chip.style.width = (c.w || 14) + '%';
            chip.style.height = (c.h || 6) + '%';
          } else {
            chip.textContent = c.etiqueta || ('Cuadro ' + (+inp.dataset.i + 1));
          }
        }
      });
    });
  }

  // Devuelve el chip (cuadro sobre la imagen) del índice dado
  function visorChipDe(i) {
    const visor = document.getElementById('hme-visor');
    if (!visor) return null;
    return visor.querySelectorAll('.hme-chip')[+i] || null;
  }

  window.HOJA_MEDIDAS._delCampo = function (i) {
    estadoEdit.def.campos.splice(i, 1);
    pintarLista(); pintarEditorCampos(true);
  };
  // Parche: _delCampo debe vivir en el módulo real (se ejecutaba contra el objeto vacío inicial)
  window.HOJA_MEDIDAS._delCampoHOJA = function (i) {
    estadoEdit.def.campos.splice(i, 1);
    pintarLista(); pintarEditorCampos(true);
  };

  function pintarEditor() {
    const visor = document.getElementById('hme-visor');
    if (!visor) return;
    // En móvil: visor más pequeño para que quepa en pantalla sin cortes
    const maxAncho = 1100; // en PC visor grande; en móvil el CSS lo limita al ancho de pantalla
    const src = estadoEdit.imagenBase64 || estadoEdit.def?.imagenUrl;
    if (!src) {
      visor.innerHTML = '<div style="padding:50px;text-align:center;color:#94a3b8"><i class="fas fa-image" style="font-size:30px;display:block;margin-bottom:10px"></i>Sube la imagen de la plantilla para empezar a colocar los cuadros</div>';
      pintarLista();
      return;
    }
    visor.innerHTML = '';
    const img = new Image();
    img.onload = () => {
      visor.style.aspectRatio = img.width + ' / ' + img.height;
      visor.style.maxWidth = Math.min(maxAncho, img.width * 1.6) + 'px'; // visor grande en el editor (limitado en móvil)
      visor.style.margin = '0 auto';
      visor.style.padding = '0'; // sin padding: el % de los cuadros es sobre la imagen exacta
      visor.style.boxSizing = 'content-box';
      img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px;pointer-events:none';
      visor.appendChild(img);
      pintarEditorCampos();
      ajustarVisorEdit();
    };
    img.src = src;
  }

  function pintarEditorCampos(sinLista) {
    const visor = document.getElementById('hme-visor');
    if (!visor) return;
    visor.querySelectorAll('.hme-chip').forEach(el => el.remove());
    const src = estadoEdit.imagenBase64 || estadoEdit.def?.imagenUrl;
    if (!src) { pintarLista(); return; }
    if (!visor.querySelector('img')) { pintarLista(); return; }
    estadoEdit.def.campos.forEach((c, i) => {
      const chip = document.createElement('div');
      chip.className = 'hme-chip';
      chip.style.cssText = 'position:absolute;left:' + c.x + '%;top:' + c.y + '%;width:' + (c.w || 14) + '%;height:' + (c.h || 6) + '%;background:rgba(56,189,248,.25);border:1.5px dashed #0284c7;border-radius:4px;padding:2px 4px;font-size:11px;font-weight:700;color:#0c4a6e;cursor:grab;user-select:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      chip.textContent = c.etiqueta || ('Cuadro ' + (i + 1));
      chip.addEventListener('pointerdown', e => {
        e.preventDefault();
        chip.setPointerCapture(e.pointerId);
        // Guardar el offset del punto agarrado DENTRO del cuadro: el cuadro no "salta"
        const r = visor.querySelector('img').getBoundingClientRect();
        estadoEdit.arrastrando = {
          i, chip,
          dxPct: ((e.clientX - r.left) / r.width * 100) - (c.x || 0),
          dyPct: ((e.clientY - r.top) / r.height * 100) - (c.y || 0)
        };
      });
      chip.addEventListener('pointermove', e => {
        if (!estadoEdit.arrastrando || estadoEdit.arrastrando.chip !== chip) return;
        const c2 = estadoEdit.def.campos[i];
        const r = visor.querySelector('img').getBoundingClientRect(); // % sobre la IMAGEN, no sobre el contenedor
        const nx = Math.max(0, Math.min(100 - (c2.w || 14), ((e.clientX - r.left) / r.width * 100) - estadoEdit.arrastrando.dxPct));
        const ny = Math.max(0, Math.min(100 - (c2.h || 6), ((e.clientY - r.top) / r.height * 100) - estadoEdit.arrastrando.dyPct));
        estadoEdit.def.campos[i].x = Math.round(nx * 10) / 10;
        estadoEdit.def.campos[i].y = Math.round(ny * 10) / 10;
        chip.style.left = estadoEdit.def.campos[i].x + '%';
        chip.style.top = estadoEdit.def.campos[i].y + '%';
      });
      chip.addEventListener('pointerup', () => {
        estadoEdit.arrastrando = null;
        pintarLista(); // sincroniza por si acaso
      });
      // Ajuste fino con flechas cuando el chip tiene el foco
      chip.tabIndex = 0;
      chip.addEventListener('keydown', e => {
        const paso = e.shiftKey ? 1 : 0.2; // Shift = paso grande
        const c2 = estadoEdit.def.campos[i];
        if (!c2) return;
        let usado = true;
        if (e.key === 'ArrowLeft') c2.x = Math.max(0, c2.x - paso);
        else if (e.key === 'ArrowRight') c2.x = Math.min(100 - (c2.w || 14), c2.x + paso);
        else if (e.key === 'ArrowUp') c2.y = Math.max(0, c2.y - paso);
        else if (e.key === 'ArrowDown') c2.y = Math.min(100 - (c2.h || 6), c2.y + paso);
        else usado = false;
        if (usado) {
          e.preventDefault();
          chip.style.left = c2.x + '%';
          chip.style.top = c2.y + '%';
        }
      });
      // Botones de flecha (ajuste fino con ratón / táctil)
      ['up','down','left','right'].forEach(dir => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hme-nudge';
        b.innerHTML = {up:'&#9650;', down:'&#9660;', left:'&#9664;', right:'&#9654;'}[dir];
        b.title = 'Mover ' + dir;
        b.style.cssText = 'position:absolute;width:16px;height:16px;line-height:14px;font-size:9px;padding:0;border:1px solid #15803d;background:#16a34a;color:#fff;border-radius:3px;cursor:pointer;z-index:5;' +
          (dir==='up' ? 'top:-9px;left:calc(50% - 8px);' : dir==='down' ? 'bottom:-9px;left:calc(50% - 8px);' : dir==='left' ? 'left:-9px;top:calc(50% - 8px);' : 'right:-9px;top:calc(50% - 8px);');
        b.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); });
        b.addEventListener('click', ev => {
          ev.preventDefault(); ev.stopPropagation();
          const c2 = estadoEdit.def.campos[i]; if (!c2) return;
          const paso = 0.2;
          if (dir==='left') c2.x = Math.max(0, c2.x - paso);
          else if (dir==='right') c2.x = Math.min(100 - (c2.w||14), c2.x + paso);
          else if (dir==='up') c2.y = Math.max(0, c2.y - paso);
          else c2.y = Math.min(100 - (c2.h||6), c2.y + paso);
          chip.style.left = c2.x + '%'; chip.style.top = c2.y + '%';
        });
        chip.appendChild(b);
      });
      visor.appendChild(chip);
    });
    if (!sinLista) pintarLista();
  }

  async function guardarEditor() {
    const def = estadoEdit.def;
    def.tipoPuerta = estadoEdit.tipoNombre;
    if (estadoEdit.imagenBase64) {
      const url = await subirImagenHoja(estadoEdit.imagenBase64);
      if (url) def.imagenUrl = url;
      else def.imagenUrl = estadoEdit.imagenBase64; // respaldo base64 si no hay red
    }
    if (!def.imagenUrl) { showToast('Sube primero la imagen de la plantilla', 'error'); return; }
    if (!(def.campos || []).length) { showToast('Añade al menos un cuadro de texto', 'error'); return; }
    const btn = document.getElementById('hme-guardar');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      def.id = await guardarDefPlantilla(def);
      showToast('✅ Plantilla guardada para "' + def.tipoPuerta + '"', 'success');
      document.getElementById('hm-edit-modal')?.remove();
      if (estadoEdit.onGuardar) estadoEdit.onGuardar(def);
    } catch (e) {
      console.error('[HojaMedidas] guardar plantilla:', e);
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar plantilla';
    }
  }

  // ════════════════ VISTA DE ADMINISTRACIÓN (solo lectura) ════════════════
  function abrirVista(medidas) {
    if (!medidas || medidas.sistema !== 'hoja-v1') { showToast('Este presupuesto no tiene hoja de medidas adjunta', 'info'); return; }
    const html = `
    <div id="hm-view-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:980px;width:100%;max-height:96vh;display:flex;flex-direction:column">
        <div class="modal-header"><h2 style="font-size:17px"><i class="fas fa-ruler-combined"></i> Hoja de medidas — ${esc(medidas.tipoNombre || '')}</h2>
          <button type="button" class="btn-close-x" onclick="document.getElementById('hm-view-modal').remove()">✕</button></div>
        <div style="overflow:auto;padding:14px">
          <div id="hm-view-visor" style="position:relative;width:100%;max-width:860px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15)"></div>
          <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Tomada el ${esc(medidas.fecha || '')} por ${esc(medidas.tecnico || '—')}</div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const visor = document.getElementById('hm-view-visor');
    const img = new Image();
    img.onload = () => {
      visor.style.aspectRatio = img.width + ' / ' + img.height;
      visor.style.maxWidth = Math.min(860, img.width) + 'px';
      visor.style.margin = '0 auto';
      visor.style.padding = '0';
      visor.style.boxSizing = 'content-box';
      img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
      visor.appendChild(img);
      const capa = document.createElement('div');
      capa.style.cssText = 'position:absolute;inset:0';
      (medidas.campos || []).forEach(c => {
        const v = String(medidas.valores?.[c.id] ?? '').trim();
        if (!v) return;
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;left:' + c.x + '%;top:' + c.y + '%;width:' + (c.w || 14) + '%;height:' + (c.h || 6) + '%;font-size:clamp(10px,1.6vw,14px);font-weight:800;color:#0f172a;text-align:center;display:flex;align-items:center;justify-content:center;text-shadow:0 0 3px #fff,0 0 3px #fff;box-sizing:border-box';
        div.textContent = v;
        capa.appendChild(div);
      });
      visor.appendChild(capa);
    };
    img.onerror = () => {
      visor.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> No se pudo cargar la imagen de la hoja de medidas</div>';
    };
    img.src = medidas.imagenUrl || '';
  }

  // ── API pública ──
  Object.assign(window.HOJA_MEDIDAS, {
    abrirHoja, abrirEditor, abrirVista, cerrar,
    cargarPlantillaDeTipo, PLANTILLAS_INCLUIDAS
  });
  return window.HOJA_MEDIDAS;
})();
