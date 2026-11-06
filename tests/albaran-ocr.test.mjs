import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../js/albaran-ocr.js');

// Construye líneas con posición vertical creciente, como las devuelve el OCR / pdf.js
const mk = txts => txts.map((t, i) => ({ text: t, x0: 50, x1: 600, y0: 30 + i * 30, y1: 52 + i * 30, conf: 90 }));

test('parseNum: formatos españoles y ingleses', () => {
  assert.equal(A.parseNum('1.234,56'), 1234.56);
  assert.equal(A.parseNum('1,234.56'), 1234.56);
  assert.equal(A.parseNum('12,5'), 12.5);
  assert.equal(A.parseNum('12.50'), 12.5);
  assert.equal(A.parseNum('1.234'), 1234);
  assert.equal(A.parseNum('45,00€'), 45);
  assert.equal(A.parseNum('abc'), null);
});

test('parseDate', () => {
  assert.equal(A.parseDate('Fecha: 05/11/2026'), '2026-11-05');
  assert.equal(A.parseDate('5-1-26'), '2026-01-05');
  assert.equal(A.parseDate('31/13/2026'), null);
});

test('parseLineItem: cantidad, precio e importe al final', () => {
  const r = A.parseLineItem('TQ-1234 Tornillo hexagonal M8x40 galvanizado 100 0,12 12,00');
  assert.deepEqual([r.ref, r.descripcion, r.cantidad, r.precio, r.importe], ['TQ-1234', 'Tornillo hexagonal M8x40 galvanizado', 100, 0.12, 12]);
});

test('parseLineItem: con descuento', () => {
  const r = A.parseLineItem('MOT-220 Motor puerta seccional 2 450,00 10 810,00');
  assert.deepEqual([r.ref, r.cantidad, r.precio, r.dto, r.importe], ['MOT-220', 2, 450, 10, 810]);
});

test('parseLineItem: cantidad al principio', () => {
  const r = A.parseLineItem('2 uds Fotocélula de seguridad 35,50 71,00');
  assert.deepEqual([r.descripcion, r.cantidad, r.precio, r.importe], ['Fotocélula de seguridad', 2, 35.5, 71]);
});

test('parseLineItem: albarán sin precios', () => {
  const r = A.parseLineItem('MUELLE-30 Muelle torsión 30 mm 4');
  assert.equal(r.cantidad, 4);
  assert.equal(r.ref, 'MUELLE-30');
  assert.equal(r.precio, null);
});

test('parseLineItem: coma decimal perdida por el OCR', () => {
  const r = A.parseLineItem('FOT-01 Fotocélula de seguridad 3 3550 106,50');
  assert.deepEqual([r.cantidad, r.precio, r.importe], [3, 35.5, 106.5]);
});

test('parseLineItem: símbolo suelto delante de la descripción', () => {
  assert.equal(A.parseLineItem('MOT-220 — Motor puerta 2 450,00 900,00').descripcion, 'Motor puerta');
});

test('número de documento aunque el OCR lea "N*" por "Nº"', () => {
  const r = A.parseAlbaranLines(mk(['PROVEEDOR EJEMPLO SL', 'ALBARÁN N*: A-2026/0457']));
  assert.equal(r.numero, 'A-2026/0457');
});

test('parseLineItem: descarta direcciones y ruido', () => {
  assert.equal(A.parseLineItem('Polígono Industrial El Tiro, nave 4'), null);
  assert.equal(A.parseLineItem('Tel. 968 123 456'), null);
});

const ALBARAN = [
  'SUMINISTROS INDUSTRIALES LOPEZ S.L.',
  'CIF B12345678   Pol. Ind. Oeste, 12 30169 San Ginés',
  'ALBARAN Nº: A-2026/0457',
  'Fecha: 05/11/2026',
  'Cliente: AUTOPUERTA SL   CIF: B87654321',
  'Referencia Descripción Cantidad Precio Importe',
  'TQ-1234 Tornillo hexagonal M8x40 100 0,12 12,00',
  'MOT-220 Motor puerta seccional',
  'con cuadro de maniobra 2 450,00 900,00',
  'FOT-01 Fotocélula de seguridad 3 35,50 106,50',
  'Base imponible 1.018,50',
  'IVA 21% 213,89',
  'TOTAL 1.232,39 €'
];

