import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const BASE = 'https://app.test/';
const abs = u => new URL(typeof u === 'string' ? u : u.url, BASE).href;
const noQ = u => u.split('?')[0];
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ver = f => (html.match(new RegExp('js/' + f.replace('.', '\\.') + '\\?v=(\\d+)')) || [])[1];

function loadSW({ files = {}, hang = false } = {}) {
  const handlers = {}, store = new Map(), added = [];
  class Req { constructor(r, o) { this.url = abs(r); this.method = 'GET'; this.mode = (r && r.mode) || 'cors'; this.headers = { get: () => null }; Object.assign(this, o || {}); } }
  class Res { constructor(body, o = {}) { this.body = body; this.status = o.status ?? 200; this.ok = this.status >= 200 && this.status < 300; }
    clone() { return new Res(this.body, { status: this.status }); } async text() { return this.body; } }
  const find = (req, opts) => { const k = abs(req); if (store.has(k)) return store.get(k);
    if (opts && opts.ignoreSearch) for (const [kk, v] of store) if (noQ(kk) === noQ(k)) return v; return undefined; };
  const cache = {
    add: async u => { const r = await sandbox.fetch(u); if (!r.ok) throw new Error('bad ' + u); added.push(abs(u)); store.set(abs(u), r); },
    addAll: async us => { for (const u of us) await cache.add(u); },
    put: async (rq, rs) => { store.set(abs(rq), rs); },
    match: async (rq, o) => find(rq, o)
  };
  const sandbox = {
    console, URL, Promise, Set, Map, Array, Object, JSON, Error, RegExp, String, Date, Math,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 ? 15 : ms),       // el "timeout de red" de 5 s pasa a 15 ms
    clearTimeout, Request: Req, Response: Res,
    caches: { open: async () => cache, match: async (rq, o) => find(rq, o), keys: async () => ['autopuerta-v122'], delete: async () => true },
    fetch: async u => {
      const k = abs(u);
      if (hang) return new Promise(() => {});                              // red colgada
      if (k in files) return new Res(files[k]);
      return new Res('', { status: 404 });
    },
    self: null
  };
  sandbox.self = { addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting() {}, clients: { claim() {} }, location: { href: BASE + 'sw.js' } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), sandbox);
  const run = (req) => { const ev = { request: req, respondWith(p) { this.p = p; }, waitUntil() {} }; handlers.fetch(ev); return ev.p; };
  return { sandbox, handlers, store, added, cache, run, Req, Res, get: e => vm.runInContext(e, sandbox) };
}
const navReq = (u, Req) => { const r = new Req(u); r.mode = 'navigate'; return r; };

