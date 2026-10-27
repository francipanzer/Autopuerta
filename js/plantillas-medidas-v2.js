/* =========================================================
 * plantillas-medidas-v2.js v1.0
 * Módulo de PLANTILLAS DE MEDIDAS digitales.
 *
 * 1. CATÁLOGO: plantillas guardadas en Supabase (tabla
 *    plantillas_medidas) + las básicas incluidas. El técnico
 *    elige la hoja en un select, rellena las medidas y el
 *    dibujo técnico se actualiza en vivo con las cotas.
 * 2. EDITOR: crea/edita plantillas sin tocar código: nombre,
 *    tipo de puerta, campos (etiqueta, defecto, min, max) y
 *    vista previa del dibujo en vivo.
 * 3. MEDICIONES: cada toma queda registrada con fecha, cliente,
 *    técnico, valores, foto y estado (pendiente → presupuestado),
 *    para pasarla a administración. PDF incluido.
 *
 * Depende de: escapeHtml, showToast, window.supabaseDB,
 *             window.PLANTILLAS_MEDIDAS.PLANTILLAS (básicas),
 *             window.jspdf (PDF).
 * ========================================================= */
'use strict';

window.PLANTILLAS_MEDIDAS_V2 = (function () {
  const T_PLANTILLAS = 'plantillas_medidas';
  const T_MEDICIONES = 'mediciones_medidas';
  const BUCKET = 'medidas-fotos';
  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => new Date().toISOString().slice(0, 10);

  // ── Acceso a datos (Supabase + caché local como respaldo) ──
  let cachePlantillas = null;

  function supa() {
    const db = window.supabaseDB || window.sb;
    if (db && typeof db.from === 'function') return db;
    throw new Error('Supabase no disponible');
  }

  async function listarPlantillas(forzar) {
    if (cachePlantillas && !forzar) return cachePlantillas;
    const basicas = Object.entries(window.PLANTILLAS_MEDIDAS?.PLANTILLAS || {}).map(([k, p]) => ({
      id: 'basica_' + k, nombre: p.nombre, tipoPuerta: p.nombre, campos: p.campos, svgFn: p.svg, esBasica: true
    }));
    let remota = [];
    try {
      const { data, error } = await supa().from(T_PLANTILLAS).select('*').order('createdat', { ascending: false });
      if (!error && Array.isArray(data)) {
        remota = data.map(r => ({
          id: r.id, nombre: r.nombre, tipoPuerta: r.tipopuerta || '', descripcion: r.descripcion || '',
          campos: r.campos || [], svg: r.svg || '', imagenUrl: r.imagenurl || '', esBasica: false
        }));
      }
    } catch (e) { console.warn('[Plantillas V2] sin conexión, uso solo básicas:', e.message || e); }
    cachePlantillas = [...remota, ...basicas];
    return cachePlantillas;
  }

  async function guardarPlantilla(p) {
    const db = await supa();
    const fila = {
      nombre: p.nombre, tipopuerta: p.tipoPuerta || '', descripcion: p.descripcion || '',
      campos: p.campos, svg: p.svg || '', imagenurl: p.imagenUrl || null, createdby: window.authState?.user?.id || null
    };
    if (p.id && !String(p.id).startsWith('basica_')) {
      const { error } = await db.from(T_PLANTILLAS).update({ ...fila, updatedat: new Date().toISOString() }).eq('id', p.id);
      if (error) throw error;
    } else {
      const { data, error } = await db.from(T_PLANTILLAS).insert(fila).select().single();
      if (error) throw error;
      p.id = data.id;
    }
    cachePlantillas = null;
    return p;
  }

  async function borrarPlantilla(id) {
    const db = await supa();
    const { error } = await db.from(T_PLANTILLAS).delete().eq('id', id);
    if (error) throw error;
    cachePlantillas = null;
  }

  async function listarMediciones() {
    try {
      const { data, error } = await supa().from(T_MEDICIONES).select('*').order('createdat', { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []).map(r => ({
        id: r.id, plantillaId: r.plantillaid, plantillaNombre: r.plantillanombre,
        clienteId: r.clienteid, clienteNombre: r.clientenombre,
        tecnicoNombre: r.tecniconombre, fecha: r.fecha, valores: r.valores || {},
        notas: r.notas || '', fotos: r.fotos || [], estado: r.estado || 'pendiente'
      }));
    } catch (e) {
      console.warn('[Mediciones] sin conexión:', e.message || e);
      try { return JSON.parse(localStorage.getItem('autopuerta_mediciones_local') || '[]'); } catch (_) { return []; }
    }
  }

  async function guardarMedicion(m) {
    const db = await supa();
    const fila = {
      plantillaid: m.plantillaId && !String(m.plantillaId).startsWith('basica_') ? m.plantillaId : null,
      plantillanombre: m.plantillaNombre, clienteid: m.clienteId || null, clientenombre: m.clienteNombre || '',
      tecnicoid: window.authState?.employee?.id || null, tecniconombre: m.tecnicoNombre || '',
      fecha: m.fecha, valores: m.valores, notas: m.notas || '', fotos: m.fotos || [],
      estado: m.estado || 'pendiente', createdby: window.authState?.user?.id || null
    };
    const { data, error } = await db.from(T_MEDICIONES).insert(fila).select().single();
    if (error) throw error;
    return data;
  }

  async function cambiarEstadoMedicion(id, estado) {
    const db = await supa();
    const { error } = await db.from(T_MEDICIONES).update({ estado, updatedat: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async function subirFotoMedicion(dataUrl) {
    const userId = window.authState?.user?.id;
    if (!userId || !navigator.onLine || !window.supabaseDB) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const rand = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random()).replace(/-/g, '');
      const path = userId + '/' + rand + '.' + ext;
      const { error } = await window.supabaseDB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      return window.supabaseDB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) { console.warn('[Mediciones] foto no subida:', e.message || e); return null; }
  }

  // ── Dibujo SVG de una plantilla con los valores actuales ──
  function dibujarPlantilla(p, valores) {
    // Plantilla básica: usa su propio renderizador
    if (p.svgFn) return p.svgFn(valores);
    if (p.svg) return p.svg; // SVG guardado por el editor
    // Genérico: hueco cotado con todos los campos numéricos
    const nums = (p.campos || []).filter(c => String(c.defecto ?? '') !== '' && !isNaN(parseFloat(c.defecto)));
    const ancho = parseFloat(valores[nums[0]?.id]) || 2000, alto = parseFloat(valores[nums[1]?.id]) || 2000;
    const txt = nums.map(c => `${_esc(c.etiqueta.split('(')[0].trim())}: <tspan font-weight="bold">${_esc(valores[c.id] ?? '—')}</tspan>`).join('  ·  ');
    return `<svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="30" width="220" height="160" fill="#f8fafc" stroke="#1e3a5f" stroke-width="3"/>
      <line x1="40" y1="205" x2="260" y2="205" stroke="#e11d48" stroke-width="1.8"/>
      <polygon points="40,205 48,201 48,209" fill="#e11d48"/><polygon points="260,205 252,201 252,209" fill="#e11d48"/>
      <line x1="285" y1="30" x2="285" y2="190" stroke="#e11d48" stroke-width="1.8"/>
      <polygon points="285,30 281,38 289,38" fill="#e11d48"/><polygon points="285,190 281,182 289,182" fill="#e11d48"/>
      <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">${ancho} × ${alto}</text>
      <text x="150" y="18" font-size="8" fill="#475569" text-anchor="middle">${txt}</text>
    </svg>`;
  }

  // ═══════════ MODAL: tomar una medición ═══════════
  let estadoMed = { plantilla: null, valores: {}, fotos: [], onGuardar: null };

  function asegurarModalMedicion() {
    if (document.getElementById('pmv2-med-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="pmv2-med-modal" class="modal" style="display:none;">
      <div class="modal-content plantillas-modal">
        <div class="modal-header"><h2>📏 Tomar medidas</h2><button type="button" class="btn-close-x" onclick="PLANTILLAS_MEDIDAS_V2.cerrarMedicion()">✕</button></div>
        <div class="plantillas-body">
          <div class="plantillas-izq">
            <label>Plantilla (tipo de puerta)</label>
            <div style="display:flex;gap:6px">
              <select id="pmv2-sel-plantilla" style="flex:1"></select>
              <button type="button" class="btn btn-outline btn-sm" title="Editar plantillas" onclick="PLANTILLAS_MEDIDAS_V2.abrirEditor()"><i class="fas fa-pen-to-square"></i></button>
            </div>
            <div id="pmv2-campos"></div>
            <label>Cliente</label>
            <select id="pmv2-cliente"></select>
            <label>Técnico</label>
            <input type="text" id="pmv2-tecnico" readonly>
            <label>Fecha</label>
            <input type="date" id="pmv2-fecha">
            <label>Notas</label>
            <textarea id="pmv2-notas" rows="2" placeholder="Observaciones para administración…"></textarea>
            <label>Foto de la obra (opcional)</label>
            <div id="pmv2-fotos-thumbs" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('pmv2-foto-input').click()"><i class="fas fa-camera"></i> Añadir foto</button>
            <input type="file" id="pmv2-foto-input" accept="image/*" capture="environment" style="display:none">
            <button id="pmv2-btn-guardar-med" class="btn btn-primary" style="margin-top:6px"><i class="fas fa-paper-plane"></i> Guardar y enviar a administración</button>
          </div>
          <div class="plantillas-der">
            <div class="plantillas-toolbar"><span style="font-size:12px;color:var(--text-muted)">Vista previa en vivo — los valores se reflejan al escribir</span></div>
            <div id="pmv2-visor" class="plantillas-visor"></div>
            <div id="pmv2-ayuda" class="plantillas-ayuda"></div>
          </div>
        </div>
      </div>
    </div>`);
    document.getElementById('pmv2-sel-plantilla').addEventListener('change', e => cargarPlantillaEnForm(e.target.value));
    document.getElementById('pmv2-foto-input').addEventListener('change', async e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      try {
        const { compressDoticsPhoto } = window;
        const dataUrl = window.compressDoticsPhoto ? await window.compressDoticsPhoto(f) : await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        estadoMed.fotos.push(dataUrl);
        pintarThumbsMed();
      } catch (err) { showToast('No se pudo procesar la foto', 'error'); }
    });
    document.getElementById('pmv2-btn-guardar-med').addEventListener('click', guardarMedicionForm);
  }

  function pintarThumbsMed() {
    const cont = document.getElementById('pmv2-fotos-thumbs');
    if (!cont) return;
    cont.innerHTML = estadoMed.fotos.map((f, i) =>
      `<div style="position:relative;width:70px;height:70px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)">
        <img src="${f}" style="width:100%;height:100%;object-fit:cover">
        <button type="button" onclick="PLANTILLAS_MEDIDAS_V2.quitarFotoMed(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:11px">×</button>
      </div>`).join('');
  }

window.PLANTILLAS_MEDIDAS_V2 = { abrirMedicion(){}, abrirEditor(){}, abrirRegistro(){} }; // placeholder antes de la carga real

  async function abrirMedicion(opts) {
    opts = opts || {};
    asegurarModalMedicion();
    estadoMed = { plantilla: null, valores: {}, fotos: [], onGuardar: opts.onGuardar || null };
    const plantillas = await listarPlantillas(true);
    const sel = document.getElementById('pmv2-sel-plantilla');
    sel.innerHTML = '<option value="">— Elegir hoja de medidas —</option>' +
      plantillas.map(p => `<option value="${_esc(p.id)}">${_esc(p.nombre)}${p.esBasica ? ' ✎' : ''}</option>`).join('');
    const clientes = opts.clientes || [];
    const selCli = document.getElementById('pmv2-cliente');
    selCli.innerHTML = '<option value="">— Sin cliente (medición libre) —</option>' +
      clientes.map(c => `<option value="${_esc(c.id)}">${_esc(c.nombre)}</option>`).join('');
    if (opts.clienteId) selCli.value = opts.clienteId;
    document.getElementById('pmv2-tecnico').value = window.authState?.employee?.nombre || window.authState?.user?.email || '';
    document.getElementById('pmv2-fecha').value = hoy();
    document.getElementById('pmv2-notas').value = '';
    document.getElementById('pmv2-visor').innerHTML = '<div style="color:#94a3b8;text-align:center;padding:30px">Elige una plantilla para ver el dibujo cotado</div>';
    document.getElementById('pmv2-campos').innerHTML = '';
    pintarThumbsMed();
    document.getElementById('pmv2-med-modal').style.display = 'flex';
  }

  function cargarPlantillaEnForm(id) {
    listarPlantillas().then(list => {
      const p = list.find(x => String(x.id) === String(id));
      estadoMed.plantilla = p || null;
      estadoMed.valores = {};
      const cont = document.getElementById('pmv2-campos');
      if (!p) { cont.innerHTML = ''; document.getElementById('pmv2-visor').innerHTML = ''; return; }
      cont.innerHTML = '<div style="border-top:1px dashed var(--border);margin:10px 0;padding-top:10px;display:flex;flex-direction:column;gap:8px">' +
        (p.campos || []).map(c => `
          <div>
            <label style="font-size:12px;color:var(--text-muted);margin-bottom:2px">${_esc(c.etiqueta)}</label>
            <input type="number" inputmode="decimal" class="only-num-dec pmv2-campo" data-cid="${_esc(c.id)}"
              value="${_esc(c.defecto ?? '')}" min="${_esc(c.min ?? '')}" max="${_esc(c.max ?? '')}"
              placeholder="${_esc(c.defecto ?? '')}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px">
          </div>`).join('') + '</div>';
      cont.querySelectorAll('.pmv2-campo').forEach(inp => {
        inp.addEventListener('input', () => {
          estadoMed.valores[inp.dataset.cid] = inp.value;
          pintarPreviewMed();
        });
      });
      pintarPreviewMed();
      document.getElementById('pmv2-ayuda').textContent = 'Plantilla: ' + p.nombre + '. Rellena las medidas y guarda.';
    });
  }

  function pintarPreviewMed() {
    const p = estadoMed.plantilla;
    if (!p) return;
    // valores por defecto + escritos
    const v = {};
    (p.campos || []).forEach(c => { v[c.id] = estadoMed.valores[c.id] ?? c.defecto ?? ''; });
    document.getElementById('pmv2-visor').innerHTML = dibujarPlantilla(p, v);
  }

  async function guardarMedicionForm() {
    const p = estadoMed.plantilla;
    if (!p) { showToast('Elige una plantilla de medidas', 'error'); return; }
    // Validación: campos obligatorios dentro de rango
    for (const c of (p.campos || [])) {
      const inp = document.querySelector(`.pmv2-campo[data-cid="${CSS.escape(c.id)}"]`);
      const val = (inp?.value ?? '').trim();
      if (val === '' && (c.defecto ?? '') === '') { showToast('Rellena "' + c.etiqueta + '"', 'error'); inp?.focus(); return; }
      if (val !== '' && !isNaN(parseFloat(c.defecto))) {
        const n = parseFloat(val);
        if (isNaN(n)) { showToast('"' + c.etiqueta + '" debe ser un número', 'error'); inp?.focus(); return; }
        if (c.min != null && n < parseFloat(c.min)) { showToast('"' + c.etiqueta + '" no puede ser menor que ' + c.min, 'error'); inp?.focus(); return; }
        if (c.max != null && n > parseFloat(c.max)) { showToast('"' + c.etiqueta + '" no puede ser mayor que ' + c.max, 'error'); inp?.focus(); return; }
      }
    }
    const v = {};
    (p.campos || []).forEach(c => { v[c.id] = document.querySelector(`.pmv2-campo[data-cid="${CSS.escape(c.id)}"]`)?.value ?? c.defecto ?? ''; });
    const selCli = document.getElementById('pmv2-cliente');
    const btn = document.getElementById('pmv2-btn-guardar-med');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      // Subir fotos a Storage
      const fotos = [];
      for (const f of estadoMed.fotos) {
        if (f.startsWith('data:image/')) fotos.push(await subirFotoMedicion(f) || f);
        else fotos.push(f);
      }
      const medicion = {
        plantillaId: p.id, plantillaNombre: p.nombre,
        clienteId: selCli.value || null, clienteNombre: selCli.selectedOptions[0]?.textContent || '',
        tecnicoNombre: document.getElementById('pmv2-tecnico').value,
        fecha: document.getElementById('pmv2-fecha').value || hoy(),
        valores: v, notas: document.getElementById('pmv2-notas').value.trim(),
        fotos, estado: 'pendiente'
      };
      await guardarMedicion(medicion);
      showToast('✅ Medición enviada a administración', 'success');
      cerrarMedicion();
      if (estadoMed.onGuardar) estadoMed.onGuardar(medicion);
      if (typeof window.refrescarMediciones === 'function') window.refrescarMediciones();
    } catch (e) {
      console.error('[Mediciones] guardar:', e);
      // Respaldo local si falla la red
      try {
        const local = JSON.parse(localStorage.getItem('autopuerta_mediciones_local') || '[]');
        local.unshift({ ...({}), id: 'local_' + Date.now(), ...({}), plantillaNombre: p.nombre, clienteNombre: document.getElementById('pmv2-cliente').selectedOptions[0]?.textContent || '', tecnicoNombre: document.getElementById('pmv2-tecnico').value, fecha: document.getElementById('pmv2-fecha').value || hoy(), valores: v, notas: document.getElementById('pmv2-notas').value.trim(), fotos: estadoMed.fotos, estado: 'pendiente' });
        localStorage.setItem('autopuerta_mediciones_local', JSON.stringify(local.slice(0, 100)));
        showToast('Sin conexión: medición guardada localmente, se enviará al recuperar señal', 'info');
        cerrarMedicion();
      } catch (_) { showToast('Error al guardar: ' + e.message, 'error'); }
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Guardar y enviar a administración';
    }
  }

  function quitarFotoMed(i) { estadoMed.fotos.splice(i, 1); pintarThumbsMed(); }
  function cerrarMedicion() { const m = document.getElementById('pmv2-med-modal'); if (m) m.style.display = 'none'; }

  // ═══════════ MODAL: editor de plantillas ═══════════
  let estadoEdit = { plantilla: null, campos: [], imagenBase64: null };

  function asegurarModalEditor() {
    if (document.getElementById('pmv2-edit-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="pmv2-edit-modal" class="modal" style="display:none;">
      <div class="modal-content plantillas-modal">
        <div class="modal-header"><h2>🛠 Editor de plantillas de medidas</h2><button type="button" class="btn-close-x" onclick="PLANTILLAS_MEDIDAS_V2.cerrarEditor()">✕</button></div>
        <div class="plantillas-body">
          <div class="plantillas-izq">
            <label>Nombre de la plantilla</label>
            <input type="text" id="pmv2e-nombre" placeholder="Ej: Seccional con marco">
            <label>Tipo de puerta</label>
            <input type="text" id="pmv2e-tipo" placeholder="Ej: Puerta Seccional">
            <label>Descripción</label>
            <input type="text" id="pmv2e-desc" placeholder="Opcional">
            <label style="margin-top:6px"><i class="fas fa-ruler"></i> Campos de medida</label>
            <div id="pmv2e-campos" style="display:flex;flex-direction:column;gap:6px"></div>
            <button type="button" class="btn btn-outline btn-sm" id="pmv2e-add-campo"><i class="fas fa-plus"></i> Añadir campo</button>
            <label style="margin-top:6px">Imagen de referencia (opcional)</label>
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('pmv2e-img-input').click()"><i class="fas fa-image"></i> Subir esquema</button>
            <input type="file" id="pmv2e-img-input" accept="image/*" style="display:none">
            <div id="pmv2e-img-thumbs" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            <button id="pmv2e-btn-guardar" class="btn btn-primary" style="margin-top:6px"><i class="fas fa-save"></i> Guardar plantilla</button>
          </div>
          <div class="plantillas-der">
            <div class="plantillas-toolbar"><span style="font-size:12px;color:var(--text-muted)">Vista previa — así la verá el técnico con las medidas</span></div>
            <div id="pmv2e-visor" class="plantillas-visor"></div>
          </div>
        </div>
      </div>
    </div>`);
    document.getElementById('pmv2e-add-campo').addEventListener('click', () => {
      estadoEdit.campos.push({ id: 'c' + Date.now() + Math.floor(Math.random() * 99), etiqueta: '', defecto: '', min: '', max: '' });
      pintarCamposEditor(); pintarPreviewEditor();
    });
    document.getElementById('pmv2e-btn-guardar').addEventListener('click', guardarPlantillaEditor);
    document.getElementById('pmv2e-img-input').addEventListener('change', e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        estadoEdit.imagenBase64 = r.result;
        pintarImgThumbEditor();
        pintarPreviewEditor();
      };
      r.readAsDataURL(f);
    });
    ['pmv2e-nombre', 'pmv2e-tipo'].forEach(id => document.getElementById(id).addEventListener('input', pintarPreviewEditor));
  }

  function pintarCamposEditor() {
    const cont = document.getElementById('pmv2e-campos');
    cont.innerHTML = estadoEdit.campos.map((c, i) => `
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 30px;gap:4px;align-items:center">
        <input type="text" placeholder="Etiqueta (Ancho hueco mm)" value="${_esc(c.etiqueta)}" data-i="${i}" data-f="etiqueta" class="pmv2e-campo-in">
        <input type="text" placeholder="Defecto" value="${_esc(c.defecto)}" data-i="${i}" data-f="defecto" class="pmv2e-campo-in">
        <input type="text" placeholder="Mín" value="${_esc(c.min)}" data-i="${i}" data-f="min" class="pmv2e-campo-in">
        <input type="text" placeholder="Máx" value="${_esc(c.max)}" data-i="${i}" data-f="max" class="pmv2e-campo-in">
        <button type="button" class="btn btn-outline btn-sm btn-icon" title="Quitar" onclick="PLANTILLAS_MEDIDAS_V2._quitarCampo(${i})"><i class="fas fa-minus"></i></button>
      </div>`).join('') +
      (estadoEdit.campos.length ? '<small style="color:var(--text-muted)">Columnas: etiqueta · valor por defecto · mínimo · máximo</small>' : '<small style="color:var(--text-muted)">Aún no hay campos. Añade al menos uno (p. ej. "Ancho hueco (mm)").</small>');
    cont.querySelectorAll('.pmv2e-campo-in').forEach(inp => {
      inp.addEventListener('input', () => {
        const c = estadoEdit.campos[+inp.dataset.i];
        if (!c) return;
        c[inp.dataset.f] = inp.value;
        if (inp.dataset.f === 'etiqueta' && !c.id) c.id = 'c' + Date.now();
        pintarPreviewEditor();
      });
    });
  }

  window.PLANTILLAS_MEDIDAS_V2._quitarCampo = function (i) { estadoEdit.campos.splice(i, 1); pintarCamposEditor(); pintarPreviewEditor(); };

  function pintarImgThumbEditor() {
    const cont = document.getElementById('pmv2e-img-thumbs');
    if (!cont) return;
    cont.innerHTML = estadoEdit.imagenBase64
      ? `<div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)">
          <img src="${estadoEdit.imagenBase64}" style="width:100%;height:100%;object-fit:cover">
          <button type="button" onclick="PLANTILLAS_MEDIDAS_V2._quitarImagen()" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:11px">×</button>
        </div>` : '';
  }
  window.PLANTILLAS_MEDIDAS_V2._quitarImagen = function () { estadoEdit.imagenBase64 = null; pintarImgThumbEditor(); pintarPreviewEditor(); };

  // Vista previa del editor: imagen de fondo + cotas genéricas con los campos
  function pintarPreviewEditor() {
    const visor = document.getElementById('pmv2e-visor');
    if (!visor) return;
    const campos = estadoEdit.campos.filter(c => (c.etiqueta || '').trim());
    if (!campos.length && !estadoEdit.imagenBase64) {
      visor.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:30px">Añade campos para ver la vista previa</div>';
      return;
    }
    const filaCampos = campos.map(c => `<div class="pmv2e-prev-chip"><span>${_esc(c.etiqueta)}</span><b>${_esc(c.defecto || '—')}</b></div>`).join('');
    visor.innerHTML = `
      <div style="width:100%;max-width:520px">
        ${estadoEdit.imagenBase64 ? `<div style="text-align:center;margin-bottom:10px"><img src="${estadoEdit.imagenBase64}" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border)"></div>` : `
        <svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border-radius:8px;border:1px solid var(--border)">
          <rect x="40" y="25" width="220" height="155" fill="#f8fafc" stroke="#1e3a5f" stroke-width="3"/>
          <line x1="40" y1="192" x2="260" y2="192" stroke="#e11d48" stroke-width="1.8"/>
          <polygon points="40,192 48,188 48,196" fill="#e11d48"/><polygon points="260,192 252,188 252,196" fill="#e11d48"/>
          <line x1="272" y1="25" x2="272" y2="180" stroke="#e11d48" stroke-width="1.8"/>
          <polygon points="272,25 268,33 276,33" fill="#e11d48"/><polygon points="272,180 268,172 276,172" fill="#e11d48"/>
          <text x="150" y="200" font-size="10" fill="#e11d48" font-weight="bold" text-anchor="middle">${_esc(campos[0]?.defecto || '—')}</text>
          <text x="282" y="105" font-size="10" fill="#e11d48" font-weight="bold" transform="rotate(90 282 105)">${_esc(campos[1]?.defecto || '—')}</text>
        </svg>`}
        <div class="pmv2e-prev-row">${filaCampos}</div>
      </div>`;
  }

  async function abrirEditor(idPlantilla) {
    asegurarModalEditor();
    const list = await listarPlantillas(true);
    const p = idPlantilla ? list.find(x => String(x.id) === String(idPlantilla) && !x.esBasica) : null;
    estadoEdit = {
      plantilla: p || null,
      campos: p ? JSON.parse(JSON.stringify(p.campos || [])) : [],
      imagenBase64: p?.imagenUrl || null
    };
    document.getElementById('pmv2e-nombre').value = p?.nombre || '';
    document.getElementById('pmv2e-tipo').value = p?.tipoPuerta || '';
    document.getElementById('pmv2e-desc').value = p?.descripcion || '';
    pintarCamposEditor(); pintarImgThumbEditor(); pintarPreviewEditor();
    document.getElementById('pmv2-edit-modal').style.display = 'flex';
  }

  async function guardarPlantillaEditor() {
    const nombre = document.getElementById('pmv2e-nombre').value.trim();
    if (!nombre) { showToast('Ponle nombre a la plantilla', 'error'); return; }
    const campos = estadoEdit.campos
      .filter(c => (c.etiqueta || '').trim())
      .map((c, i) => ({ id: c.id || ('c' + Date.now() + '_' + i), etiqueta: c.etiqueta.trim(), defecto: c.defecto, min: c.min, max: c.max }));
    if (!campos.length) { showToast('Añade al menos un campo de medida', 'error'); return; }
    const btn = document.getElementById('pmv2e-btn-guardar');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      let imagenUrl = estadoEdit.plantilla?.imagenUrl || null;
      if (estadoEdit.imagenBase64 && estadoEdit.imagenBase64.startsWith('data:image/')) {
        imagenUrl = await subirFotoMedicion(estadoEdit.imagenBase64) || imagenUrl;
      }
      await guardarPlantilla({
        id: estadoEdit.plantilla?.id, nombre,
        tipoPuerta: document.getElementById('pmv2e-tipo').value.trim(),
        descripcion: document.getElementById('pmv2e-desc').value.trim(),
        campos, imagenUrl
      });
      showToast('✅ Plantilla guardada', 'success');
      cerrarEditor();
      if (typeof window.refrescarMediciones === 'function') window.refrescarMediciones();
    } catch (e) {
      console.error('[Editor plantillas] guardar:', e);
      showToast('Error al guardar la plantilla: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar plantilla';
    }
  }

  function cerrarEditor() { const m = document.getElementById('pmv2-edit-modal'); if (m) m.style.display = 'none'; }

  // ═══════════ MODAL: registro de mediciones (administración) ═══════════
  async function abrirRegistro() {
    asegurarModalRegistro();
    const m = document.getElementById('pmv2-reg-modal');
    m.style.display = 'flex';
    window.refrescarMediciones = refrescarRegistro;
    refrescarRegistro();
  }

  function asegurarModalRegistro() {
    if (document.getElementById('pmv2-reg-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="pmv2-reg-modal" class="modal" style="display:none;">
      <div class="modal-content plantillas-modal">
        <div class="modal-header"><h2>📋 Mediciones pendientes de presupuestar</h2><button type="button" class="btn-close-x" onclick="PLANTILLAS_MEDIDAS_V2.cerrarRegistro()">✕</button></div>
        <div style="padding:16px 20px;max-height:80vh;overflow:auto">
          <div id="pmv2-reg-lista"></div>
        </div>
      </div>
    </div>`);
  }

  async function refrescarRegistro() {
    const cont = document.getElementById('pmv2-reg-lista');
    if (!cont) return;
    cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>';
    const lista = await listarMediciones();
    if (!lista.length) {
      cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:28px;display:block;margin-bottom:10px"></i>No hay mediciones registradas todavía.<br><small>Los técnicos las toman desde "Tomar medidas".</small></div>';
      return;
    }
    const badge = e => e === 'pendiente' ? '<span class="badge badge-orange">Pendiente</span>'
      : e === 'presupuestado' ? '<span class="badge badge-green">Presupuestado</span>'
        : '<span class="badge badge-gray">Cancelada</span>';
    cont.innerHTML = lista.map(mm => `
      <div class="pmv2-reg-card">
        <div class="pmv2-reg-head">
          <div>
            <strong>${_esc(mm.plantillaNombre || 'Medición')}</strong>
            <div style="font-size:12px;color:var(--text-muted)">${_esc(mm.clienteNombre || 'Sin cliente')} · ${_esc(mm.fecha || '')} · ${_esc(mm.tecnicoNombre || '—')}</div>
          </div>
          ${badge(mm.estado)}
        </div>
        <div class="pmv2-reg-valores">
          ${Object.entries(mm.valores || {}).map(([k, v]) => {
      const campo = null; // etiqueta corta: usamos la clave si no hay catálogo a mano
      return `<div class="pmv2-reg-val"><span>${_esc(k)}</span><b>${_esc(v)}</b></div>`;
    }).join('')}
        </div>
        ${mm.notas ? `<div style="font-size:12px;margin-top:8px;color:var(--text-muted)"><i class="fas fa-comment-dots"></i> ${_esc(mm.notas)}</div>` : ''}
        ${(mm.fotos || []).length ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${mm.fotos.map(f => `<img src="${_esc(f)}" class="inc-foto" style="width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)">`).join('')}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="PLANTILLAS_MEDIDAS_V2.pdfMedicion('${_esc(mm.id)}')"><i class="fas fa-file-pdf"></i> PDF</button>
          ${mm.estado === 'pendiente' ? `
            <button class="btn btn-primary btn-sm" onclick="PLANTILLAS_MEDIDAS_V2.marcar('${_esc(mm.id)}','presupuestado')"><i class="fas fa-check"></i> Marcar presupuestado</button>
            <button class="btn btn-outline btn-sm" onclick="PLANTILLAS_MEDIDAS_V2.marcar('${_esc(mm.id)}','cancelado')"><i class="fas fa-ban"></i> Cancelar</button>` : ''}
        </div>
      </div>`).join('');
  }

  async function marcar(id, estado) {
    try {
      await cambiarEstadoMedicion(id, estado);
      showToast('Medición actualizada', 'success');
      refrescarRegistro();
    } catch (e) { showToast('Error al actualizar: ' + e.message, 'error'); }
  }

  // PDF de una medición con el dibujo cotado
  async function pdfMedicion(id) {
    const lista = await listarMediciones();
    const mm = lista.find(x => String(x.id) === String(id));
    if (!mm) return;
    const plantillas = await listarPlantillas();
    const p = plantillas.find(x => String(x.id) === String(mm.plantillaId));
    const datosEmpresa = window.DATOS_EMPRESA || {};
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16); doc.text('AutoPuerta Pro — Hoja de medidas', 14, 16);
    doc.setFontSize(11);
    doc.text('Cliente: ' + (mm.clienteNombre || '—'), 14, 26);
    doc.text('Plantilla: ' + (mm.plantillaNombre || '—'), 150, 26);
    doc.text('Fecha: ' + (mm.fecha || '—'), 14, 33);
    doc.text('Técnico: ' + (mm.tecnicoNombre || '—'), 150, 33);
    // Dibujo: renderizar el SVG en canvas para incrustarlo
    try {
      const p2 = p || { campos: [], svgFn: null, svg: '' };
      const v = mm.valores || {};
      const svg = dibujarPlantilla(p2, v);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); });
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 880;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 40, 40, 1120, 800);
      doc.addImage(cv.toDataURL('image/png'), 'PNG', 14, 42, 180, 132);
    } catch (e) { console.warn('SVG→PDF:', e); }
    // Tabla de valores
    let y = 42;
    doc.setFontSize(10);
    Object.entries(mm.valores || {}).forEach(([k, val]) => {
      // etiqueta legible desde la plantilla si existe
      const campo = p?.campos?.find(c => c.id === k);
      doc.text('• ' + (campo?.etiqueta || k) + ': ' + val, 200, y);
      y += 6;
    });
    if (mm.notas) { doc.text('Notas: ' + mm.notas, 200, Math.min(y + 8, 190)); }
    // Fotos
    let fx = 14;
    for (const f of (mm.fotos || []).slice(0, 3)) {
      try { doc.addImage(f, 'JPEG', fx, 185, 55, 55); fx += 60; } catch (e) { }
    }
    doc.save('medidas_' + (mm.clienteNombre || '').replace(/\s+/g, '_') + '_' + (mm.fecha || '') + '.pdf');
  }

  function cerrarRegistro() { const m = document.getElementById('pmv2-reg-modal'); if (m) m.style.display = 'none'; }

  // API pública
  Object.assign(window.PLANTILLAS_MEDIDAS_V2, {
    abrirMedicion, abrirEditor, abrirRegistro, pdfMedicion, marcar,
    quitarFotoMed, cerrarMedicion, cerrarEditor, cerrarRegistro,
    dibujarPlantilla, listarPlantillas
  });
  return window.PLANTILLAS_MEDIDAS_V2;
})();
