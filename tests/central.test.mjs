// Motor de revisiones por cliente → ruta → ubicación → puerta (js/central.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function entorno(datos, { tecnico = false } = {}) {
  const guardados = [], rpc = [];
  const win = { addEventListener() {}, removeEventListener() {}, isAdmin: () => !tecnico, isTechnician: () => tecnico,
    supabaseDB: { rpc: async (n, a) => { rpc.push([n, a]); return { error: null }; } }, db: { cacheInvalidate: async () => {} } };
  const sb = { window: win, console, document: { addEventListener() {}, getElementById() { return null; } }, localStorage: { getItem() { return null; }, setItem() {} },
    dbGetAll: async s => datos[s] || [],
    dbGetByIndex: async (s, campo, v) => (datos[s] || []).filter(r => String(r[campo]) === String(v)),
    dbGet: async (s, id) => (datos[s] || []).find(r => String(r.id) === String(id)) || null,
    dbPut: async (s, o) => { guardados.push([s, o]); return o; },
    escapeHtml: s => String(s ?? ''), showToast() {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ['tipos-puerta.js', 'central.js']) vm.runInContext(fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8'), sb);
  return { Central: win.Central, guardados, rpc };
}

const J = x => JSON.parse(JSON.stringify(x));   // los objetos del vm son de otro realm
const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const en = dias => { const d = new Date(hoy); d.setDate(d.getDate() + dias); return iso(d); };

const datos = () => ({
  clientes: [
    { id: 'C1', nombre: 'Central Hiper', central: true, mantenimiento: true },
    { id: 'C2', nombre: 'Taller Pérez', central: false, mantenimiento: true },
    { id: 'C3', nombre: 'Sin contrato', central: false, mantenimiento: false }
  ],
  ubicaciones: [
    { id: 'U1', clienteId: 'C1', denominacion: 'Nave Norte', rutaId: 'R1', ordenRuta: 2 },
    { id: 'U2', clienteId: 'C1', denominacion: 'Nave Sur', rutaId: 'R1', ordenRuta: 1 },
    { id: 'U3', clienteId: 'C1', denominacion: 'Nave Suelta' },
    { id: 'U4', clienteId: 'C1', denominacion: 'Nave Baja', activa: false, rutaId: 'R1' }
  ],
  rutas: [{ id: 'R1', clienteId: 'C1', nombre: 'Ruta 1', orden: 1 }],
  puertas: [
    { id: 'P1', clienteId: 'C1', ubicacionId: 'U1', nombre: 'A', tipo: 'seccional', proximaRevision: en(40) },
    { id: 'P2', clienteId: 'C1', ubicacionId: 'U2', nombre: 'B', tipo: 'rapida', proximaRevision: en(-3) },
    { id: 'P3', clienteId: 'C1', ubicacionId: 'U3', nombre: 'C', tipo: 'seccional', proximaRevision: en(90) },
    { id: 'P4', clienteId: 'C2', nombre: 'D', tipo: 'enrollable', proximaRevision: en(10) },
    { id: 'P5', clienteId: 'C3', nombre: 'E', tipo: 'seccional', proximaRevision: en(1) }
  ]
});

test('solo aparecen los clientes con mantenimiento contratado', async () => {
  const { Central } = entorno(datos());
  const items = await Central.getEstadoRevisiones();
  assert.deepEqual(J(items.map(i => i.id).sort()), ['C1', 'C2']);
});
test('central: rutas con sus ubicaciones ordenadas, y ubicaciones sin ruta aparte', async () => {
  const { Central } = entorno(datos());
  const c = (await Central.getEstadoRevisiones()).find(i => i.id === 'C1');
  assert.equal(c.central, true);
  assert.equal(c.rutas.length, 1);
  assert.deepEqual(J(c.rutas[0].ubicaciones.map(u => u.id)), ['U2', 'U1']);       // por orden de visita
  assert.deepEqual(J(c.sinRuta.map(u => u.id)), ['U3']);
  assert.ok(!c.ubicaciones.some(u => u.id === 'U4'));                          // las dadas de baja no salen
  assert.equal(c.rutas[0].proximaRevision, en(-3));                            // la más urgente de la ruta
  assert.equal(c.proximaRevision, en(-3));
});
test('individual: sus puertas directamente', async () => {
  const { Central } = entorno(datos());
  const c = (await Central.getEstadoRevisiones()).find(i => i.id === 'C2');
  assert.equal(c.central, false);
  assert.equal(c.puertas.length, 1);
  assert.equal(c.rutas.length, 0);
});
test('avisos del panel: vencidas o a ≤ 30 días, solo con mantenimiento', async () => {
  const { Central } = entorno(datos());
  const p = await Central.getPendientesRevision();
  assert.deepEqual(J(p.map(x => x.clienteId)), ['C1', 'C2']);
  assert.equal(p[0].rutaId, 'R1');
  assert.ok(p[0].dias < 0);
});
test('reprogramar (admin): próxima revisión según la periodicidad de la puerta', async () => {
  const { Central, guardados } = entorno(datos());
  const r = await Central.reprogramarPuerta({ id: 'P2', clienteId: 'C1', tipo: 'rapida', uso: 'industrial' }, '2026-11-08', 'operativa');
  assert.equal(r.proximaRevision, '2027-03-08');            // rápida: 4 meses
  assert.equal(r.frecuenciaMeses, 4);
  assert.equal(guardados[0][0], 'puertas');
});
test('reprogramar (técnico): por RPC con la fecha calculada', async () => {
  const { Central, rpc, guardados } = entorno(datos(), { tecnico: true });
  await Central.reprogramarPuerta({ id: 'P1', clienteId: 'C1', tipo: 'seccional' }, '2026-11-08', null);
  assert.equal(guardados.length, 0);
  assert.equal(rpc[0][0], 'update_door_revision_schedule');
  assert.equal(rpc[0][1].p_next_revision, '2027-05-08');    // industrial: 6 meses
});

// ── Borradores de revisión (progreso tienda a tienda) ──
test('borradores: el alcance distingue ruta, ubicación y central completa', () => {
  const { Central } = entorno(datos());
  const B = Central.Borradores;
  assert.equal(B.alcance({ clienteId: 'C1', rutaId: 'R1' }), 'R:R1');
  assert.equal(B.alcance({ clienteId: 'C1', rutaId: 'R1', ubicacionIds: ['U1'] }), 'U:U1');
  assert.equal(B.alcance({ clienteId: 'C1', rutaId: 'R1', ubicacionIds: ['U1', 'U2'] }), 'R:R1');   // «Revisar la ruta» = misma clave que desde la lista de rutas
  assert.equal(B.alcance({ clienteId: 'C1', ubicacionIds: ['U3', 'U1'] }), 'U:U1,U3');
  assert.equal(B.alcance({ clienteId: 'C1' }), 'todo');
  assert.ok(B.clave({ clienteId: 'C1', rutaId: 'R1' }).endsWith('|C1|R:R1'));
});

test('borradores: se retoma lo marcado y una puerta nueva devuelve la tienda a pendiente', () => {
  const src = fs.readFileSync(new URL('../js/pages_gestion.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const cortar = nombre => { const i = src.indexOf('function ' + nombre); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } };
  const sb = {}; vm.createContext(sb);
  vm.runInContext(cortar('hiperberPuertaIncompleta') + '\n' + cortar('fusionarBorradorRevision') + '\nthis.f = fusionarBorradorRevision;', sb);
  const puerta = (id, extra = {}) => ({ id, nombre: id, hallazgo: null, hallazgoTexto: '', hallazgoFotos: [], correctivo: null, correctivoTexto: '', resultado: null, ...extra });
  const hecha = id => puerta(id, { hallazgo: 'ok', correctivo: 'ok', resultado: 'ok' });
  const nuevo = { id: 'REV-NUEVO', rutasCompletas: {}, stores: [
    { ubicacionId: 'U1', puertas: [puerta('P1')] },
    { ubicacionId: 'U2', puertas: [puerta('P2'), puerta('P9')] },        // P9: puerta añadida después de guardar
    { ubicacionId: 'U3', puertas: [puerta('P3')] }] };
  const guardado = { fecha: '2026-11-08', draft: { id: 'REV-VIEJO', rutasCompletas: { R1: true }, stores: [
    { ubicacionId: 'U1', completada: true, puertas: [hecha('P1')] },
    { ubicacionId: 'U2', completada: true, puertas: [hecha('P2')] },
    { ubicacionId: 'U3', completada: false, puertas: [puerta('P3', { hallazgo: 'x', hallazgoTexto: 'Cortina rota' })] }] } };
  const fecha = sb.f(nuevo, guardado);
  assert.equal(fecha, '2026-11-08');
  assert.equal(nuevo.id, 'REV-VIEJO');
  assert.equal(nuevo.stores[0].completada, true);
  assert.equal(nuevo.stores[0].puertas[0].resultado, 'ok');
  assert.equal(nuevo.stores[1].completada, false);                       // P9 sin revisar
  assert.equal(nuevo.stores[1].puertas[0].resultado, 'ok');              // pero P2 conserva lo hecho
  assert.equal(nuevo.stores[2].puertas[0].hallazgoTexto, 'Cortina rota'); // trabajo a medias conservado
  assert.equal(nuevo.rutasCompletas.R1, true);
});

// ── DOTICS: pantalla de ruta, casilla por tienda (cada tienda = su propio parte) ──
function dotics(extra = {}) {
  const d = datos();
  d.clientes = [{ id: 'C1', nombre: 'DOTICS', central: true, mantenimiento: true }];
  d.puertas = [
    { id: 'P1', clienteId: 'C1', ubicacionId: 'U1', nombre: 'Muelle 1', tipo: 'seccional', numeroSerie: 'SN-1' },
    { id: 'P1b', clienteId: 'C1', ubicacionId: 'U1', nombre: 'Muelle 2', tipo: 'seccional', numeroSerie: 'SN-1b' },
    { id: 'P2', clienteId: 'C1', ubicacionId: 'U2', nombre: 'Acceso', tipo: 'rapida', numeroSerie: 'SN-2' }];
  d.revisiones = extra.revisiones || [];
  if (extra.sinUbicaciones) { d.ubicaciones = []; d.rutas = []; d.puertas.forEach(p => delete p.ubicacionId); }
  d.empleados = [{ id: 'E1', nombre: 'Ana' }];
  const { Central, guardados } = entorno(d);
  const src = fs.readFileSync(new URL('../js/pages_gestion.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const altas = [], toasts = [];
  const W = { Central, db: { nextId: (p) => p + '-' + (altas.length + 1) }, authState: {},
    TiposPuerta: { cargar: async () => {}, lista: () => [{ codigo: 'SECCIONAL' }, { codigo: 'RAPIDA' }], resolver: t => ({ codigo: String(t || '').toUpperCase() }) } };
  const sb = { window: W, console, setTimeout: () => 0, clearTimeout() {}, document: { getElementById() { return null; } }, escapeHtml: s => String(s ?? ''),
    showToast: (m, k) => toasts.push([m, k]), confirm: () => true, openModal() {}, closeModal() {},
    dbGet: async (s, id) => (d[s] || []).find(r => String(r.id) === String(id)) || null, dbGetAll: async s => d[s] || [],
    dbAdd: async (s, o) => { altas.push([s, o]); (d[s] = d[s] || []).push(o); return o; }, dbPut: async (s, o) => { guardados.push([s, o]); return o; } };
  sb.globalThis = sb; vm.createContext(sb);
  try { vm.runInContext(src, sb); } catch (e) { /* solo interesan las funciones */ }
  return { W, altas, toasts, guardados, sb };
}
const abrir = (W, o = {}) => W.abrirRevisionDotics({ clienteId: 'C1', rutaId: 'R1', ubicacionIds: ['U1', 'U2'], fecha: '2026-11-08', ...o });

test('DOTICS: una pantalla con todas las tiendas y las puertas ya escritas', async () => {
  const { W } = dotics();
  await abrir(W);
  const R = W.__doticsRoute;
  assert.equal(R.esRuta, true);
  assert.deepEqual(J(R.stores.map(s => s.ubicacionId)), ['U2', 'U1']);          // orden de visita de la ruta
  const u1 = R.stores.find(s => s.ubicacionId === 'U1');
  assert.deepEqual(J(u1.lines.map(l => [l.denominacionCliente, l.numeroSerie, l.tipoProducto, l.estado])),
    [['Muelle 1', 'SN-1', 'SECCIONAL', ''], ['Muelle 2', 'SN-1b', 'SECCIONAL', '']]);
  assert.equal(R.stores[0].abierta, true);                                       // se abre la primera pendiente
});

test('DOTICS: marcar una tienda valida y guarda SU parte; la ruta final se bloquea hasta terminar', async () => {
  const { W, altas, toasts } = dotics();
  await abrir(W);
  const R = W.__doticsRoute;
  await W.drCheckTienda(0, true);                                                // sin técnico / intervención
  assert.equal(R.stores[0].completada, false);
  assert.equal(altas.length, 0);
  R.comun.tecnicos = 'Ana';
  R.stores[0].intervencion = '0011';
  await W.drCheckTienda(0, true);                                                // faltan estados
  assert.equal(altas.length, 0);
  W.drTodoBueno(0);
  await W.drCheckTienda(0, true);
  assert.equal(altas.length, 1);
  assert.equal(R.stores[0].completada, true);
  const notas = JSON.parse(altas[0][1].notas);
  assert.equal(notas.form, 'DOTICS_VISITA_V1'); assert.equal(notas.ubicacionId, 'U2'); assert.equal(notas.intervencion, '0011');
  // la ruta no se puede cerrar con una tienda pendiente
  await W.drCheckRuta('R1', true);
  assert.notEqual(R.rutasCompletas.R1, true);
  assert.ok(toasts.some(([m]) => /Primero finaliza/.test(m)));
  // segunda tienda: otro parte distinto
  R.stores[1].intervencion = '0012'; W.drTodoBueno(1);
  await W.drCheckTienda(1, true);
  assert.equal(altas.length, 2);
  assert.notEqual(altas[0][1].id, altas[1][1].id);                               // un parte por tienda
  assert.equal(JSON.parse(altas[1][1].notas).ubicacionId, 'U1');
  await W.drCheckRuta('R1', true);
  assert.equal(W.__doticsRoute, null);                                           // ruta completada → resumen y estado cerrado
});

test('DOTICS: al reabrir la ruta, las tiendas ya guardadas de esa fecha salen finalizadas y se actualiza su mismo parte', async () => {
  const { W, altas, guardados } = dotics({ revisiones: [{ id: 'REV-9', clienteId: 'C1', fecha: '2026-11-08',
    items: [{ puertaId: 'P2', tipoProducto: 'RAPIDA', denominacionCliente: 'Acceso', numeroSerie: 'SN-2', estadoEquipo: 'bueno' }],
    notas: JSON.stringify({ form: 'DOTICS_VISITA_V1', ubicacionId: 'U2', intervencion: '77', tecnicos: 'Ana', contrato: 'K' }) }] });
  await abrir(W);
  const R = W.__doticsRoute;
  assert.equal(R.stores[0].completada, true);
  assert.equal(R.stores[0].revisionId, 'REV-9');
  assert.equal(R.stores[1].completada, false);
  assert.equal(R.comun.tecnicos, 'Ana');
  assert.equal(R.stores[1].abierta, true);                                       // continúa por la primera pendiente
  await W.drCheckTienda(0, false);                                               // reabrir
  assert.equal(R.stores[0].completada, false);
  await W.drCheckTienda(0, true);                                                // volver a finalizar → actualiza, no duplica
  assert.equal(altas.length, 0);
  assert.ok(guardados.some(([s, o]) => s === 'revisiones' && o.id === 'REV-9'));
});

test('DOTICS: una sola tienda también lleva casilla de tienda y casilla final', async () => {
  const { W, altas } = dotics();
  await abrir(W, { ubicacionIds: ['U1'], rutaId: null });
  const R = W.__doticsRoute;
  assert.equal(R.esRuta, true); assert.equal(R.multi, false);
  R.comun.tecnicos = 'Ana'; R.stores[0].intervencion = '5'; W.drTodoBueno(0);
  await W.drCheckTienda(0, true);
  assert.equal(altas.length, 1);
  await W.drCheckRuta('R1', true);
  assert.equal(W.__doticsRoute, null);
});

test('DOTICS: cliente sin ubicaciones y revisión de una sola puerta usan el mismo formulario', async () => {
  const { W, altas } = dotics({ sinUbicaciones: true });
  await W.abrirRevisionDotics({ clienteId: 'C1', fecha: '2026-11-08' });
  let R = W.__doticsRoute;
  assert.equal(R.stores.length, 1);
  assert.equal(R.stores[0].lines.length, 3);
  await W.abrirRevisionDotics({ clienteId: 'C1', fecha: '2026-11-08', puertaId: 'P1b' });
  R = W.__doticsRoute;
  assert.deepEqual(J(R.stores[0].lines.map(l => l.puertaId)), ['P1b']);
  R.comun.tecnicos = 'Ana'; R.stores[0].intervencion = '9'; W.drTodoBueno(0);
  await W.drCheckTienda(0, true);
  assert.equal(altas.length, 1);
  assert.equal(JSON.parse(altas[0][1].notas).ubicacionId, null);
  await W.drCheckRuta('sin', true);
  assert.equal(W.__doticsRoute, null);
});

test('DOTICS: cada equipo es una línea con tres iconos de estado', async () => {
  const { W, sb } = dotics();
  await abrir(W);
  const R = W.__doticsRoute;
  R.stores[1].abierta = true;
  const html = sb.drStoreHtml(R.stores[1], 1, R);
  assert.equal((html.match(/class="dotics-eq"/g) || []).length, 2);
  assert.equal((html.match(/type="radio"/g) || []).length, 6);
  assert.ok(/fa-circle-check/.test(html) && /fa-triangle-exclamation/.test(html) && /fa-circle-xmark/.test(html));
});

