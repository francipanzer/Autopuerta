
// ── IMPORTAR CLIENTES DESDE UNA FOTO (folio de rutas) ─────────────────────────
// Foto -> OCR (Tesseract + preprocesado en js/folio-ocr.js) -> filas editables -> ubicaciones de un cliente central, con su ruta.
(function () {
  const esc = s => window.escapeHtml(s);
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  const nk = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const OCR_WIDTH = 2200;

  let st = null; // estado del modal abierto

  function newRow(r) {
    return { uid: Math.random().toString(36).slice(2), sel: true, ruta: r.ruta || '', nombre: r.nombre || '', direccion: r.direccion || '', conf: r.conf == null ? 100 : r.conf };
  }

  async function fileToImageData(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) {
      bmp = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img); img.onerror = () => rej(new Error('No se pudo leer la imagen'));
        img.src = URL.createObjectURL(file);
      });
    }
    const sw = bmp.width, sh = bmp.height;
    let w = OCR_WIDTH, h = Math.round(sh * (OCR_WIDTH / sw));
    if (h > 4200) { h = 4200; w = Math.round(sw * (4200 / sh)); }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  function grayToCanvas(g, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) { id.data[p] = id.data[p + 1] = id.data[p + 2] = g[i]; id.data[p + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  async function ensureEngine(setStatus) {
    if (!window.FolioOCR) await window.loadScriptOnce((window.LAZY_SCRIPTS && window.LAZY_SCRIPTS.folioOcr) || 'js/folio-ocr.js');
    if (!st.worker) {
      setStatus('Cargando el motor de lectura (solo la primera vez)…');
      await window.ensureTesseract();
      st.worker = await Tesseract.createWorker('spa', 1, {
        logger: m => {
          if (m.status && /loading|initializing/.test(m.status)) setStatus('Preparando el motor de lectura… ' + Math.round((m.progress || 0) * 100) + '%');
        }
      });
    }
    return st.worker;
  }

  // ── Coincidencia con clientes existentes ──
  function findExisting(nombre, cadenaId) {
    const k = nk(nombre);
    if (!k || !st.ubicaciones || !cadenaId) return null;
    const u = st.ubicaciones.find(x => String(x.clienteId) === String(cadenaId) && nk(x.denominacion) === k);
    return u ? { ...u, nombre: u.denominacion } : null;
  }

  function rowHtml(r) {
    const low = r.conf < 60;
    const ex = findExisting(r.nombre, st.cadenaId);
    return `<div class="imp-row" data-uid="${r.uid}" style="padding:8px 0;border-bottom:1px dashed var(--border);">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <input type="checkbox" data-f="sel" ${r.sel ? 'checked' : ''} style="width:18px;height:18px;flex:0 0 auto;" title="Importar esta fila">
        <input type="text" data-f="ruta" value="${esc(r.ruta)}" placeholder="Ruta" inputmode="numeric" list="imp-rutas-list" title="Número de ruta"
          style="width:70px;flex:0 0 70px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);">
        <input type="text" data-f="nombre" value="${esc(r.nombre)}" placeholder="Nombre de la tienda / centro"
          style="flex:1 1 180px;min-width:150px;padding:7px;border:1px solid ${low ? '#f59e0b' : 'var(--border)'};border-radius:8px;background:var(--surface-alt);color:var(--text);">
        <input type="text" data-f="direccion" value="${esc(r.direccion)}" placeholder="Dirección completa (calle, nº, CP, población)"
          style="flex:2 1 260px;min-width:200px;padding:7px;border:1px solid ${low && !r.direccion ? '#f59e0b' : 'var(--border)'};border-radius:8px;background:var(--surface-alt);color:var(--text);">
        <button type="button" class="btn btn-outline btn-sm" data-act="merge" title="Unir con la fila anterior (cuando el nombre o la dirección salieron partidos)"><i class="fas fa-arrow-up"></i></button>
        <button type="button" class="btn btn-danger btn-sm" data-act="del" title="Quitar fila"><i class="fas fa-trash"></i></button>
      </div>
      <div data-badge style="margin:4px 0 0 26px;font-size:12px;color:#d97706;${ex || low ? '' : 'display:none;'}">${ex ? 'Ya existe como «' + esc(ex.nombre) + '»: se actualizarán su ruta y dirección. ' : ''}${low ? 'Lectura dudosa: revísala.' : ''}</div>
    </div>`;
  }

  function refreshBadge(rowEl, r) {
    const b = rowEl.querySelector('[data-badge]');
    const ex = findExisting(r.nombre, st.cadenaId);
    const low = r.conf < 60;
    b.style.display = ex || low ? '' : 'none';
    b.innerHTML = (ex ? 'Ya existe como «' + esc(ex.nombre) + '»: se actualizarán su ruta y dirección. ' : '') + (low ? 'Lectura dudosa: revísala.' : '');
  }

  function updateCounters() {
    const n = st.rows.filter(r => r.sel && r.nombre.trim()).length;
    const btn = document.getElementById('imp-save');
    if (btn) { btn.textContent = n ? `Importar ${n} ubicaci${n === 1 ? 'ón' : 'ones'}` : 'Importar'; btn.disabled = !n || st.busy; }
    const info = document.getElementById('imp-count');
    if (info) info.textContent = st.rows.length ? `${st.rows.length} fila${st.rows.length === 1 ? '' : 's'} detectada${st.rows.length === 1 ? '' : 's'}` : '';
  }

  function renderRows() {
    const box = document.getElementById('imp-rows');
    if (!box) return;
    box.innerHTML = st.rows.length ? st.rows.map(rowHtml).join('') : '<p style="color:var(--text-muted);margin:8px 0;">Aún no hay filas. Carga una foto o añade filas a mano.</p>';
    updateCounters();
  }

  async function handleFile(file) {
    if (!file || st.busy) return;
    if (!/^image\//.test(file.type || 'image/')) { toast('El archivo no es una imagen', 'error'); return; }
    const status = document.getElementById('imp-status');
    const bar = document.getElementById('imp-bar');
    const setStatus = (t, p) => {
      status.style.display = ''; status.style.color = 'var(--text-muted)'; status.textContent = t;
      document.getElementById('imp-barwrap').style.display = p == null ? 'none' : '';
      if (p != null) bar.style.width = Math.round(p * 100) + '%';
    };
    st.busy = true; updateCounters();
    const thumb = document.getElementById('imp-thumb');
    if (st.thumbUrl) URL.revokeObjectURL(st.thumbUrl);
    st.thumbUrl = URL.createObjectURL(file);
    thumb.src = st.thumbUrl; thumb.style.display = '';
    try {
      const worker = await ensureEngine(setStatus);
      setStatus('Preparando la imagen…', 0.02);
      await new Promise(r => setTimeout(r, 30));
      const img = await fileToImageData(file);
      const parsed = await window.FolioOCR.recognizeFolio(worker, img.data, img.width, img.height, 4, {
        encode: grayToCanvas,
        onProgress: (t, p) => setStatus(t, p)
      });
      let added = 0;
      for (const ruta of parsed.rutas) {
        for (const c of ruta.clientes) {
          if (!c.nombre && !c.direccion) continue;
          st.rows.push(newRow({ ruta: ruta.numero, nombre: c.nombre, direccion: c.direccion, conf: c.conf }));
          added++;
        }
      }
      st.loaded = true;
      if (added) { status.style.display = 'none'; document.getElementById('imp-barwrap').style.display = 'none'; toast(`${added} filas leídas. Revisa nombres y direcciones antes de importar.`, 'info'); }
      else setStatus('No se pudo leer ninguna fila. Prueba con una foto más recta y con buena luz, o añade las filas a mano.');
    } catch (e) {
      console.error('Importar foto:', e);
      status.style.display = ''; status.style.color = '#dc2626';
      document.getElementById('imp-barwrap').style.display = 'none';
      status.textContent = 'Error al leer la imagen: ' + (e.message || e);
      st.loaded = true;
    } finally {
      st.busy = false;
      renderRows();
    }
  }

  // Si la columna ordenruta aún no existe en Supabase (SUPABASE_ORDEN_RUTA.sql), se guarda sin el orden en vez de fallar
  async function putCliente(c) {
    try { return await window.db.dbPut('clientes', c); }
    catch (e) {
      if (!/ordenruta/i.test(String(e && (e.message || e)))) throw e;
      const { ordenRuta, ...sinOrden } = c;
      return window.db.dbPut('clientes', sinOrden);
    }
  }

  // ── Guardado ──
  const rutaNum = s => { const m = String(s || '').match(/(\d+)\s*$/); return m ? String(parseInt(m[1], 10)) : null; };

  async function guardar() {
    const cadenaId = document.getElementById('imp-cadena').value;
    if (!cadenaId) { toast('Elige el cliente central al que pertenecen las ubicaciones', 'error'); document.getElementById('imp-cadena').focus(); return; }
    const filas = st.rows.filter(r => r.sel && r.nombre.trim());
    if (!filas.length) { toast('No hay filas marcadas para importar', 'error'); return; }
    const sinRuta = filas.filter(r => !String(r.ruta).trim());
    document.querySelectorAll('#imp-rows .imp-row').forEach(el => {
      const r = st.rows.find(x => x.uid === el.dataset.uid);
      const inp = el.querySelector('[data-f="ruta"]');
      if (inp) inp.style.borderColor = r && r.sel && r.nombre.trim() && !String(r.ruta).trim() ? '#dc2626' : 'var(--border)';
    });
    if (sinRuta.length) { toast(`Falta la ruta en ${sinRuta.length} fila${sinRuta.length === 1 ? '' : 's'}`, 'error'); return; }

    st.busy = true; updateCounters();
    const saveBtn = document.getElementById('imp-save');
    saveBtn.textContent = 'Guardando…';
    try {
      const cadena = (st.cadenas || []).find(c => String(c.id) === String(cadenaId));
      const [ubicaciones, rutasAll] = await Promise.all([window.db.dbGetAll('ubicaciones'), window.db.dbGetAll('rutas')]);
      const rutasCad = rutasAll.filter(r => String(r.clienteId) === String(cadenaId));
      const rutaCache = new Map();
      const creadasRutas = [];

      async function asegurarRuta(texto) {
        const t = String(texto).trim();
        const n = /^\d+$/.test(t) ? String(parseInt(t, 10)) : rutaNum(t) && /^ruta\s*\d+$/i.test(t) ? rutaNum(t) : null;
        const key = n != null ? 'n' + n : 't' + nk(t);
        if (rutaCache.has(key)) return rutaCache.get(key);
        let ruta = rutasCad.find(r => n != null ? rutaNum(r.nombre) === n : nk(r.nombre) === nk(t));
        if (!ruta) {
          const nombre = n != null ? `RUTA ${n}` : t.toUpperCase();
          ruta = { id: window.db.nextId('RUT'), nombre, clienteId: cadenaId, orden: n != null ? parseInt(n, 10) : rutasCad.length + creadasRutas.length + 1 };
          await window.db.dbPut('rutas', ruta);
          creadasRutas.push(nombre);
          rutasCad.push(ruta);
        }
        rutaCache.set(key, ruta);
        return ruta;
      }

      const maxOrden = new Map();
      const ordenSiguiente = (rutaId) => {
        if (!maxOrden.has(rutaId)) {
          maxOrden.set(rutaId, ubicaciones.filter(u => String(u.rutaId) === String(rutaId)).reduce((m, u) => Math.max(m, u.ordenRuta ?? 0), 0));
        }
        const v = maxOrden.get(rutaId) + 1; maxOrden.set(rutaId, v); return v;
      };

      let creados = 0, actualizados = 0;
      const nombresActualizados = [];
      for (const f of filas) {
        const ruta = await asegurarRuta(f.ruta);
        const nombre = f.nombre.trim().replace(/\s+/g, ' ');
        const direccion = f.direccion.trim().replace(/\s+/g, ' ');
        const k = nk(nombre);
        const ex = ubicaciones.find(u => String(u.clienteId) === String(cadenaId) && nk(u.denominacion) === k);
        if (ex) {
          const mismaRuta = String(ex.rutaId) === String(ruta.id);
          const upd = { ...ex, rutaId: ruta.id, ordenRuta: mismaRuta && ex.ordenRuta ? ex.ordenRuta : ordenSiguiente(ruta.id) };
          if (direccion) { if (direccion !== ex.direccion) { upd.lat = null; upd.lng = null; } upd.direccion = direccion; }
          await window.db.dbPut('ubicaciones', upd);
          Object.assign(ex, upd);
          actualizados++; nombresActualizados.push(ex.denominacion);
        } else {
          const nuevo = { id: window.db.nextId('UBI'), clienteId: cadenaId, denominacion: nombre, direccion, rutaId: ruta.id, ordenRuta: ordenSiguiente(ruta.id), activa: true };
          await window.db.dbPut('ubicaciones', nuevo);
          ubicaciones.push(nuevo);
          creados++;
        }
      }

      const body = document.getElementById('imp-body');
      body.innerHTML = `<div style="padding:8px 4px;line-height:1.6;">
        <h3 style="margin:0 0 10px;color:#16a34a;"><i class="fas fa-circle-check"></i> Importación completada</h3>
        <div><b>${creados}</b> ubicaci${creados === 1 ? 'ón nueva' : 'ones nuevas'} en <b>${esc(cadena ? cadena.nombre : '')}</b></div>
        <div><b>${actualizados}</b> ubicaci${actualizados === 1 ? 'ón ya existente actualizada' : 'ones ya existentes actualizadas'}${nombresActualizados.length ? ': ' + esc(nombresActualizados.join(', ')) : ''}</div>
        <div>Rutas creadas: ${creadasRutas.length ? esc(creadasRutas.join(', ')) : 'ninguna (ya existían)'}</div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:6px;">Las ubicaciones están en la ficha del cliente (Clientes → ${esc(cadena ? cadena.nombre : '')} → Ubicaciones). Sus coordenadas se buscan al ordenar la ruta.</div>
      </div>`;
      document.getElementById('imp-save').style.display = 'none';
      document.getElementById('imp-cancel').textContent = 'Cerrar';
      st.busy = false;
      if (document.getElementById('clientesBody') && typeof window.renderClientes === 'function') window.renderClientes();
    } catch (e) {
      console.error('Importar foto (guardar):', e);
      toast('No se pudo guardar: ' + (e.message || e), 'error');
      st.busy = false; updateCounters();
    }
  }

  function cerrar() {
    if (!st) return;
    document.removeEventListener('keydown', st.onKey);
    if (st.thumbUrl) URL.revokeObjectURL(st.thumbUrl);
    if (st.worker) st.worker.terminate().catch(() => {});
    document.getElementById('imp-overlay')?.remove();
    st = null;
  }

  window.showImportFolioModal = async function () {
    if (st) return;
    st = { rows: [], cadenas: [], ubicaciones: [], cadenaId: '', clientes: [], rutas: [], loaded: false, busy: false, worker: null, thumbUrl: null };
    try {
      await abrirVentana();
    } catch (e) {
      console.error('Importar clientes desde foto:', e);
      document.getElementById('imp-overlay')?.remove();
      if (st) document.removeEventListener('keydown', st.onKey);
      st = null;
      toast('No se pudo abrir el importador: ' + (e.message || e), 'error');
    }
  };

  async function abrirVentana() {
    const cadenas = [];
    window.db.dbGetAll('ubicaciones').then(u => { if (st) { st.ubicaciones = u; renderRows(); } }).catch(() => {});
    window.db.dbGetAll('clientes').then(all => {
      if (!st) return;
      const list = all.filter(c => c.central === true);
      list.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
      st.cadenas = list;
      const sel = document.getElementById('imp-cadena');
      if (sel) sel.innerHTML = '<option value="">— Elige el cliente central —</option>' + list.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    }).catch(e => { console.error(e); toast('No se pudieron cargar los clientes', 'error'); });

    const overlay = document.createElement('div');
    overlay.id = 'imp-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:10001;padding:12px;';
    overlay.innerHTML = `
      <div style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;width:100%;max-width:1000px;max-height:94vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.45);">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <h2 style="margin:0;font-size:18px;"><i class="fas fa-file-image"></i> Importar clientes desde una foto</h2>
          <button type="button" id="imp-x" class="btn btn-outline btn-sm" title="Cerrar"><i class="fas fa-xmark"></i></button>
        </div>
        <div id="imp-body" style="padding:16px 20px;overflow-y:auto;flex:1;min-height:0;">
          <p style="margin:0 0 12px;color:var(--text-muted);font-size:13px;">Elige el cliente central, carga la foto del folio y revisa lo leído: cada fila pasa a ser una ubicación del cliente (solo se toman nombre, dirección y ruta). Todo es editable antes de importar.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
            <div style="flex:1 1 240px;">
              <label style="font-weight:600;display:block;margin-bottom:4px;">Cliente central *</label>
              <select id="imp-cadena" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);">
                <option value="">— Elige el cliente central —</option>
                ${cadenas.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="imp-pick" class="btn btn-primary"><i class="fas fa-image"></i> Elegir imagen</button>
              <button type="button" id="imp-cam" class="btn btn-secondary"><i class="fas fa-camera"></i> Hacer foto</button>
            </div>
            <input type="file" id="imp-file" accept="image/*" style="display:none;">
            <input type="file" id="imp-file-cam" accept="image/*" capture="environment" style="display:none;">
          </div>
          <div id="imp-drop" style="border:2px dashed var(--border);border-radius:10px;padding:12px;text-align:center;color:var(--text-muted);margin-bottom:12px;background:var(--surface-alt);">
            <img id="imp-thumb" alt="" style="display:none;max-height:90px;max-width:100%;border-radius:8px;margin-bottom:6px;">
            <div>Arrastra aquí la foto o usa los botones. Puedes cargar varias fotos seguidas: las filas se van sumando.</div>
          </div>
          <div id="imp-barwrap" style="display:none;height:6px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:6px;"><div id="imp-bar" style="height:100%;width:0;background:var(--primary);transition:width .2s;"></div></div>
          <div id="imp-status" style="display:none;margin-bottom:10px;font-size:13px;"></div>
          <div id="imp-tools" style="display:none;margin-bottom:8px;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <span id="imp-count" style="font-weight:600;"></span>
              <span style="flex:1;"></span>
              <label style="font-size:13px;">Ruta para las marcadas:</label>
              <input type="text" id="imp-bulk" inputmode="numeric" list="imp-rutas-list" placeholder="Nº" style="width:70px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);">
              <button type="button" id="imp-bulk-ok" class="btn btn-outline btn-sm">Aplicar</button>
              <button type="button" id="imp-all" class="btn btn-outline btn-sm">Marcar todas</button>
              <button type="button" id="imp-none" class="btn btn-outline btn-sm">Ninguna</button>
              <button type="button" id="imp-add" class="btn btn-outline btn-sm"><i class="fas fa-plus"></i> Añadir fila</button>
            </div>
            <datalist id="imp-rutas-list"></datalist>
          </div>
          <div id="imp-rows"></div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
          <button type="button" id="imp-cancel" class="btn btn-outline">Cancelar</button>
          <button type="button" id="imp-save" class="btn btn-primary" disabled>Importar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    st.onKey = e => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', st.onKey);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) st.downOnOverlay = true; else st.downOnOverlay = false; });
    overlay.addEventListener('click', e => { if (e.target === overlay && st.downOnOverlay && !st.busy) cerrar(); });
    document.getElementById('imp-x').onclick = () => cerrar();
    document.getElementById('imp-cancel').onclick = () => cerrar();
    document.getElementById('imp-save').onclick = guardar;

    const cadSel = document.getElementById('imp-cadena');
    cadSel.addEventListener('change', async () => {
      st.cadenaId = cadSel.value;
      const dl = document.getElementById('imp-rutas-list');
      dl.innerHTML = '';
      if (st.cadenaId) {
        try {
          const rutas = await window.db.dbGetAll('rutas');
          rutas.filter(r => String(r.clienteId) === String(st.cadenaId))
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .forEach(r => { const o = document.createElement('option'); o.value = rutaNum(r.nombre) || r.nombre; o.label = r.nombre; dl.appendChild(o); });
        } catch (_) {}
      }
      renderRows();
    });

    const fileInput = document.getElementById('imp-file'), camInput = document.getElementById('imp-file-cam');
    document.getElementById('imp-pick').onclick = () => fileInput.click();
    document.getElementById('imp-cam').onclick = () => camInput.click();
    [fileInput, camInput].forEach(inp => inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) handleFile(f); }));
    const drop = document.getElementById('imp-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });

    const rowsBox = document.getElementById('imp-rows');
    const rowOf = el => { const rowEl = el.closest('.imp-row'); return rowEl ? { rowEl, r: st.rows.find(x => x.uid === rowEl.dataset.uid) } : {}; };
    rowsBox.addEventListener('input', e => {
      const f = e.target.dataset.f; const { rowEl, r } = rowOf(e.target);
      if (!r || !f || f === 'sel') return;
      r[f] = e.target.value;
      if (f === 'ruta') e.target.style.borderColor = 'var(--border)';
      if (f === 'nombre') { refreshBadge(rowEl, r); updateCounters(); }
    });
    rowsBox.addEventListener('change', e => {
      if (e.target.dataset.f !== 'sel') return;
      const { r } = rowOf(e.target); if (r) { r.sel = e.target.checked; updateCounters(); }
    });
    rowsBox.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const { r } = rowOf(btn); if (!r) return;
      const i = st.rows.indexOf(r);
      if (btn.dataset.act === 'del') st.rows.splice(i, 1);
      else if (btn.dataset.act === 'merge' && i > 0) {
        const p = st.rows[i - 1];
        p.nombre = [p.nombre, r.nombre].filter(Boolean).join(' ');
        p.direccion = [p.direccion, r.direccion].filter(Boolean).join(' ');
        p.conf = Math.min(p.conf, r.conf);
        st.rows.splice(i, 1);
      }
      renderRows();
    });
    document.getElementById('imp-bulk-ok').onclick = () => {
      const v = document.getElementById('imp-bulk').value.trim();
      if (!v) { toast('Escribe el número de ruta', 'error'); return; }
      st.rows.forEach(r => { if (r.sel) r.ruta = v; });
      renderRows();
    };
    document.getElementById('imp-all').onclick = () => { st.rows.forEach(r => { r.sel = true; }); renderRows(); };
    document.getElementById('imp-none').onclick = () => { st.rows.forEach(r => { r.sel = false; }); renderRows(); };
    document.getElementById('imp-add').onclick = () => {
      const last = st.rows[st.rows.length - 1];
      st.rows.push(newRow({ ruta: last ? last.ruta : '' }));
      renderRows();
      const inputs = rowsBox.querySelectorAll('[data-f="nombre"]'); if (inputs.length) inputs[inputs.length - 1].focus();
    };
    renderRows();
    document.getElementById('imp-tools').style.display = '';
  };
  window.render_importFolio = function () { window.showImportFolioModal(); };
})();

//  MANUALES
window.getTiposManuales = async function(){
  return window.TiposPuerta.filasDB();   // catálogo único: ya incluye Corredera Cristal y el resto
};

window.render_manuales = async function(el){
  const manuales = await dbGetAll('manuales');
  const tipos = await getTiposManuales();
  
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  el.innerHTML =
    '<div class="page-header"><div><h2>Manuales</h2><p>Manuales técnicos por tipo de puerta y avería</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showSubirManualModal()"><i class="fas fa-upload"></i> Subir Manual</button><button class="btn btn-secondary" onclick="navigateTo(\'configuracion\')"><i class="fas fa-xmark"></i> Cerrar</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar manual..." id="searchManual" oninput="renderManualesList()">'+
      '<select id="filterTipoManual" onchange="renderManualesList()"><option value="">Todos los tipos</option>'+
      tiposOptions+'</select></div>'+
    '<div class="card"><div class="table-wrapper"><table><thead>'+
      '<tr><th>Título</th><th>Tipo de puerta</th><th>Tipo de avería</th><th>Fecha</th><th>Acciones</th></tr>'+
    '</thead><tbody id="manualesBody"></tbody></table></div></div>';
  renderManualesList();
};

window.renderManualesList = async function(){
  const manuales = await dbGetAll('manuales');
  const q = (document.getElementById('searchManual')?.value||'').toLowerCase();
  const tipo = document.getElementById('filterTipoManual')?.value||'';
  const tipos = await getTiposManuales();
  const tiposMap = new Map(tipos.map(t => [t.id, t.nombre]));
  
  const filtered = manuales.filter(m=>{
    if(q && !JSON.stringify(m).toLowerCase().includes(q)) return false;
    if(tipo && m.tipoPuerta!==tipo) return false;
    return true;
  });
  
  document.getElementById('manualesBody').innerHTML = filtered.map(m=>{
    const tipoNombre = m.tipoPuerta ? tiposMap.get(m.tipoPuerta) || '—' : '—';
    const esVideo = String(m.archivoTipo||'').startsWith('video/');
    const icono = esVideo ? '<i class="fas fa-film" style="color:var(--primary)"></i> ' : '<i class="fas fa-file-pdf" style="color:#dc2626"></i> ';
    return '<tr>'+
      '<td><strong>'+icono+escapeHtml(m.titulo)+'</strong></td>'+
      '<td><span class="badge badge-blue">'+escapeHtml(tipoNombre)+'</span></td>'+
      '<td><span class="badge badge-purple">'+escapeHtml(m.tipoAveria||'—')+'</span></td>'+
      '<td>'+new Date(m.createdAt).toLocaleDateString('es-ES')+'</td>'+
      '<td class="actions-cell">'+
        '<button class="btn btn-outline btn-sm" onclick="verManual(\''+m.id+'\')"><i class="fas fa-eye"></i> Ver</button>'+
        '<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarManual(\''+m.id+'\')"><i class="fas fa-trash"></i></button>'+
      '</td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin manuales</td></tr>';
};

window.showSubirManualModal = async function(){
  const tipos = await getTiposManuales();
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  const form = '<div class="form-grid">'+
    '<div class="form-group full"><label>Título *</label><input id="man_titulo" placeholder="Ej: Motor averiado - Corredera"></div>'+
    '<div class="form-group"><label>Tipo de puerta</label><select id="man_tipo">'+tiposOptions+'</select></div>'+
    '<div class="form-group"><label>Tipo de avería</label><input id="man_averia" placeholder="Ej: motor, sensor, muelle..."></div>'+
    '<div class="form-group full"><label>Archivo (PDF o vídeo) *</label><input type="file" id="man_archivo" accept=".pdf,video/*" required>'+
    '<small style="color:var(--text-muted);display:block;margin-top:4px">PDF o vídeo (mp4/webm). El archivo se guarda en el servidor y solo se descarga al abrirlo: no ralentiza la app.</small></div>'+
  '</div>';
  
  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="subirManual()"><i class="fas fa-upload"></i> Subir</button>';
  openModal('Subir Manual', form, footer);
};

window.subirManual = async function(){
  const titulo = document.getElementById('man_titulo').value.trim();
  const tipoPuerta = document.getElementById('man_tipo').value;
  const tipoAveria = document.getElementById('man_averia').value.trim();
  const archivoInput = document.getElementById('man_archivo');
  
  if(!titulo){ showToast('El título es obligatorio','error'); return; }
  if(!archivoInput.files[0]){ showToast('Debes seleccionar un archivo','error'); return; }

  const archivo = archivoInput.files[0];
  const esPdf = archivo.type === 'application/pdf';
  const esVideo = (archivo.type || '').startsWith('video/');
  if(!esPdf && !esVideo){ showToast('El archivo debe ser un PDF o un vídeo','error'); return; }

  // Límite práctico de tamaño (Storage lo soporta, pero avisamos de subidas enormes)
  if(archivo.size > 200 * 1024 * 1024){ showToast('El archivo supera 200 MB','error'); return; }

  try{
    const userId = window.authState?.user?.id || 'anon';
    const ext = esPdf ? 'pdf' : (archivo.name.split('.').pop() || 'bin').toLowerCase();
    const path = userId + '/' + Date.now() + '-' + archivo.name.replace(/[^\w.\-]+/g,'_');
    const { error: upErr } = await window.supabaseDB.storage.from('manuales').upload(path, archivo, { contentType: archivo.type, upsert: false });
    if(upErr) throw upErr;
    const data = {
      id: 'MAN-'+Date.now(),
      titulo,
      tipoPuerta,
      tipoAveria,
      archivoPath: path,       // ruta en Storage (REN_OUT: archivoPath → archivopath)
      archivoTipo: archivo.type,
      archivoTamano: archivo.size,
      createdAt: new Date().toISOString()
    };
    await dbPut('manuales', data);
    closeModal();
    showToast('Manual subido correctamente');
    renderManualesList();
  }catch(err){
    console.error('Error al subir manual:', err);
    showToast('Error al subir manual: '+err.message,'error');
  }
};

// Abre un manual: los nuevos desde Storage (URL firmada, streaming); los antiguos, desde su base64
window.verManual = async function(id){
  const manual = await dbGet('manuales', id);
  if(!manual) { showToast('Manual no encontrado','error'); return; }
  try{
    if(manual.archivoPath){
      const { data, error } = await window.supabaseDB.storage.from('manuales').createSignedUrl(manual.archivoPath, 3600);
      if(error) throw error;
      window.open(data.signedUrl, '_blank');
      return;
    }
    if(manual.pdfData){
      const blob = await fetch(manual.pdfData).then(r => r.blob());
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return;
    }
    showToast('Manual sin archivo','error');
  }catch(e){
    console.error(e);
    showToast('No se pudo abrir: '+(e.message||e),'error');
  }
};

window.eliminarManual = async function(id){
  if(!confirm('¿Eliminar este manual?')) return;
  await dbDelete('manuales', id);
  showToast('Manual eliminado');
  renderManualesList();
};

/* ========================================
   IMPORTACIÓN DE CLIENTES DESDE EXCEL / CSV
   ======================================== */
window.__importClientesFilas = null;

// Cabeceras admitidas (norm: minúsculas, sin acentos). "oblig" = obligatoria.
const IMPORT_CLIENTES_CAMPOS = [
  { norm: 'nombre',                 alias: ['nombre','razon social','razonsocial','nombre cliente','nombrecomercial','nombre comercial','empresa'], oblig: true,  campo: 'nombre' },
  { norm: 'contacto',               alias: ['contacto','persona contacto','persona de contacto','personacontacto'],                                 oblig: false, campo: 'contacto' },
  { norm: 'telefono',               alias: ['telefono','teléfono','tel','telefono1','telefono contacto'],                                            oblig: false, campo: 'telefono' },
  { norm: 'email',                  alias: ['email','correo','correo electronico','correo electrónico','e-mail'],                                    oblig: false, campo: 'email' },
  { norm: 'direccion',              alias: ['direccion','dirección','dir','direccion completa'],                                                     oblig: false, campo: 'direccion' },
  { norm: 'tipo',                   alias: ['tipo','tipocliente','tipo cliente'],                                                                    oblig: false, campo: 'tipo' },
  { norm: 'dni',                    alias: ['dni','nif','cif','dni/cif','dninif'],                                                                   oblig: false, campo: 'dni' },
  { norm: 'nota',                   alias: ['nota','notas','observaciones','comentarios'],                                                           oblig: false, campo: 'nota' },
  // Cabeceras del INFORME.xlsx (Sage) — se guardan en campos dedicados
  { norm: 'codigo',                 alias: ['codigo','código','codigo cliente','código cliente'],                                                    oblig: false, campo: 'codigo' },
  { norm: 'cpostal',                alias: ['c postal','cpostal','código postal','código postal','codigo postal','cp','c postal'],                  oblig: false, campo: 'cpostal' },
  { norm: 'poblacion',              alias: ['poblacion','población','ciudad','municipio'],                                                           oblig: false, campo: 'poblacion' },
  { norm: 'provincia',              alias: ['provincia'],                                                                                            oblig: false, campo: 'provincia' }
];

function importNormHeader(s){
  return String(s||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[_\-.]+/g,' ').replace(/\s+/g,' ');
}

window.showImportClientesModal = function(){
  window.__importClientesFilas = null;
  openModal('Importar clientes (Excel / CSV)',
    '<p style="color:var(--text-muted);margin-bottom:12px">Sube un archivo <strong>.xlsx/.xls</strong> o <strong>.csv</strong>. La primera fila deben ser los nombres de los campos: <strong>Nombre</strong> (obligatorio) y, opcionales, Contacto, Teléfono, Email, Dirección, C.Postal, Población, Provincia, NIF/CIF, Código y Notas.</p>'+
    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13.5px"><input type="checkbox" id="ic_geo" checked> <i class="fas fa-map-marker-alt" style="color:#16a34a"></i> Geolocalizar direcciones automáticamente durante la importación (≈1 dirección/segundo)</label>'+
    '<div id="ic_drop" style="border:2px dashed var(--border);border-radius:10px;padding:26px;text-align:center;cursor:pointer;background:var(--surface-alt)">'+
      '<input type="file" id="ic_file" accept=".xlsx,.xls,.csv" style="display:none">'+
      '<i class="fas fa-file-excel" style="font-size:28px;color:#16a34a"></i>'+
      '<p style="margin:8px 0 0">Clic o arrastra aquí el archivo</p>'+
    '</div>'+
    '<div id="ic_status" style="margin-top:12px;font-size:13px"></div>'+
    '<div id="ic_preview" style="margin-top:12px"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" id="ic_import" disabled><i class="fas fa-download"></i> Importar a clientes</button>');

  const drop = document.getElementById('ic_drop');
  const fileInput = document.getElementById('ic_file');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.style.borderColor = 'var(--border)';
    if(e.dataTransfer.files.length) window.__procesarArchivoClientes(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if(fileInput.files.length) window.__procesarArchivoClientes(fileInput.files[0]);
  });

  document.getElementById('ic_import').addEventListener('click', window.__guardarClientesImportados);
};

window.__procesarArchivoClientes = async function(file){
  const status = document.getElementById('ic_status');
  const preview = document.getElementById('ic_preview');
  const btnImport = document.getElementById('ic_import');
  status.innerHTML = '⚙️ Leyendo archivo...';
  preview.innerHTML = '';

  try{
    const lower = file.name.toLowerCase();
    let rows;
    if(lower.endsWith('.csv')){
      rows = await window.__leerCSVClientes(file);
    } else if(lower.endsWith('.xlsx') || lower.endsWith('.xls')){
      rows = await window.__leerExcelClientes(file);
    } else {
      throw new Error('Formato no admitido. Usa .xlsx, .xls o .csv');
    }
    if(!rows || !rows.length) throw new Error('El archivo está vacío.');

    // ── Validación de cabeceras ──
    const headers = rows[0].map(importNormHeader);
    const mapeados = IMPORT_CLIENTES_CAMPOS.map(cfg => {
      const idx = headers.findIndex(h => cfg.alias.includes(h));
      return { ...cfg, idx };
    });
    const faltanObligatorias = mapeados.filter(m => m.oblig && m.idx < 0).map(m => m.alias[0]);
    if(faltanObligatorias.length){
      throw new Error('Faltan columnas obligatorias: ' + faltanObligatorias.join(', ') +
        '. Cabeceras encontradas: ' + (rows[0].join(', ') || '(ninguna)'));
    }
    const desconocidas = headers.filter((h,i) => h && !mapeados.some(m => m.idx === i));
    if(desconocidas.length){
      showToast('Columnas ignoradas (no reconocidas): ' + desconocidas.join(', '), 'warning');
    }

    // ── Parsear filas ──
    const filas = [];
    const errores = [];
    rows.slice(1).forEach((r, i) => {
      const numFila = i + 2;
      const fila = {};
      mapeados.forEach(m => {
        if(m.idx >= 0) fila[m.campo] = String(r[m.idx] ?? '').trim();
      });
      if(!fila.nombre && !Object.values(fila).some(Boolean)) return; // fila vacía
      if(!fila.nombre){ errores.push('Fila ' + numFila + ': sin nombre'); return; }
      const tipo = importNormHeader(fila.tipo);
      fila.tipo = tipo === 'particular' ? 'particular' : 'empresa';
      filas.push(fila);
    });

    if(!filas.length) throw new Error('No se encontró ninguna fila con datos válidos (¿falta la columna Nombre?).');

    // ── Componer dirección completa (dirección + CP + población + provincia) y dedup por código ──
    const compDir = f => {
      const partes = [f.direccion, [f.cpostal, f.poblacion].filter(Boolean).join(' '), f.provincia].filter(Boolean).map(p => String(p).trim());
      const vistos = new Set();
      const unicos = [];
      for(const p of partes){ const k = p.toLowerCase(); if(!vistos.has(k)){ vistos.add(k); unicos.push(p); } }
      return unicos.join(', ');
    };
    filas.forEach(f => {
      if(f.cpostal || f.poblacion || f.provincia) f.direccion = compDir(f);
      delete f.cpostal; delete f.poblacion; delete f.provincia;
    });
    // Dedup por código (Sage): misma ficha que aparece dos veces con datos distintos
    const porCodigo = new Map();
    const sinCodigo = [];
    for(const f of filas){
      if(f.codigo){
        const prev = porCodigo.get(f.codigo);
        if(prev){ for(const k of Object.keys(f)){ if(f[k] && !prev[k]) prev[k] = f[k]; } }
        else porCodigo.set(f.codigo, f);
      } else sinCodigo.push(f);
    }
    const filasFinal = [...porCodigo.values(), ...sinCodigo];
    filasFinal.forEach(f => { f.sageCodigo = f.codigo || null; delete f.codigo; });

    window.__importClientesFilas = filasFinal;

    status.innerHTML = '<span style="color:#16a34a">✅ ' + filasFinal.length + ' fila(s) válidas' +
      (filasFinal.length !== filas.length ? ' (de ' + filas.length + ' leídas — duplicadas por código fusionadas)' : '') + ' · ' +
      (errores.length ? ' · ' + errores.length + ' ignorada(s)' : '') + '</span>';
    if(errores.length){
      status.innerHTML += '<br><small style="color:#f59e0b">' + escapeHtml(errores.slice(0,5).join(' · ')) +
        (errores.length>5 ? ' y ' + (errores.length-5) + ' más' : '') + '</small>';
    }

    // Vista previa
    const vista = filas.slice(0, 10);
    preview.innerHTML =
      '<div class="table-wrapper"><table><thead><tr><th>#</th><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Tipo</th></tr></thead><tbody>' +
      vista.map((f,i) => '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(f.nombre)+'</td><td>'+escapeHtml(f.contacto||'—')+'</td><td>'+escapeHtml(f.telefono||'—')+'</td><td>'+escapeHtml(f.email||'—')+'</td><td>'+escapeHtml(f.direccion||'—')+'</td><td>'+escapeHtml(f.tipo)+'</td></tr>').join('') +
      '</tbody></table></div>' +
      (filas.length > 10 ? '<small style="color:var(--text-muted)">y ' + (filas.length-10) + ' más...</small>' : '');

    btnImport.disabled = false;
  }catch(err){
    status.innerHTML = '<span style="color:#dc2626">❌ ' + escapeHtml(err.message) + '</span>';
    btnImport.disabled = true;
  }
};

/** Lee un CSV (separador , o ;) devolviendo array de arrays de strings */
window.__leerCSVClientes = function(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      try{
        let text = String(reader.result || '');
        if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
        const delim = (text.split('\n')[0].match(/;/g)||[]).length > (text.split('\n')[0].match(/,/g)||[]).length ? ';' : ',';
        const rows = [];
        let row = [], cell = '', inQuotes = false;
        for(let i = 0; i < text.length; i++){
          const ch = text[i];
          if(inQuotes){
            if(ch === '"'){
              if(text[i+1] === '"'){ cell += '"'; i++; }
              else inQuotes = false;
            } else cell += ch;
          } else if(ch === '"'){ inQuotes = true; }
          else if(ch === delim){ row.push(cell); cell = ''; }
          else if(ch === '\n' || ch === '\r'){
            if(ch === '\r' && text[i+1] === '\n') i++;
            row.push(cell); cell = '';
            if(row.some(c => c !== '')) rows.push(row);
            row = [];
          } else cell += ch;
        }
        if(cell !== '' || row.length){ row.push(cell); if(row.some(c => c !== '')) rows.push(row); }
        resolve(rows);
      }catch(err){ reject(err); }
    };
    reader.readAsText(file, 'utf-8');
  });
};

/** Lee un Excel con SheetJS (cargado desde CDN bajo demanda) */
window.__ensureSheetJS = async function(){
  if(window.XLSX) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel (¿sin conexión?)'));
    document.head.appendChild(s);
  });
};

window.__leerExcelClientes = async function(file){
  await window.__ensureSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
};

window.__guardarClientesImportados = async function(){
  const filas = window.__importClientesFilas;
  if(!filas || !filas.length){ showToast('No hay datos para importar','error'); return; }
  const btn = document.getElementById('ic_import');
  const geolocalizar = document.getElementById('ic_geo')?.checked !== false;
  btn.disabled = true;

  try{
    const existentes = await dbGetAll('clientes');
    const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    let creados = 0, actualizados = 0, saltados = 0, geolocalizados = 0, sinGeo = 0;
    const errores = [];

    for(let fi=0; fi<filas.length; fi++){
      const fila = filas[fi];
      try{
        // Validación de email si viene
        if(fila.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fila.email)){
          errores.push('Email no válido para ' + fila.nombre + ' (se importa sin email)');
          delete fila.email;
        }
        const dup = existentes.find(c => norm(c.nombre) === norm(fila.nombre));
        let coords = null;
        if(geolocalizar && fila.direccion){
          // Marcador de progreso en el botón
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Geolocalizando ' + (fi+1) + '/' + filas.length + '…';
          try{ coords = await geocodificar(fila.direccion); }catch(_){ }
          if(coords){ geolocalizados++; }
          else sinGeo++;
          // Nominatim: cortesía de ~1.1 s entre peticiones para no saturar el servicio
          await new Promise(r => setTimeout(r, 1100));
        }
        if(dup){
          // Actualizar datos de la ficha existente sin perder los que ya tenía
          await dbPut('clientes', {
            ...dup,
            contacto: fila.contacto || dup.contacto,
            telefono: fila.telefono || dup.telefono,
            email: fila.email || dup.email,
            direccion: fila.direccion || dup.direccion,
            tipo: fila.tipo || dup.tipo,
            nota: fila.nota || dup.nota,
            dni: fila.dni || dup.dni,
            sageCodigo: fila.sageCodigo || dup.sageCodigo || null,
            lat: (coords ? coords.lat : (dup.lat || null)),
            lng: (coords ? coords.lng : (dup.lng || null)),
            updatedAt: new Date().toISOString()
          });
          actualizados++;
        } else {
          await dbCreate('clientes', {
            id: window.db.nextId('CLI'),
            nombre: fila.nombre,
            contacto: fila.contacto || '',
            telefono: fila.telefono || '',
            email: fila.email || '',
            direccion: fila.direccion || '',
            tipo: fila.tipo,
            nota: fila.nota || '',
            dni: fila.dni || '',
            sageCodigo: fila.sageCodigo || null,
            lat: coords ? coords.lat : null,
            lng: coords ? coords.lng : null,
            central: false,
            updatedAt: new Date().toISOString()
          });
          creados++;
        }
      }catch(err){
        saltados++;
        errores.push(fila.nombre + ': ' + err.message);
      }
    }

    window.__importClientesFilas = null;
    closeModal();
    showToast('Importación completada: ' + creados + ' creados · ' + actualizados + ' actualizados' +
      (geolocalizar ? ' · 📍 ' + geolocalizados + ' geolocalizados' + (sinGeo ? ' (' + sinGeo + ' sin coordenadas, revisa su ficha)' : '') : '') +
      (saltados ? ' · ' + saltados + ' con error' : ''), saltados ? 'warning' : 'success');
    if(window.currentPage === 'clientes') renderClientes();
  }catch(err){
    console.error('[import clientes]', err);
    showToast('Error al importar: ' + err.message, 'error');
    btn.disabled = false;
  }
};
