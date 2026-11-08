// ── ENTRADA DE MATERIAL EN ALMACÉN DESDE ALBARÁN / FACTURA DE PROVEEDOR (foto o PDF) ─────────────────────
// Foto/PDF -> lectura (js/albaran-ocr.js, OCR con Tesseract o texto nativo del PDF) -> revisión editable ->
// stock de los artículos + registro de la entrada (historial, duplicados, documento adjunto, memoria por proveedor).
// Solo administradores. Tablas y bucket: SUPABASE_ENTRADAS_MATERIAL.sql
(function () {
  const esc = s => window.escapeHtml(s);
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  const db = () => window.db;
  const OCR_WIDTH = 2400;
  const BUCKET = 'entradas_material';
  const SPECIAL_NEW = '__new__', SPECIAL_SKIP = '__skip__';
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => (n == null || n === '' ? '' : round2(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  let st = null;

  // ── Imagen -> RGBA / canvas ──
  async function bitmapOf(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) {
      return await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img); img.onerror = () => rej(new Error('No se pudo leer la imagen'));
        img.src = URL.createObjectURL(file);
      });
    }
  }
  async function imageToCanvas(file) {
    const bmp = await bitmapOf(file);
    let w = OCR_WIDTH, h = Math.round(bmp.height * (OCR_WIDTH / bmp.width));
    if (h > 5000) { h = 5000; w = Math.round(bmp.width * (5000 / bmp.height)); }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return c;
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
  const canvasBlob = (c, q) => new Promise(res => c.toBlob(res, 'image/jpeg', q || 0.8));
  const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  async function ensureLibs() {
    const L = window.LAZY_SCRIPTS || {};
    if (!window.FolioOCR) await window.loadScriptOnce(L.folioOcr || 'js/folio-ocr.js');
    if (!window.AlbaranOCR) await window.loadScriptOnce(L.albaranOcr || 'js/albaran-ocr.js');
  }

  async function ensureEngine(setStatus) {
    await ensureLibs();
    if (!st.worker) {
      setStatus('Cargando el motor de lectura (solo la primera vez)…');
      await window.ensureTesseract();
      st.worker = await Tesseract.createWorker('spa', 1, {
        logger: m => { if (m.status && /loading|initializing/.test(m.status)) setStatus('Preparando el motor de lectura… ' + Math.round((m.progress || 0) * 100) + '%'); }
      });
    }
    return st.worker;
  }

  // ── Datos de apoyo ──
  async function loadContext() {
    const ctx = { articulos: [], aliases: [], entradas: [], histOk: true, ownCif: '', proveedores: [] };
    ctx.articulos = await db().dbGetAll('almacen').catch(() => []);
    try { ctx.aliases = await db().dbGetAll('almacenAlias'); } catch (e) { ctx.histOk = false; }
    try { ctx.entradas = await db().dbGetAll('entradasMaterial'); } catch (e) { ctx.histOk = false; }
    try { const s = await window.getCompanySettings?.(); ctx.ownCif = s?.tax_id || ''; } catch (_) {}
    const set = new Set();
    ctx.articulos.forEach(a => a.proveedor && set.add(String(a.proveedor).trim()));
    ctx.entradas.forEach(e => e.proveedor && set.add(String(e.proveedor).trim()));
    ctx.aliases.forEach(a => a.proveedor && set.add(String(a.proveedor).trim()));
    ctx.proveedores = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
    return ctx;
  }

  const newLine = l => ({
    uid: Math.random().toString(36).slice(2), ref: l.ref || '', descripcion: l.descripcion || '',
    cantidad: l.cantidad ?? 1,
    precio: l.precio != null ? (l.dto && l.importe != null && l.cantidad ? round2(l.importe / l.cantidad) : l.precio) : 0,
    importe: l.importe != null ? l.importe : round2((l.cantidad || 0) * (l.precio || 0)),
    conf: l.conf == null ? 100 : l.conf, articuloId: '', motivo: '', manual: false
  });

  function applyMatches(lines) {
    const prov = document.getElementById('ent-prov')?.value || '';
    const res = window.AlbaranOCR.matchArticulos(lines, st.ctx.articulos, prov, st.ctx.aliases);
    lines.forEach((l, i) => {
      if (l.manual) return;
      l.articuloId = res[i].articuloId || SPECIAL_NEW;
      l.motivo = res[i].motivo;
    });
  }

  // ── Pintado ──
  function artOptions(selected) {
    const base = `<option value="${SPECIAL_NEW}" ${selected === SPECIAL_NEW ? 'selected' : ''}>➕ Crear artículo nuevo</option><option value="${SPECIAL_SKIP}" ${selected === SPECIAL_SKIP ? 'selected' : ''}>⛔ Ignorar esta línea</option>`;
    return base + st.artHtml.replace(`value="${esc(selected)}"`, `value="${esc(selected)}" selected`);
  }
  const MOTIVO = {
    memoria: ['Recordado', '#16a34a'], referencia: ['Misma referencia', '#16a34a'], parecido: ['Parecido: confirma', '#d97706'], '': ['Nuevo', '#2563eb']
  };

  function lineHtml(l) {
    const [txt, col] = l.articuloId === SPECIAL_SKIP ? ['Ignorada', '#6b7280'] : (l.manual && l.articuloId !== SPECIAL_NEW ? ['Elegido por ti', '#16a34a'] : (l.articuloId === SPECIAL_NEW ? ['Nuevo', '#2563eb'] : MOTIVO[l.motivo] || MOTIVO['']));
    const low = l.conf < 60;
    const inp = 'padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-alt);color:var(--text);';
    return `<tr class="ent-row" data-uid="${l.uid}" style="${l.articuloId === SPECIAL_SKIP ? 'opacity:.5;' : ''}">
      <td><input data-f="ref" value="${esc(l.ref)}" style="${inp}width:100px;"></td>
      <td><input data-f="descripcion" value="${esc(l.descripcion)}" style="${inp}width:100%;min-width:180px;${low ? 'border-color:#f59e0b;' : ''}"></td>
      <td><input data-f="cantidad" inputmode="decimal" value="${esc(String(l.cantidad).replace('.', ','))}" style="${inp}width:70px;text-align:right;"></td>
      <td><input data-f="precio" inputmode="decimal" value="${esc(l.precio ? String(l.precio).replace('.', ',') : '')}" style="${inp}width:80px;text-align:right;"></td>
      <td data-importe style="text-align:right;white-space:nowrap;">${fmt(l.importe)}</td>
      <td><select data-f="articuloId" style="${inp}width:100%;min-width:190px;">${artOptions(l.articuloId)}</select>
        <div data-motivo style="font-size:11px;color:${col};margin-top:2px;">${txt}${low ? ' · lectura dudosa' : ''}</div></td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-outline btn-sm" data-act="merge" title="Unir con la línea anterior (descripción partida)"><i class="fas fa-arrow-up"></i></button>
        <button type="button" class="btn btn-danger btn-sm" data-act="del" title="Quitar línea"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }

  function renderLines() {
    const body = document.getElementById('ent-lines');
    if (!body) return;
    body.innerHTML = st.lines.length ? st.lines.map(lineHtml).join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:16px;">Aún no hay líneas. Carga un documento o añade líneas a mano.</td></tr>';
    refreshChecks();
  }

  function refreshChecks() {
    if (!window.AlbaranOCR) return;
    const active = st.lines.filter(l => l.articuloId !== SPECIAL_SKIP);
    const total = parseFloat(document.getElementById('ent-total')?.value.replace(',', '.'));
    const c = window.AlbaranOCR.cuadre(active.map(l => ({ importe: l.importe, precio: l.precio, cantidad: l.cantidad })), { total: Number.isFinite(total) ? total : null, base: null, iva: null });
    const box = document.getElementById('ent-cuadre');
    if (box) {
      if (c.cuadra === null) { box.style.display = active.length ? '' : 'none'; box.style.color = 'var(--text-muted)'; box.textContent = `Suma de las líneas: ${fmt(c.suma)} €` + (Number.isFinite(total) ? '' : ' (indica el total del documento para comprobar la lectura)'); }
      else if (c.cuadra) { box.style.display = ''; box.style.color = '#16a34a'; box.textContent = `✔ Las líneas suman ${fmt(c.suma)} €, coherente con el total del documento (sin IVA o con IVA 21 %).`; }
      else { box.style.display = ''; box.style.color = '#dc2626'; box.textContent = `⚠ Las líneas suman ${fmt(c.suma)} € y no cuadran con el total ${fmt(total)} €. Revisa cantidades, precios y líneas que falten o sobren.`; }
    }
    const dup = window.AlbaranOCR.findDuplicado(st.ctx.entradas, document.getElementById('ent-prov')?.value, document.getElementById('ent-num')?.value);
    st.dup = dup;
    const dbox = document.getElementById('ent-dup');
    if (dbox) {
      dbox.style.display = dup ? '' : 'none';
      if (dup) dbox.innerHTML = `⚠ Este documento ya se registró (${esc(dup.proveedor)} nº ${esc(dup.numero)}, ${esc(dup.fecha || '')}). Si lo guardas de nuevo se sumará otra vez al stock. <label style="display:block;margin-top:4px;"><input type="checkbox" id="ent-dup-ok"> Registrar de todos modos</label>`;
    }
    const n = active.filter(l => String(l.descripcion).trim() && num(l.cantidad) > 0).length;
    const btn = document.getElementById('ent-save');
    if (btn) { btn.disabled = st.busy || !n; btn.textContent = n ? `Registrar entrada (${n} línea${n === 1 ? '' : 's'})` : 'Registrar entrada'; }
  }

  function setHeader(h) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && !el.value && v != null && v !== '') el.value = v; };
    set('ent-prov', h.proveedor); set('ent-cif', h.cif); set('ent-num', h.numero); set('ent-fecha', h.fecha); set('ent-total', h.total != null ? String(h.total).replace('.', ',') : '');
  }

  // ── Lectura de un archivo ──
  async function handleFile(file) {
    if (!file || st.busy) return;
    const status = document.getElementById('ent-status'), barWrap = document.getElementById('ent-barwrap'), bar = document.getElementById('ent-bar');
    const setStatus = (t, p) => { status.style.display = ''; status.style.color = 'var(--text-muted)'; status.textContent = t; barWrap.style.display = p == null ? 'none' : ''; if (p != null) bar.style.width = Math.round(p * 100) + '%'; };
    st.busy = true; refreshChecks();
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    try {
      const worker = await ensureEngine(setStatus);
      const host = { encode: grayToCanvas, onProgress: setStatus, loadScript: src => window.loadScriptOnce(src), createCanvas };
      let lines = [];
      if (isPdf) {
        setStatus('Leyendo el PDF…', 0.05);
        const pdf = await window.AlbaranOCR.readAlbaranPdf(file, host);
        lines = pdf.lines;
        let off = 100000;
        for (const c of pdf.scannedCanvases) {          // páginas sin texto: son un escaneo, se pasan por OCR
          const ctx = c.getContext('2d', { willReadFrequently: true });
          const r = await window.AlbaranOCR.readAlbaranImage(worker, ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 4, host);
          lines = lines.concat(r.lines.map(l => ({ ...l, y0: l.y0 + off, y1: l.y1 + off })));
          if (!st.preview) st.preview = await canvasBlob(c, 0.8);
          off += 100000;
        }
        st.file = file; st.fileExt = 'pdf'; st.fileType = 'application/pdf';
      } else {
        setStatus('Preparando la imagen…', 0.02);
        await new Promise(r => setTimeout(r, 30));
        const c = await imageToCanvas(file);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const r = await window.AlbaranOCR.readAlbaranImage(worker, ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 4, host);
        lines = r.lines;
        if (!st.file) { st.file = await canvasBlob(c, 0.8); st.fileExt = 'jpg'; st.fileType = 'image/jpeg'; }
        const thumb = document.getElementById('ent-thumb');
        if (thumb) { if (st.thumbUrl) URL.revokeObjectURL(st.thumbUrl); st.thumbUrl = URL.createObjectURL(file); thumb.src = st.thumbUrl; thumb.style.display = ''; }
      }
      const parsed = window.AlbaranOCR.parseAlbaranLines(lines, { ownCif: st.ctx.ownCif, knownProveedores: st.ctx.proveedores });
      setHeader(parsed);
      const nuevas = parsed.lineas.map(newLine);
      applyMatches(nuevas);
      st.lines = st.lines.concat(nuevas);
      st.leidas = (st.leidas || 0) + 1;
      status.style.display = 'none'; barWrap.style.display = 'none';
      if (!nuevas.length) { status.style.display = ''; status.style.color = '#d97706'; status.textContent = 'No se pudieron leer líneas de material. Prueba con una foto más recta, con buena luz y sin sombras, o añade las líneas a mano.'; }
      else toast(`${nuevas.length} línea${nuevas.length === 1 ? '' : 's'} leída${nuevas.length === 1 ? '' : 's'}. Revisa todo antes de registrar.`, 'info');
    } catch (e) {
      console.error('Entrada de material:', e);
      status.style.display = ''; status.style.color = '#dc2626'; barWrap.style.display = 'none';
      status.textContent = 'Error al leer el documento: ' + (e.message || e);
    } finally {
      st.busy = false;
      renderLines();
    }
  }

  // ── Guardado ──
  async function guardar() {
    const proveedor = document.getElementById('ent-prov').value.trim();
    const numero = document.getElementById('ent-num').value.trim();
    const fecha = document.getElementById('ent-fecha').value || null;
    const total = parseFloat(document.getElementById('ent-total').value.replace(',', '.'));
    const margen = num(document.getElementById('ent-margen').value);
    if (!proveedor) { toast('Indica el proveedor', 'error'); document.getElementById('ent-prov').focus(); return; }
    const lineas = st.lines.filter(l => l.articuloId !== SPECIAL_SKIP && String(l.descripcion).trim() && num(l.cantidad) > 0);
    if (!lineas.length) { toast('No hay líneas para registrar', 'error'); return; }
    const sinArt = lineas.filter(l => !l.articuloId);
    if (sinArt.length) { toast('Elige un artículo (o "Crear nuevo") en todas las líneas', 'error'); return; }
    if (st.dup && !document.getElementById('ent-dup-ok')?.checked) { toast('Este documento ya está registrado: marca "Registrar de todos modos" si es correcto', 'error'); return; }
    try { localStorage.setItem('entradaMargen', String(margen)); } catch (_) {}

    st.busy = true; refreshChecks();
    const btn = document.getElementById('ent-save'); btn.textContent = 'Guardando…';
    const hechas = [];
    let error = null, nuevos = 0, actualizados = 0;
    const entradaId = db().nextId('ENT');
    try {
      for (const l of lineas) {
        const cantidad = num(l.cantidad), precio = num(l.precio);
        let art;
        if (l.articuloId === SPECIAL_NEW) {
          art = {
            id: db().nextId('ART'), nombre: l.descripcion.trim(), unidad: 'unidad', categoria: '',
            stock: cantidad, stockMinimo: 0, precioCompra: precio, precioVenta: margen > 0 && precio > 0 ? round2(precio * (1 + margen / 100)) : 0,
            proveedor, foto: null
          };
          art.referencia = l.ref.trim() || art.id;
          await db().dbPut('almacen', art);
          st.ctx.articulos.push(art);
          nuevos++;
        } else {
          art = await db().dbGet('almacen', l.articuloId);
          if (!art) throw new Error('No se encontró el artículo «' + l.descripcion + '»');
          art.stock = (Number(art.stock) || 0) + cantidad;
          if (precio > 0) art.precioCompra = precio;
          if (proveedor) art.proveedor = proveedor;
          await db().dbPut('almacen', art);
          actualizados++;
        }
        hechas.push({ ref: l.ref.trim(), descripcion: l.descripcion.trim(), cantidad, precio, importe: round2(cantidad * precio), articuloid: art.id, accion: l.articuloId === SPECIAL_NEW ? 'nuevo' : 'suma' });
        // Memoria del proveedor: la próxima vez esta línea se empareja sola
        if (st.ctx.histOk && l.motivo !== 'referencia' && l.motivo !== 'memoria') {
          for (const clave of window.AlbaranOCR.aliasKeys({ ref: l.ref, descripcion: l.descripcion })) {
            const alias = { id: window.AlbaranOCR.aliasId(proveedor, clave), proveedor, clave, articuloid: String(art.id), usos: 1 };
            try { await db().dbPut('almacenAlias', alias); st.ctx.aliases = st.ctx.aliases.filter(a => a.id !== alias.id).concat([alias]); } catch (e) { console.warn('alias', e); }
          }
        }
      }
    } catch (e) { error = e; console.error('Entrada de material (guardado):', e); }

    let archivoPath = null, histWarn = '';
    if (hechas.length && st.ctx.histOk) {
      try {
        if (st.file) {
          archivoPath = `${(fecha || new Date().toISOString()).slice(0, 4)}/${entradaId}.${st.fileExt}`;
          const { error: upErr } = await window.supabaseDB.storage.from(BUCKET).upload(archivoPath, st.file, { contentType: st.fileType, upsert: false });
          if (upErr) { archivoPath = null; histWarn = 'No se pudo guardar el archivo del documento (' + upErr.message + '). '; }
        }
        await db().dbPut('entradasMaterial', {
          id: entradaId, proveedor, numero, fecha, total: Number.isFinite(total) ? total : null, lineas: hechas,
          archivo_path: archivoPath, creadopor: window.authState?.user?.id || null
        });
        st.ctx.entradas.push({ id: entradaId, proveedor, numero, fecha });
      } catch (e) { console.error('Registro de entrada:', e); histWarn += 'No se pudo guardar el historial: ' + (e.message || e); }
    } else if (hechas.length) histWarn = 'El historial no está disponible: ejecuta SUPABASE_ENTRADAS_MATERIAL.sql en Supabase para guardar el documento, evitar duplicados y recordar emparejamientos.';

    const body = document.getElementById('ent-body');
    body.innerHTML = `<div style="padding:8px 4px;line-height:1.6;">
      <h3 style="margin:0 0 10px;color:${error ? '#d97706' : '#16a34a'};"><i class="fas ${error ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${error ? 'Entrada registrada solo en parte' : 'Entrada registrada'}</h3>
      <div><b>${actualizados}</b> artículo${actualizados === 1 ? '' : 's'} con stock sumado · <b>${nuevos}</b> artículo${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'}</div>
      ${error ? `<div style="color:#dc2626;margin-top:6px;">Se detuvo en un error: ${esc(error.message || error)}. Se aplicaron ${hechas.length} de ${lineas.length} líneas; no repitas las ya aplicadas.</div>` : ''}
      ${histWarn ? `<div style="color:#d97706;margin-top:6px;">${esc(histWarn)}</div>` : ''}
    </div>`;
    document.getElementById('ent-save').style.display = 'none';
    document.getElementById('ent-cancel').textContent = 'Cerrar';
    st.busy = false; st.done = true;
    if (window.currentPage === 'almacen' && typeof window.renderAlmacen === 'function') window.renderAlmacen();
  }

  function cerrar() {
    if (!st || st.busy) return;
    document.removeEventListener('keydown', st.onKey);
    if (st.thumbUrl) URL.revokeObjectURL(st.thumbUrl);
    if (st.worker) st.worker.terminate().catch(() => {});
    document.getElementById('ent-overlay')?.remove();
    st = null;
  }

  // ── Ventana principal ──
  window.showEntradaMaterial = async function () {
    if (st) return;
    if (!window.isAdmin?.()) { toast('Solo administración puede dar entrada de material', 'error'); return; }
    st = { lines: [], busy: true, worker: null, ctx: { articulos: [], aliases: [], entradas: [], histOk: true, proveedores: [] }, file: null };
    const overlay = document.createElement('div');
    overlay.id = 'ent-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:10001;padding:12px;';
    const fld = 'width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);';
    overlay.innerHTML = `
      <div style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:16px;width:100%;max-width:1150px;max-height:94vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.45);">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <h2 style="margin:0;font-size:18px;"><i class="fas fa-wand-magic-sparkles"></i> Entrada de material desde albarán / factura</h2>
          <button type="button" id="ent-x" class="btn btn-outline btn-sm" title="Cerrar"><i class="fas fa-xmark"></i></button>
        </div>
        <div id="ent-body" style="padding:16px 20px;overflow-y:auto;flex:1;min-height:0;">
          <div id="ent-histwarn" style="display:none;margin-bottom:10px;padding:8px 10px;border:1px solid #f59e0b;border-radius:8px;color:#d97706;font-size:13px;"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
            <button type="button" id="ent-pick" class="btn btn-primary"><i class="fas fa-image"></i> Elegir foto / PDF</button>
            <button type="button" id="ent-cam" class="btn btn-secondary"><i class="fas fa-camera"></i> Hacer foto</button>
            <input type="file" id="ent-file" accept="image/*,application/pdf" style="display:none;">
            <input type="file" id="ent-file-cam" accept="image/*" capture="environment" style="display:none;">
            <span style="color:var(--text-muted);font-size:13px;">Puedes cargar varias fotos del mismo documento (varias páginas): las líneas se suman.</span>
          </div>
          <div id="ent-drop" style="border:2px dashed var(--border);border-radius:10px;padding:10px;text-align:center;color:var(--text-muted);margin-bottom:10px;background:var(--surface-alt);">
            <img id="ent-thumb" alt="" style="display:none;max-height:90px;max-width:100%;border-radius:8px;margin-bottom:6px;">
            <div>Arrastra aquí la foto o el PDF del albarán o la factura.</div>
          </div>
          <div id="ent-barwrap" style="display:none;height:6px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:6px;"><div id="ent-bar" style="height:100%;width:0;background:var(--primary);transition:width .2s;"></div></div>
          <div id="ent-status" style="display:none;margin-bottom:10px;font-size:13px;"></div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:10px;">
            <div><label style="font-weight:600;font-size:13px;">Proveedor *</label><input id="ent-prov" list="ent-prov-list" style="${fld}"><datalist id="ent-prov-list"></datalist></div>
            <div><label style="font-weight:600;font-size:13px;">Nº documento</label><input id="ent-num" style="${fld}"></div>
            <div><label style="font-weight:600;font-size:13px;">Fecha</label><input id="ent-fecha" type="date" style="${fld}"></div>
            <div><label style="font-weight:600;font-size:13px;">Total del documento (€)</label><input id="ent-total" inputmode="decimal" style="${fld}"></div>
            <div><label style="font-weight:600;font-size:13px;" title="Solo para artículos nuevos: precio de venta = compra + este %">Margen artículos nuevos (%)</label><input id="ent-margen" inputmode="decimal" value="${esc((() => { try { return localStorage.getItem('entradaMargen') ?? '30'; } catch (_) { return '30'; } })())}" style="${fld}"></div>
          </div>
          <input id="ent-cif" type="hidden">
          <div id="ent-dup" style="display:none;margin-bottom:8px;padding:8px 10px;border:1px solid #dc2626;border-radius:8px;color:#dc2626;font-size:13px;"></div>
          <div id="ent-cuadre" style="display:none;margin-bottom:8px;font-size:13px;"></div>
          <div class="table-wrapper"><table style="width:100%;border-collapse:collapse;">
            <thead><tr><th style="text-align:left;">Referencia</th><th style="text-align:left;">Descripción</th><th>Cant.</th><th>Precio ud.</th><th>Importe</th><th style="text-align:left;">Artículo del almacén</th><th></th></tr></thead>
            <tbody id="ent-lines"></tbody></table></div>
          <div style="margin-top:8px;"><button type="button" id="ent-add" class="btn btn-outline btn-sm"><i class="fas fa-plus"></i> Añadir línea</button></div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
          <button type="button" id="ent-cancel" class="btn btn-outline">Cancelar</button>
          <button type="button" id="ent-save" class="btn btn-primary" disabled>Registrar entrada</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    st.onKey = e => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', st.onKey);
    document.getElementById('ent-x').onclick = cerrar;
    document.getElementById('ent-cancel').onclick = cerrar;
    document.getElementById('ent-save').onclick = guardar;

    try { await ensureLibs(); st.ctx = await loadContext(); } catch (e) { console.error(e); }
    st.artHtml = st.ctx.articulos.slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }))
      .map(a => `<option value="${esc(a.id)}">${esc(a.nombre)}${a.referencia && a.referencia !== a.id ? ' · ' + esc(a.referencia) : ''}</option>`).join('');
    document.getElementById('ent-prov-list').innerHTML = st.ctx.proveedores.map(p => `<option value="${esc(p)}">`).join('');
    if (!st.ctx.histOk) {
      const w = document.getElementById('ent-histwarn');
      w.style.display = ''; w.textContent = 'Falta ejecutar SUPABASE_ENTRADAS_MATERIAL.sql en Supabase: la entrada de stock funciona, pero no se guardará el historial ni el documento, ni se evitarán duplicados ni se recordarán los emparejamientos.';
    }
    st.busy = false;

    const fileInput = document.getElementById('ent-file'), camInput = document.getElementById('ent-file-cam');
    document.getElementById('ent-pick').onclick = () => fileInput.click();
    document.getElementById('ent-cam').onclick = () => camInput.click();
    [fileInput, camInput].forEach(inp => inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) handleFile(f); }));
    const drop = document.getElementById('ent-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });

    const body = document.getElementById('ent-lines');
    const lineOf = el => { const tr = el.closest('.ent-row'); return tr ? { tr, l: st.lines.find(x => x.uid === tr.dataset.uid) } : {}; };
    const refreshRow = (tr, l) => {
      tr.querySelector('[data-importe]').textContent = fmt(l.importe);
      const m = tr.querySelector('[data-motivo]');
      const [txt, col] = l.articuloId === SPECIAL_SKIP ? ['Ignorada', '#6b7280'] : (l.manual && l.articuloId !== SPECIAL_NEW ? ['Elegido por ti', '#16a34a'] : (l.articuloId === SPECIAL_NEW ? ['Nuevo', '#2563eb'] : MOTIVO[l.motivo] || MOTIVO['']));
      m.style.color = col; m.textContent = txt;
      tr.style.opacity = l.articuloId === SPECIAL_SKIP ? '.5' : '';
    };
    body.addEventListener('input', e => {
      const f = e.target.dataset.f; const { tr, l } = lineOf(e.target);
      if (!l || !f || f === 'articuloId') return;
      l[f] = e.target.value;
      if (f === 'cantidad' || f === 'precio') { l.importe = round2(num(l.cantidad) * num(l.precio)); }
      refreshRow(tr, l); refreshChecks();
    });
    body.addEventListener('change', e => {
      if (e.target.dataset.f !== 'articuloId') return;
      const { tr, l } = lineOf(e.target); if (!l) return;
      l.articuloId = e.target.value; l.manual = true; l.motivo = '';
      refreshRow(tr, l); refreshChecks();
    });
    body.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const { l } = lineOf(btn); if (!l) return;
      const i = st.lines.indexOf(l);
      if (btn.dataset.act === 'del') st.lines.splice(i, 1);
      else if (btn.dataset.act === 'merge' && i > 0) { const p = st.lines[i - 1]; p.descripcion = [p.descripcion, l.descripcion].filter(Boolean).join(' '); st.lines.splice(i, 1); }
      renderLines();
    });
    document.getElementById('ent-add').onclick = () => { const l = newLine({ cantidad: 1 }); l.articuloId = SPECIAL_NEW; st.lines.push(l); renderLines(); body.querySelector('tr:last-child [data-f="descripcion"]')?.focus(); };
    ['ent-total', 'ent-num'].forEach(id => document.getElementById(id).addEventListener('input', refreshChecks));
    document.getElementById('ent-prov').addEventListener('input', refreshChecks);
    document.getElementById('ent-prov').addEventListener('change', () => { applyMatches(st.lines); renderLines(); });
    renderLines();
  };

  // ── Historial de entradas ──
  window.showHistorialEntradas = async function () {
    if (!window.isAdmin?.()) { toast('Solo administración puede ver las entradas', 'error'); return; }
    let rows;
    try { rows = await db().dbGetAll('entradasMaterial'); }
    catch (e) { toast('Falta ejecutar SUPABASE_ENTRADAS_MATERIAL.sql en Supabase', 'error'); return; }
    rows.sort((a, b) => String(b.createdAt || b.fecha || '').localeCompare(String(a.createdAt || a.fecha || '')));
    const body = rows.length ? `<div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Nº</th><th>Líneas</th><th>Total</th><th></th></tr></thead><tbody>` +
      rows.map(r => {
        const ls = Array.isArray(r.lineas) ? r.lineas : [];
        return `<tr><td>${esc(r.fecha || '')}</td><td>${esc(r.proveedor)}</td><td>${esc(r.numero)}</td><td>${ls.length}</td><td>${r.total != null ? fmt(r.total) + ' €' : ''}</td>
          <td style="white-space:nowrap;"><button class="btn btn-outline btn-sm" data-ent-lines="${esc(r.id)}">Líneas</button>
          ${r.archivoPath || r.archivo_path ? `<button class="btn btn-outline btn-sm" data-ent-file="${esc(r.archivoPath || r.archivo_path)}"><i class="fas fa-file"></i> Documento</button>` : ''}</td></tr>
          <tr data-ent-detail="${esc(r.id)}" style="display:none;"><td colspan="6" style="font-size:13px;color:var(--text-muted);">${ls.map(l => `${esc(l.cantidad)} × ${esc(l.descripcion)}${l.ref ? ' (' + esc(l.ref) + ')' : ''}${l.precio ? ' — ' + fmt(l.precio) + ' €' : ''}`).join('<br>')}</td></tr>`;
      }).join('') + '</tbody></table></div>' : '<p style="color:var(--text-muted);">Todavía no hay entradas registradas.</p>';
    window.openModal('Entradas de material', body, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
    document.getElementById('modalBody').addEventListener('click', async e => {
      const l = e.target.closest('[data-ent-lines]');
      if (l) { const tr = document.querySelector(`[data-ent-detail="${CSS.escape(l.dataset.entLines)}"]`); if (tr) tr.style.display = tr.style.display === 'none' ? '' : 'none'; return; }
      const f = e.target.closest('[data-ent-file]');
      if (f) {
        const { data, error } = await window.supabaseDB.storage.from(BUCKET).createSignedUrl(f.dataset.entFile, 3600);
        if (error) toast('No se pudo abrir el documento: ' + error.message, 'error'); else window.open(data.signedUrl, '_blank');
      }
    });
  };
})();