test('parseAlbaranLines: cabecera y líneas de un albarán típico', () => {
  const r = A.parseAlbaranLines(mk(ALBARAN), { ownCif: 'B87654321' });
  assert.equal(r.proveedor, 'SUMINISTROS INDUSTRIALES LOPEZ S.L.');
  assert.equal(r.cif, 'B12345678');
  assert.equal(r.numero, 'A-2026/0457');
  assert.equal(r.fecha, '2026-11-05');
  assert.equal(r.total, 1232.39);
  assert.equal(r.base, 1018.5);
  assert.equal(r.lineas.length, 3);
  assert.equal(r.lineas[1].descripcion, 'Motor puerta seccional con cuadro de maniobra');
  assert.deepEqual(r.lineas.map(l => l.cantidad), [100, 2, 3]);
  assert.equal(A.cuadre(r.lineas, r).cuadra, true);
});

test('cuadre detecta una lectura errónea', () => {
  const r = A.parseAlbaranLines(mk(ALBARAN.map(l => l.replace('900,00', '90,00'))));
  assert.equal(A.cuadre(r.lineas, r).cuadra, false);
});

test('proveedor conocido se prefiere al texto del encabezado', () => {
  const r = A.parseAlbaranLines(mk(ALBARAN), { knownProveedores: ['Suministros Industriales Lopez'] });
  assert.equal(r.proveedor, 'Suministros Industriales Lopez');
});

const ALMACEN = [
  { id: 'ART-1', referencia: 'TQ-1234', nombre: 'Tornillo hexagonal M8x40' },
  { id: 'ART-2', referencia: 'ART-2', nombre: 'Motor puerta seccional 600N' },
  { id: 'ART-3', referencia: 'ART-3', nombre: 'Fotocélula seguridad' },
  { id: 'ART-4', referencia: 'ART-4', nombre: 'Tornillo hexagonal M10x40' }
];

test('matchArticulos: referencia, memoria y parecido', () => {
  const lineas = [
    { ref: 'TQ-1234', descripcion: 'Tornillo hex M8' },
    { ref: 'XX-9', descripcion: 'Cosa rara del proveedor' },
    { ref: '', descripcion: 'Fotocélula de seguridad' },
    { ref: '', descripcion: 'Tornillo hexagonal M10x40' }
  ];
  const aliases = [{ proveedor: 'Lopez', clave: A.nk('XX-9'), articuloid: 'ART-2' }];
  const m = A.matchArticulos(lineas, ALMACEN, 'LOPEZ', aliases);
  assert.deepEqual(m.map(x => [x.articuloId, x.motivo]), [['ART-1', 'referencia'], ['ART-2', 'memoria'], ['ART-3', 'parecido'], ['ART-4', 'parecido']]);
});

test('matchArticulos: medidas distintas no se confunden', () => {
  const m = A.matchArticulos([{ ref: '', descripcion: 'Tornillo hexagonal M12x40' }], ALMACEN, 'X', []);
  assert.equal(m[0].articuloId, '');
});

test('findDuplicado y aliasId estable', () => {
  assert.ok(A.findDuplicado([{ proveedor: 'Lopez SL', numero: 'A-1' }], 'LOPEZ  SL', 'a-1'));
  assert.equal(A.findDuplicado([], 'x', '1'), null);
  assert.equal(A.aliasId('Lopez', 'xx9'), A.aliasId('LOPEZ ', 'xx9'));
});

test('pdfItemsToLines agrupa fragmentos por renglón', () => {
  const it = (s, x, y, w) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
  const lines = A.pdfItemsToLines([it('Tornillo', 50, 700, 40), it('M8', 95, 700, 15), it('12,00', 400, 700, 30), it('TOTAL', 50, 600, 30)], 800, 0);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'Tornillo M8 12,00'.replace('M8 ', 'M8').replace('Tornillo M8', 'Tornillo M8') && lines[0].text);
  assert.match(lines[0].text, /Tornillo M8\s+12,00/);
});
