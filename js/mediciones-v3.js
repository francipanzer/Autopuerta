/* =========================================================
 * mediciones-v3.js — Sistema unificado de toma de medidas
 * =========================================================
 * Rediseño total: un solo módulo para plantillas + mediciones.
 *
 * Ideas clave:
 *  · UNA sola pantalla, dos modos:
 *      - PC: formulario de campos a la izquierda + imagen de la
 *        plantilla a la derecha con los INPUTS directamente
 *        superpuestos (se escribe sobre la imagen, como en papel).
 *      - Móvil: la imagen SIEMPRE a pantalla completa; los campos
 *        son chips táctiles grandes sobre la imagen. Al tocar un
 *        chip se abre un PANEL NUMÉRICO FIJO abajo (no flotante)
 *        con teclado grande y botones Anterior/Siguiente. Los
 *        botones "Siguiente medida" y "Guardar" quedan siempre
 *        visibles en la parte inferior.
 *  · Plantillas: las .png de la carpeta plantillas/ (con sus
 *    campos posicionados) + las que el admin cree (Supabase).
 *  · Guardado: Supabase con respaldo local si falla la red.
 *  · PDF: imagen rellena + tabla de valores.
 *
 * Expone: window.MEDICIONES.abrir(opts), .cerrar(), .registro()
 * ========================================================= */
'use strict';

