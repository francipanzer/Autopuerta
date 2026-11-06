/* =========================================================
 * hoja-medidas.js v1.0
 * Sistema de HOJAS DE MEDIDAS sobre imagen real de plantilla.
 *
 * Concepto (lo pedido):
 *  - En el presupuesto se elige el TIPO DE PUERTA (tabla
 *    global tipos_puerta) y se abre la HOJA asociada a ese tipo:
 *    una imagen/PDF rasterizado de la plantilla de papel de
 *    siempre, con CAMPOS DE TEXTO superpuestos justo en los
 *    huecos donde se escribe a mano.
 *  - El técnico pasa de cuadro en cuadro (Tab / botón
 *    "Siguiente medida") apuntando los valores.
 *  - Al guardar, la hoja rellena queda adjunta al PRESUPUESTO
 *    (campo medidasPlanta, ya existente). Administración la ve
 *    en pantalla y en el PDF del presupuesto (página extra con
 *    la hoja rellena).
 *
 * Plantillas: tabla Supabase `plantillas_medidas` (ya creada),
 * columna imagenUrl (bucket medidas-fotos) y campos jsonb con
 * posición en % de la imagen: {id, etiqueta, x, y, w, h}.
 *
 * Editor: desde la propia hoja (para admins) — subir imagen,
 * hacer clic para añadir cuadros, arrastrar para colocarlos.
 * ========================================================= */
'use strict';

