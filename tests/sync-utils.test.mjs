import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const U = require('../js/sync-utils.js');

/* ───── clasificación de errores ───── */
test('classifyError distingue red, sesión, temporal y permanente', () => {
  assert.equal(U.classifyError(new TypeError('Failed to fetch')), 'network');
  assert.equal(U.classifyError({ message: 'x' }, false), 'network');                 // navegador sin conexión
  assert.equal(U.classifyError({ status: 401, message: 'JWT expired' }), 'auth');
  assert.equal(U.classifyError({ code: 'PGRST301', message: 'x' }), 'auth');
  assert.equal(U.classifyError({ status: 503, message: 'x' }), 'transient');
  assert.equal(U.classifyError({ status: 429, message: 'x' }), 'transient');
  assert.equal(U.classifyError({ code: '57014', message: 'statement timeout' }), 'transient');
  assert.equal(U.classifyError({ code: '42501', message: 'permission denied' }), 'permanent');  // RLS
  assert.equal(U.classifyError({ code: '23502', message: 'null value' }), 'permanent');
  assert.equal(U.classifyError({ code: 'PGRST204', message: 'column not found' }), 'permanent');
  assert.equal(U.classifyError({ code: 'P0001', message: 'Not authorized' }), 'permanent');
  assert.equal(U.classifyError({ status: 403, message: 'x' }), 'permanent');
  assert.equal(U.classifyError({ message: 'cosa rara' }), 'transient');              // lo desconocido se reintenta
});

test('decideAfterError: parar con red/sesión, fallar lo permanente y acotar los reintentos', () => {
  assert.deepEqual(U.decideAfterError(new TypeError('Failed to fetch'), 0, { online: true }),
    { kind: 'network', action: 'stop', countAttempt: false });
  assert.equal(U.decideAfterError({ code: '42501' }, 0).action, 'fail');
  assert.equal(U.decideAfterError({ status: 500 }, 0).action, 'stop');
  assert.equal(U.decideAfterError({ status: 500 }, U.MAX_ATTEMPTS - 1).action, 'fail');
});

test('backoffDelay crece, tiene techo y varía', () => {
  const fixed = () => 1;
  assert.equal(U.backoffDelay(0, 5000, 300000, fixed), 5000);
  assert.equal(U.backoffDelay(3, 5000, 300000, fixed), 40000);
  assert.equal(U.backoffDelay(20, 5000, 300000, fixed), 300000);
  assert.equal(U.backoffDelay(2, 5000, 300000, () => 0), 10000);
});

test('errorFromResponse conserva código y estado HTTP', () => {
  const e = U.errorFromResponse({ error: { message: 'm', code: '42501' }, status: 403 });
  assert.equal(e.code, '42501'); assert.equal(e.status, 403);
  assert.equal(U.errorFromResponse({ data: [] }), null);
});

/* ───── fusión de cambios (last-write-wins corregido) ───── */
test('diffFields solo devuelve lo cambiado y respeta ignore', () => {
  const base = { id: 1, nombre: 'A', tel: '1', datos: { a: [1, 2] }, updatedAt: 'x' };
  const mine = { id: 1, nombre: 'A', tel: '2', datos: { a: [1, 2] }, updatedAt: 'y' };
  assert.deepEqual(U.diffFields(base, mine, ['updatedAt']), { tel: '2' });
  assert.deepEqual(U.diffFields(base, { ...mine, datos: { a: [1, 3] } }, ['updatedAt', 'tel']), { datos: { a: [1, 3] } });
});

test('threeWayMerge: dos usuarios editan campos distintos y no se pisan', () => {
  const base = { nombre: 'Acme', tel: '111', email: 'a@a.es' };
  const mine = { nombre: 'Acme', tel: '222', email: 'a@a.es' };        // yo cambio el teléfono
  const server = { nombre: 'Acme SL', tel: '111', email: 'a@a.es' };   // otro cambió el nombre
  const r = U.threeWayMerge(base, mine, server);
  assert.deepEqual(r.patch, { tel: '222' });                            // el nombre del otro se conserva
  assert.equal(r.conflicts.length, 0);
});

