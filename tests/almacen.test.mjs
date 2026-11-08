// Almacén: paginación de 20 en 20, búsqueda por campo / familia y códigos de artículo manuales
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function entorno(items) {
  const els = {};
  const el = id => (els[id] ||= { id, value: '', checked: false, innerHTML: '', options: [{}], add(o) { this.options.push(o); }, insertAdjacentHTML(_, h) { this.innerHTML += h; }, addEventListener() {} });
  const toasts = [];
  const W = { isAdmin: () => true, TiposPuerta: { filasDB: async () => [] }, articuloStockBajo: a => a.controlStock !== false && Number(a.stockMinimo) > 0 && Number(a.stock) <= Number(a.stockMinimo) };
  const sb = { window: W, console, document: { getElementById: el }, escapeHtml: s => String(s ?? ''), formatCurrency: n => String(n), Option: function (t, v) { this.text = t; this.value = v; },
    dbGetAll: async () => items, showToast: (m, k) => toasts.push([m, k]), clearTimeout, setTimeout: f => { f(); return 0; } };
  sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(new URL('../js/pages_almacen.js', import.meta.url), 'utf8'), sb);
  return { W, el, toasts };
}
const filas = html => (html.match(/data-art-row=/g) || []).length;
const arts = Array.from({ length: 45 }, (_, i) => ({ id: 'A' + i, sageCodigo: (i % 2 ? 'PU' : 'BM') + String(i).padStart(6, '0'), nombre: 'Artículo ' + String(i).padStart(2, '0'), familia: i % 3 ? 'MERCADERIAS' : 'PUERTAS RAPIDAS', proveedor: i === 7 ? 'Elka' : '', stock: 0, stockMinimo: 0 }));

test('el almacén muestra 20 artículos y «Mostrar más» / «Mostrar menos» avanzan de 20 en 20', async () => {
  const { W, el } = entorno(arts);
  W.__artVisibles = 20;
  await W.renderAlmacen();
  let h = el('artBody').innerHTML;
  assert.equal(filas(h), 20); assert.match(h, /Mostrando 20 de 45/); assert.match(h, /Mostrar más/); assert.doesNotMatch(h, /Mostrar menos/);
  W.artMas(); await new Promise(r => setImmediate(r)); h = el('artBody').innerHTML;
  assert.equal(filas(h), 40); assert.match(h, /Mostrar menos/);
  W.artMas(); await new Promise(r => setImmediate(r)); h = el('artBody').innerHTML;
  assert.equal(filas(h), 45); assert.doesNotMatch(h, /Mostrar más/);
  W.artMenos(); await new Promise(r => setImmediate(r)); h = el('artBody').innerHTML;
  assert.equal(filas(h), 40);
});

test('buscar por campo y por familia reinicia la paginación', async () => {
  const { W, el } = entorno(arts);
  W.__artVisibles = 40;
  el('searchArt').value = 'elka'; el('searchCampoArt').value = 'proveedor';
  W.artReset(); await new Promise(r => setImmediate(r));
  assert.equal(filas(el('artBody').innerHTML), 1);
  el('searchCampoArt').value = 'nombre';                       // «elka» no está en ningún nombre
  W.artReset(); await new Promise(r => setImmediate(r));
  assert.equal(filas(el('artBody').innerHTML), 0);
  el('searchArt').value = 'pu0000'; el('searchCampoArt').value = 'codigo';
  W.artReset(); await new Promise(r => setImmediate(r));
  assert.equal(filas(el('artBody').innerHTML), 20);            // PU000001… impares: 22 → muestra 20
  el('searchArt').value = ''; el('searchCampoArt').value = 'todos'; el('filterFamArt').value = 'PUERTAS RAPIDAS';
  W.artReset(); await new Promise(r => setImmediate(r));
  assert.equal(filas(el('artBody').innerHTML), 15);
  assert.equal(el('filterFamArt').options.length, 3);          // «Todas» + 2 familias
});

test('siguiente código libre por prefijo, con 8 caracteres como Sage', () => {
  const { W } = entorno([]);
  const lista = [{ sageCodigo: 'PU000290' }, { sageCodigo: 'PU000612' }, { sageCodigo: 'BM000003' }, { sageCodigo: 'PUX00099' }, { sageCodigo: 'NAV01' }];
  assert.equal(W.siguienteCodigoArticulo('PU', lista), 'PU000613');
  assert.equal(W.siguienteCodigoArticulo('BM', lista), 'BM000004');
  assert.equal(W.siguienteCodigoArticulo('ZZ', lista), 'ZZ000001');
  assert.equal(W.siguienteCodigoArticulo('SEC', lista), 'SEC00001');
});
