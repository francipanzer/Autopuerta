// Artículos de Sage 50 → almacén (js/almacen-sage.js): lectura, clave común, stock bidireccional
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function cargar() {
  const win = { addEventListener() {} };
  const sb = { window: win, console, document: {}, escapeHtml: s => String(s ?? '') };
  sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(new URL('../js/almacen-sage.js', import.meta.url), 'utf8'), sb);
  return win.AlmacenSage;
}
const S = cargar();
const J = x => JSON.parse(JSON.stringify(x));

const CAB = ['Código', 'Nombre', 'Marca', 'Nombre marca', 'Familia', 'Nombre familia', 'Subfamilia', 'Nombre subfamilia', 'Código alternativo', 'Localización', 'Ampliación definición', 'Observaciones', 'Tipo artículo', 'Baja', 'Fecha baja'];
const fila = (o = {}) => CAB.map(c => o[c] ?? '');
const rows = lista => [CAB, ...lista];

test('lee el informe de Sage: el nombre genérico «ARTÍCULO IMPORTADO» se sustituye por la ampliación', () => {
  const r = S.parseFilas(rows([
    fila({ 'Código': 'FS000001', 'Nombre': 'ARTÍCULO IMPORTADO', 'Familia': '00', 'Nombre familia': 'MERCADERIAS', 'Ampliación definición': 'Aceite hidráulico', 'Baja': false }),
    fila({ 'Código': 'AL000011', 'Nombre': 'Abrigo Hinchable  3500x800', 'Familia': '00', 'Nombre familia': 'MERCADERIAS', 'Ampliación definición': 'ABRIGO HINCHABLE MOD. 3.7\nMOTOR 230VAC', 'Baja': false })
  ]));
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].nombre, 'Aceite hidráulico');
  assert.equal(r.filas[0].descripcion, '');                          // era el mismo texto que el nombre
  assert.equal(r.filas[1].nombre, 'Abrigo Hinchable 3500x800');      // espacios dobles limpiados
  assert.match(r.filas[1].descripcion, /MOTOR 230VAC/);
  assert.equal(r.nombresDeAmpliacion, 1);
  assert.equal(r.columnas.stock, false);                             // este informe no trae existencias
});

test('sin la opción, conserva el nombre original', () => {
  const r = S.parseFilas(rows([fila({ 'Código': 'X1', 'Nombre': 'ARTÍCULO IMPORTADO', 'Ampliación definición': 'Gasoil' })]), { nombreDeAmpliacion: false });
  assert.equal(r.filas[0].nombre, 'ARTÍCULO IMPORTADO');
});

test('baja, fecha, servicios sin control de stock y datos extra sin columna propia', () => {
  const r = S.parseFilas(rows([
    fila({ 'Código': 'ARC00001', 'Nombre': 'Viejo', 'Baja': 'True', 'Fecha baja': new Date(2024, 7, 22) }),
    fila({ 'Código': 'MO1', 'Nombre': 'Hora técnico', 'Familia': '02', 'Nombre familia': 'MANO DE OBRA' }),
    fila({ 'Código': 'P1', 'Nombre': 'Motor', 'Marca': 'ELK', 'Nombre marca': 'Elka', 'Familia': '00', 'Nombre familia': 'MERCADERIAS' })
  ]));
  assert.equal(r.filas[0].baja, true); assert.equal(r.filas[0].fechaBaja, '2024-08-22');
  assert.equal(r.filas[1].controlStock, false);
  assert.equal(r.filas[2].controlStock, true);
  assert.deepEqual(J(r.filas[2].sageDatos), { marca: 'ELK', nombreMarca: 'Elka' });
});

test('códigos repetidos exactos no duplican (las mayúsculas sí distinguen); sin código se omite', () => {
  const r = S.parseFilas(rows([
    fila({ 'Código': 'NI000062', 'Nombre': 'A' }), fila({ 'Código': 'NI000062', 'Nombre': 'B' }), fila({ 'Código': 'ni000062', 'Nombre': 'C' }), fila({ 'Nombre': 'sin código' })
  ]));
  assert.equal(r.filas.length, 2); assert.deepEqual(J(r.filas.map(f => f.nombre)), ['B', 'C']);
  assert.deepEqual(J(S.planificar(r.filas, []).nuevos.map(a => a.id)), ['ART-NI000062', 'ART-ni000062']);
  assert.ok(r.avisos.some(a => /repetido/i.test(a))); assert.ok(r.avisos.some(a => /sin código/i.test(a)));
});

test('números en formato español y cabeceras opcionales (existencias, PVP, coste)', () => {
  assert.equal(S.aNumero('1.234,56'), 1234.56); assert.equal(S.aNumero('12,5'), 12.5); assert.equal(S.aNumero(''), null);
  const r = S.parseFilas([[...CAB, 'Existencias', 'PVP', 'Precio coste'], [...fila({ 'Código': 'A', 'Nombre': 'N' }), '3,5', '1.200,00 €', '800']]);
  assert.equal(r.filas[0].stock, 3.5); assert.equal(r.filas[0].precioVenta, 1200); assert.equal(r.filas[0].precioCompra, 800);
  assert.equal(r.columnas.stock, true);
});

