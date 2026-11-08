/**
 * outbox-mediciones.js — Bandeja de salida de mediciones hechas sin cobertura (siempre cargado).
 *
 * Antes la cola vivía dentro de medidas.js (carga diferida) y guardaba las fotos en base64 en localStorage:
 * con unas pocas fotos se agotaba la cuota (~5 MB), se recortaba en silencio a 60, un envío rechazado se
 * reintentaba eternamente y un reintento tras perder la respuesta duplicaba la medición.
 * Ahora: fotos en IndexedDB, id de cliente (envío idempotente), estados pendiente/fallida, reintentos con
 * espera exponencial y cada usuario envía solo lo suyo. La lógica está en sync-utils.js (con tests).
 */
(function () {
  'use strict';
  const SU = window.SyncUtils;
  if (!SU) { console.error('[outbox] sync-utils.js no está cargado'); return; }

  const BUCKET = 'medidas-fotos', TABLE = 'mediciones_medidas', LEGACY_KEY = 'autopuerta_mediciones_local';
  const client = () => window.supabaseDB || window.sb;
  const uid = () => (window.authState && window.authState.user && window.authState.user.id) || null;
  const toast = (m, t) => { if (window.showToast) window.showToast(m, t); };

  let blobs = null;
  try { if (window.indexedDB) blobs = SU.createBlobStore(window.indexedDB, 'autopuerta_pendientes', 'fotos'); } catch (e) { blobs = null; }

  async function upload(blob) {
    const user = uid();
    if (!user) { const e = new Error('Sin sesión'); e.status = 401; throw e; }
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = user + '/' + SU.randomId().replace(/-/g, '') + '.' + ext;
    const { error } = await client().storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const outbox = SU.createOutbox({
    storage: window.localStorage, blobs, upload,
    // upsert + ignoreDuplicates: si la medición ya llegó (respuesta perdida), reenviarla no crea otra
    send: row => client().from(TABLE).upsert(row, { onConflict: 'id', ignoreDuplicates: true }),
    userId: uid, online: () => navigator.onLine
  });

  // Mediciones de la versión antigua (clave distinta): se migran a la bandeja
  (function migrarLegado() {
    try {
      const viejas = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      if (!Array.isArray(viejas) || !viejas.length) return;
      const list = SU.readMedPend(localStorage);
      viejas.forEach(v => list.push({
        idLocal: 'legacy_' + (v.id || Math.random().toString(36).slice(2)), ownerId: null, estado: 'pendiente', intentos: 0, error: '', ts: Date.now(),
        fila: { id: SU.randomId(), plantillanombre: v.plantillaNombre, clientenombre: v.clienteNombre, tecniconombre: v.tecnicoNombre,
          fecha: v.fecha, valores: v.valores || {}, notas: v.notas || '', fotos: v.fotos || [], estado: 'pendiente' }
      }));
      localStorage.setItem(SU.MED_PEND_KEY, JSON.stringify(list));
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) { /* si falla, se conserva la clave antigua */ }
  })();

  let timer = null, attempt = 0;
  const notify = () => window.dispatchEvent(new CustomEvent('autopuerta:sync-state'));

  async function run() {
    const r = await outbox.syncAll();
    if (r.sent) toast('✅ ' + r.sent + ' medición(es) pendiente(s) enviada(s)', 'success');
    if (r.failed) toast(r.failed + ' medición(es) no se han podido enviar. Revísalas en Mediciones.', 'warning');
    if (r.sent && typeof window.refrescarMediciones === 'function') window.refrescarMediciones();
    if (r.retry && r.left > 0 && navigator.onLine && uid()) schedule(); else attempt = 0;
    notify();
    return r;
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; run().catch(() => { }); }, SU.backoffDelay(attempt++));
  }

  window.MedicionesOutbox = {
    run,
    list: () => outbox.list(uid() || undefined),
    counts: id => outbox.counts(id),
    retry: id => { outbox.retry(id); notify(); },
    retryAll: () => { outbox.retryAll(); notify(); },
    discard: async id => { await outbox.discard(id); notify(); },
    enqueue: async (fila, ownerId, extra) => {
      const item = await outbox.enqueue(fila, ownerId, extra);
      notify();
      if (item.estado === 'pendiente') schedule();
      return item;
    }
  };

  window.addEventListener('online', () => { attempt = 0; run().catch(() => { }); });
  window.addEventListener('valgom:authenticated', () => setTimeout(() => run().catch(() => { }), 1500));
  setTimeout(() => run().catch(() => { }), 6000);
})();