window.HOJA_MEDIDAS = window.HOJA_MEDIDAS || {}; // el IIFE de abajo devuelve este objeto (antes devolvía undefined)
window.HOJA_MEDIDAS = (function () {
  const T_PLANTILLAS = 'plantillas_medidas';
  const BUCKET = 'medidas-fotos';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Plantillas locales incluidas (respaldo si no hay red) ──
  // Las imágenes están en la carpeta plantillas/ del proyecto (PNG generados de los SVG de alta resolución)
  const PLANTILLAS_INCLUIDAS = {
    'Puerta Rápida de Lona': {
      imagenUrl: 'plantillas/plantillarapidas.png',
      campos: [
        { id: 'a_ancho', etiqueta: 'ANCHO (A)', x: 72, y: 14, w: 16 },
        { id: 'b_alto', etiqueta: 'ALTO (B)', x: 72, y: 22, w: 16 },
        { id: 'c_luz', etiqueta: 'LUZ LIBRE (C)', x: 72, y: 30, w: 16 },
        { id: 'd_emboc', etiqueta: 'EMBOCADURA (D)', x: 72, y: 38, w: 16 },
        { id: 'e_celulas', etiqueta: 'Nº CÉLULAS', x: 72, y: 46, w: 16 },
        { id: 'f_notas', etiqueta: 'OBSERVACIONES', x: 72, y: 54, w: 16 }
      ]
    },
    'Puerta Seccional': {
      imagenUrl: 'plantillas/plantillaseccional.png',
      campos: [
        { id: 'a_ancho', etiqueta: 'ANCHO HUECO', x: 72, y: 12, w: 15 },
        { id: 'b_alto', etiqueta: 'ALTO HUECO', x: 72, y: 20, w: 15 },
        { id: 'c_luz', etiqueta: 'LUZ LIBRE', x: 72, y: 28, w: 15 },
        { id: 'd_guia', etiqueta: 'HIERRO GUIA', x: 72, y: 36, w: 15 },
        { id: 'e_paneles', etiqueta: 'NUM. PANELES', x: 72, y: 44, w: 15 },
        { id: 'f_notas', etiqueta: 'OBSERVACIONES', x: 72, y: 52, w: 22 }
      ]
    },
    'Puerta Cortafuegos': {
      imagenUrl: 'plantillas/plantillacortafuegos.png',
      campos: [
        { id: 'a_ancho', etiqueta: 'ANCHO HUECO', x: 72, y: 12, w: 15 },
        { id: 'b_alto', etiqueta: 'ALTO HUECO', x: 72, y: 20, w: 15 },
        { id: 'c_hojas', etiqueta: 'HOJAS (1/2)', x: 72, y: 28, w: 15 },
        { id: 'd_ejes', etiqueta: 'EJES (L/R)', x: 72, y: 36, w: 15 },
        { id: 'e_ei', etiqueta: 'RESISTENCIA', x: 72, y: 44, w: 15 },
        { id: 'f_notas', etiqueta: 'OBSERVACIONES', x: 72, y: 52, w: 22 }
      ]
    },
    'Puerta Corredera': {
      imagenUrl: 'plantillas/plantillacorredera.png',
      campos: [
        { id: 'a_ancho', etiqueta: 'ANCHO HOJA', x: 72, y: 12, w: 15 },
        { id: 'b_alto', etiqueta: 'ALTO HOJA', x: 72, y: 20, w: 15 },
        { id: 'c_hueco', etiqueta: 'HUECO TOTAL', x: 72, y: 28, w: 15 },
        { id: 'd_nhojas', etiqueta: 'NUM. HOJAS', x: 72, y: 36, w: 15 },
        { id: 'e_motor', etiqueta: 'MOTOR/MANUAL', x: 72, y: 44, w: 15 },
        { id: 'f_notas', etiqueta: 'OBSERVACIONES', x: 72, y: 52, w: 22 }
      ]
    },
    'Persiana Enrollable': {
      imagenUrl: 'plantillas/plantillaenrollable.png',
      campos: [
        { id: 'a_ancho', etiqueta: 'ANCHO TOTAL', x: 72, y: 12, w: 15 },
        { id: 'b_alto', etiqueta: 'ALTO TOTAL', x: 72, y: 20, w: 15 },
        { id: 'c_luz', etiqueta: 'LUZ LIBRE', x: 72, y: 28, w: 15 },
        { id: 'd_cajon', etiqueta: 'CAJON', x: 72, y: 36, w: 15 },
        { id: 'e_lama', etiqueta: 'TIPO LAMA', x: 72, y: 44, w: 15 },
        { id: 'f_notas', etiqueta: 'OBSERVACIONES', x: 72, y: 52, w: 22 }
      ]
    },
    'Puerta Basculante': {
      imagenUrl: 'plantillas/plantillabasculante.png',
      campos: [
        { id: 'a_ancho', etiqueta: 'ANCHO HUECO', x: 72, y: 12, w: 15 },
        { id: 'b_alto', etiqueta: 'ALTO HUECO', x: 72, y: 20, w: 15 },
        { id: 'c_luz', etiqueta: 'LUZ LIBRE', x: 72, y: 28, w: 15 },
        { id: 'd_muelles', etiqueta: 'NUM. MUELLES', x: 72, y: 36, w: 15 },
        { id: 'e_motor', etiqueta: 'MOTOR/MANUAL', x: 72, y: 44, w: 15 },
        { id: 'f_notas', etiqueta: 'OBSERVACIONES', x: 72, y: 52, w: 22 }
      ]
    }
  };

  function supa() {
    const db = window.supabaseDB || window.sb;
    if (db && typeof db.from === 'function') return db;
    throw new Error('Supabase no disponible');
  }

  // ── Cargar plantilla de un tipo de puerta ──
  // Prioridad: Supabase → plantilla local de la carpeta plantillas/ (imágenes PNG generadas de los SVG)
  async function cargarPlantillaDeTipo(tipoNombre) {
    try {
      const { data, error } = await supa().from(T_PLANTILLAS)
        .select('*').eq('tipopuerta', tipoNombre).limit(1).maybeSingle();
      if (!error && data) {
        return {
          id: data.id, tipoPuerta: data.tipopuerta || tipoNombre,
          imagenUrl: data.imagenurl || '', campos: data.campos || []
        };
      }
    } catch (e) { console.warn('[HojaMedidas] sin conexión:', e.message || e); }
    const incluida = PLANTILLAS_INCLUIDAS[tipoNombre];
    return incluida ? { id: 'incluida', tipoPuerta: tipoNombre, ...incluida } : null;
  }

  async function guardarDefPlantilla(def) {
    const fila = {
      nombre: 'Hoja de medidas — ' + def.tipoPuerta,
      tipopuerta: def.tipoPuerta, descripcion: 'Plantilla de toma de medidas',
      campos: def.campos, imagenurl: def.imagenUrl || null,
      createdby: window.authState?.user?.id || null
    };
    const db = supa();
    if (def.id && def.id !== 'incluida') {
      const { error } = await db.from(T_PLANTILLAS).update({ ...fila, updatedat: new Date().toISOString() }).eq('id', def.id);
      if (error) throw error;
      return def.id;
    }
    const { data, error } = await db.from(T_PLANTILLAS).insert(fila).select().single();
    if (error) throw error;
    return data.id;
  }

  async function subirImagenHoja(dataUrl) {
    const userId = window.authState?.user?.id;
    if (!userId || !navigator.onLine || !window.supabaseDB) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const rand = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random()).replace(/-/g, '');
      const path = userId + '/hoja-' + rand + '.' + ext;
      const { error } = await window.supabaseDB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      return window.supabaseDB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) { console.warn('[HojaMedidas] imagen no subida:', e.message || e); return null; }
  }

  // ════════════════ MODAL DE RELLENADO ════════════════
  let estado = { plantilla: null, valores: {}, onGuardar: null, imagenCargada: false };

  function asegurarModal() {
    if (document.getElementById('hm-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div id="hm-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10000;display:none;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:980px;width:100%;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.45);animation:pageIn .2s ease-out">
        <div class="modal-header">
          <h2 style="font-size:17px"><i class="fas fa-ruler-combined"></i> Hoja de medidas — <span id="hm-tipo-nombre"></span></h2>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-outline btn-sm" id="hm-btn-fs" title="Pantalla completa (ampliar imagen)"><i class="fas fa-expand"></i></button>
            <button type="button" class="btn btn-outline btn-sm" id="hm-btn-editor" title="Editar plantilla (admins)"><i class="fas fa-pen-to-square"></i> Editar plantilla</button>
            <button type="button" class="btn-close-x" onclick="HOJA_MEDIDAS.cerrar()">✕</button>
          </div>
        </div>
        <div style="overflow:auto;padding:14px;flex:1">
          <div id="hm-visor" style="position:relative;width:100%;max-width:860px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15)"></div>
        </div>
        <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <small style="color:var(--text-muted);flex:1;min-width:150px"><i class="fas fa-keyboard"></i> Pulsa <b>Tab</b> para pasar a la siguiente medida</small>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button type="button" class="btn btn-secondary" id="hm-btn-siguiente" style="min-height:40px"><i class="fas fa-forward"></i> Siguiente medida</button>
            <button type="button" class="btn btn-primary" id="hm-btn-guardar" style="min-height:40px;flex:0 1 auto;min-width:0"><i class="fas fa-paper-plane"></i> Adjuntar</button>
          </div>
        </div>
      </div>
    </div>`);
    document.getElementById('hm-btn-guardar').addEventListener('click', guardarHoja);
    document.getElementById('hm-btn-siguiente').addEventListener('click', siguienteCampo);
    document.getElementById('hm-btn-fs').addEventListener('click', () => {
      const m = document.getElementById('hm-modal');
      m.classList.toggle('hm-fs');
      document.getElementById('hm-btn-fs').innerHTML = m.classList.contains('hm-fs')
        ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
      ajustarVisorHoja();
    });
    document.getElementById('hm-btn-editor').addEventListener('click', () => {
      cerrar();
      abrirEditor(estado.plantilla);
    });
  }

  function siguienteCampo() {
    const inputs = [...document.querySelectorAll('#hm-visor .hm-input')];
    const vacio = inputs.find(i => !i.value.trim());
    (vacio || inputs[0])?.focus();
  }

  async function abrirHoja(tipoNombre, tipoId, valoresPrevios, onGuardar) {
    asegurarModal();
    document.getElementById('hm-tipo-nombre').textContent = tipoNombre;
    document.getElementById('hm-visor').innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i> Cargando hoja…</div>';
    document.getElementById('hm-btn-editor').style.display = window.isTechnician?.() ? 'none' : '';
    estado = { plantilla: null, valores: { ...(valoresPrevios || {}) }, onGuardar: onGuardar || null, imagenCargada: false };

    // Plantilla remota → si no hay, plantilla local incluida (carpeta plantillas/)
    let plantilla = null;
    try { plantilla = await cargarPlantillaDeTipo(tipoNombre); } catch (e) { console.warn('[HojaMedidas] remota:', e); }
    if (!plantilla) {
      const incluida = PLANTILLAS_INCLUIDAS[tipoNombre];
      if (incluida) plantilla = { id: 'incluida', tipoPuerta: tipoNombre, ...incluida };
    }
    estado.plantilla = plantilla;
    if (!plantilla) {
      document.getElementById('hm-visor').innerHTML =
        '<div style="padding:40px;text-align:center;color:#94a3b8">' +
        '<i class="fas fa-file-circle-plus" style="font-size:32px;display:block;margin-bottom:12px"></i>' +
        'Aún no hay hoja de medidas para <b>' + esc(tipoNombre) + '</b>.<br>' +
        '<small>Un administrador puede crearla con "Editar plantilla": sube el PDF/foto y marca los cuadros.</small></div>';
      document.getElementById('hm-btn-editor').style.display = '';
      document.getElementById('hm-modal').style.display = 'flex';
      return;
    }
    document.getElementById('hm-modal').style.display = 'flex';
    pintarHoja();
  }

  function ajustarVisorHoja() {
    // En pantalla completa: la imagen ocupa TODO el alto disponible (el ancho se adapta)
    const modal = document.getElementById('hm-modal');
    const visor = document.getElementById('hm-visor');
    if (!modal || !visor) return;
    const fs = modal.classList.contains('hm-fs');
    const header = modal.querySelector('.modal-header');
    const footH = fs ? 64 : 0; // pie con botones Siguiente/Adjuntar siempre visible
    const headH = header ? header.offsetHeight : 0;
    if (fs) {
      // el contenedor padre (#hm-modal>div) es flex-column; área disponible = alto pantalla - header - pie
      const disp = window.innerHeight - headH - footH - 8;
      visor.style.maxWidth = 'none';
      visor.style.maxHeight = disp + 'px';
      visor.style.width = 'auto';
      visor.style.height = disp + 'px';
      visor.style.aspectRatio = '';
      visor.style.margin = '0 auto';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'height:100%;width:auto;display:block;border-radius:10px;max-width:none';
    } else {
      visor.style.maxHeight = '';
      visor.style.height = '';
      visor.style.width = '100%';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
    }
  }

  function pintarHoja() {
    const visor = document.getElementById('hm-visor');
    const p = estado.plantilla;
    if (!visor || !p) return;
    visor.innerHTML = '';
    const img = new Image();
    img.onload = () => {
      estado.imagenCargada = true;
      visor.style.aspectRatio = img.width + ' / ' + img.height;
      visor.style.maxWidth = Math.min(860, img.width) + 'px';
      visor.style.margin = '0 auto';
      visor.style.padding = '0';
      visor.style.boxSizing = 'content-box';
      img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
      visor.appendChild(img);
      // Capa de campos superpuestos
      const capa = document.createElement('div');
      capa.style.cssText = 'position:absolute;inset:0';
      (p.campos || []).forEach((c, i) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;left:' + c.x + '%;top:' + c.y + '%;width:' + (c.w || 14) + '%;height:' + (c.h || 6) + '%;box-sizing:border-box';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'hm-input';
        inp.value = estado.valores[c.id] ?? '';
        inp.placeholder = c.etiqueta || '';
        inp.title = c.etiqueta || '';
        inp.dataset.idx = i;
        inp.style.cssText = 'width:100%;height:100%;font-size:clamp(10px,1.6vw,14px);font-weight:700;color:#0f172a;background:rgba(56,189,248,.14);border:1.5px solid rgba(14,165,233,.55);border-radius:4px;padding:2px 6px;text-align:center;outline:none;transition:background .15s';
        inp.addEventListener('focus', () => { inp.style.background = 'rgba(56,189,248,.32)'; });
        inp.addEventListener('blur', () => { estado.valores[c.id] = inp.value.trim(); inp.style.background = 'rgba(56,189,248,.14)'; });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); siguienteCampo(); } });
        wrap.appendChild(inp);
        capa.appendChild(wrap);
      });
      visor.appendChild(capa);
      ajustarVisorHoja();
    };
    img.onerror = () => {
      visor.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> No se pudo cargar la imagen de la plantilla</div>';
    };
    img.src = p.imagenUrl;
  }

  function guardarHoja() {
    // Recolectar valores actuales de los inputs
    const p = estado.plantilla;
    if (!p) return;
    document.querySelectorAll('#hm-visor .hm-input').forEach(inp => {
      const c = (p.campos || [])[+inp.dataset.idx];
      if (c) estado.valores[c.id] = inp.value.trim();
    });
    const llenos = Object.values(estado.valores).filter(v => String(v).trim() !== '').length;
    if (!llenos) { showToast('Rellena al menos una medida', 'error'); return; }
    const datos = {
      sistema: 'hoja-v1',
      tipoId: estado.tipoId || null,
      tipoNombre: p.tipoPuerta,
      imagenUrl: p.imagenUrl,
      campos: p.campos,
      valores: estado.valores,
      fecha: getToday(),
      tecnico: window.authState?.employee?.nombre || window.authState?.user?.email || ''
    };
    if (estado.onGuardar) estado.onGuardar(datos);
    cerrar();
  }

  function cerrar() { const m = document.getElementById('hm-modal'); if (m) m.style.display = 'none'; }

  // ════════════════ EDITOR DE PLANTILLA ════════════════
  let estadoEdit = { def: null, tipoNombre: '', arrastrando: null, imagenBase64: null, onGuardar: null };

  async function abrirEditor(defActual, onGuardar) {
    const tipos = (window.__tiposPuertaCache || await dbGetAll('tiposPuerta').catch(() => []));
    const opciones = tipos.map(t => '<option value="' + esc(t.nombre) + '" ' + ((defActual?.tipoPuerta) === t.nombre ? 'selected' : '') + '>' + esc(t.nombre) + '</option>').join('');
    const def = defActual || null;
    const html = `
    <div id="hm-edit-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:1050px;width:100%;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.45)">
        <div class="modal-header"><h2 style="font-size:17px"><i class="fas fa-pen-to-square"></i> Editor de hoja de medidas</h2>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-outline btn-sm" id="hme-btn-fs" title="Pantalla completa"><i class="fas fa-expand"></i></button>
            <button type="button" class="btn-close-x" onclick="document.getElementById('hm-edit-modal').remove()">✕</button>
          </div></div>
        <div style="display:grid;grid-template-columns:360px 1fr;overflow:hidden;flex:1;min-height:0">
          <div style="padding:16px;border-right:1px solid var(--border);overflow:auto;display:flex;flex-direction:column;gap:10px" id="hme-panel">
            <label style="font-size:12px;color:var(--text-muted)">Tipo de puerta (global)</label>
            <select id="hme-tipo">${opciones || '<option value="">— Sin tipos —</option>'}</select>
            <label style="font-size:12px;color:var(--text-muted)">Imagen de la plantilla (PDF/foto → PNG/JPG)</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-outline btn-sm" id="hme-btn-archivo"><i class="fas fa-file-import"></i> Subir imagen</button>
              <input type="file" id="hme-file" accept="image/*" style="display:none">
            </div>
            <small style="color:var(--text-muted)">Si es un PDF, hazle una captura o conviértelo a imagen (a mayor resolución, mejor).</small>
            <label style="font-size:12px;color:var(--text-muted);margin-top:4px">Cuadros de texto</label>
            <div id="hme-lista" style="display:flex;flex-direction:column;gap:6px"></div>
            <button type="button" class="btn btn-outline btn-sm" id="hme-add"><i class="fas fa-plus"></i> Añadir cuadro</button>
            <small id="hme-ayuda" style="color:var(--text-muted)">Arrastra cada cuadro sobre la imagen para colocarlo. Ajusta ancho y alto en la lista.</small>
            <button type="button" class="btn btn-primary" id="hme-guardar" style="margin-top:8px"><i class="fas fa-save"></i> Guardar plantilla</button>
          </div>
          <div style="overflow:auto;padding:14px">
            <div id="hme-visor" style="position:relative;width:100%;background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15)"></div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    estadoEdit = {
      def: def ? JSON.parse(JSON.stringify(def)) : null,
      tipoNombre: def?.tipoPuerta || (tipos[0]?.nombre || ''),
      arrastrando: null,
      imagenBase64: null,
      onGuardar: typeof onGuardar === 'function' ? onGuardar : null
    };
    if (!estadoEdit.def) {
      // ¿Hay plantilla guardada para este tipo?
      const existente = await cargarPlantillaDeTipo(estadoEdit.tipoNombre);
      estadoEdit.def = existente || { id: null, tipoPuerta: estadoEdit.tipoNombre, imagenUrl: '', campos: [] };
    }
    document.getElementById('hme-tipo').addEventListener('change', async e => {
      estadoEdit.tipoNombre = e.target.value;
      const existente = await cargarPlantillaDeTipo(estadoEdit.tipoNombre);
      estadoEdit.def = existente || { id: null, tipoPuerta: estadoEdit.tipoNombre, imagenUrl: '', campos: [] };
      estadoEdit.imagenBase64 = null;
      pintarEditor();
    });
    document.getElementById('hme-btn-archivo').addEventListener('click', () => document.getElementById('hme-file').click());
    document.getElementById('hme-file').addEventListener('change', e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { estadoEdit.imagenBase64 = r.result; pintarEditor(); };
      r.readAsDataURL(f);
    });
    document.getElementById('hme-add').addEventListener('click', () => {
      estadoEdit.def.campos.push({ id: 'c' + Date.now() + Math.floor(Math.random() * 99), etiqueta: 'Medida ' + (estadoEdit.def.campos.length + 1), x: 50, y: 50, w: 14, h: 6 });
      pintarLista(); pintarEditor();
    });
    document.getElementById('hme-guardar').addEventListener('click', guardarEditor);
    document.getElementById('hme-btn-fs').addEventListener('click', () => {
      const m = document.getElementById('hm-edit-modal');
      m.classList.toggle('hm-fs');
      document.getElementById('hme-btn-fs').innerHTML = m.classList.contains('hm-fs')
        ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
      ajustarVisorEdit();
    });
    pintarEditor();
  }

  // Pantalla completa del editor: imagen ocupa todo el alto disponible
  function ajustarVisorEdit() {
    const modal = document.getElementById('hm-edit-modal');
    const visor = document.getElementById('hme-visor');
    if (!modal || !visor) return;
    const fs = modal.classList.contains('hm-fs');
    if (fs) {
      const disp = window.innerHeight - 120;
      visor.style.maxWidth = 'none';
      visor.style.maxHeight = disp + 'px';
      visor.style.height = disp + 'px';
      visor.style.width = 'auto';
      visor.style.aspectRatio = '';
      visor.style.margin = '0 auto';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'height:100%;width:auto;display:block;border-radius:10px;max-width:none';
    } else {
      visor.style.maxHeight = ''; visor.style.height = ''; visor.style.width = '100%';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
    }
  }

  function pintarLista() {
    const cont = document.getElementById('hme-lista');
    if (!cont) return;
    cont.innerHTML = estadoEdit.def.campos.map((c, i) => `
      <div style="display:flex;gap:4px;align-items:center">
        <input type="text" value="${esc(c.etiqueta)}" data-i="${i}" data-f="etiqueta" class="hme-in" style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
        <input type="number" value="${esc(c.w || 14)}" data-i="${i}" data-f="w" class="hme-in" title="Ancho %" placeholder="Ancho" style="width:56px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
        <input type="number" value="${esc(c.h || 6)}" data-i="${i}" data-f="h" class="hme-in" title="Alto %" placeholder="Alto" style="width:52px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">
        <button type="button" class="btn btn-outline btn-sm btn-icon" onclick="HOJA_MEDIDAS._delCampoHOJA(${i})"><i class="fas fa-minus"></i></button>
      </div>`).join('') || '<small style="color:var(--text-muted)">Sin cuadros aún: añade uno</small>';
    cont.querySelectorAll('.hme-in').forEach(inp => {
      inp.addEventListener('input', () => {
        const c = estadoEdit.def.campos[+inp.dataset.i];
        if (!c) return;
        c[inp.dataset.f] = inp.dataset.f === 'etiqueta'
          ? inp.value
          : (parseFloat(inp.value) || (inp.dataset.f === 'w' ? 14 : 6));
        // SIN re-render: se actualiza el chip en vivo y el foco/teclado se conserva (móvil incluido)
        const chip = visorChipDe(inp.dataset.i);
        if (chip) {
          if (inp.dataset.f === 'w' || inp.dataset.f === 'h') {
            chip.style.width = (c.w || 14) + '%';
            chip.style.height = (c.h || 6) + '%';
          } else {
            chip.textContent = c.etiqueta || ('Cuadro ' + (+inp.dataset.i + 1));
          }
        }
      });
    });
  }

  // Devuelve el chip (cuadro sobre la imagen) del índice dado
  function visorChipDe(i) {
    const visor = document.getElementById('hme-visor');
    if (!visor) return null;
    return visor.querySelectorAll('.hme-chip')[+i] || null;
  }

  window.HOJA_MEDIDAS._delCampo = function (i) {
    estadoEdit.def.campos.splice(i, 1);
    pintarLista(); pintarEditorCampos(true);
  };
  // Parche: _delCampo debe vivir en el módulo real (se ejecutaba contra el objeto vacío inicial)
  window.HOJA_MEDIDAS._delCampoHOJA = function (i) {
    estadoEdit.def.campos.splice(i, 1);
    pintarLista(); pintarEditorCampos(true);
  };

  function pintarEditor() {
    const visor = document.getElementById('hme-visor');
    if (!visor) return;
    // En móvil: visor más pequeño para que quepa en pantalla sin cortes
    const maxAncho = 1100; // en PC visor grande; en móvil el CSS lo limita al ancho de pantalla
    const src = estadoEdit.imagenBase64 || estadoEdit.def?.imagenUrl;
    if (!src) {
      visor.innerHTML = '<div style="padding:50px;text-align:center;color:#94a3b8"><i class="fas fa-image" style="font-size:30px;display:block;margin-bottom:10px"></i>Sube la imagen de la plantilla para empezar a colocar los cuadros</div>';
      pintarLista();
      return;
    }
    visor.innerHTML = '';
    const img = new Image();
    img.onload = () => {
      visor.style.aspectRatio = img.width + ' / ' + img.height;
      visor.style.maxWidth = Math.min(maxAncho, img.width * 1.6) + 'px'; // visor grande en el editor (limitado en móvil)
      visor.style.margin = '0 auto';
      visor.style.padding = '0'; // sin padding: el % de los cuadros es sobre la imagen exacta
      visor.style.boxSizing = 'content-box';
      img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px;pointer-events:none';
      visor.appendChild(img);
      pintarEditorCampos();
      ajustarVisorEdit();
    };
    img.src = src;
  }

  function pintarEditorCampos(sinLista) {
    const visor = document.getElementById('hme-visor');
    if (!visor) return;
    visor.querySelectorAll('.hme-chip').forEach(el => el.remove());
    const src = estadoEdit.imagenBase64 || estadoEdit.def?.imagenUrl;
    if (!src) { pintarLista(); return; }
    if (!visor.querySelector('img')) { pintarLista(); return; }
    estadoEdit.def.campos.forEach((c, i) => {
      const chip = document.createElement('div');
      chip.className = 'hme-chip';
      chip.style.cssText = 'position:absolute;left:' + c.x + '%;top:' + c.y + '%;width:' + (c.w || 14) + '%;height:' + (c.h || 6) + '%;background:rgba(56,189,248,.25);border:1.5px dashed #0284c7;border-radius:4px;padding:2px 4px;font-size:11px;font-weight:700;color:#0c4a6e;cursor:grab;user-select:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      chip.textContent = c.etiqueta || ('Cuadro ' + (i + 1));
      chip.addEventListener('pointerdown', e => {
        e.preventDefault();
        chip.setPointerCapture(e.pointerId);
        // Guardar el offset del punto agarrado DENTRO del cuadro: el cuadro no "salta"
        const r = visor.querySelector('img').getBoundingClientRect();
        estadoEdit.arrastrando = {
          i, chip,
          dxPct: ((e.clientX - r.left) / r.width * 100) - (c.x || 0),
          dyPct: ((e.clientY - r.top) / r.height * 100) - (c.y || 0)
        };
      });
      chip.addEventListener('pointermove', e => {
        if (!estadoEdit.arrastrando || estadoEdit.arrastrando.chip !== chip) return;
        const c2 = estadoEdit.def.campos[i];
        const r = visor.querySelector('img').getBoundingClientRect(); // % sobre la IMAGEN, no sobre el contenedor
        const nx = Math.max(0, Math.min(100 - (c2.w || 14), ((e.clientX - r.left) / r.width * 100) - estadoEdit.arrastrando.dxPct));
        const ny = Math.max(0, Math.min(100 - (c2.h || 6), ((e.clientY - r.top) / r.height * 100) - estadoEdit.arrastrando.dyPct));
        estadoEdit.def.campos[i].x = Math.round(nx * 10) / 10;
        estadoEdit.def.campos[i].y = Math.round(ny * 10) / 10;
        chip.style.left = estadoEdit.def.campos[i].x + '%';
        chip.style.top = estadoEdit.def.campos[i].y + '%';
      });
      chip.addEventListener('pointerup', () => {
        estadoEdit.arrastrando = null;
        pintarLista(); // sincroniza por si acaso
      });
      // Ajuste fino con flechas cuando el chip tiene el foco
      chip.tabIndex = 0;
      chip.addEventListener('keydown', e => {
        const paso = e.shiftKey ? 1 : 0.2; // Shift = paso grande
        const c2 = estadoEdit.def.campos[i];
        if (!c2) return;
        let usado = true;
        if (e.key === 'ArrowLeft') c2.x = Math.max(0, c2.x - paso);
        else if (e.key === 'ArrowRight') c2.x = Math.min(100 - (c2.w || 14), c2.x + paso);
        else if (e.key === 'ArrowUp') c2.y = Math.max(0, c2.y - paso);
        else if (e.key === 'ArrowDown') c2.y = Math.min(100 - (c2.h || 6), c2.y + paso);
        else usado = false;
        if (usado) {
          e.preventDefault();
          chip.style.left = c2.x + '%';
          chip.style.top = c2.y + '%';
        }
      });
      // Botones de flecha (ajuste fino con ratón / táctil)
      ['up','down','left','right'].forEach(dir => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hme-nudge';
        b.innerHTML = {up:'&#9650;', down:'&#9660;', left:'&#9664;', right:'&#9654;'}[dir];
        b.title = 'Mover ' + dir;
        b.style.cssText = 'position:absolute;width:16px;height:16px;line-height:14px;font-size:9px;padding:0;border:1px solid #0284c7;background:#e0f2fe;color:#0c4a6e;border-radius:3px;cursor:pointer;z-index:5;' +
          (dir==='up' ? 'top:-9px;left:calc(50% - 8px);' : dir==='down' ? 'bottom:-9px;left:calc(50% - 8px);' : dir==='left' ? 'left:-9px;top:calc(50% - 8px);' : 'right:-9px;top:calc(50% - 8px);');
        b.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); });
        b.addEventListener('click', ev => {
          ev.preventDefault(); ev.stopPropagation();
          const c2 = estadoEdit.def.campos[i]; if (!c2) return;
          const paso = 0.2;
          if (dir==='left') c2.x = Math.max(0, c2.x - paso);
          else if (dir==='right') c2.x = Math.min(100 - (c2.w||14), c2.x + paso);
          else if (dir==='up') c2.y = Math.max(0, c2.y - paso);
          else c2.y = Math.min(100 - (c2.h||6), c2.y + paso);
          chip.style.left = c2.x + '%'; chip.style.top = c2.y + '%';
        });
        chip.appendChild(b);
      });
      visor.appendChild(chip);
    });
    if (!sinLista) pintarLista();
  }

  async function guardarEditor() {
    const def = estadoEdit.def;
    def.tipoPuerta = estadoEdit.tipoNombre;
    if (estadoEdit.imagenBase64) {
      const url = await subirImagenHoja(estadoEdit.imagenBase64);
      if (url) def.imagenUrl = url;
      else def.imagenUrl = estadoEdit.imagenBase64; // respaldo base64 si no hay red
    }
    if (!def.imagenUrl) { showToast('Sube primero la imagen de la plantilla', 'error'); return; }
    if (!(def.campos || []).length) { showToast('Añade al menos un cuadro de texto', 'error'); return; }
    const btn = document.getElementById('hme-guardar');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      def.id = await guardarDefPlantilla(def);
      showToast('✅ Plantilla guardada para "' + def.tipoPuerta + '"', 'success');
      document.getElementById('hm-edit-modal')?.remove();
      if (estadoEdit.onGuardar) estadoEdit.onGuardar(def);
    } catch (e) {
      console.error('[HojaMedidas] guardar plantilla:', e);
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar plantilla';
    }
  }

  // ════════════════ VISTA DE ADMINISTRACIÓN (solo lectura) ════════════════
  function abrirVista(medidas) {
    if (!medidas || medidas.sistema !== 'hoja-v1') { showToast('Este presupuesto no tiene hoja de medidas adjunta', 'info'); return; }
    const html = `
    <div id="hm-view-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:14px">
      <div style="background:var(--surface);border-radius:16px;max-width:980px;width:100%;max-height:96vh;display:flex;flex-direction:column">
        <div class="modal-header"><h2 style="font-size:17px"><i class="fas fa-ruler-combined"></i> Hoja de medidas — ${esc(medidas.tipoNombre || '')}</h2>
          <button type="button" class="btn-close-x" onclick="document.getElementById('hm-view-modal').remove()">✕</button></div>
        <div style="overflow:auto;padding:14px">
          <div id="hm-view-visor" style="position:relative;width:100%;max-width:860px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15)"></div>
          <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Tomada el ${esc(medidas.fecha || '')} por ${esc(medidas.tecnico || '—')}</div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const visor = document.getElementById('hm-view-visor');
    const img = new Image();
    img.onload = () => {
      visor.style.aspectRatio = img.width + ' / ' + img.height;
      visor.style.maxWidth = Math.min(860, img.width) + 'px';
      visor.style.margin = '0 auto';
      visor.style.padding = '0';
      visor.style.boxSizing = 'content-box';
      img.style.cssText = 'width:100%;height:100%;display:block;border-radius:10px';
      visor.appendChild(img);
      const capa = document.createElement('div');
      capa.style.cssText = 'position:absolute;inset:0';
      (medidas.campos || []).forEach(c => {
        const v = String(medidas.valores?.[c.id] ?? '').trim();
        if (!v) return;
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;left:' + c.x + '%;top:' + c.y + '%;width:' + (c.w || 14) + '%;height:' + (c.h || 6) + '%;font-size:clamp(10px,1.6vw,14px);font-weight:800;color:#0f172a;text-align:center;display:flex;align-items:center;justify-content:center;text-shadow:0 0 3px #fff,0 0 3px #fff;box-sizing:border-box';
        div.textContent = v;
        capa.appendChild(div);
      });
      visor.appendChild(capa);
    };
    img.onerror = () => {
      visor.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444"><i class="fas fa-triangle-exclamation"></i> No se pudo cargar la imagen de la hoja de medidas</div>';
    };
    img.src = medidas.imagenUrl || '';
  }

  // ── API pública ──
  Object.assign(window.HOJA_MEDIDAS, {
    abrirHoja, abrirEditor, abrirVista, cerrar,
    cargarPlantillaDeTipo, PLANTILLAS_INCLUIDAS
  });
  return window.HOJA_MEDIDAS;
})();
