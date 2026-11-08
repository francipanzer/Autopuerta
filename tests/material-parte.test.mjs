// Parte de trabajo: buscador de artículos del almacén (en lugar de un desplegable de miles de opciones)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function cargar() {
  const W = { isAdmin: () => false, isTechnician: () => true };
  const sb = { window: W, console, document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } }, escapeHtml: s => String(s ?? '') };
  sb.globalThis = sb; vm.createContext(sb);
  try { vm.runInContext(fs.readFileSync(new URL('../js/pages_partes.js', import.meta.url), 'utf8'), sb); } catch (e) { /* solo interesan las funciones */ }
  return W;
}
const W = cargar();
const art = (id, nombre, extra = {}) => ({ id, nombre, sageCodigo: id.replace('ART-', ''), stock: 1, ...extra });
const lista = [
  art('ART-PU000290', 'Acoplamiento fijo acero galvanizado 1" Hexa 32mm', { familia: 'MERCADERIAS' }),
  art('ART-BM000003', 'Motor 400N seccional'),
  art('ART-BM000004', 'Motor rápido 230V', { descripcion: 'Motor para puerta rápida enrollable' }),
  art('ART-ZZ000001', 'Artículo antiguo motor', { baja: true }),
  art('ART-ELK00007', 'Accionamiento de emergencia manual de cadena KNH 4m')
];
const ids = r => JSON.parse(JSON.stringify(r.items.map(a => a.id)));

test('el buscador encuentra por código, por nombre y por varias palabras sin distinguir acentos ni mayúsculas', () => {
  assert.deepEqual(ids(W.buscarArticulosMaterial(lista, 'pu000290')), ['ART-PU000290']);
  assert.deepEqual(ids(W.buscarArticulosMaterial(lista, 'ACOPLAMIENTO hexa')), ['ART-PU000290']);
  assert.deepEqual(ids(W.buscarArticulosMaterial(lista, 'rapido motor')), ['ART-BM000004']);       // «rápido» sin tilde, palabras en otro orden
  assert.deepEqual(ids(W.buscarArticulosMaterial(lista, 'zzzz')), []);
  assert.equal(W.buscarArticulosMaterial(lista, '   ').total, 0);
});

test('no ofrece artículos de baja y pone primero el código exacto y lo que empieza igual', () => {
  const r = W.buscarArticulosMaterial(lista, 'motor');
  assert.ok(!ids(r).includes('ART-ZZ000001'));
  assert.deepEqual(ids(r), ['ART-BM000003', 'ART-BM000004']);                                         // empiezan por «Motor»; ordenados por nombre
  assert.deepEqual(ids(W.buscarArticulosMaterial(lista, 'BM000004')), ['ART-BM000004']);
});

test('limita los resultados pero informa del total', () => {
  const muchos = Array.from({ length: 50 }, (_, i) => art('ART-X' + i, 'Rueda ' + i));
  const r = W.buscarArticulosMaterial(muchos, 'rueda', 8);
  assert.equal(r.items.length, 8); assert.equal(r.total, 50);
});

test('buscador de clientes del parte: palabras en cualquier orden, sin tildes, lo que empieza igual primero', () => {
  const clientes = [{ value: '1', label: 'Panadería López' }, { value: '2', label: 'López e hijos, S.L.' }, { value: '3', label: 'Taller Pérez' }, { value: '4', label: 'DOTICS Murcia' }];
  const v = r => JSON.parse(JSON.stringify(r.items.map(o => o.value)));
  assert.deepEqual(v(W.ptBuscarOpciones(clientes, 'lopez')), ['2', '1']);          // «López e hijos» empieza por lo escrito
  assert.deepEqual(v(W.ptBuscarOpciones(clientes, 'perez taller')), ['3']);
  assert.deepEqual(v(W.ptBuscarOpciones(clientes, 'dotics')), ['4']);
  assert.equal(W.ptBuscarOpciones(clientes, '  ').total, 0);
});

test('el botón Eliminar de la ficha del parte no rompe su atributo onclick con comillas dobles', () => {
  const src = fs.readFileSync(new URL('../js/pages_partes.js', import.meta.url), 'utf8');
  assert.ok(!/onclick="[^"\n]*JSON\.stringify/.test(src));
});
