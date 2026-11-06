import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDb } from './helpers/browser-env.mjs';

const U1 = { id: 'u1' }, U2 = { id: 'u2' };

/* ───── Mapeo camelCase ↔ columnas ───── */
test('mapeo: toda clave que se escribe vuelve con el mismo nombre al leer (sin asimetrías)', () => {
  const { get } = loadDb();
  const { REN_OUT, REN_IN } = get('({REN_OUT,REN_IN})');
  for (const [camel, col] of Object.entries(REN_OUT)) assert.equal(REN_IN[col], camel, `${camel} → ${col} no vuelve como ${camel}`);
});
test('mapeo: sin colisiones y sin columnas con mayúsculas', () => {
  const { get } = loadDb();
  const { REN_OUT } = get('({REN_OUT})');
  const seen = {}; for (const [camel, col] of Object.entries(REN_OUT)) { assert.ok(!(col in seen), `${camel} y ${seen[col]} → ${col}`); seen[col] = camel; assert.equal(col, col.toLowerCase()); }
});
test('mapeo: regresión tecnicoId (revisiones) se lee como tecnicoId', () => {
  const { get } = loadDb();
  assert.equal(get("fromJS({tecnicoid:'EMP1'})").tecnicoId, 'EMP1');
  assert.equal(get("toDB({tecnicoId:'EMP1'})").tecnicoid, 'EMP1');
});
test('mapeo: ida y vuelta conserva el registro', () => {
  const { get } = loadDb();
  const rec = get("fromJS(toDB({id:'1',clienteId:'C',kmInicial:5,puertaIds:['a'],precioCompra:3}))");
  assert.equal(rec.clienteId, 'C'); assert.equal(rec.kmInicial, 5); assert.deepEqual(JSON.parse(JSON.stringify(rec.puertaIds)), ['a']); assert.equal(rec.precioCompra, 3);
});

/* ───── Paginación: el límite de 1000 filas ya no trunca ───── */
test('dbGetAll lee más de 1000 filas aunque el servidor limite cada respuesta', async () => {
  const tables = { puertas: Array.from({ length: 2350 }, (_, i) => ({ id: 'P' + String(i).padStart(5, '0'), nombre: 'n' + i })) };
  const { get, sb } = loadDb({ tables, maxRows: 1000, user: U1 });
  const rows = await get("dbGetAll('puertas')");
  assert.equal(rows.length, 2350);
  assert.equal(new Set(rows.map(r => r.id)).size, 2350);                       // sin duplicados ni huecos entre páginas
  assert.ok(sb.log.filter(l => l.table === 'puertas').length >= 3);
});
test('dbGetAll con una tabla pequeña usa una sola petición', async () => {
  const { get, sb } = loadDb({ tables: { clientes: [{ id: 'C1' }, { id: 'C2' }] }, user: U1 });
  assert.equal((await get("dbGetAll('clientes')")).length, 2);
  assert.equal(sb.log.filter(l => l.table === 'clientes').length, 1);
});

/* ───── Guardado sin pisar cambios de otros (antes: last-write-wins) ───── */
const cliente = () => ({ id: 'C1', nombre: 'Acme', telefono: '111', email: 'a@a.es', updatedat: '2026-01-01T10:00:00.000Z' });