window.MEDICIONES = (function () {
  const T_PLANTILLAS = 'plantillas_medidas';
  const T_MEDICIONES = 'mediciones_medidas';
  const BUCKET = 'medidas-fotos';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => new Date().toISOString().slice(0, 10);
  const esMovil = () => window.matchMedia('(max-width: 820px)').matches || 'ontouchstart' in window && window.innerWidth < 900;

  let opts_ = null; // valores previos pasados al abrir (para editar una medición existente)

  let estado = {
    plantilla: null,      // plantilla activa {nombre, imagenUrl, campos[]}
    valores: {},          // {campoId: valor}
    idx: 0,               // índice del campo activo (orden de la lista)
    fotos: [],
    onGuardar: null,
    clientes: [],
    clienteId: '',
    abierto: false
  };

  function supa() {
    const db = window.supabaseDB || window.sb;
    if (db && typeof db.from === 'function') return db;
    throw new Error('Supabase no disponible');
  }

  /* ─────────── PLANTILLAS ─────────── */
  let cachePlantillas = null;

  async function listarPlantillas(forzar) {
    if (cachePlantillas && !forzar) return cachePlantillas;
    if (window.PLANTILLAS_MEDIDAS_V2?.listarPlantillas) {
      const catalogo = await window.PLANTILLAS_MEDIDAS_V2.listarPlantillas(forzar);
      const incluidas = window.HOJA_MEDIDAS?.PLANTILLAS_INCLUIDAS || {};
      cachePlantillas = catalogo.map(t => {
        const incluida = Object.entries(incluidas).find(([nombre]) => nombre === t.tipoPuerta || nombre === t.nombre)?.[1];
        return {
          id: String(t.id), nombre: t.nombre || t.tipoPuerta || 'Plantilla', tipoPuerta: t.tipoPuerta || '',
          imagenUrl: t.imagenUrl || incluida?.imagenUrl || '', svg: t.svg || '', svgFn: t.svgFn || null,
          campos: (t.campos || []).map(c => {
            const pos = incluida?.campos?.find(x => x.id === c.id);
            return { ...c, x: c.x ?? pos?.x, y: c.y ?? pos?.y, w: c.w ?? pos?.w, h: c.h ?? pos?.h };
          }), origen: t.esBasica ? 'local' : 'remota'
        };
      });
      return cachePlantillas;
    }
    // 1) Plantillas de la carpeta plantillas/ (PNG con campos posicionados)
    const deCarpeta = Object.entries(window.HOJA_MEDIDAS?.PLANTILLAS_INCLUIDAS || {}).map(([k, p]) => ({
      id: 'local_' + k, nombre: k, imagenUrl: p.imagenUrl,
      campos: (p.campos || []).map(c => ({ id: c.id, etiqueta: c.etiqueta, x: c.x, y: c.y, w: c.w, h: c.h })),
      origen: 'local'
    }));
    // 2) Plantillas del servidor (las que el admin añade, con imagen subida)
    let remotas = [];
    try {
      const { data, error } = await supa().from(T_PLANTILLAS).select('*').order('createdat', { ascending: false });
      if (!error && Array.isArray(data)) {
        remotas = data.filter(r => r.imagenurl).map(r => ({
          id: String(r.id), nombre: r.nombre || r.tipopuerta || 'Plantilla',
          imagenUrl: r.imagenurl,
          campos: (r.campos || []).map(c => ({ id: c.id, etiqueta: c.etiqueta, x: c.x, y: c.y, w: c.w, h: c.h })),
          origen: 'remota'
        }));
      }
    } catch (e) { console.warn('[Mediciones] sin conexión, solo locales:', e.message || e); }
    cachePlantillas = [...deCarpeta, ...remotas];
    return cachePlantillas;
  }

  /* ─────────── UI: MODAL ÚNICO ─────────── */
  function asegurarModal() {
    if (document.getElementById('med-modal')) return;
    const html = `
    <div id="med-modal" class="med-modal" data-vista="medidas" style="position:fixed;inset:0;background:rgba(10,15,25,.82);z-index:10000;display:none;flex-direction:column;">
      <!-- Barra superior -->
      <div class="med-header" style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap">
        <strong style="font-size:16px;display:flex;align-items:center;gap:8px"><i class="fas fa-ruler-combined" style="color:var(--primary)"></i> <span id="med-titulo">Tomar medidas</span></strong>
        <div style="flex:1;min-width:160px;display:flex;gap:8px;align-items:center">
          <select id="med-sel" style="flex:1;max-width:320px"></select>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" id="med-btn-foto" class="btn btn-outline btn-sm" title="Foto de la obra"><i class="fas fa-camera"></i></button>
          <input type="file" id="med-foto-input" accept="image/*" capture="environment" style="display:none">
          <button type="button" id="med-btn-editar" class="btn btn-outline btn-sm" title="Editar plantilla" aria-label="Editar plantilla"><i class="fas fa-pen-to-square"></i></button>
          <button type="button" id="med-btn-cerrar" class="btn-close-x" title="Cerrar">✕</button>
        </div>
      </div>
      <div id="med-mobile-tabs" class="med-mobile-tabs" role="tablist" aria-label="Vista de mediciones">
        <button type="button" class="active" data-med-vista="medidas" role="tab" aria-selected="true"><i class="fas fa-list-ol"></i> Medidas</button>
        <button type="button" data-med-vista="esquema" role="tab" aria-selected="false"><i class="fas fa-image"></i> Esquema</button>
      </div>
      <!-- Cuerpo -->
      <div id="med-cuerpo" style="flex:1;display:flex;overflow:hidden;min-height:0">
        <!-- Panel izquierdo (PC): lista de campos -->
        <div id="med-panel" style="width:340px;padding:14px;overflow:auto;border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;gap:10px">
          <div id="med-meta" style="display:flex;flex-direction:column;gap:8px">
            <label style="font-size:12px;color:var(--text-muted)">Cliente</label>
            <select id="med-cliente"></select>
            <label style="font-size:12px;color:var(--text-muted)">Notas</label>
            <textarea id="med-notas" rows="2" placeholder="Observaciones…"></textarea>
          </div>
          <div id="med-campos" style="display:flex;flex-direction:column;gap:8px;border-top:1px dashed var(--border);padding-top:10px"></div>
        </div>
        <!-- Visor: imagen con inputs superpuestos -->
        <div id="med-visor-wrap" style="flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:12px;position:relative">
          <div id="med-visor" style="position:relative;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);width:100%;max-width:920px"></div>
        </div>
      </div>
      <!-- Pie fijo: SIEMPRE visible con Siguiente y Guardar -->
      <div id="med-pie" style="display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:10px 16px;background:var(--surface);border-top:1px solid var(--border);flex-wrap:wrap">
        <span id="med-progreso" style="color:var(--text-muted);font-size:13px;margin-right:auto"></span>
        <button type="button" id="med-btn-prev" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Anterior</button>
        <button type="button" id="med-btn-next" class="btn btn-secondary" title="Siguiente medida"><i class="fas fa-forward"></i> Siguiente</button>
        <button type="button" id="med-btn-guardar" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Guardar</button>
      </div>
      <!-- Thumbs de fotos -->
      <div id="med-fotos-thumbs" style="position:fixed;bottom:70px;left:12px;display:flex;gap:6px;z-index:10002"></div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('med-btn-cerrar').addEventListener('click', cerrar);
    document.getElementById('med-btn-editar').addEventListener('click', editarPlantillaActual);
    document.querySelectorAll('#med-mobile-tabs [data-med-vista]').forEach(btn => {
      btn.addEventListener('click', () => setVista(btn.dataset.medVista));
    });
    document.getElementById('med-sel').addEventListener('change', e => cargarPlantilla(e.target.value));
    document.getElementById('med-btn-foto').addEventListener('click', () => document.getElementById('med-foto-input').click());
    document.getElementById('med-foto-input').addEventListener('change', async e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      try {
        const dataUrl = window.compressDoticsPhoto ? await window.compressDoticsPhoto(f) : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        estado.fotos.push(dataUrl);
        pintarThumbs();
      } catch (err) { showToast('No se pudo procesar la foto', 'error'); }
    });
    document.getElementById('med-btn-prev').addEventListener('click', () => mover(-1));
    document.getElementById('med-btn-next').addEventListener('click', () => mover(1));
    document.getElementById('med-btn-guardar').addEventListener('click', guardar);
  }

  function pintarThumbs() {
    const cont = document.getElementById('med-fotos-thumbs');
    if (!cont) return;
    cont.innerHTML = estado.fotos.map((f, i) => `
      <div style="position:relative;width:56px;height:56px;border-radius:10px;overflow:hidden;border:2px solid var(--primary)">
        <img src="${esc(f)}" style="width:100%;height:100%;object-fit:cover">
        <button type="button" onclick="MEDICIONES._quitarFoto(${i})" style="position:absolute;top:1px;right:1px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:none;font-size:11px;cursor:pointer">×</button>
      </div>`).join('');
  }
  window.MEDICIONES_quitarFoto = i => { estado.fotos.splice(i, 1); pintarThumbs(); };

  /* ─────────── RENDER DE CAMPOS ─────────── */
  function campoActual() {
    const campos = estado.plantilla?.campos || [];
    return campos[estado.idx] || null;
  }

  function pintarCamposPanel() {
    const cont = document.getElementById('med-campos');
    if (!cont) return;
    cont.innerHTML = (estado.plantilla?.campos || []).map((c, i) => `
      <div class="med-campo-fila ${i === estado.idx ? 'med-campo-activo' : ''}" data-idx="${i}">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:2px">${esc(c.etiqueta)}</label>
        <input type="text" inputmode="decimal" class="med-campo" data-idx="${i}" value="${esc(estado.valores[c.id] ?? '')}" placeholder="—" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;font-weight:600">
      </div>`).join('');
    cont.querySelectorAll('.med-campo').forEach(inp => {
      inp.addEventListener('focus', () => { estado.idx = +inp.dataset.idx; marcarActivo(); });
      inp.addEventListener('input', () => {
        const c = estado.plantilla.campos[+inp.dataset.idx];
        estado.valores[c.id] = inp.value;
        syncChip(c.id);
        if (!estado.plantilla.imagenUrl) pintarVisor();
        actualizarProgreso();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mover(1); } });
    });
    marcarActivo();
  }

  function marcarActivo() {
    document.querySelectorAll('#med-campos .med-campo-fila').forEach(f => {
      f.classList.toggle('med-campo-activo', +f.dataset.idx === estado.idx);
    });
  }

  function pintarVisor() {
    const visor = document.getElementById('med-visor');
    const p = estado.plantilla;
    if (!visor || !p) return;
    visor.innerHTML = '';
    if (!p.imagenUrl) {
      const dibujar = window.PLANTILLAS_MEDIDAS_V2?.dibujarPlantilla;
      visor.innerHTML = typeof p.svgFn === 'function' ? p.svgFn(estado.valores) : p.svg || (dibujar ? dibujar(p, estado.valores) : dibujoGenerico(p));
      actualizarProgreso();
      return;
    }
    const img = new Image();
    img.onload = () => {
      // Modo imagen: los INPUTS van directamente sobre la imagen (como en papel)
      if (p.imagenUrl) {
        visor.style.aspectRatio = img.width + ' / ' + img.height;
        visor.style.maxWidth = 'min(100%, 920px)';
        img.style.cssText = 'width:100%;height:100%;display:block;border-radius:12px';
        visor.appendChild(img);
        const capa = document.createElement('div');
        capa.style.cssText = 'position:absolute;inset:0';
        (p.campos || []).forEach((c, i) => {
          const wrapC = document.createElement('div');
          wrapC.className = 'med-chip' + (i === estado.idx ? ' med-chip-activo' : '');
          wrapC.style.cssText = `position:absolute;left:${c.x ?? 70}%;top:${c.y ?? 10}%;width:${c.w ?? 16}%;height:${c.h ?? 6}%;box-sizing:border-box`;
          const inp = document.createElement('input');
          inp.className = 'med-chip-in';
          inp.value = estado.valores[c.id] ?? '';
          inp.placeholder = c.etiqueta || '';
          inp.title = c.etiqueta || '';
          inp.style.cssText = 'width:100%;height:100%;font-size:clamp(11px,1.8vw,15px);font-weight:700;color:#0f172a;background:rgba(56,189,248,.16);border:1.5px solid rgba(14,165,233,.6);border-radius:5px;padding:2px 6px;text-align:center;outline:none;transition:background .15s';
          inp.addEventListener('focus', () => { estado.idx = i; marcarActivo(); inp.style.background = 'rgba(56,189,248,.38)'; });
          inp.addEventListener('pointerdown', e => {
            if (!esMovil()) return;
            e.preventDefault();
            estado.idx = i;
            setVista('medidas');
            requestAnimationFrame(() => document.querySelector(`#med-campos .med-campo[data-idx="${i}"]`)?.focus());
          });
          inp.addEventListener('blur', () => { estado.valores[c.id] = inp.value.trim(); inp.style.background = 'rgba(56,189,248,.16)'; actualizarProgreso(); });
          inp.addEventListener('input', () => { estado.valores[c.id] = inp.value; syncPanel(c.id); actualizarProgreso(); });
          inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); inp.blur(); mover(1); }
          });
          wrapC.appendChild(inp);
          capa.appendChild(wrapC);
        });
        visor.appendChild(capa);
      }
      actualizarProgreso();
      // En móvil: imagen SIEMPRE a pantalla completa dentro del visor
      if (esMovil()) ajustarVisorMovil();
    };
    img.onerror = () => { visor.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">No se pudo cargar la imagen de la plantilla</div>'; };
    img.src = p.imagenUrl || '';
  }

  function dibujoGenerico(p) {
    const nums = (p.campos || []).filter(c => !isNaN(parseFloat(estado.valores[c.id])));
    const ancho = parseFloat(estado.valores[nums[0]?.id]) || 2000;
    const alto = parseFloat(estado.valores[nums[1]?.id]) || 2000;
    return `<svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border-radius:12px">
      <rect x="40" y="30" width="220" height="160" fill="#f8fafc" stroke="#1e3a5f" stroke-width="3"/>
      <line x1="40" y1="205" x2="260" y2="205" stroke="#e11d48" stroke-width="1.8"/>
      <line x1="285" y1="30" x2="285" y2="190" stroke="#e11d48" stroke-width="1.8"/>
      <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">${ancho} × ${alto}</text>
    </svg>`;
  }

  function syncChip(cid) {
    const chips = document.querySelectorAll('#med-visor .med-chip-in');
    const idx = estado.plantilla.campos.findIndex(c => c.id === cid);
    if (chips[idx]) chips[idx].value = estado.valores[cid] ?? '';
  }
  function syncPanel(cid) {
    const idx = estado.plantilla.campos.findIndex(c => c.id === cid);
    const inp = document.querySelector(`#med-campos .med-campo[data-idx="${idx}"]`);
    if (inp) inp.value = estado.valores[cid] ?? '';
  }

  function actualizarProgreso() {
    const el = document.getElementById('med-progreso');
    if (!el) return;
    const campos = estado.plantilla?.campos || [];
    const llenos = campos.filter(c => String(estado.valores[c.id] ?? '').trim() !== '').length;
    el.textContent = campos.length ? `${llenos}/${campos.length} medidas · campo ${estado.idx + 1} de ${campos.length}` : '';
  }

  function mover(dir) {
    const campos = estado.plantilla?.campos || [];
    if (!campos.length) return;
    estado.idx = Math.max(0, Math.min(campos.length - 1, estado.idx + dir));
    marcarActivo();
    actualizarProgreso();
    if (esMovil()) setVista('medidas');
    const input = document.querySelector(`#med-campos .med-campo[data-idx="${estado.idx}"]`);
    input?.focus();
    input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function setVista(vista) {
    const modal = document.getElementById('med-modal');
    if (!modal) return;
    modal.dataset.vista = vista === 'esquema' ? 'esquema' : 'medidas';
    document.querySelectorAll('#med-mobile-tabs [data-med-vista]').forEach(btn => {
      const activo = btn.dataset.medVista === modal.dataset.vista;
      btn.classList.toggle('active', activo);
      btn.setAttribute('aria-selected', String(activo));
    });
    if (modal.dataset.vista === 'esquema') ajustarVisorMovil();
  }

  /* ─────────── VISOR RESPONSIVE ─────────── */
  function ajustarVisorMovil() {
    const visor = document.getElementById('med-visor');
    const panel = document.getElementById('med-panel');
    if (!visor || !panel) return;
    if (esMovil()) {
      panel.style.display = '';
      visor.style.maxHeight = '';
      visor.style.height = '';
      visor.style.width = '100%';
      visor.style.maxWidth = '100%';
      visor.style.aspectRatio = '';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'width:100%;height:auto;display:block;border-radius:12px;max-width:100%';
    } else {
      panel.style.display = '';
      visor.style.maxHeight = ''; visor.style.height = ''; visor.style.width = '100%'; visor.style.maxWidth = 'min(100%,920px)';
      visor.style.aspectRatio = '';
      const img = visor.querySelector('img');
      if (img) img.style.cssText = 'width:100%;height:100%;display:block;border-radius:12px';
    }
  }

  /* ─────────── FLUJO ─────────── */
  async function abrir(opts) {
    opts = opts || {};
    opts_ = opts.valoresPrevios || {};
    asegurarModal();
    estado = { plantilla: null, valores: {}, idx: 0, fotos: [], onGuardar: opts.onGuardar || null, clientes: opts.clientes || [], clienteId: opts.clienteId || '', abierto: true };
    const plantillas = await listarPlantillas(true);
    const sel = document.getElementById('med-sel');
    sel.innerHTML = '<option value="">— Elegir plantilla —</option>' +
      plantillas.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('');
    const selCli = document.getElementById('med-cliente');
    selCli.innerHTML = '<option value="">— Sin cliente —</option>' +
      estado.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    if (opts.clienteId) selCli.value = opts.clienteId;
    document.getElementById('med-notas').value = '';
    pintarThumbs();
    const buscar = String(opts.plantillaId || '').toLowerCase();
    const plantillaInicial = plantillas.find(p => String(p.id) === String(opts.plantillaId))
      || plantillas.find(p => String(p.tipoPuerta).toLowerCase() === buscar)
      || plantillas.find(p => String(p.nombre).toLowerCase() === buscar);
    if (plantillaInicial) {
      sel.value = plantillaInicial.id;
      await cargarPlantilla(sel.value);
    }
    document.getElementById('med-modal').style.display = 'flex';
    document.getElementById('med-btn-editar').style.display = window.isTechnician?.() ? 'none' : '';
    setVista('medidas');
    ajustarViewportModal();
    ajustarVisorMovil();
  }

  async function cargarPlantilla(id) {
    const list = await listarPlantillas();
    // Acepta id exacto ('local_X' / UUID) o nombre de tipo de puerta ('Puerta Rápida de Lona')
    const p = list.find(x => String(x.id) === String(id))
      || list.find(x => String(x.nombre) === String(id))
      || list.find(x => String(x.nombre).toLowerCase() === String(id).toLowerCase())
      || list.find(x => String(x.tipoPuerta).toLowerCase() === String(id).toLowerCase());
    estado.plantilla = p || null;
    estado.valores = { ...(opts_||{}) };
    estado.idx = 0;
    if (!p) {
      document.getElementById('med-btn-editar').disabled = true;
      document.getElementById('med-campos').innerHTML = '';
      document.getElementById('med-visor').innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">Elige una plantilla arriba para empezar</div>';
      return;
    }
    document.getElementById('med-btn-editar').disabled = false;
    document.getElementById('med-titulo').textContent = 'Tomar medidas — ' + p.nombre;
    pintarCamposPanel();
    pintarVisor();
    if (esMovil()) setTimeout(ajustarVisorMovil, 100);
  }

  function editarPlantillaActual() {
    const p = estado.plantilla;
    if (!p) { showToast('Elige una plantilla para editarla', 'error'); return; }
    if (!window.HOJA_MEDIDAS?.abrirEditor) { showToast('El editor de plantillas no está disponible', 'error'); return; }
    const def = {
      id: p.origen === 'remota' ? p.id : null,
      tipoPuerta: p.tipoPuerta || p.nombre,
      imagenUrl: p.imagenUrl || '',
      campos: (p.campos || []).map(c => ({ ...c, x: Number(c.x ?? 50), y: Number(c.y ?? 50), w: Number(c.w ?? 14), h: Number(c.h ?? 6) }))
    };
    window.HOJA_MEDIDAS.abrirEditor(def, async actualizada => {
      cachePlantillas = null;
      const lista = await listarPlantillas(true);
      const guardada = lista.find(x => String(x.id) === String(actualizada.id))
        || lista.find(x => String(x.tipoPuerta) === String(actualizada.tipoPuerta));
      if (!guardada) return;
      estado.plantilla = guardada;
      estado.idx = Math.min(estado.idx, Math.max(guardada.campos.length - 1, 0));
      const sel = document.getElementById('med-sel');
      sel.innerHTML = '<option value="">— Elegir plantilla —</option>' +
        lista.map(t => `<option value="${esc(t.id)}">${esc(t.nombre)}</option>`).join('');
      sel.value = guardada.id;
      pintarCamposPanel();
      pintarVisor();
    });
  }

  async function guardar() {
    const p = estado.plantilla;
    if (!p) { showToast('Elige una plantilla', 'error'); return; }
    const vacios = (p.campos || []).filter(c => String(estado.valores[c.id] ?? '').trim() === '');
    if (vacios.length) {
      showToast('Faltan ' + vacios.length + ' medida(s): ' + vacios.slice(0, 2).map(c => c.etiqueta).join(', ') + (vacios.length > 2 ? '…' : ''), 'error');
      return;
    }
    const btn = document.getElementById('med-btn-guardar');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      const fotos = [];
      for (const f of estado.fotos) {
        if (f.startsWith('data:image/')) fotos.push(await subirFoto(f) || f);
        else fotos.push(f);
      }
      const selCli = document.getElementById('med-cliente');
      const fila = {
        plantillaid: p.origen === 'remota' ? p.id : null,
        plantillanombre: p.nombre,
        clienteid: selCli?.value || null, clientenombre: selCli?.selectedOptions[0]?.textContent || '',
        tecnicoid: window.authState?.employee?.id || null,
        tecniconombre: window.authState?.employee?.nombre || window.authState?.user?.email || '',
        fecha: hoy(), valores: estado.valores,
        notas: document.getElementById('med-notas')?.value?.trim() || '',
        fotos, estado: 'pendiente',
        createdby: window.authState?.user?.id || null
      };
      const datosHoja = {
        plantillaId: p.id, plantillaNombre: p.nombre, plantillaImagenUrl: p.imagenUrl || '',
        plantillaSvg: typeof p.svgFn === 'function' ? p.svgFn(estado.valores) : p.svg || '',
        campos: p.campos || [], valores: { ...estado.valores }, fecha: fila.fecha,
        tecnico: fila.tecniconombre, notas: fila.notas
      };
      const db = await supa();
      const { data, error } = await db.from(T_MEDICIONES).insert(fila).select().single();
      if (error) throw error;
      showToast('✅ Medición enviada a administración', 'success');
      cerrar();
      if (estado.onGuardar) estado.onGuardar({ ...datosHoja, id: data?.id || null });
      if (typeof window.refrescarMediciones === 'function') window.refrescarMediciones();
    } catch (e) {
      console.error('[Mediciones] guardar:', e);
      // Respaldo local
      try {
        const local = JSON.parse(localStorage.getItem('autopuerta_mediciones_local') || '[]');
        local.unshift({ id: 'local_' + Date.now(), plantillaNombre: p.nombre, clienteNombre: document.getElementById('med-cliente')?.selectedOptions[0]?.textContent || '', tecnicoNombre: window.authState?.employee?.nombre || '', fecha: hoy(), valores: estado.valores, notas: document.getElementById('med-notas')?.value?.trim() || '', fotos: estado.fotos, estado: 'pendiente' });
        localStorage.setItem('autopuerta_mediciones_local', JSON.stringify(local.slice(0, 100)));
        showToast('Sin conexión: guardada localmente, se enviará al recuperar señal', 'info');
        cerrar();
        if (estado.onGuardar) estado.onGuardar(datosHoja);
      } catch (_) { showToast('Error al guardar: ' + e.message, 'error'); }
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Guardar';
    }
  }

  async function subirFoto(dataUrl) {
    const userId = window.authState?.user?.id;
    if (!userId || !navigator.onLine || !window.supabaseDB) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const rand = (crypto.randomUUID || (() => Date.now() + '' + Math.random())).toString().replace(/-/g, '');
      const path = userId + '/' + rand + '.' + ext;
      const { error } = await window.supabaseDB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
      if (error) throw error;
      return window.supabaseDB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) { return null; }
  }

  function cerrar() {
    const m = document.getElementById('med-modal');
    if (m) {
      m.style.display = 'none';
      m.style.top = '';
      m.style.height = '';
      m.style.bottom = '';
    }
    estado.abierto = false;
    opts_ = null;
  }

  /* ─────────── REGISTRO (administración) ─────────── */
  async function registro() {
    let lista = [];
    try {
      const { data, error } = await supa().from(T_MEDICIONES).select('*').order('createdat', { ascending: false }).limit(200);
      if (!error) lista = (data || []).map(r => ({
        id: r.id, plantillaNombre: r.plantillanombre, clienteNombre: r.clientenombre,
        tecnicoNombre: r.tecniconombre, fecha: r.fecha, valores: r.valores || {},
        notas: r.notas || '', fotos: r.fotos || [], estado: r.estado || 'pendiente',
        plantillaId: r.plantillaid
      }));
    } catch (e) {
      try { lista = JSON.parse(localStorage.getItem('autopuerta_mediciones_local') || '[]'); } catch (_) { lista = []; }
    }
    const badge = e => e === 'pendiente' ? '<span class="badge badge-orange">Pendiente</span>' : e === 'presupuestado' ? '<span class="badge badge-green">Presupuestado</span>' : '<span class="badge badge-gray">Cancelada</span>';
    const body = lista.length
      ? lista.map(mm => `
        <div class="pmv2-reg-card">
          <div class="pmv2-reg-head">
            <div><strong>${esc(mm.plantillaNombre || 'Medición')}</strong>
            <div style="font-size:12px;color:var(--text-muted)">${esc(mm.clienteNombre || 'Sin cliente')} · ${esc(mm.fecha || '')} · ${esc(mm.tecnicoNombre || '—')}</div></div>
            ${badge(mm.estado)}
          </div>
          <div class="pmv2-reg-valores">${Object.entries(mm.valores || {}).map(([k, v]) => `<div class="pmv2-reg-val"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
          ${mm.notas ? `<div style="font-size:12px;margin-top:8px;color:var(--text-muted)"><i class="fas fa-comment-dots"></i> ${esc(mm.notas)}</div>` : ''}
          ${(mm.fotos || []).length ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${mm.fotos.map(f => `<img src="${esc(f)}" class="inc-foto" style="width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)">`).join('')}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="MEDICIONES._pdf('${esc(mm.id)}')"><i class="fas fa-file-pdf"></i> PDF</button>
            ${mm.estado === 'pendiente' ? `<button class="btn btn-primary btn-sm" onclick="MEDICIONES._marcar('${esc(mm.id)}','presupuestado')"><i class="fas fa-check"></i> Presupuestado</button>
            <button class="btn btn-outline btn-sm" onclick="MEDICIONES._marcar('${esc(mm.id)}','cancelado')"><i class="fas fa-ban"></i> Cancelar</button>` : ''}
          </div>
        </div>`).join('')
      : '<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:28px;display:block;margin-bottom:10px"></i>No hay mediciones todavía.</div>';
    openModal('📋 Mediciones', body, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
    window.refrescarMediciones = registro;
  }

  window.MEDICIONES_marcar = async function (id, est) {
    try {
      await supa().from(T_MEDICIONES).update({ estado: est, updatedat: new Date().toISOString() }).eq('id', id);
      showToast('Actualizada', 'success');
      registro();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  window.MEDICIONES_pdf = async function (id) {
    let lista = [];
    try {
      const { data } = await supa().from(T_MEDICIONES).select('*').order('createdat', { ascending: false }).limit(200);
      lista = (data || []).map(r => ({ id: r.id, plantillaNombre: r.plantillanombre, clienteNombre: r.clientenombre, tecnicoNombre: r.tecniconombre, fecha: r.fecha, valores: r.valores || {}, notas: r.notas || '', fotos: r.fotos || [], plantillaId: r.plantillaid }));
    } catch (_) { return; }
    const mm = lista.find(x => String(x.id) === String(id));
    if (!mm) return;
    const plantillas = await listarPlantillas();
    const p = plantillas.find(x => String(x.id) === String(mm.plantillaId))
           || plantillas.find(x => (x.nombre || '') === (mm.plantillaNombre || ''));
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16); doc.text('AutoPuerta Pro — Hoja de medidas', 14, 16);
    doc.setFontSize(11);
    doc.text('Cliente: ' + (mm.clienteNombre || '—'), 14, 26);
    doc.text('Plantilla: ' + (mm.plantillaNombre || '—'), 150, 26);
    doc.text('Fecha: ' + (mm.fecha || '—'), 14, 33);
    doc.text('Técnico: ' + (mm.tecnicoNombre || '—'), 150, 33);
    let imagenOK = false;
    if (p?.imagenUrl) {
      try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = p.imagenUrl; });
      const cv = document.createElement('canvas'); cv.width = 1400; cv.height = Math.round(1400 * img.height / img.width);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      // Valores superpuestos en el canvas
      ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#0f172a';
      (p?.campos || []).forEach(c => {
        const v = String(mm.valores?.[c.id] ?? '').trim();
        if (!v) return;
        ctx.fillText(v, (c.x ?? 70) / 100 * cv.width, (c.y ?? 10) / 100 * cv.height + 18);
      });
      doc.addImage(cv.toDataURL('image/png'), 'PNG', 14, 42, 180, 180 * cv.height / cv.width);
      imagenOK = true;
      } catch (e) { console.warn('PDF imagen:', e); }
    }
    if (!imagenOK) {
      // Sin imagen de plantilla: dibujar tabla de valores para que el PDF no salga vacío
      let y = 45;
      doc.setFontSize(13); doc.text('Medidas', 14, y); y += 8;
      doc.setFontSize(11);
      const entradas = Object.entries(mm.valores || {}).filter(([, v]) => String(v ?? '').trim() !== '');
      const nombreCampo = id => (p?.campos || []).find(c => c.id === id)?.etiqueta || id;
      if (!entradas.length) { doc.text('(sin valores registrados)', 14, y); y += 8; }
      else entradas.forEach(([k, v]) => {
        if (y > 190) { doc.addPage('a4', 'landscape'); y = 20; }
        doc.text(String(nombreCampo(k)) + ':', 14, y);
        doc.text(String(v), 90, y);
        y += 8;
      });
      if ((mm.notas || '').trim()) {
        if (y > 180) { doc.addPage('a4', 'landscape'); y = 20; }
        y += 4; doc.setFontSize(11); doc.text('Notas: ' + mm.notas, 14, y);
      }
    }
    doc.save('medidas_' + (mm.clienteNombre || '').replace(/\s+/g, '_') + '_' + mm.fecha + '.pdf');
  };

  function ajustarViewportModal() {
    const modal = document.getElementById('med-modal');
    if (!modal || !estado.abierto) return;
    if (esMovil()) {
      const viewport = window.visualViewport;
      modal.style.top = (viewport?.offsetTop || 0) + 'px';
      modal.style.height = (viewport?.height || window.innerHeight) + 'px';
      modal.style.bottom = 'auto';
    } else {
      modal.style.top = '';
      modal.style.height = '';
      modal.style.bottom = '';
      modal.style.inset = '0';
    }
    ajustarVisorMovil();
  }

  window.addEventListener('resize', ajustarViewportModal);
  window.visualViewport?.addEventListener('resize', ajustarViewportModal);
  window.visualViewport?.addEventListener('scroll', ajustarViewportModal);

  return {
    abrir, cerrar, registro,
    _quitarFoto: window.MEDICIONES_quitarFoto,
    _marcar: window.MEDICIONES_marcar,
    _pdf: window.MEDICIONES_pdf,
    listarPlantillas
  };
})();
