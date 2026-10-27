/* ═══════════
   repostajes.js v1.0
   Registro de tickets de combustible (sin abrir partes de trabajo).
   El técnico hace la foto del ticket, Tesseract (OCR en el navegador)
   extrae fecha / importe / litros / precio y él solo confirma.
   ═══════════════════ */
'use strict';

window.REPOSTAJES = (function () {
  const BUCKET = 'medidas-fotos';   // bucket ya existente y público
  const T_PLANTILLAS = 'repostajes';
  const OCR_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let ocrWorker = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function supa() {
    const db = window.supabaseDB || window.sb;
    if (db && typeof db.from === 'function') return db;
    throw new Error('Supabase no disponible');
  }

  // ── OCR ─────────────────────────────────────
  async function loadTesseract() {
    if (window.Tesseract) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = OCR_CDN;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el OCR (Tesseract)'));
      document.head.appendChild(s);
    });
  }

  // Preprocesado: escala, blanco/negro y contraste para tickets de gasolinera
  async function prepImagen(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(3, Math.max(1.5, 1400 / img.width));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try {
          const d = ctx.getImageData(0, 0, c.width, c.height);
          const px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const v = g > 150 ? 255 : (g < 80 ? 0 : (g - 80) * 255 / 70);
            px[i] = px[i + 1] = px[i + 2] = v;
          }
          ctx.putImageData(d, 0, 0);
        } catch (_) { /* si falla, seguimos con la original */ }
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('No se pudo leer la foto'));
      img.src = dataUrl;
    });
  }

  function extraerDatosTicket(texto) {
    const t = texto.replace(/,/g, '.').replace(/\s+/g, ' ');
    const out = { importe: null, litros: null, precio: null, fecha: null, matricula: null };

    // Importe: "TOTAL 45,60" / "TOTAL EUROS 45.60" / "IMPORTE 45,60€"
    let m = t.match(/TOTAL[^\d]{0,12}(\d+(?:\.\d{1,2}){1,2})/i)
      || t.match(/IMPORTE[^\d]{0,12}(\d+(?:\.\d{1,2}){1,2})/i)
      || t.match(/A PAGAR[^\d]{0,12}(\d+(?:\.\d{1,2}){1,2})/i)
      || t.match(/(\d{1,3}(?:\.\d{3})*\.\d{2})\s*(?:€|EUR|EUROS)/i);
    if (m) out.importe = parseFloat(m[1]);

    // Litros: "45,60 L" / "LITROS 45.60"
    m = t.match(/(\d+(?:\.\d{1,3})?)\s*(?:L\b|LTS|LITROS)/i)
      || t.match(/LITROS?[^\d]{0,10}(\d+(?:\.\d{1,3})?)/i);
    if (m) out.litros = parseFloat(m[1]);

    // Precio por litro: "1,659 €/L" / "PRECIO LITRO 1.659"
    m = t.match(/(\d+(?:\.\d{1,3})?)\s*(?:€|EUR)?\s*\/\s*L/i)
      || t.match(/(?:PRECIO|€\/L|EUR\/L)[^\d]{0,10}(\d+(?:\.\d{1,3})?)/i);
    if (m) out.precio = parseFloat(m[1]);

    // Fecha: dd/mm/aaaa o dd-mm-aa
    m = t.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (m) {
      let [_, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      if (+mo <= 12 && +d <= 31) out.fecha = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // Matrícula española: 1234 ABC o 1234-ABC
    m = t.match(/\b(\d{4})[\s\-]?([B-DF-HJ-NP-TV-Z]{3})\b/i);
    if (m) out.matricula = m[1] + ' ' + m[2].toUpperCase();

    return out;
  }

  async function ocrTicket(dataUrl) {
    await loadTesseract();
    const pre = await prepImagen(dataUrl);
    if (!ocrWorker) {
      ocrWorker = await window.Tesseract.createWorker('spa', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const el = document.getElementById('rep-ocr-progreso');
            if (el) el.textContent = 'Leyendo ticket… ' + Math.round((m.progress || 0) * 100) + '%';
          }
        }
      });
    }
    const { data } = await ocrWorker.recognize(pre);
    return { texto: data.text || '', datos: extraerDatosTicket(data.text || '') };
  }

  // ── Storage ─────────────────────────────────
  async function subirFotoTicket(dataUrl) {
    const userId = window.authState?.user?.id;
    if (!userId || !navigator.onLine || !window.supabaseDB) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const rand = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random()).replace(/-/g, '');
      const path = userId + '/ticket-' + rand + '.' + ext;
      const { error } = await window.supabaseDB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      return window.supabaseDB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) {
      console.warn('[Repostajes] foto no subida:', e.message || e);
      showToast('No se pudo subir la foto del ticket: ' + (e.message || e), 'error');
      return null;
    }
  }

  // ── Modal ───────────────────────────────────
  let estado = { foto: null, ocr: null, vehiculoId: null };

  function asegurarModal() {
    if (document.getElementById('rep-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="rep-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10000;display:none;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:560px;width:100%;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.45)">
        <div class="modal-header">
          <h2 style="font-size:17px"><i class="fas fa-gas-pump"></i> Registrar repostaje</h2>
          <button type="button" class="btn-close-x" onclick="REPOSTAJES.cerrar()">✕</button>
        </div>
        <div style="overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group"><label>Vehículo *</label><select id="rep-vehiculo"></select></div>
            <div class="form-group"><label>Fecha *</label><input type="date" id="rep-fecha"></div>
          </div>
          <button type="button" class="btn btn-outline" id="rep-btn-foto"><i class="fas fa-camera"></i> Hacer foto del ticket</button>
          <input type="file" id="rep-foto-input" accept="image/*" capture="environment" style="display:none">
          <div id="rep-foto-prev"></div>
          <div id="rep-ocr-progreso" style="font-size:12px;color:var(--text-muted)"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div class="form-group"><label>Importe (€) *</label><input type="number" step="0.01" id="rep-importe" class="only-num-dec"></div>
            <div class="form-group"><label>Litros</label><input type="number" step="0.01" id="rep-litros" class="only-num-dec"></div>
            <div class="form-group"><label>€/Litro</label><input type="number" step="0.001" id="rep-precio" class="only-num-dec"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group"><label>Km del marcador</label><input type="number" id="rep-kms" class="only-num"></div>
            <div class="form-group"><label>Gasolinera</label><input id="rep-gasolinera" placeholder="Opcional"></div>
          </div>
          <small id="rep-nota-ocr" style="color:var(--text-muted);display:none"></small>
        </div>
        <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button type="button" class="btn btn-outline" onclick="REPOSTAJES.cerrar()">Cancelar</button>
          <button type="button" class="btn btn-primary" id="rep-btn-guardar"><i class="fas fa-paper-plane"></i> Guardar repostaje</button>
        </div>
      </div>
    </div>`);
    document.getElementById('rep-btn-foto').addEventListener('click', () => document.getElementById('rep-foto-input').click());
    document.getElementById('rep-foto-input').addEventListener('change', e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        estado.foto = r.result;
        pintarPrev();
        await procesarOCR();
      };
      r.readAsDataURL(f);
    });
    // Autocalcular: si escribe importe y litros → precio; si litros y precio → importe
    document.getElementById('rep-importe').addEventListener('input', autoCalc);
    document.getElementById('rep-litros').addEventListener('input', autoCalc);
    document.getElementById('rep-precio').addEventListener('input', () => { /* manual */ });
    document.getElementById('rep-btn-guardar').addEventListener('click', guardar);
  }

  function autoCalc() {
    const imp = parseFloat(document.getElementById('rep-importe').value);
    const lit = parseFloat(document.getElementById('rep-litros').value);
    const pre = parseFloat(document.getElementById('rep-precio').value);
    if (!isNaN(imp) && !isNaN(lit) && lit > 0 && (isNaN(pre) || document.activeElement !== document.getElementById('rep-precio'))) {
      document.getElementById('rep-precio').value = (imp / lit).toFixed(3);
    } else if (isNaN(imp) && !isNaN(lit) && !isNaN(pre)) {
      document.getElementById('rep-importe').value = (lit * pre).toFixed(2);
    }
  }

  function pintarPrev() {
    document.getElementById('rep-foto-prev').innerHTML = estado.foto
      ? `<img src="${estado.foto}" style="max-width:100%;max-height:220px;border-radius:10px;border:1px solid var(--border)">`
      : '';
  }

  async function procesarOCR() {
    const nota = document.getElementById('rep-nota-ocr');
    const progreso = document.getElementById('rep-ocr-progreso');
    nota.style.display = 'none';
    progreso.textContent = 'Leyendo ticket…';
    try {
      const { datos } = await ocrTicket(estado.foto);
      estado.ocr = datos;
      let tocados = 0;
      if (datos.importe != null) { document.getElementById('rep-importe').value = datos.importe; tocados++; }
      if (datos.litros != null) { document.getElementById('rep-litros').value = datos.litros; tocados++; }
      if (datos.precio != null) { document.getElementById('rep-precio').value = datos.precio; tocados++; }
      if (datos.fecha) { document.getElementById('rep-fecha').value = datos.fecha; tocados++; }
      autoCalc();
      progreso.textContent = '';
      nota.style.display = '';
      nota.textContent = tocados
        ? `✅ Leído del ticket: ${tocados} dato(s). Revísalos antes de guardar.`
        : 'No he podido leer datos del ticket automáticamente — rellénalos a mano.';
      if (datos.matricula) nota.textContent += ' Matrícula detectada: ' + datos.matricula;
    } catch (e) {
      console.warn('[Repostajes] OCR:', e);
      progreso.textContent = '';
      nota.style.display = '';
      nota.textContent = 'OCR no disponible ahora mismo: rellena los datos a mano.';
    }
  }

  async function abrir() {
    asegurarModal();
    estado = { foto: null, ocr: null };
    const sel = document.getElementById('rep-vehiculo');
    const vehiculos = await dbGetAll('vehiculos').catch(() => []);
    // Sugerencia: el vehículo del último parte del técnico (o el único de la flota)
    const sugerida = await sugerirVehiculo(vehiculos);
    sel.innerHTML = '<option value="">— Elegir vehículo —</option>' +
      vehiculos.map(v => `<option value="${esc(v.matricula)}">${esc(v.matricula)} ${esc((v.marca || '') + ' ' + (v.modelo || ''))}</option>`).join('');
    if (sugerida) sel.value = sugerida;
    document.getElementById('rep-fecha').value = new Date().toISOString().slice(0, 10);
    ['rep-importe', 'rep-litros', 'rep-precio', 'rep-kms', 'rep-gasolinera'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('rep-nota-ocr').style.display = 'none';
    document.getElementById('rep-ocr-progreso').textContent = '';
    pintarPrev();
    document.getElementById('rep-modal').style.display = 'flex';
  }

  async function sugerirVehiculo(vehiculos) {
    if (vehiculos.length === 1) return vehiculos[0].matricula;
    try {
      const partes = await dbGetAll('partesTrabajo');
      const mios = (partes || [])
        .filter(p => String(p.matricula || '').length > 2)
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
      if (mios[0]?.matricula) return mios[0].matricula;
    } catch (_) { }
    return null;
  }

  async function guardar() {
    const matricula = document.getElementById('rep-vehiculo').value;
    const fecha = document.getElementById('rep-fecha').value;
    const importe = parseFloat(document.getElementById('rep-importe').value);
    if (!matricula) { showToast('Elige el vehículo', 'error'); return; }
    if (!fecha) { showToast('Pon la fecha del repostaje', 'error'); return; }
    if (isNaN(importe) || importe <= 0) { showToast('El importe es obligatorio', 'error'); return; }
    const btn = document.getElementById('rep-btn-guardar');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      const fotoUrl = estado.foto ? await subirFotoTicket(estado.foto) : null;
      const registro = {
        id: 'REP-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
        matricula: matricula.toUpperCase(),
        fecha,
        importe,
        litros: parseFloat(document.getElementById('rep-litros').value) || null,
        preciobtanol: parseFloat(document.getElementById('rep-precio').value) || null,
        kms: parseFloat(document.getElementById('rep-kms').value) || null,
        gasolinera: document.getElementById('rep-gasolinera').value.trim() || null,
        foto_url: fotoUrl,
        ocr: estado.ocr ? null : null, // texto crudo no se guarda (privacidad); solo datos extraídos
        createdby: window.authState?.user?.id || null
      };
      const db = supa();
      const { error } = await db.from(T_PLANTILLAS).insert({
        id: registro.id, matricula: registro.matricula, fecha: registro.fecha,
        litros: registro.litros, preciobtanol: registro.preciobtanol, importe: registro.importe,
        kms: registro.kms, gasolinera: registro.gasolinera, foto_url: registro.foto_url,
        createdby: registro.createdby
      });
      if (error) throw error;
      showToast('⛽ Repostaje guardado', 'success');
      cerrar();
      if (typeof window.refrescarConsumo === 'function') window.refrescarConsumo();
    } catch (e) {
      console.error('[Repostajes] guardar:', e);
      showToast('Error al guardar: ' + (e.message || e), 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Guardar repostaje';
    }
  }

  function cerrar() { const m = document.getElementById('rep-modal'); if (m) m.style.display = 'none'; }

  // ── Estadísticas mensuales de consumo ──────
  async function resumenConsumo(desde, hasta) {
    const db = supa();
    const q = db.from(T_PLANTILLAS).select('matricula,fecha,litros,importe,kms')
      .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  window.addEventListener('valgom:logged-out', () => {
    if (ocrWorker) { try { ocrWorker.terminate(); } catch (_) { } ocrWorker = null; }
  });

  return { abrir, cerrar, resumenConsumo, extraerDatosTicket, ocrDocumento: ocrTicket };
})();