const base = () => S.parseFilas(rows([
  fila({ 'Código': 'P1', 'Nombre': 'Motor 400N', 'Nombre familia': 'MERCADERIAS', 'Familia': '00' }),
  fila({ 'Código': 'P2', 'Nombre': 'Muelle', 'Nombre familia': 'MERCADERIAS' }),
  fila({ 'Código': 'OLD', 'Nombre': 'Antiguo', 'Baja': true })
])).filas;

test('primera importación: crea con id determinista y sin duplicar al repetir', () => {
  const plan = S.planificar(base(), []);
  assert.deepEqual(J(plan.nuevos.map(a => a.id)), ['ART-P1', 'ART-P2']);   // la baja no se crea
  assert.equal(plan.bajasOmitidas, 1);
  assert.equal(plan.nuevos[0].referencia, 'P1'); assert.equal(plan.nuevos[0].sageCodigo, 'P1');
  const guardados = J(plan.nuevos);
  const otra = S.planificar(base(), guardados);                             // misma importación otra vez
  assert.equal(otra.nuevos.length, 0); assert.equal(otra.cambios.length, 0); assert.equal(otra.iguales, 2);
});

test('enlaza por código, por referencia y por nombre único; solo cambia lo que difiere', () => {
  const existentes = [
    { id: 'ART-1', referencia: 'P1', nombre: 'Motor 400N', stock: 4, stockMinimo: 2 },        // misma referencia
    { id: 'ART-2', referencia: 'RAND', nombre: 'Muelle', stock: 1 },                           // mismo nombre (único)
    { id: 'ART-3', referencia: 'X', sageCodigo: 'OLD', nombre: 'Antiguo', baja: false }        // ya enlazado: pasa a baja
  ];
  const plan = S.planificar(base(), existentes);
  assert.equal(plan.nuevos.length, 0);
  const por = id => plan.cambios.find(c => c.id === id);
  assert.equal(por('ART-1').patch.sageCodigo, 'P1'); assert.equal(por('ART-1').via, 'referencia');
  assert.equal(por('ART-1').patch.stock, undefined);                                           // no toca el stock sin existencias
  assert.equal(por('ART-2').via, 'nombre'); assert.equal(por('ART-2').patch.sageCodigo, 'P2');
  assert.equal(por('ART-3').patch.baja, true);
  assert.equal(plan.vinculados.length, 2);
  const sin = S.planificar(base(), existentes, { vincularPorNombre: false });
  assert.equal(sin.nuevos.length, 1);                                                          // Muelle ya no se enlaza → se crea
});

test('stock bidireccional: existencias de Sage + lo pendiente de enviar a Sage', () => {
  const filas = S.parseFilas([[...CAB, 'Existencias'], [...fila({ 'Código': 'P1', 'Nombre': 'Motor' }), '10']]).filas;
  const art = { id: 'ART-P1', referencia: 'P1', sageCodigo: 'P1', nombre: 'Motor', stock: 7, sageStock: 8 };
  // en la app se han gastado 1 (7 vs 8 de Sage) y aún no se ha enviado a Sage: stock = 10 − 1
  const plan = S.planificar(filas, [art], { pendientes: new Map([['ART-P1', -1]]) });
  assert.equal(plan.cambios[0].patch.stock, 9); assert.equal(plan.cambios[0].patch.sageStock, 10);
  // sin existencias aplicadas no se toca
  assert.equal(S.planificar(filas, [art], { aplicarStock: false }).cambios.length, 0);
  // servicios: nunca llevan stock
  const serv = S.planificar(filas, [{ ...art, controlStock: false }], { pendientes: new Map() });
  assert.equal(serv.cambios.length, 0);
});

test('un dato vacío en Sage no borra lo escrito en la app', () => {
  const filas = S.parseFilas(rows([fila({ 'Código': 'P1', 'Nombre': 'Motor' })])).filas;
  const plan = S.planificar(filas, [{ id: 'A', sageCodigo: 'P1', nombre: 'Motor', descripcion: 'Texto propio', localizacion: 'Estante 3' }]);
  assert.equal(plan.cambios.length, 0);
});

test('exportación a Sage: neto por código, sin código aparte, y lo que suma cero no sale', () => {
  const arts = [{ id: 'A', sageCodigo: 'P1', nombre: 'Motor', stock: 5, sageStock: 6 }, { id: 'B', nombre: 'Nuevo en app', stock: 2 }, { id: 'C', sageCodigo: 'P3', nombre: 'Neto cero', stock: 1 }];
  const movs = [{ id: 1, articuloid: 'A', delta: -2, createdat: '2026-11-08T10:00' }, { id: 2, articuloid: 'A', delta: 1, createdat: '2026-11-09T10:00' },
    { id: 3, articuloid: 'B', delta: 2, createdat: '2026-11-09T11:00' }, { id: 4, articuloid: 'C', delta: 3 }, { id: 5, articuloid: 'C', delta: -3 }];
  const ex = S.construirExportacion(arts, movs);
  assert.deepEqual(J(ex.movs.map(m => [m.codigo, m.cantidad])), [['P1', -1]]);
  assert.deepEqual(J(ex.sinCodigo.map(m => [m.nombre, m.cantidad])), [['Nuevo en app', 2]]);
  assert.deepEqual(J(ex.ids), [1, 2, 3, 4, 5]);
  assert.equal(ex.existencias.find(e => e.codigo === 'P1').stockApp, 5);
});