test('extractAssetUrls: saca de index.html scripts, hojas, LAZY_SCRIPTS y CSS de medidas', () => {
  const { get } = loadSW();
  const urls = get('extractAssetUrls')(html);
  const has = s => assert.ok(urls.some(u => u.startsWith(s)), 'falta ' + s);
  ['js/sync-utils.js', 'js/db.js', 'js/outbox-mediciones.js', 'js/app.js', 'js/auth.js', 'js/medidas.js', 'js/medidas-datos.js',
    'js/pdf-generator.js', 'js/pages_partes.js', 'js/pages_presupuestos.js', 'css/styles.css', 'css/medidas.css',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome'].forEach(has);
});
test('todo script local de index.html y de LAZY_SCRIPTS existe en disco (nada que precachear da 404)', () => {
  const { get } = loadSW();
  for (const u of get('extractAssetUrls')(html).filter(u => !u.startsWith('http'))) {
    assert.ok(fs.existsSync(new URL('../' + u.split('?')[0], import.meta.url)), 'no existe ' + u);
  }
});
test('extractFontUrls resuelve las fuentes relativas de Font Awesome', () => {
  const { get } = loadSW();
  const css = "@font-face{src:url(../webfonts/fa-solid-900.woff2) format('woff2'),url(../webfonts/fa-solid-900.ttf) format('truetype')}";
  assert.deepEqual(Array.from(get('extractFontUrls')(css, 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css')),
    ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2']);
});
test('las 9 hojas de medidas del precache existen en disco', () => {
  const { get } = loadSW();
  const hojas = get('HOJAS_MEDIDAS');
  assert.equal(hojas.length, 9);
  for (const h of hojas) assert.ok(fs.existsSync(new URL('../' + h, import.meta.url)), h);
  for (const f of fs.readdirSync(new URL('../plantillas/', import.meta.url)).filter(f => f.endsWith('.webp'))) assert.ok(hojas.includes('plantillas/' + f), 'sin precachear: ' + f);
});

test('instalaciÃ³n: cachea imprescindibles + todos los JS, y un fallo no la aborta', async () => {
  const files = { [BASE]: 'x', [BASE + 'index.html']: html, [BASE + 'css/styles.css']: 'x', [BASE + 'manifest.json']: '{}',
    [BASE + 'js/medidas.js?v=' + ver('medidas.js')]: 'x', [BASE + 'js/sync-utils.js?v=' + ver('sync-utils.js')]: 'x', [BASE + 'js/db.js?v=' + ver('db.js')]: 'x' };
  const w = loadSW({ files });
  let waited; w.handlers.install({ waitUntil: p => { waited = p; } });
  await waited;
  for (const u of ['js/medidas.js?v=' + ver('medidas.js'), 'js/sync-utils.js?v=' + ver('sync-utils.js'), 'js/db.js?v=' + ver('db.js'), 'index.html']) assert.ok(w.added.includes(BASE + u), 'no precacheado ' + u);
});
test('instalaciÃ³n: si faltan los imprescindibles NO se instala (se reintentarÃ¡) en vez de quedar a medias', async () => {
  const w = loadSW({ files: {} });
  let skipped = false; w.sandbox.self.skipWaiting = () => { skipped = true; };
  let waited; w.handlers.install({ waitUntil: p => { waited = p; } });
  await waited; assert.equal(skipped, false);
});

test('offline: abrir la app desde una notificaciÃ³n (?page=â€¦) sirve index.html cacheado', async () => {
  const w = loadSW({ hang: false, files: {} });
  w.store.set(BASE + 'index.html', new w.Res('<html>app</html>'));
  w.sandbox.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const res = await w.run(navReq(BASE + '?page=incidencias', w.Req));
  assert.equal(await res.text(), '<html>app</html>');
});
test('cobertura mala: con red colgada se sirve la copia en cachÃ© tras el timeout', async () => {
  const w = loadSW({ hang: true });
  w.store.set(BASE + 'js/app.js?v=71', new w.Res('copia'));
  const res = await w.run(new w.Req(BASE + 'js/app.js?v=71'));
  assert.equal(await res.text(), 'copia');
});
test('red rÃ¡pida: gana la versiÃ³n nueva y se actualiza la cachÃ©', async () => {
  const w = loadSW({ files: { [BASE + 'js/app.js?v=71']: 'nueva' } });
  w.store.set(BASE + 'js/app.js?v=71', new w.Res('vieja'));
  const res = await w.run(new w.Req(BASE + 'js/app.js?v=71'));
  assert.equal(await res.text(), 'nueva');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(w.store.get(BASE + 'js/app.js?v=71').body, 'nueva');
});
test('sin copia y sin red devuelve 503 (no undefined)', async () => {
  const w = loadSW(); w.sandbox.fetch = async () => { throw new TypeError('x'); };
  const res = await w.run(new w.Req(BASE + 'js/otro.js'));
  assert.equal(res.status, 503);
});
test('las peticiones a Supabase nunca pasan por el service worker', () => {
  const w = loadSW(); const ev = { request: new w.Req('https://abc.supabase.co/rest/v1/clientes'), respondWith() { throw new Error('no debe responder'); }, waitUntil() {} };
  w.handlers.fetch(ev);
});
