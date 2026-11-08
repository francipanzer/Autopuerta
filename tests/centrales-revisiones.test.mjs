import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function cargar(datos) {
  const context = {
    console, Date, Intl, setTimeout, clearTimeout,
    document: { addEventListener() {}, readyState: 'loading' },
    navigator: {},
    dbGetAll: async store => structuredClone(datos[store] || []),
    dbGetByIndex: async (store, key, value) =>
      structuredClone((datos[store] || []).filter(x => String(x[key] || '') === String(value))),
    escapeHtml: s => String(s ?? '')
  };
  context.window = context;
  context.addEventListener = () => {};
  runInNewContext(readFileSync(new URL('../js/utils.js', import.meta.url), 'utf8'), context);
  runInNewContext(readFileSync(new URL('../js/informe-revisiones-cliente.js', import.meta.url), 'utf8'), context);
  return context;
}

function datosEjemplo() {
  return {
    clientes: [
      { id: 'P', nombre: 'Central', esCadena: true, centralcadenaid: 'C', mantenimientocontratado: true },
      { id: 'A', nombre: 'Centro', padreId: 'P', cadenaId: 'C', rutaId: 'R1' },
      { id: 'B', nombre: 'Centro', padreId: 'P', cadenaId: 'C', rutaId: 'R2' },
      { id: 'S', nombre: 'Sin ruta', padreId: 'P', cadenaId: 'C' },
      { id: 'L', nombre: 'Pendiente de confirmar', cadenaId: 'C', rutaId: 'R1' },
      { id: 'I', nombre: 'Individual', mantenimientocontratado: true },
      { id: 'N', nombre: 'Sin contrato', mantenimientocontratado: false }
    ],
    cadenas: [{ id: 'C', nombre: 'Nombre antiguo' }],
    rutas: [{ id: 'R1', cadenaId: 'C', nombre: 'Ruta 1', proximaRevision: '2030-01-01' },
      { id: 'R2', cadenaId: 'C', nombre: 'Ruta 2' }],
    puertas: [
      { id: 'PA', clienteId: 'A', nombre: 'A', criteriosrevision: { uso: 'industrial', rapida: true }, proximaRevision: '2027-01-01' },
      { id: 'PB', clienteId: 'B', nombre: 'B', criteriosrevision: {}, proximaRevision: null },
      { id: 'PS', clienteId: 'S', nombre: 'S', criteriosrevision: {}, proximaRevision: null },
      { id: 'PL', clienteId: 'L', nombre: 'No confirmado', proximaRevision: '2020-01-01' },
      { id: 'PI', clienteId: 'I', nombre: 'Individual', proximaRevision: '2027-02-01' },
      { id: 'PN', clienteId: 'N', nombre: 'Sin contrato', proximaRevision: '2020-01-01' }
    ]
  };
}

test('rutas incluyen solo centros confirmados y nunca incorporan los de otra ruta', async () => {
  const app = cargar(datosEjemplo());
  assert.deepEqual(Array.from(await app.getTiendasDeRuta('R1', 'C'), x => x.id), ['A']);
  assert.deepEqual(Array.from(await app.getTiendasDeRuta('R2', 'C'), x => x.id), ['B']);
  assert.deepEqual(Array.from(await app.getPuertasDeRuta('R1', 'C'), x => x.id), ['PA']);
  assert.deepEqual(Array.from(await app.getTiendasDeRuta('__sin_ruta__', 'C'), x => x.id), ['S']);
});

test('estado usa fecha de puertas, muestra sin programar y excluye contratos desactivados', async () => {
  const app = cargar(datosEjemplo());
  const estado = Array.from(await app.getEstadoRevisiones());
  assert.equal(estado.find(x => x.rutaId === 'R1').proximaRevision, '2027-01-01');
  assert.equal(estado.find(x => x.rutaId === 'R1').nombre, 'Central');
  assert.equal(estado.find(x => x.rutaId === 'R2').proximaRevision, null);
  assert.equal(estado.find(x => x.rutaId === '__sin_ruta__').puertas[0].id, 'PS');
  assert.ok(estado.some(x => x.id === 'I' && !x.esCadena));
  assert.ok(!estado.some(x => x.id === 'N' || x.id === 'A' || x.id === 'P'));
});