test('threeWayMerge: mismo campo → conflicto informado; gana el mío salvo prefer:server', () => {
  const base = { tel: '111' }, mine = { tel: '222' }, server = { tel: '333' };
  const r = U.threeWayMerge(base, mine, server);
  assert.deepEqual(r.patch, { tel: '222' });
  assert.deepEqual(r.conflicts[0], { field: 'tel', base: '111', mine: '222', server: '333', kind: 'overwrite' });
  assert.deepEqual(U.threeWayMerge(base, mine, server, { prefer: 'server' }).patch, {});
});

test('threeWayMerge: contadores (stock) suman la diferencia en vez de pisar', () => {
  // stock 10; yo gasto 2 (→8); otro gasta 3 (→7). Resultado correcto: 5
  const r = U.threeWayMerge({ stock: 10 }, { stock: 8 }, { stock: 7 }, { deltaFields: ['stock'] });
  assert.equal(r.patch.stock, 5);
  assert.equal(r.conflicts[0].kind, 'delta');
});

test('threeWayMerge: si ya coincide con el servidor no escribe nada', () => {
  const r = U.threeWayMerge({ a: 1 }, { a: 2 }, { a: 2 });
  assert.deepEqual(r.patch, {}); assert.equal(r.conflicts.length, 0);
});

/* ───── paginación (límite de 1000 filas) ───── */
test('fetchAllPages recorre todas las páginas usando el recuento', async () => {
  const all = Array.from({ length: 2350 }, (_, i) => ({ id: i }));
  const calls = [];
  const rows = await U.fetchAllPages(async (from, to) => {
    calls.push([from, to]);
    return { data: all.slice(from, to + 1), count: from === 0 ? all.length : undefined };
  });
  assert.equal(rows.length, 2350); assert.equal(rows[2349].id, 2349); assert.equal(calls.length, 3);
});

test('fetchAllPages es válido aunque el servidor recorte las páginas a menos de lo pedido', async () => {
  const all = Array.from({ length: 1200 }, (_, i) => ({ id: i }));
  const rows = await U.fetchAllPages(async (from, to) => {
    const cap = Math.min(to, from + 499);                               // el servidor devuelve como mucho 500
    return { data: all.slice(from, cap + 1), count: from === 0 ? all.length : undefined };
  });
  assert.equal(rows.length, 1200);
});

test('fetchAllPages sin recuento: una tabla pequeña = una sola petición', async () => {
  let n = 0;
  const rows = await U.fetchAllPages(async () => { n++; return { data: [{ id: 1 }, { id: 2 }] }; });
  assert.equal(rows.length, 2); assert.equal(n, 1);
});

test('fetchAllPages propaga el error', async () => {
  await assert.rejects(U.fetchAllPages(async () => ({ error: new Error('boom') })), /boom/);
});