test('dbPut solo envía los campos que cambian (no el registro entero)', async () => {
  const { get, sb } = loadDb({ tables: { clientes: [cliente()] }, user: U1 });
  const [rec] = (await get("dbGetAll('clientes')"));
  sb.log.length = 0;
  await get('dbPut')('clientes', { ...rec, telefono: '222' });
  const upd = sb.log.find(l => l.op === 'update');
  assert.deepEqual(Object.keys(upd.patch).sort(), ['telefono', 'updatedat']);
  assert.ok(!sb.log.some(l => l.op === 'upsert'));
});
test('dos usuarios editan campos distintos: no se pierde ningún cambio', async () => {
  const { get, sb, toasts } = loadDb({ tables: { clientes: [cliente()] }, user: U1 });
  const [rec] = await get("dbGetAll('clientes')");                              // yo abro el cliente
  Object.assign(sb.tables.clientes[0], { nombre: 'Acme SL', updatedat: '2026-01-01T11:00:00.000Z' });   // otro usuario cambia el nombre
  const saved = await get('dbPut')('clientes', { ...rec, telefono: '222' });    // yo cambio el teléfono
  assert.equal(sb.tables.clientes[0].telefono, '222');
  assert.equal(sb.tables.clientes[0].nombre, 'Acme SL');                        // lo del otro se conserva
  assert.equal(saved.nombre, 'Acme SL');
  assert.equal(toasts.length, 0);                                               // sin conflicto real, sin avisos
});
test('mismo campo editado por dos usuarios: gana el último, pero se avisa', async () => {
  const { get, sb, toasts } = loadDb({ tables: { clientes: [cliente()] }, user: U1 });
  const [rec] = await get("dbGetAll('clientes')");
  Object.assign(sb.tables.clientes[0], { telefono: '999', updatedat: '2026-01-01T11:00:00.000Z' });
  await get('dbPut')('clientes', { ...rec, telefono: '222' });
  assert.equal(sb.tables.clientes[0].telefono, '222');
  assert.equal(toasts.length, 1); assert.match(toasts[0][0], /telefono/); assert.equal(toasts[0][1], 'warning');
});
test('stock de almacén: dos técnicos gastan material a la vez y no se pierde ningún descuento', async () => {
  const { get, sb, sandbox } = loadDb({ tables: { almacen: [{ id: 'A1', nombre: 'Muelle', stock: 10, updatedat: '2026-01-01T10:00:00.000Z' }] }, user: U1 });
  await get("cacheWrite('almacen',[{id:'A1',nombre:'Muelle',stock:10,updatedAt:'2026-01-01T10:00:00.000Z'}],true)");
  Object.assign(sb.tables.almacen[0], { stock: 7, updatedat: '2026-01-01T11:00:00.000Z' });   // otro técnico gastó 3
  await get('dbPut')('almacen', { id: 'A1', nombre: 'Muelle', stock: 8 });                        // yo gasté 2 (veía 10)
  assert.equal(sb.tables.almacen[0].stock, 5);
});
test('dbPut sin cambios no escribe en el servidor', async () => {
  const { get, sb } = loadDb({ tables: { clientes: [cliente()] }, user: U1 });
  const [rec] = await get("dbGetAll('clientes')"); sb.log.length = 0;
  await get('dbPut')('clientes', { ...rec });
  assert.equal(sb.log.length, 0);
});
test('registro nuevo o borrado por otro: se crea con upsert como siempre', async () => {
  const { get, sb } = loadDb({ tables: { clientes: [cliente()] }, user: U1 });
  const [rec] = await get("dbGetAll('clientes')");
  sb.tables.clientes.length = 0;                                                // otro usuario lo borró
  await get('dbPut')('clientes', { ...rec, telefono: '222' });
  assert.equal(sb.tables.clientes.length, 1); assert.equal(sb.tables.clientes[0].telefono, '222');
  await get('dbPut')('clientes', { id: 'NUEVO', nombre: 'Otro' });
  assert.ok(sb.tables.clientes.some(r => r.id === 'NUEVO'));
});

/* ───── Cola de sincronización ───── */
const put = (id, extra = {}) => ({ action: 'put', store: 'clientes', data: { id, nombre: id, ...extra } });

