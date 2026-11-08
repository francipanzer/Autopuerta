// Entorno de pruebas: ejecuta el db.js REAL dentro de un "navegador" simulado con Supabase e IndexedDB falsos.
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SyncUtils = require('../../js/sync-utils.js');

export function fakeIndexedDB() {
  const stores = {};
  const clone = v => (v === undefined ? undefined : structuredClone(v));
  return {
    open() {
      const req = {};
      setTimeout(() => {
        const db = {
          createObjectStore: n => { stores[n] = stores[n] || new Map(); },
          transaction: n => {
            const tx = {};
            const st = {
              get: k => { const r = {}; setTimeout(() => { r.result = clone(stores[n].get(k)); r.onsuccess && r.onsuccess(); }, 0); return r; },
              put: (v, k) => { stores[n].set(k, clone(v)); return {}; },
              delete: k => { stores[n].delete(k); return {}; }
            };
            tx.objectStore = () => st;
            setTimeout(() => tx.oncomplete && tx.oncomplete(), 5);   // después de que se entregue el resultado de get()
            return tx;
          }
        };
        req.result = db; req.target = req;
        req.onupgradeneeded && req.onupgradeneeded({ target: req });
        req.onsuccess && req.onsuccess({ target: req });
      }, 0);
      return req;
    }
  };
}

// Supabase mínimo en memoria: select/insert/update/upsert/delete con eq, order, range, count y tope de filas (max_rows)
export function fakeSupabase(tables, opts = {}) {
  const maxRows = opts.maxRows ?? 1000;
  const log = [];
  const api = {
    tables, log, failNext: null, rpcs: {},
    from(name) {
      const q = { name, op: 'select', filters: [], patch: null, rows: null, returning: false, single: false, rng: null, ord: null, cnt: false };
      const b = {
        select(_c, o) { if (q.op === 'select') q.cnt = !!(o && o.count); else q.returning = true; return b; },
        insert(r) { q.op = 'insert'; q.rows = [].concat(r); return b; },
        update(p) { q.op = 'update'; q.patch = p; return b; },
        upsert(r) { q.op = 'upsert'; q.rows = [].concat(r); return b; },
        delete() { q.op = 'delete'; return b; },
        eq(c, v) { q.filters.push([c, v]); return b; },
        order(c, o) { q.ord = [c, !(o && o.ascending === false)]; return b; },
        range(f, t) { q.rng = [f, t]; return b; },
        maybeSingle() { q.single = true; return b; },
        then(res, rej) { return Promise.resolve().then(() => run(q)).then(res, rej); }
      };
      return b;
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: path => ({ data: { publicUrl: 'https://cdn.test/' + path } }) }) },
    rpc: async n => (api.rpcs[n] ? { data: api.rpcs[n](), error: null } : { data: null, error: { message: 'rpc ' + n + ' no existe', code: '42883' } })
  };
  function run(q) {
    log.push({ table: q.name, op: q.op, patch: q.patch, filters: q.filters.slice() });
    if (api.failNext) { const f = api.failNext; api.failNext = null; return f; }
    const tbl = (tables[q.name] = tables[q.name] || []);
    const match = r => q.filters.every(([c, v]) => String(r[c]) === String(v));
    if (q.op === 'select') {
      let rows = tbl.filter(match); const total = rows.length;
      if (q.ord) rows = rows.slice().sort((a, b) => (a[q.ord[0]] > b[q.ord[0]] ? 1 : -1) * (q.ord[1] ? 1 : -1));
      const [f, t] = q.rng || [0, Infinity]; rows = rows.slice(f, Math.min(t + 1, f + maxRows));
      if (q.single) return { data: rows[0] ? { ...rows[0] } : null, error: null };
      return { data: rows.map(r => ({ ...r })), error: null, count: q.cnt ? total : null };
    }
    if (q.op === 'update') {
      const hit = tbl.filter(match); hit.forEach(r => Object.assign(r, q.patch));
      return { data: q.returning ? hit.map(r => ({ ...r })) : null, error: null };
    }
    if (q.op === 'insert' || q.op === 'upsert') {
      q.rows.forEach(r => { const i = tbl.findIndex(x => String(x.id) === String(r.id)); if (i === -1) tbl.push({ ...r }); else if (q.op === 'upsert') Object.assign(tbl[i], r); });
      return { data: null, error: null };
    }
    if (q.op === 'delete') { tables[q.name] = tbl.filter(r => !match(r)); return { data: null, error: null }; }
  }
  return api;
}

export function loadDb({ tables = {}, maxRows = 1000, user = null, online = true } = {}) {
  const store = new Map();
  const et = new EventTarget();
  const sb = fakeSupabase(tables, { maxRows });
  const toasts = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, Date, Math, JSON, Promise, Array, Object, Map, Set, Error, TypeError, String, Number, Symbol, structuredClone,
    CustomEvent, atob, Blob, Uint8Array,
    navigator: { onLine: online },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    indexedDB: fakeIndexedDB(),
    SUPABASE_CONFIG: { url: 'http://x', anon: 'eyJfake' },
    sb, SyncUtils, authState: user ? { user } : null,
    addEventListener: (...a) => et.addEventListener(...a), dispatchEvent: e => et.dispatchEvent(e),
    showToast: (m, t) => toasts.push([m, t])
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../../js/db.js', import.meta.url), 'utf8'), sandbox, { filename: 'db.js' });
  const get = expr => vm.runInContext(expr, sandbox);
  return { sandbox, sb, get, toasts, ls: sandbox.localStorage, wait: ms => new Promise(r => setTimeout(r, ms)) };
}
