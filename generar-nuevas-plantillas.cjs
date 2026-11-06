// Añade las plantillas corredera_cristal y rapida_apilable a js/medidas-datos.js
// Coordenadas de las casillas impresas, medidas sobre imágenes de 1536×1024.
const fs = require('fs');
const ruta = 'js/medidas-datos.js';

const d = fs.readFileSync(ruta, 'utf8');
const i = d.indexOf('{');
const obj = JSON.parse(d.slice(i, d.lastIndexOf(';')));

function cNum(id, etiqueta, corto, unidad, x, y, w, h, espejos, alias) {
  const f = { id, etiqueta, corto, tipo: 'num', unidad, x, y, w, h };
  if (espejos && espejos.length) f.espejos = espejos;
  if (alias) f.alias = alias;
  return f;
}
function cTxt(id, etiqueta, x, y, w, h, ml, alias) {
  const f = { id, etiqueta, corto: String(etiqueta).split(' (')[0], tipo: 'texto', x, y, w, h };
  if (ml) f.ml = true;
  if (alias) f.alias = alias;
  return f;
}

// ═══ CORREDERA DE CRISTAL ═══
// Cada cuadro coincide con el borde azul de la casilla de la imagen.
obj.corredera_cristal = {
  nombre: 'Corredera Cristal',
  imagen: 'plantillas/plantillacorrederacristal.webp',
  ratio: [1536, 1024],
  campos: [
    cNum('ancho', 'Ancho total de la puerta (A)', 'Ancho total (A)', 'mm', 89.84, 14.06, 8.98, 3.61,
      [{ x: 23.63, y: 13.38, w: 7.94, h: 3.12 }], ['a_ancho']),
    cNum('alto', 'Alto total de la puerta (B)', 'Alto total (B)', 'mm', 89.84, 18.26, 8.98, 3.61,
      [{ x: 1.37, y: 41.60, w: 7.29, h: 3.12 }, { x: 53.26, y: 41.60, w: 5.47, h: 3.12 }], ['b_alto']),
    cNum('ancho_libre', 'Ancho libre de paso (D)', 'Ancho libre (D)', 'mm', 89.84, 22.46, 8.98, 3.61,
      [{ x: 24.54, y: 37.21, w: 6.71, h: 3.12 }]),
    cNum('alto_libre', 'Alto libre de paso (E)', 'Alto libre (E)', 'mm', 89.84, 26.66, 8.98, 3.61,
      [{ x: 41.86, y: 43.46, w: 6.18, h: 3.12 }]),
    cNum('espacio_izq', 'Espacio lateral izquierdo (F)', 'Lateral izq. (F)', 'mm', 89.84, 30.86, 8.98, 3.52,
      [{ x: 3.06, y: 67.48, w: 6.25, h: 3.22 }]),
    cNum('espacio_der', 'Espacio lateral derecho (G)', 'Lateral dcho. (G)', 'mm', 89.84, 35.06, 8.98, 3.52,
      [{ x: 45.25, y: 67.48, w: 5.53, h: 3.22 }]),
    cNum('fondo_guia', 'Fondo necesario con recogida (H)', 'Fondo necesario (H)', 'mm', 89.84, 39.26, 8.98, 3.52,
      [{ x: 58.98, y: 19.04, w: 5.40, h: 3.22 }]),
    cNum('ancho_perfil', 'Ancho de perfil guía (I)', 'Ancho perfil (I)', 'mm', 89.84, 43.36, 8.98, 3.61,
      [{ x: 58.59, y: 69.14, w: 5.92, h: 2.64 }]),
    // Detalles inferiores
    cNum('alt_cajon', 'Altura del cajón (J)', 'Altura del cajón (J)', 'mm', 11.78, 86.52, 4.69, 3.12),
    cNum('alt_guia', 'Altura de la guía (K)', 'Altura de la guía (K)', 'mm', 27.80, 88.57, 5.01, 3.12),
    cNum('grosor_cristal', 'Grosor del cristal (L)', 'Grosor del cristal (L)', 'mm', 42.12, 93.75, 6.32, 2.15),
    cNum('ancho_perfil_lat', 'Ancho del perfil lateral (M)', 'Ancho perfil lateral (M)', 'mm', 67.97, 89.45, 8.33, 3.42),
    // OTROS DATOS IMPORTANTES
    cTxt('apertura', 'Tipo de apertura', 82.88, 53.42, 15.95, 3.61),
    cTxt('velocidad', 'Velocidad aproximada', 82.88, 57.62, 15.95, 3.61),
    cTxt('alimentacion', 'Alimentación eléctrica (V/Hz)', 82.88, 61.82, 15.95, 3.71),
    cTxt('observaciones', 'Observaciones', 82.88, 66.11, 15.95, 11.91, true, ['f_notas'])
  ]
};