test('cola: una operación rechazada por el servidor NO bloquea las siguientes', async () => {
  const env = loadDb({ tables: { clientes: [] }, user: null });
  const enqueue = env.get('enqueueSyncOperation');
  await enqueue(put('A')); await enqueue(put('MALA')); await enqueue(put('C'));
  env.sandbox.authState = { user: U1 };
  // Los registros se enviaron con ownerId null (sesión no iniciada): son de "quien entre"
  const realFrom = env.sb.from.bind(env.sb);
  env.sb.from = n => { const b = realFrom(n); const t = b.then.bind(b); const orig = b.upsert; b.upsert = r => { const row = [].concat(r)[0]; if (row.id === 'MALA') { b.then = (res, rej) => Promise.resolve({ error: { code: '42501', message: 'permission denied' }, status: 403 }).then(res, rej); return b; } return orig(r); }; return b; };
  await env.get('flushSyncQueue')();
  assert.deepEqual(env.sb.tables.clientes.map(r => r.id).sort(), ['A', 'C']);
  const info = env.sandbox.dbSyncInfo();
  assert.equal(info.pending.length, 0); assert.equal(info.failed.length, 1);
  assert.match(info.failed[0].error, /permission denied/);
});
test('cola: sin red se conserva todo, en orden, y no se gastan intentos', async () => {
  const env = loadDb({ tables: { clientes: [] }, user: null });
  await env.get('enqueueSyncOperation')(put('A')); await env.get('enqueueSyncOperation')(put('B'));
  env.sandbox.authState = { user: U1 };
  env.sb.failNext = { data: null, error: { message: 'Failed to fetch' } };
  await env.get('flushSyncQueue')();
  assert.equal(env.sandbox.dbSyncInfo().pending.length, 2); assert.equal(env.sandbox.dbSyncInfo().pending[0].attempts, 0);
  await env.wait(0); env.sandbox.navigator.onLine = true;
  await env.get('flushSyncQueue')();
});
test('cola: la hora de edición se conserva al sincronizar (no se sobrescribe con la de envío)', async () => {
  const env = loadDb({ tables: { clientes: [] }, user: U1 });
  const item = await env.get('enqueueSyncOperation')(put('A'));
  await env.get('flushSyncQueue')();
  assert.equal(env.sb.tables.clientes[0].updatedat, item.editedAt);
});
test('cola: cerrar sesión NO borra lo pendiente y otro usuario no lo ve ni lo envía', async () => {
  const env = loadDb({ tables: { clientes: [] }, user: U1 });
  env.sandbox.navigator.onLine = false;
  await env.get('enqueueSyncOperation')(put('DE-U1'));
  await env.get('clearAuthenticatedCache')();                                    // cierre de sesión
  assert.equal(JSON.parse(env.ls.getItem('autopuerta_sync_queue')).length, 1);   // sigue ahí
  env.sandbox.authState = { user: U2 }; env.sandbox.navigator.onLine = true;
  assert.equal(env.sandbox.dbSyncInfo().pending.length, 0);                       // u2 no la ve
  await env.get('flushSyncQueue')();
  assert.equal(env.sb.tables.clientes.length, 0);                                 // y no se envía con su sesión
  env.sandbox.authState = { user: U1 };                                           // u1 vuelve
  assert.equal(env.sandbox.dbSyncInfo().pending.length, 1);
  await env.get('flushSyncQueue')();
  assert.equal(env.sb.tables.clientes[0].id, 'DE-U1');
});
test('cola: reintentar y descartar fallidas', async () => {
  const env = loadDb({ tables: { clientes: [] }, user: U1 });
  env.ls.setItem('autopuerta_sync_failed', JSON.stringify([{ queueId: 'F1', ownerId: 'u1', action: 'put', store: 'clientes', data: { id: 'X' }, error: 'e' }, { queueId: 'F2', ownerId: 'u1', action: 'put', store: 'clientes', data: { id: 'Y' } }]));
  env.sandbox.dbSyncFailedDiscard('F2');
  assert.equal(env.sandbox.dbSyncInfo().failed.length, 1);
  env.sandbox.dbSyncFailedRetry('F1'); await env.wait(20);
  assert.equal(env.sandbox.dbSyncInfo().failed.length, 0);
  assert.equal(env.sb.tables.clientes[0].id, 'X');
});
test('cola: sin espacio en localStorage avisa en vez de perder en silencio', async () => {
  const env = loadDb({ tables: { clientes: [] }, user: null });
  env.sandbox.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  await assert.rejects(env.get('enqueueSyncOperation')(put('A')), /No hay espacio/);
});
