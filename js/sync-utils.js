/**
 * sync-utils.js — Lógica de robustez compartida (sin dependencias del DOM)
 *
 *  · classifyError / decideAfterError  → qué hacer con un error al sincronizar (reintentar, parar, dar por fallida)
 *  · backoffDelay                       → espera exponencial con variación aleatoria
 *  · diffFields / threeWayMerge         → guardar solo lo que cambia y fusionar con lo que cambió otro usuario
 *  · fetchAllPages                      → leer tablas completas superando el límite de filas de PostgREST
 *  · createBlobStore                    → fotos pendientes en IndexedDB (sin la cuota de localStorage)
 *  · createOutbox                       → bandeja de salida de mediciones: idempotente, por usuario, sin bloqueos
 *
 * Funciona en el navegador (window.SyncUtils) y en Node (module.exports) para poder probarlo.
 */
(function (root) {
  'use strict';

  var MED_PEND_KEY = 'autopuerta_mediciones_pendientes';
  var MAX_ATTEMPTS = 10;          // reintentos "transitorios" antes de dar un envío por fallido
  var MAX_PENDING_ITEMS = 500;    // tope de seguridad de la bandeja (no se descarta nada en silencio: se avisa)

  /* ───────────────────────── Errores ───────────────────────── */

  var NET_RE = /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|timed out|offline|aborted|\babort|err_internet|net::/i;
  var AUTH_RE = /jwt (expired|invalid)|invalid jwt|not authenticated|authentication required|refresh token/i;
  var TRANSIENT_CODES = ['57014', '53300', '40001', '40P01', '08000', '08003', '08006',
    'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'];

  /**
   * 'network'   → sin red: parar y reintentar al volver la conexión (no cuenta como intento)
   * 'auth'      → sesión caducada/sin sesión: parar, reintentar tras renovar la sesión (no se descarta)
   * 'transient' → fallo temporal del servidor (5xx, 429, timeouts): reintentar con espera, con tope
   * 'permanent' → el servidor rechaza esta operación (RLS, datos inválidos…): reintentar no lo arregla
   */
  function classifyError(err, online) {
    if (online === false) return 'network';
    if (!err) return 'transient';
    var status = Number(err.status || err.statusCode || 0);
    var code = String(err.code || '').toUpperCase();
    var msg = String(err.message || err || '');

    if (typeof TypeError !== 'undefined' && err instanceof TypeError) return 'network';
    if (!status && NET_RE.test(msg) && !code) return 'network';
    if (status === 401 || code === 'PGRST301' || code === 'PGRST302' || AUTH_RE.test(msg)) return 'auth';
    if (status === 408 || status === 429 || status >= 500 || TRANSIENT_CODES.indexOf(code) !== -1) return 'transient';
    if (status >= 400 && status < 500) return 'permanent';
    // Clases SQLSTATE: 22 datos, 23 integridad, 42 sintaxis/permisos, P0 RAISE EXCEPTION; PGRST1xx/2xx errores de petición
    if (/^(22|23|42|44|2F|0A|P0|PGRST1|PGRST2)/.test(code)) return 'permanent';
    if (NET_RE.test(msg)) return 'network';
    return 'transient';
  }

  function decideAfterError(err, attempts, opts) {
    opts = opts || {};
    var kind = classifyError(err, opts.online);
    var max = opts.maxAttempts || MAX_ATTEMPTS;
    if (kind === 'network' || kind === 'auth') return { kind: kind, action: 'stop', countAttempt: false };
    if (kind === 'transient') {
      return (attempts + 1 >= max)
        ? { kind: kind, action: 'fail', countAttempt: true }
        : { kind: kind, action: 'stop', countAttempt: true };
    }
    return { kind: kind, action: 'fail', countAttempt: true };
  }

  function backoffDelay(attempt, base, cap, rnd) {
    base = base || 5000; cap = cap || 300000; rnd = rnd || Math.random;
    var d = Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
    return Math.round(d * (0.5 + rnd() * 0.5));
  }

  // Convierte la respuesta de supabase-js ({error,status}) en un Error con código y estado HTTP
  function errorFromResponse(res) {
    var e = res && res.error;
    if (!e) return null;
    var out = new Error(e.message || 'Error de servidor');
    out.code = e.code; out.details = e.details; out.hint = e.hint;
    out.status = res.status || e.status || 0;
    return out;
  }

  function errorMessage(err) {
    if (!err) return 'Error desconocido';
    var m = String(err.message || err);
    return (err.hint ? m + ' — ' + err.hint : m).slice(0, 300);
  }

  /* ─────────────── Comparación y fusión de cambios ─────────────── */

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;   // NaN
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(b, ka[i]) || !deepEqual(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }

  /** Campos de `next` cuyo valor difiere del de `base` (solo lo que el usuario ha cambiado). */
  function diffFields(base, next, ignore) {
    var skip = ignore || [], out = {};
    base = base || {};
    Object.keys(next || {}).forEach(function (k) {
      if (skip.indexOf(k) !== -1) return;
      if (!deepEqual(base[k], next[k])) out[k] = next[k];
    });
    return out;
  }

  /**
   * Fusión a 3 bandas.  base = lo que yo vi al empezar a editar, mine = mi versión, server = lo que hay ahora.
   *  · Campo que solo cambié yo           → se escribe el mío
   *  · Campo que solo cambió otro usuario → no se toca (se conserva el suyo)
   *  · Campo que cambiamos los dos        → conflicto. Por defecto gana el mío (prefer:'mine') y se informa;
   *    los campos numéricos en deltaFields (p. ej. stock) suman la diferencia en vez de pisar.
   */
  function threeWayMerge(base, mine, server, opts) {
    opts = opts || {};
    var changed = diffFields(base, mine, opts.ignore);
    var delta = opts.deltaFields || [];
    var prefer = opts.prefer || 'mine';
    var patch = {}, conflicts = [];
    Object.keys(changed).forEach(function (f) {
      var theirs = server ? server[f] : undefined;
      var was = base ? base[f] : undefined;
      if (!server || deepEqual(theirs, was)) { patch[f] = changed[f]; return; }          // nadie más lo tocó
      if (deepEqual(theirs, changed[f])) return;                                          // ya coincide
      if (delta.indexOf(f) !== -1 && isFinite(Number(theirs)) && isFinite(Number(was)) && isFinite(Number(changed[f]))) {
        patch[f] = Number(theirs) + (Number(changed[f]) - Number(was));                  // contador: suma el cambio
        conflicts.push({ field: f, base: was, mine: changed[f], server: theirs, merged: patch[f], kind: 'delta' });
        return;
      }
      conflicts.push({ field: f, base: was, mine: changed[f], server: theirs, kind: 'overwrite' });
      if (prefer === 'mine') patch[f] = changed[f];
    });
    return { patch: patch, conflicts: conflicts, changed: changed };
  }

  /* ───────────────────── Paginación de tablas ───────────────────── */

  /**
   * Lee todas las filas aunque el servidor limite cada respuesta (PostgREST: 1000 por defecto).
   * makeQuery(from, to) debe devolver {data, error, count}; en la primera página conviene pedir count:'exact'.
   * Si hay recuento se pagina hasta alcanzarlo (válido con cualquier tamaño de página del servidor);
   * si no, hasta recibir una página vacía o más corta que la pedida.
   */
  async function fetchAllPages(makeQuery, opts) {
    opts = opts || {};
    var pageSize = opts.pageSize || 1000, maxRows = opts.maxRows || 200000;
    var out = [], total = null, from = 0, guard = 0;
    while (from < maxRows && guard++ < 1000) {
      var res = await makeQuery(from, from + pageSize - 1);
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (from === 0 && typeof res.count === 'number') total = res.count;
      for (var i = 0; i < rows.length; i++) out.push(rows[i]);
      if (!rows.length) break;
      from += rows.length;
      if (total !== null) { if (out.length >= total) break; }
      else if (rows.length < pageSize) break;
    }
    return out;
  }

  /* ───────────────────────── Fotos en IndexedDB ───────────────────────── */

  function dataUrlToBlob(dataUrl) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
    if (!m) throw new Error('Imagen no válida');
    var mime = m[1] || 'application/octet-stream';
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function createBlobStore(factory, dbName, storeName) {
    storeName = storeName || 'blobs';
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        var r = factory.open(dbName, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(storeName); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { dbp = null; rej(r.error); };
      });
      return dbp;
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction(storeName, mode), st = t.objectStore(storeName), rq = fn(st);
          t.oncomplete = function () { res(rq ? rq.result : undefined); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      put: function (k, v) { return run('readwrite', function (s) { return s.put(v, k); }); },
      get: function (k) { return run('readonly', function (s) { return s.get(k); }); },
      del: function (k) { return run('readwrite', function (s) { return s.delete(k); }); }
    };
  }

  /* ───────────── Bandeja de salida de mediciones (offline) ───────────── */

  function randomId() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function readMedPend(storage, key) {
    try { var l = JSON.parse(storage.getItem(key || MED_PEND_KEY) || '[]'); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  }
  function countMedPend(storage, key) {
    var l = readMedPend(storage, key);
    return {
      pending: l.filter(function (i) { return i.estado !== 'fallida'; }).length,
      failed: l.filter(function (i) { return i.estado === 'fallida'; }).length
    };
  }

  /**
   * opts: storage, key, blobs{put,get,del}|null, upload(blob)->Promise<url>, send(row)->Promise<{error,status}>,
   *       userId()->string|null, online()->bool, now()->ms
   * Garantías: la fila lleva un id de cliente (reintentar no duplica), las fotos viven en IndexedDB, nada se descarta
   * en silencio, un envío permanentemente rechazado pasa a 'fallida' sin bloquear los demás y cada usuario solo
   * envía lo suyo.
   */
  function createOutbox(opts) {
    var storage = opts.storage, KEY = opts.key || MED_PEND_KEY, blobs = opts.blobs || null;
    var now = opts.now || function () { return Date.now(); };
    var running = null;

    function read() { return readMedPend(storage, KEY); }
    function write(list) {
      try { storage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
    }
    // Lectura-modificación-escritura SIN esperas intermedias: seguro frente a otros guardados concurrentes
    function mutate(fn) { var l = read(); var r = fn(l); if (!write(l)) throw new Error('No hay espacio en el móvil para guardar los cambios pendientes'); return r; }
    function find(l, id) { for (var i = 0; i < l.length; i++) if (l[i].idLocal === id) return l[i]; return null; }
    function blobKeys(item) {
      return ((item.fila && item.fila.fotos) || []).filter(function (f) { return typeof f === 'string' && f.indexOf('idb:') === 0; })
        .map(function (f) { return f.slice(4); });
    }
    async function dropBlobs(keys) {
      if (!blobs) return;
      for (var i = 0; i < keys.length; i++) { try { await blobs.del(keys[i]); } catch (e) { /* ya no está */ } }
    }

    async function enqueue(fila, ownerId, extra) {
      extra = extra || {};
      if (read().length >= MAX_PENDING_ITEMS) throw new Error('Hay demasiadas mediciones sin enviar en este móvil (' + MAX_PENDING_ITEMS + '). Conéctate para enviarlas.');
      var idLocal = 'local_' + now() + '_' + randomId().slice(0, 8);
      var fotos = [], stored = [];
      var src = (fila.fotos || []);
      for (var i = 0; i < src.length; i++) {
        var f = src[i];
        if (blobs && typeof f === 'string' && f.indexOf('data:image/') === 0) {
          try { var k = idLocal + '_' + i; await blobs.put(k, dataUrlToBlob(f)); stored.push(k); fotos.push('idb:' + k); continue; }
          catch (e) { /* sin IndexedDB: se conserva en la propia fila */ }
        }
        fotos.push(f);
      }
      var item = {
        idLocal: idLocal, ownerId: ownerId || null, estado: extra.estado || 'pendiente', intentos: 0,
        error: extra.error || '', ts: now(), fila: Object.assign({}, fila, { id: fila.id || randomId(), fotos: fotos })
      };
      try { mutate(function (l) { l.unshift(item); }); }
      catch (e) { await dropBlobs(stored); throw e; }
      return item;
    }

    async function processItem(item, uid) {
      var l0 = read(), cur = find(l0, item.idLocal);
      if (!cur) return { out: 'gone' };
      var fotos = (cur.fila.fotos || []).slice(), uploadedKeys = [];

      for (var i = 0; i < fotos.length; i++) {
        var f = fotos[i];
        if (typeof f !== 'string' || /^https?:/i.test(f)) continue;
        var blob = null;
        if (f.indexOf('idb:') === 0) { try { blob = blobs ? await blobs.get(f.slice(4)) : null; } catch (e) { blob = null; } }
        else if (f.indexOf('data:image/') === 0) { try { blob = dataUrlToBlob(f); } catch (e) { blob = null; } }
        if (!blob) { fotos[i] = null; continue; }                               // foto irrecuperable: se omite, no bloquea
        var url = null, upErr = null;
        try { url = await opts.upload(blob); } catch (e) { url = null; upErr = e; }
        if (!url) {
          var d = decideAfterError(upErr || new Error('No se pudo subir la foto'), cur.intentos, { online: opts.online() });
          mutate(function (l) { var it = find(l, cur.idLocal); if (it) { if (d.countAttempt) it.intentos++; it.error = errorMessage(upErr || 'No se pudo subir la foto'); if (d.action === 'fail') it.estado = 'fallida'; } });
          return { out: d.action === 'fail' ? 'failed' : 'stop' };
        }
        fotos[i] = url;
        uploadedKeys.push(f.indexOf('idb:') === 0 ? f.slice(4) : null);
        // Guarda el progreso: si el envío falla después, no se vuelve a subir esta foto
        mutate(function (l) { var it = find(l, cur.idLocal); if (it) it.fila.fotos[i] = url; });
      }

      var row = Object.assign({}, cur.fila, { fotos: fotos.filter(Boolean) });
      var res, thrown = null;
      try { res = await opts.send(row); } catch (e) { thrown = e; }
      var err = thrown || errorFromResponse(res);
      if (!err || String(err.code) === '23505') {                              // enviada (o ya estaba: id repetido)
        mutate(function (l) { var i2 = l.findIndex(function (x) { return x.idLocal === cur.idLocal; }); if (i2 !== -1) l.splice(i2, 1); });
        await dropBlobs(blobKeys(cur));
        return { out: 'sent' };
      }
      var dec = decideAfterError(err, cur.intentos, { online: opts.online() });
      mutate(function (l) {
        var it = find(l, cur.idLocal); if (!it) return;
        if (dec.countAttempt) it.intentos++;
        it.error = errorMessage(err);
        if (dec.action === 'fail') it.estado = 'fallida';
      });
      return { out: dec.action === 'fail' ? 'failed' : 'stop', kind: dec.kind };
    }

    function syncAll() {
      if (running) return running;
      running = (async function () {
        var summary = { sent: 0, failed: 0, left: 0, retry: false, skipped: false };
        var uid = opts.userId();
        if (!uid || !opts.online()) { summary.skipped = true; summary.left = counts().pending; summary.retry = summary.left > 0; return summary; }
        var ids = read().filter(function (i) { return i.estado === 'pendiente' && (!i.ownerId || i.ownerId === uid); })
          .map(function (i) { return i.idLocal; });
        for (var n = 0; n < ids.length; n++) {
          var r;
          try {
            mutate(function (l) { var it = find(l, ids[n]); if (it && !it.ownerId) it.ownerId = uid; });   // migra lo antiguo al usuario actual
            r = await processItem({ idLocal: ids[n] }, uid);
          } catch (e) { r = { out: 'stop' }; }
          if (r.out === 'sent') summary.sent++;
          else if (r.out === 'failed') summary.failed++;
          else if (r.out === 'stop') { summary.retry = true; break; }       // red/sesión/servidor: dejar el resto para luego
        }
        summary.left = counts().pending;
        return summary;
      })();
      var clear = function () { running = null; };
      running.then(clear, clear);
      return running;
    }

    function list(ownerId) {
      return read().filter(function (i) { return !ownerId || !i.ownerId || i.ownerId === ownerId; });
    }
    function counts(ownerId) {
      var l = list(ownerId);
      return {
        pending: l.filter(function (i) { return i.estado !== 'fallida'; }).length,
        failed: l.filter(function (i) { return i.estado === 'fallida'; }).length
      };
    }
    function retry(idLocal) {
      mutate(function (l) { var it = find(l, idLocal); if (it) { it.estado = 'pendiente'; it.intentos = 0; it.error = ''; } });
    }
    function retryAll() { mutate(function (l) { l.forEach(function (it) { if (it.estado === 'fallida') { it.estado = 'pendiente'; it.intentos = 0; it.error = ''; } }); }); }
    async function discard(idLocal) {
      var keys = [];
      mutate(function (l) { var i = l.findIndex(function (x) { return x.idLocal === idLocal; }); if (i !== -1) { keys = blobKeys(l[i]); l.splice(i, 1); } });
      await dropBlobs(keys);
    }

    return { enqueue: enqueue, syncAll: syncAll, list: list, counts: counts, retry: retry, retryAll: retryAll, discard: discard, _read: read };
  }

  var api = {
    MED_PEND_KEY: MED_PEND_KEY, MAX_ATTEMPTS: MAX_ATTEMPTS,
    classifyError: classifyError, decideAfterError: decideAfterError, backoffDelay: backoffDelay,
    errorFromResponse: errorFromResponse, errorMessage: errorMessage,
    deepEqual: deepEqual, diffFields: diffFields, threeWayMerge: threeWayMerge,
    fetchAllPages: fetchAllPages, dataUrlToBlob: dataUrlToBlob, createBlobStore: createBlobStore,
    readMedPend: readMedPend, countMedPend: countMedPend, createOutbox: createOutbox, randomId: randomId
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SyncUtils = api;
})(typeof self !== 'undefined' ? self : this);