// ═══ PUERTA RÁPIDA APILABLE ═══
// Cada cuadro coincide con el borde azul de la casilla de la imagen.
obj.rapida_apilable = {
  nombre: 'Puerta Rápida Apilable',
  imagen: 'plantillas/plantillarapidaapilable.webp',
  ratio: [1536, 1024],
  campos: [
    cNum('ancho', 'Ancho total de la puerta (A)', 'Ancho total (A)', 'mm', 89.84, 15.14, 8.79, 4.20,
      [{ x: 25.52, y: 15.43, w: 8.33, h: 3.32 }], ['a_ancho']),
    cNum('alto', 'Alto total de la puerta (B)', 'Alto total (B)', 'mm', 89.84, 20.61, 8.79, 4.30,
      [{ x: 1.37, y: 42.58, w: 6.90, h: 3.42 }], ['b_alto']),
    cNum('alto_libre', 'Alto libre de paso (C)', 'Alto libre (C)', 'mm', 89.84, 25.98, 8.85, 4.30,
      [{ x: 50.20, y: 41.89, w: 6.25, h: 3.71 }], ['c_luz']),
    cNum('ancho_libre', 'Ancho libre de paso (D)', 'Ancho libre (D)', 'mm', 89.84, 31.35, 8.85, 4.30,
      [{ x: 23.96, y: 65.62, w: 8.14, h: 3.52 }]),
    cNum('ancho_guias', 'Altura de mandos (E)', 'Altura de mandos (E)', 'mm', 89.91, 36.62, 8.79, 4.20,
      [{ x: 45.31, y: 53.03, w: 5.79, h: 3.42 }]),
    cNum('fondo', 'Profundidad necesaria (F)', 'Profundidad necesaria (F)', 'cm', 89.91, 41.89, 8.79, 3.91,
      [{ x: 56.84, y: 70.41, w: 6.32, h: 2.93 }]),
    cNum('ancho_guia', 'Ancho de guía (aprox.)', 'Ancho de guía', 'cm', 11.59, 85.84, 7.68, 3.42),
    cNum('altura_panel', 'Altura de panel (aprox.)', 'Altura de panel', 'cm', 35.42, 87.50, 7.03, 3.42),
    cNum('altura_zocalo', 'Altura de zócalo (si lleva)', 'Altura de zócalo', 'cm', 58.33, 87.50, 7.75, 3.42),
    // OTROS DATOS IMPORTANTES
    cTxt('apertura', 'Tipo de apertura', 83.79, 52.73, 14.97, 4.30),
    cTxt('velocidad', 'Velocidad aproximada', 83.79, 58.01, 14.97, 4.20),
    cTxt('alimentacion', 'Alimentación eléctrica (V/Hz)', 83.79, 63.28, 14.97, 5.08),
    cTxt('observaciones', 'Observaciones', 83.79, 69.43, 14.97, 13.18, true, ['f_notas'])
  ]
};

const cabecera = d.slice(0, i);
fs.writeFileSync(ruta, cabecera + 'window.MEDIDAS_PLANTILLAS_BASE = ' + JSON.stringify(obj) + ';\n');
console.log('Plantillas:', Object.keys(obj).join(', '));