/* ───── bandeja de salida de mediciones ───── */
function fakeStorage(limit = Infinity) {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (String(v).length > limit) throw new Error('QuotaExceededError'); m.set(k, String(v)); } };
}
function fakeBlobs() {
  const m = new Map();
  return { put: async (k, v) => { m.set(k, v); }, get: async k => m.get(k), del: async k => { m.delete(k); }, _m: m };
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
function mkOutbox(over = {}) {
  const sent = [], uploads = [];
  const o = {
    storage: fakeStorage(), blobs: fakeBlobs(),
    upload: async blob => { uploads.push(blob); return 'https://cdn/x' + uploads.length + '.png'; },
    send: async row => { sent.push(row); return { error: null }; },
    userId: () => 'u1', online: () => true, ...over
  };
  return { ob: U.createOutbox(o), o, sent, uploads };
}

test('outbox: encolar mueve las fotos a IndexedDB, asigna id y no deja base64 en localStorage', async () => {
  const { ob, o } = mkOutbox();
  const it = await ob.enqueue({ plantillanombre: 'X', fotos: [PNG, 'https://ya/subida.png'] }, 'u1');
  assert.match(it.fila.id, /^[0-9a-f-]{36}$/);
  assert.ok(it.fila.fotos[0].startsWith('idb:'));
  assert.equal(it.fila.fotos[1], 'https://ya/subida.png');
  assert.equal(o.blobs._m.size, 1);
  assert.ok(!o.storage.getItem(U.MED_PEND_KEY).includes('base64'));
});

test('outbox: envío correcto sube fotos, inserta con el mismo id, limpia fotos locales y vacía la cola', async () => {
  const { ob, o, sent } = mkOutbox();
  const it = await ob.enqueue({ fotos: [PNG, PNG] }, 'u1');
  const r = await ob.syncAll();
  assert.equal(r.sent, 1); assert.equal(r.left, 0);
  assert.equal(sent[0].id, it.fila.id);
  assert.deepEqual(sent[0].fotos, ['https://cdn/x1.png', 'https://cdn/x2.png']);
  assert.equal(o.blobs._m.size, 0);
  assert.equal(ob.list().length, 0);
});

test('outbox: sin red no se pierde nada ni se cuenta intento', async () => {
  let online = false;
  const { ob, sent } = mkOutbox({ online: () => online });
  await ob.enqueue({ fotos: [] }, 'u1');
  let r = await ob.syncAll(); assert.equal(r.skipped, true); assert.equal(r.left, 1);
  assert.equal(sent.length, 0);
  online = true; r = await ob.syncAll(); assert.equal(r.sent, 1);
});

test('outbox: un envío permanentemente rechazado pasa a "fallida" y NO bloquea a los demás', async () => {
  let n = 0;
  const { ob, sent } = mkOutbox({ send: async row => { n++; sent.push(row);
    return row.plantillanombre === 'MALA' ? { error: { code: '42501', message: 'permission denied' }, status: 403 } : { error: null }; } });
  await ob.enqueue({ plantillanombre: 'BUENA-1', fotos: [] }, 'u1');
  await ob.enqueue({ plantillanombre: 'MALA', fotos: [] }, 'u1');
  await ob.enqueue({ plantillanombre: 'BUENA-2', fotos: [] }, 'u1');
  const r = await ob.syncAll();
  assert.equal(r.sent, 2); assert.equal(r.failed, 1);
  const rest = ob.list();
  assert.equal(rest.length, 1); assert.equal(rest[0].estado, 'fallida'); assert.match(rest[0].error, /permission denied/);
  assert.deepEqual(ob.counts(), { pending: 0, failed: 1 });
  // reintentar no la pierde y la vuelve a poner en cola
  ob.retry(rest[0].idLocal); assert.deepEqual(ob.counts(), { pending: 1, failed: 0 });
});

test('outbox: error de red a mitad de envío para y conserva el resto; luego continúa', async () => {
  let fail = true; const sent = [];
  const { ob } = mkOutbox({ send: async row => { if (fail) return { error: { message: 'Failed to fetch' } }; sent.push(row.id); return { error: null }; } });
  await ob.enqueue({ fotos: [] }, 'u1'); await ob.enqueue({ fotos: [] }, 'u1');
  let r = await ob.syncAll(); assert.equal(r.retry, true); assert.equal(r.left, 2);
  assert.equal(ob.list()[0].intentos, 0);                                  // la red caída no gasta intentos
  fail = false; r = await ob.syncAll(); assert.equal(r.sent, 2); assert.equal(sent.length, 2);
});

test('outbox: errores 5xx repetidos acaban en "fallida" (no reintenta eternamente)', async () => {
  const { ob } = mkOutbox({ send: async () => ({ error: { message: 'bad gateway' }, status: 502 }) });
  await ob.enqueue({ fotos: [] }, 'u1');
  for (let i = 0; i < U.MAX_ATTEMPTS + 2; i++) await ob.syncAll();
  assert.deepEqual(ob.counts(), { pending: 0, failed: 1 });
});

test('outbox: si el insert falla tras subir las fotos, al reintentar NO se vuelven a subir', async () => {
  let ok = false; const { ob, uploads } = mkOutbox({ send: async () => (ok ? { error: null } : { error: { message: 'x' }, status: 503 }) });
  await ob.enqueue({ fotos: [PNG, PNG] }, 'u1');
  await ob.syncAll(); assert.equal(uploads.length, 2);
  ok = true; await ob.syncAll(); assert.equal(uploads.length, 2);          // sin subidas duplicadas
});

test('outbox: reintentar un envío ya recibido (id duplicado) cuenta como enviado, sin duplicar', async () => {
  const { ob } = mkOutbox({ send: async () => ({ error: { code: '23505', message: 'duplicate key' }, status: 409 }) });
  await ob.enqueue({ fotos: [] }, 'u1');
  const r = await ob.syncAll(); assert.equal(r.sent, 1); assert.equal(ob.list().length, 0);
});

test('outbox: cada usuario solo envía lo suyo; lo de otro se conserva intacto', async () => {
  let uid = 'u1'; const { ob, sent } = mkOutbox({ userId: () => uid });
  await ob.enqueue({ plantillanombre: 'de-u1', fotos: [] }, 'u1');
  uid = 'u2'; await ob.enqueue({ plantillanombre: 'de-u2', fotos: [] }, 'u2');
  let r = await ob.syncAll(); assert.equal(r.sent, 1); assert.equal(sent[0].plantillanombre, 'de-u2');
  assert.equal(ob._read().length, 1);                                       // lo de u1 sigue ahí
  uid = 'u1'; r = await ob.syncAll(); assert.equal(r.sent, 1); assert.equal(sent[1].plantillanombre, 'de-u1');
});

test('outbox: sin sesión no envía (y no marca nada como fallido)', async () => {
  const { ob } = mkOutbox({ userId: () => null });
  await ob.enqueue({ fotos: [] }, 'u1');
  const r = await ob.syncAll(); assert.equal(r.skipped, true); assert.deepEqual(ob.counts(), { pending: 1, failed: 0 });
});

test('outbox: guardado concurrente durante la sincronización no pierde elementos', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const { ob } = mkOutbox({ send: async () => { await gate; return { error: null }; } });
  await ob.enqueue({ plantillanombre: 'A', fotos: [] }, 'u1');
  const syncing = ob.syncAll();
  await ob.enqueue({ plantillanombre: 'B', fotos: [] }, 'u1');             // el técnico guarda otra mientras se envía
  release(); await syncing;
  const left = ob.list(); assert.equal(left.length, 1); assert.equal(left[0].fila.plantillanombre, 'B');
});