test('desactivar el contrato de la central excluye todas sus rutas', async () => {
  const datos = datosEjemplo();
  datos.clientes[0].mantenimientocontratado = false;
  const estado = await cargar(datos).getEstadoRevisiones();
  assert.ok(!estado.some(x => x.id === 'C'));
  assert.ok(estado.some(x => x.id === 'I'));
});

test('una ruta vinculada no usa una fecha antigua si no hay puertas confirmadas', async () => {
  const datos = datosEjemplo();
  datos.puertas = datos.puertas.filter(p => p.clienteId !== 'A');
  const estado = await cargar(datos).getEstadoRevisiones();
  assert.equal(estado.find(x => x.rutaId === 'R1').proximaRevision, null);
});

test('errores de lectura de puertas se propagan, no se muestran como ruta vacía', async () => {
  const app = cargar(datosEjemplo());
  app.getPuertasDeRuta = async () => { throw new Error('fallo de lectura'); };
  await assert.rejects(app.getEstadoRevisiones(), /fallo de lectura/);
});

test('cadena antigua sin central vinculada conserva su ruta sin incluir centros de otras rutas', async () => {
  const datos = datosEjemplo();
  delete datos.clientes[0].centralcadenaid;
  const app = cargar(datos);
  assert.deepEqual(Array.from(await app.getTiendasDeRuta('R1', 'C'), x => x.id).sort(), ['A', 'L']);
  assert.deepEqual(Array.from(await app.getTiendasDeRuta('R2', 'C'), x => x.id), ['B']);
});

test('la lista Próximas muestra vencidas, hoy y hasta 30 días, pero no más ni sin fecha', async () => {
  const app = cargar({});
  const dias = {
    '2026-01-01': -40, '2026-02-10': 0, '2026-03-12': 30, '2026-03-13': 31
  };
  app.diasHastaFechaITV = fecha => Object.hasOwn(dias, fecha) ? dias[fecha] : null;
  app.getEstadoRevisiones = async () => [
    { id: '1', nombre: 'Vencida', esCadena: false, proximaRevision: '2026-01-01', puertas: [] },
    { id: '2', nombre: 'Hoy', esCadena: false, proximaRevision: '2026-02-10', puertas: [] },
    { id: '3', nombre: 'Día treinta', esCadena: false, proximaRevision: '2026-03-12', puertas: [] },
    { id: '4', nombre: 'Día treinta y uno', esCadena: false, proximaRevision: '2026-03-13', puertas: [] },
    { id: '5', nombre: 'Sin programar', esCadena: false, proximaRevision: null, puertas: [] },
    { id: '6', nombre: 'Cadena pendiente', esCadena: true, rutaId: 'R', proximaRevision: '2026-03-12', puertas: [] },
    { id: '7', nombre: 'Cadena lejana', esCadena: true, rutaId: 'R2', proximaRevision: '2026-03-13', puertas: [] }
  ];
  app.document.getElementById = () => null;
  const cont = { innerHTML: '', addEventListener() {} };
  await app.__revPintarProximas(cont);
  for (const nombre of ['Vencida', 'Hoy', 'Día treinta', 'Cadena pendiente'])
    assert.ok(cont.innerHTML.includes(nombre), `No aparece ${nombre}`);
  for (const nombre of ['Día treinta y uno', 'Sin programar', 'Cadena lejana'])
    assert.ok(!cont.innerHTML.includes(nombre), `No debería aparecer ${nombre}`);
});

test('la búsqueda no devuelve clientes fuera del plazo', async () => {
  const app = cargar({});
  app.diasHastaFechaITV = () => 31;
  app.getEstadoRevisiones = async () => [
    { id: '1', nombre: 'Cliente buscado', esCadena: false, proximaRevision: '2026-03-13', puertas: [] }
  ];
  app.document.getElementById = id => id === 'rev-q' ? { value: 'buscado' } : null;
  const cont = { innerHTML: '', addEventListener() {} };
  await app.__revPintarProximas(cont);
  assert.ok(cont.innerHTML.includes('Sin revisiones en este periodo'));
  assert.ok(!cont.innerHTML.includes('Cliente buscado'));
});
