import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { loadDb } from './helpers/browser-env.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
function loadWithOutbox(opts) {
  const env = loadDb(opts);
  env.sandbox.setTimeout = (fn, ms) => { const t = setTimeout(fn, ms); t.unref && t.unref(); return t; };   // no dejar temporizadores vivos
  vm.runInContext(fs.readFileSync(new URL('../js/outbox-mediciones.js', import.meta.url), 'utf8'), env.sandbox, { filename: 'outbox-mediciones.js' });
  return env;
}

test('integración: encolar sin red y enviar al volver — fotos a Storage, una sola fila, bandeja vacía', async () => {
  const env = loadWithOutbox({ tables: { mediciones_medidas: [] }, user: { id: 'u1' }, online: false });
  const ob = env.sandbox.MedicionesOutbox;
  await ob.enqueue({ plantillanombre: 'Seccional', clienteid: 'C1', valores: { a: 1 }, fotos: [PNG, PNG], estado: 'pendiente' }, 'u1');
  assert.deepEqual({ ...ob.counts('u1') }, { pending: 1, failed: 0 });
  assert.ok(!env.ls.getItem('autopuerta_mediciones_pendientes').includes('base64'));     // las fotos no están en localStorage
  env.sandbox.navigator.onLine = true;
  const r = await ob.run();
  assert.equal(r.sent, 1);
  const rows = env.sb.tables.mediciones_medidas;
  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(rows[0].fotos.length, 2); assert.ok(rows[0].fotos.every(u => u.startsWith('https://cdn.test/u1/')));
  assert.deepEqual({ ...ob.counts('u1') }, { pending: 0, failed: 0 });
  await ob.run();                                                                         // un segundo envío no duplica
  assert.equal(env.sb.tables.mediciones_medidas.length, 1);
});

test('integración: el envío usa upsert con ignoreDuplicates sobre el id (idempotente)', async () => {
  const env = loadWithOutbox({ tables: { mediciones_medidas: [] }, user: { id: 'u1' } });
  let opts = null; const realFrom = env.sb.from.bind(env.sb);
  env.sb.from = n => { const b = realFrom(n); const up = b.upsert; b.upsert = (r, o) => { opts = o; return up(r); }; return b; };
  await env.sandbox.MedicionesOutbox.enqueue({ plantillanombre: 'X', fotos: [] }, 'u1');
  await env.sandbox.MedicionesOutbox.run();
  assert.deepEqual({ ...opts }, { onConflict: 'id', ignoreDuplicates: true });
});

test('integración: migra la cola de la versión antigua y no la pierde', async () => {
  const env = loadDb({ tables: { mediciones_medidas: [] }, user: { id: 'u1' } });
  env.ls.setItem('autopuerta_mediciones_local', JSON.stringify([{ id: 'v1', plantillaNombre: 'Vieja', clienteNombre: 'Cli', fecha: '2026-01-01', valores: { a: 1 }, fotos: [] }]));
  env.sandbox.setTimeout = (fn, ms) => { const t = setTimeout(fn, ms); t.unref && t.unref(); return t; };
  vm.runInContext(fs.readFileSync(new URL('../js/outbox-mediciones.js', import.meta.url), 'utf8'), env.sandbox);
  assert.equal(env.ls.getItem('autopuerta_mediciones_local'), null);
  const r = await env.sandbox.MedicionesOutbox.run();
  assert.equal(r.sent, 1); assert.equal(env.sb.tables.mediciones_medidas[0].plantillanombre, 'Vieja');
});

test('integración: la bandeja de un usuario no se envía con la sesión de otro', async () => {
  const env = loadWithOutbox({ tables: { mediciones_medidas: [] }, user: { id: 'u1' } });
  env.sandbox.navigator.onLine = false;
  await env.sandbox.MedicionesOutbox.enqueue({ plantillanombre: 'De u1', fotos: [] }, 'u1');
  env.sandbox.authState = { user: { id: 'u2' } }; env.sandbox.navigator.onLine = true;
  assert.equal((await env.sandbox.MedicionesOutbox.run()).sent, 0);
  assert.equal(env.sb.tables.mediciones_medidas.length, 0);
});