test('outbox: sin espacio en localStorage falla en alto (no se pierde en silencio) y limpia las fotos', async () => {
  const { ob, o } = mkOutbox({ storage: fakeStorage(50) });
  await assert.rejects(ob.enqueue({ plantillanombre: 'X'.repeat(200), fotos: [PNG] }, 'u1'), /espacio/i);
  assert.equal(o.blobs._m.size, 0);
});

test('outbox: puede guardar estado "fallida" desde el principio (error permanente al enviar)', async () => {
  const { ob } = mkOutbox();
  await ob.enqueue({ fotos: [] }, 'u1', { estado: 'fallida', error: 'permission denied' });
  assert.deepEqual(ob.counts(), { pending: 0, failed: 1 });
  const r = await ob.syncAll(); assert.equal(r.sent, 0);                    // no se reintenta sola
});

test('outbox: foto irrecuperable no bloquea el envío', async () => {
  const { ob, o, sent } = mkOutbox();
  const it = await ob.enqueue({ fotos: [PNG, PNG] }, 'u1');
  o.blobs._m.delete(it.fila.fotos[0].slice(4));                              // se perdió una
  const r = await ob.syncAll(); assert.equal(r.sent, 1); assert.equal(sent[0].fotos.length, 1);
});

test('dataUrlToBlob decodifica base64', async () => {
  const b = U.dataUrlToBlob(PNG); assert.equal(b.type, 'image/png'); assert.equal(b.size, 8);
});

test('countMedPend cuenta pendientes y fallidas', () => {
  const st = fakeStorage(); st.setItem(U.MED_PEND_KEY, JSON.stringify([{ estado: 'pendiente' }, { estado: 'fallida' }, {}]));
  assert.deepEqual(U.countMedPend(st), { pending: 2, failed: 1 });
});

/* ───── almacén de fotos sobre IndexedDB (con un IndexedDB simulado) ───── */
function fakeIDB() {
  const stores = {};
  return { open() {
    const req = {}; setTimeout(() => {
      const db = { createObjectStore: n => { stores[n] = new Map(); },
        transaction: n => { const t = {}; const st = { put: (v, k) => { stores[n].set(k, v); return { get result() { return k; } }; },
          get: k => ({ get result() { return stores[n].get(k); } }), delete: k => { stores[n].delete(k); return { result: undefined }; } };
          t.objectStore = () => st; setTimeout(() => t.oncomplete && t.oncomplete(), 0); return t; } };
      req.result = db; req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess();
    }, 0); return req; } };
}
test('createBlobStore guarda, lee y borra', async () => {
  const s = U.createBlobStore(fakeIDB(), 'x');
  await s.put('k1', 'valor'); assert.equal(await s.get('k1'), 'valor');
  await s.del('k1'); assert.equal(await s.get('k1'), undefined);
});
