/* =========================================================
 * medidas.js — HOJAS DE MEDIDAS (módulo único)
 *
 * Sustituye a plantillas-medidas.js (v1), plantillas-medidas-v2.js,
 * mediciones-v3.js y hoja-medidas.js, que se pisaban entre sí.
 *
 * Diseño MÓVIL primero (95 % del uso):
 *   · El esquema de la plantilla se ve SIEMPRE arriba y, al elegir una
 *     medida, hace zoom solo a su casilla; el valor aparece escrito en
 *     el propio dibujo (en todas las casillas donde se repite la cota).
 *   · Abajo, un panel fijo con la medida activa, entrada numérica grande
 *     y Anterior / Siguiente (Enter también avanza).
 *   · Tira con TODAS las medidas y su valor: tocar una salta a ella.
 *   · Pellizco / arrastre / doble toque para mover el esquema.
 * PC: lista de medidas a la izquierda y el esquema grande a la derecha.
 *
 * Los tipos de puerta salen del catálogo único (js/tipos-puerta.js),
 * así que el selector es idéntico en toda la aplicación.
 *
 * API pública (compatible con el código existente):
 *   MEDICIONES.abrir(opts) · .cerrar() · .registro() · .listarPlantillas()
 *   HOJA_MEDIDAS.abrirVista(medidasPlanta) · .renderizar(m) · .abrirEditor()
 * ========================================================= */
(function () {
  'use strict';

  const T_PLANTILLAS = 'plantillas_medidas';
  const T_MEDICIONES = 'mediciones_medidas';
  const BUCKET = 'medidas-fotos';
  const esc = s => window.escapeHtml(s);
  const hoy = () => new Date().toISOString().slice(0, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  const BASE = () => window.MEDIDAS_PLANTILLAS_BASE || {};

  // CSS propio (se carga solo cuando se usa)
  (function cargarCSS() {
    if (document.getElementById('md-css')) return;
    const l = document.createElement('link');
    l.id = 'md-css'; l.rel = 'stylesheet'; l.href = window.MEDIDAS_CSS || 'css/medidas.css';
    document.head.appendChild(l);
  })();

  /* ───────────── Acceso a datos ───────────── */
  function supa() {
    const db = window.supabaseDB || window.sb;
    if (db && typeof db.from === 'function') return db;
    throw new Error('Supabase no disponible');
  }

  // Las rutas antiguas .png apuntan ahora a .webp (mucho más ligero)
  const rutaImagen = u => String(u || '').replace(/^(plantillas\/[^?#]+)\.png(\?.*)?$/i, '$1.webp');

  const textoPorEtiqueta = /observ|notas|motor|apertura|aliment|tipo de|bisagra|cierrapuertas|accesorios|sistema|pared|lama|manual/i;
  function normCampo(c, i) {
    const f = Object.assign({}, c);
    f.id = String(f.id || 'c' + (i + 1));
    f.etiqueta = f.etiqueta || f.label || ('Medida ' + (i + 1));
    f.corto = f.corto || String(f.etiqueta).split(' (')[0];
    f.tipo = f.tipo || (textoPorEtiqueta.test(f.etiqueta) ? 'texto' : 'num');
    if (f.tipo === 'num' && f.unidad === undefined) f.unidad = 'mm';
    ['x', 'y', 'w', 'h'].forEach(k => { if (f[k] !== undefined && f[k] !== null && f[k] !== '') f[k] = Number(f[k]); else delete f[k]; });
    if (f.x !== undefined && !(f.w > 0)) f.w = 14;
    if (f.x !== undefined && !(f.h > 0)) f.h = 6;
    f.espejos = Array.isArray(f.espejos) ? f.espejos : [];
    return f;
  }

  // Plantilla genérica (tipos sin hoja propia): dibujo cotado + cinco medidas
  function plantillaGenerica(item) {
    const T = esc(item.nombre.toUpperCase());
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#fff"/>' +
      '<rect x="6" y="6" width="988" height="688" rx="14" fill="none" stroke="#1e3a8a" stroke-width="4"/>' +
      '<rect x="190" y="130" width="520" height="340" fill="#eef4ff" stroke="#1e3a8a" stroke-width="5"/>' +
      '<g stroke="#c7d6f2" stroke-width="2"><path d="M190 215H710M190 300H710M190 385H710"/></g>' +
      '<g stroke="#dc2626" stroke-width="3" fill="#dc2626"><path d="M190 108H710"/><path d="M190 108l14-7v14zM710 108l-14-7v14z"/><path d="M742 130V470"/><path d="M742 130l-7 14h14zM742 470l-7-14h14z"/></g>' +
      '<g font-family="Arial,sans-serif" font-weight="700" fill="#1e3a8a" text-anchor="middle"><text x="500" y="78" font-size="26">ANCHO (A)</text><text x="500" y="52" font-size="20" fill="#475569">' + T + '</text>' +
      '<text x="880" y="298" font-size="24">ALTO</text><text x="880" y="326" font-size="24">(B)</text><text x="450" y="268" font-size="22" fill="#64748b">ALTO LIBRE (C)</text>' +
      '<text x="130" y="510" font-size="22">LAT. IZQ. (D)</text><text x="870" y="510" font-size="22">LAT. DCHO. (E)</text></g>' +
      '<text x="40" y="600" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#1e3a8a">OBSERVACIONES</text></svg>';
    const pc = (x, y, w, h) => ({ x: x / 10, y: y / 7, w: w / 10, h: h / 7 });
    return {
      uid: item.key, key: item.key, nombre: item.nombre, tipoPuerta: item.nombre, origen: 'generica', ratio: [1000, 700],
      imagen: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      campos: [
        Object.assign({ id: 'ancho', etiqueta: 'Ancho (A)', tipo: 'num', unidad: 'mm' }, pc(360, 14, 280, 44)),
        Object.assign({ id: 'alto', etiqueta: 'Alto (B)', tipo: 'num', unidad: 'mm' }, pc(790, 340, 190, 44)),
        Object.assign({ id: 'alto_libre', etiqueta: 'Alto libre de paso (C)', tipo: 'num', unidad: 'mm' }, pc(370, 330, 260, 44)),
        Object.assign({ id: 'lat_izq', etiqueta: 'Espacio lateral izquierdo (D)', corto: 'Lateral izq.', tipo: 'num', unidad: 'mm' }, pc(30, 530, 220, 44)),
        Object.assign({ id: 'lat_der', etiqueta: 'Espacio lateral derecho (E)', corto: 'Lateral dcho.', tipo: 'num', unidad: 'mm' }, pc(750, 530, 220, 44)),
        Object.assign({ id: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto', ml: true }, pc(40, 618, 920, 62))
      ].map(normCampo)
    };
  }

  function plantillaBase(item) {
    const b = BASE()[item.key];
    if (!b) return plantillaGenerica(item);
    return { uid: item.key, key: item.key, nombre: item.nombre, tipoPuerta: item.nombre, origen: 'base',
      imagen: b.imagen, ratio: b.ratio, campos: b.campos.map(normCampo) };
  }

  let cacheCat = null;
  async function cargarCatalogo(forzar) {
    if (cacheCat && !forzar) return cacheCat;
    await window.TiposPuerta.cargar();
    const items = window.TiposPuerta.lista();        // tipos de puerta (sin servicios), idénticos en toda la app
    let remotas = [];
    try {
      const { data, error } = await supa().from(T_PLANTILLAS).select('*').order('createdat', { ascending: false });
      if (!error && Array.isArray(data)) remotas = data.filter(r =>
        r.imagenurl && Array.isArray(r.campos) && r.campos.length &&
        !/^Lona Puerta R[áa]pida \(BMP\)/.test(r.nombre || '') &&
        !window.TiposPuerta.esExcluido(r.tipopuerta || r.nombre));
    } catch (e) { console.warn('[Medidas] sin conexión, uso solo las hojas incluidas'); }
    const usadas = new Set();
    const lista = items.map(item => {
      const r = remotas.find(x => { const t = window.TiposPuerta.resolver(x.tipopuerta || x.nombre); return t && t.key === item.key; });
      if (r) { usadas.add(r.id); return remota(r, item); }
      return plantillaBase(item);
    });
    // Hojas guardadas por el admin para un tipo que ya no está en el catálogo: se conservan
    remotas.filter(r => !usadas.has(r.id) && !window.TiposPuerta.resolver(r.tipopuerta || r.nombre))
      .forEach(r => lista.push(remota(r, null)));
    cacheCat = lista;
    return lista;
  }
  function remota(r, item) {
    const imagen = rutaImagen(r.imagenurl);
    const base = item && BASE()[item.key];
    const mismaImagen = !!base && imagen.split('?')[0] === rutaImagen(base.imagen).split('?')[0];
    // El editor solo mueve la casilla principal; los espejos y marcas siguen al dibujo, así que con la
    // imagen original se toman siempre de la hoja base (una copia guardada antes no arrastra posiciones viejas).
    const campos = (r.campos || []).map(c => {
      const b = mismaImagen && base.campos.find(x => x.id === c.id);
      if (!b) return c;
      const o = Object.assign({}, c);
      if (b.espejos) o.espejos = clone(b.espejos); else delete o.espejos;
      if (b.opciones) o.opciones = clone(b.opciones);
      return o;
    });
    return { uid: item ? item.key : 'r_' + r.id, key: item ? item.key : null, remoteId: r.id,
      nombre: item ? item.nombre : (r.tipopuerta || r.nombre || 'Hoja'), tipoPuerta: item ? item.nombre : (r.tipopuerta || r.nombre),
      origen: 'remota', imagen, ratio: mismaImagen ? base.ratio : null, campos: campos.map(normCampo) };
  }
  const buscarTpl = (lista, v) => {
    if (!v) return null;
    const t = window.TiposPuerta.resolver(v);
    return lista.find(p => p.uid === v) || (t && lista.find(p => p.key === t.key)) || lista.find(p => p.nombre === v) || null;
  };

  // Valores guardados con ids antiguos (a_ancho, b_alto…) se trasladan a los campos actuales
  function aplicarAlias(tpl, valores) {
    const out = {};
    const v = valores || {};
    tpl.campos.forEach(c => {
      if (v[c.id] !== undefined && v[c.id] !== '') out[c.id] = v[c.id];
      else (c.alias || []).some(a => { if (v[a] !== undefined && v[a] !== '') { out[c.id] = v[a]; return true; } return false; });
    });
    return out;
  }

  /* ───────────── Lienzo: imagen + valores escritos encima, con zoom ───────────── */
  const hayValor = v => Array.isArray(v) ? v.length > 0 : String(v == null ? '' : v).trim() !== '';

  function montarLienzo(host, tpl, getVal, ops) {
    ops = ops || {};
    host.innerHTML = '';
    host.classList.add('md-stage');
    const lienzo = el('div', 'md-lienzo');
    const img = new Image();
    img.className = 'md-img'; img.alt = 'Esquema de ' + tpl.nombre; img.draggable = false; img.decoding = 'async';
    const capa = el('div', 'md-capa');
    lienzo.append(img, capa);
    const barra = el('div', 'md-zoom');
    const esMovil = window.innerWidth < 900 || ('ontouchstart' in window && window.matchMedia('(pointer:coarse)').matches);
    barra.innerHTML = (esMovil ? '' : '<button type="button" data-z="in" aria-label="Acercar"><i class="fas fa-plus"></i></button>' +
      '<button type="button" data-z="out" aria-label="Alejar"><i class="fas fa-minus"></i></button>') +
      '<button type="button" data-z="fit" aria-label="Ver esquema completo"><i class="fas fa-expand"></i></button>' +
      (ops.seguir ? '<button type="button" data-z="seg" aria-label="Acercar automáticamente a la medida activa"><i class="fas fa-crosshairs"></i></button>' : '');
    host.append(lienzo, barra);
    // La barra de zoom se coloca junto al botón «Guardar» del pie (espacio fijo que no tapa nada).
    // En móvil el pie se compacta (CSS max-width:899px) para que quepan los botones + Guardar.
    // Si ya había una barra de una plantilla anterior, se elimina: al cambiar de tipo de puerta
    // montarLienzo vuelve a ejecutarse y sin esto se acumularían barras duplicadas en el pie.
    const btnGuardar = document.getElementById('md-guardar');
    if (btnGuardar && ops.seguir) {
      btnGuardar.parentNode.querySelectorAll(':scope > .md-zoom').forEach(b => b.remove());
      btnGuardar.parentNode.insertBefore(barra, btnGuardar);
    }
    const bSeg = barra.querySelector('[data-z="seg"]');

    let z = 1, tx = 0, ty = 0, W = 0, H = 0, bx = 0, by = 0, ratio = tpl.ratio ? tpl.ratio[0] / tpl.ratio[1] : 1.4;
    let seguir = !!ops.seguir && window.innerWidth < 900, activoId = null, listo = false;   // en móvil acerca solo; en PC se ve entero
    if (bSeg) { bSeg.classList.toggle('on', seguir); bSeg.setAttribute('aria-pressed', seguir); }
    const chips = new Map();       // id -> [elementos]

    function aplicar(anim) {
      lienzo.classList.toggle('anim', !!anim);
      lienzo.style.transform = 'translate(' + (bx + tx) + 'px,' + (by + ty) + 'px) scale(' + z + ')';
    }
    function limitar() {
      const sw = host.clientWidth, sh = host.clientHeight;
      tx = z * W <= sw ? 0 : clamp(tx, sw - bx - z * W, -bx);
      ty = z * H <= sh ? 0 : clamp(ty, sh - by - z * H, -by);
    }
    function ajustar() {
      const sw = host.clientWidth, sh = host.clientHeight;
      if (!sw || !sh) return;
      W = Math.min(sw, sh * ratio); H = W / ratio;
      lienzo.style.width = W + 'px'; lienzo.style.height = H + 'px';
      bx = (sw - W) / 2; by = (sh - H) / 2;
      limitar(); aplicar(false);
    }
    function zoomEn(px, py, z2, anim) {
      z2 = clamp(z2, 1, 6);
      const u = (px - bx - tx) / z, v = (py - by - ty) / z;
      z = z2; tx = px - bx - u * z; ty = py - by - v * z;
      limitar(); aplicar(anim);
    }
    function ver(id, anim) {
      const f = tpl.campos.find(c => c.id === id);
      const caja = f && (f.x !== undefined ? f : (f.opciones && f.opciones[0] ? Object.assign({ w: 8, h: 4 }, f.opciones[0]) : null));
      if (!caja) return;
      const sw = host.clientWidth, sh = host.clientHeight;
      const bw = Math.max(caja.w / 100 * W, 24);
      z = clamp(sw * 0.34 / bw, 1.7, 3.4);
      const cx = (caja.x + (caja.w || 0) / 2) / 100 * W, cy = (caja.y + (caja.h || 0) / 2) / 100 * H;
      tx = sw / 2 - bx - cx * z; ty = sh / 2 - by - cy * z;
      limitar(); aplicar(anim !== false);
    }
    const reset = anim => { z = 1; tx = 0; ty = 0; limitar(); aplicar(anim !== false); };

    function pintarChips() {
      capa.innerHTML = ''; chips.clear();
      const hr = ratio;                                    // alto/ancho de la imagen para convertir % de alto a cqw
      tpl.campos.forEach(f => {
        const lista = [];
        const cajas = [];
        if (f.x !== undefined) cajas.push(Object.assign({}, f, { principal: true }));
        (f.espejos || []).forEach(e => cajas.push(Object.assign({}, e)));
        cajas.forEach(b => {
          const c = el('div', 'md-chip' + (b.principal ? '' : ' espejo') + (f.ml ? ' ml' : ''));
          c.dataset.f = f.id;
          c.style.cssText = 'left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%;font-size:' +
            (f.ml ? Math.min(b.h / hr * 0.2, 1.9) : Math.min(b.h / hr * 0.6, 3.4)).toFixed(2) + 'cqw';
          const t = el('span', 'md-chip-t'); c.appendChild(t);
          capa.appendChild(c); lista.push(c);
        });
        (f.opciones || []).forEach(o => {
          const m = el('button', 'md-marca', '');
          m.type = 'button'; m.dataset.f = f.id; m.dataset.v = o.valor; m.setAttribute('aria-label', f.corto + ': ' + o.valor);
          m.style.cssText = 'left:' + (o.x - 1.5) + '%;top:' + (o.y - 1.5 * hr) + '%;width:3%;height:' + (3 * hr) + '%;font-size:2.7cqw';
          capa.appendChild(m); lista.push(m);
        });
        chips.set(f.id, lista);
      });
      refrescar();
    }
    function refrescar() {
      tpl.campos.forEach(f => {
        const v = getVal(f.id), lleno = hayValor(v);
        (chips.get(f.id) || []).forEach(c => {
          c.classList.toggle('lleno', lleno);
          c.classList.toggle('activo', f.id === activoId);
          if (c.classList.contains('md-marca')) {
            const sel = Array.isArray(v) ? v.includes(c.dataset.v) : v === c.dataset.v;
            c.textContent = sel ? '✕' : ''; c.classList.toggle('sel', sel);
          } else {
            c.firstChild.textContent = Array.isArray(v) ? v.join(', ') : (v == null ? '' : v);
          }
        });
      });
    }
    function activar(id, opts) {
      activoId = id; refrescar();
      if (opts && opts.ver === false) return;
      if (seguir && ops.seguir) ver(id, true);
    }

    // Toques sobre las casillas
    let movido = false;
    capa.addEventListener('click', e => {
      if (movido) return;
      const t = e.target.closest('.md-chip,.md-marca'); if (!t) return;
      if (t.classList.contains('md-marca') && ops.onOpcion) ops.onOpcion(t.dataset.f, t.dataset.v);
      else if (ops.onSel) ops.onSel(t.dataset.f);
    });

    // Gestos: arrastrar, pellizcar, rueda, doble toque
    const ptrs = new Map(); let d0 = 0, z0 = 1, inicio = null, ultTap = 0;
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('.md-zoom')) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      inicio = { x: e.clientX, y: e.clientY }; movido = false;
      lienzo.classList.remove('anim');
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; z0 = z; }
    });
    host.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 1) {
        if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 9) movido = true;
        if (z > 1.001 && movido) { tx += e.clientX - p.x; ty += e.clientY - p.y; limitar(); aplicar(false); }
      } else if (ptrs.size === 2) {
        movido = true; p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...ptrs.values()]; const r = host.getBoundingClientRect();
        zoomEn((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, z0 * Math.hypot(a.x - b.x, a.y - b.y) / d0, false);
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const fin = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0 && !movido && !e.target.closest('.md-chip,.md-marca') && e.type === 'pointerup') {
        const t = Date.now();
        if (t - ultTap < 320) { z > 1.05 ? reset(true) : zoomEn(e.clientX - host.getBoundingClientRect().left, e.clientY - host.getBoundingClientRect().top, 2.6, true); ultTap = 0; }
        else ultTap = t;
      }
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => host.addEventListener(n, fin));
    host.addEventListener('wheel', e => {
      e.preventDefault(); const r = host.getBoundingClientRect();
      zoomEn(e.clientX - r.left, e.clientY - r.top, z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), false);
    }, { passive: false });
    barra.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const cx = host.clientWidth / 2, cy = host.clientHeight / 2;
      if (b.dataset.z === 'in') zoomEn(cx, cy, z * 1.5, true);
      else if (b.dataset.z === 'out') zoomEn(cx, cy, z / 1.5, true);
      else if (b.dataset.z === 'fit') reset(true);
      else if (b.dataset.z === 'seg') { seguir = !seguir; b.classList.toggle('on', seguir); b.setAttribute('aria-pressed', seguir); if (seguir && activoId) ver(activoId, true); else reset(true); }
    });

    const ro = new ResizeObserver(() => { ajustar(); if (seguir && ops.seguir && activoId && z > 1.05) ver(activoId, false); });
    ro.observe(host);
    img.onload = () => {
      ratio = img.naturalWidth / img.naturalHeight; listo = true;
      ajustar(); pintarChips();
      if (ops.alListo) ops.alListo();
    };
    img.onerror = () => { host.innerHTML = '<div class="md-vacio"><i class="fas fa-triangle-exclamation"></i><p>No se pudo cargar el esquema.<br>Revisa la conexión e inténtalo de nuevo.</p></div>'; };
    img.src = rutaImagen(tpl.imagen);
    return { refrescar, activar, ver, reset, ajustar, destruir() { ro.disconnect(); }, get listo() { return listo; } };
  }

  /* ───────────── Estado y pantalla de toma de medidas ───────────── */
  let estado = null, root = null, lienzoCtl = null, vv = null;
  const refs = {};

  function asegurarUI() {
    if (root) return;
    root = el('div', 'md-root');
    root.id = 'md-root'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Hoja de medidas');
    root.innerHTML =
      '<header class="md-head">' +
        '<button type="button" class="md-ib" id="md-x" aria-label="Cerrar"><i class="fas fa-xmark"></i></button>' +
        '<div class="md-tit"><strong id="md-tit">Hoja de medidas</strong><small id="md-sub">Sin cliente</small></div>' +
        '<button type="button" class="md-ib md-datos-btn" id="md-datos-btn" aria-label="Cliente, notas y fotos"><i class="fas fa-user-pen"></i><b id="md-fotos-n" hidden></b></button>' +
        '<button type="button" class="md-ib" id="md-edit" aria-label="Editar plantilla"><i class="fas fa-pen-to-square"></i></button>' +
        '<select id="md-sel" aria-label="Tipo de puerta"></select>' +
      '</header>' +
      '<section class="md-datos" id="md-datos">' +
        '<div class="md-sheet-h"><strong>Datos del trabajo</strong><button type="button" class="md-ib" id="md-datos-x" aria-label="Cerrar datos"><i class="fas fa-xmark"></i></button></div>' +
        '<label for="md-busca">Cliente</label>' +
        '<input type="search" id="md-busca" placeholder="Buscar cliente…" autocomplete="off">' +
        '<select id="md-cliente"></select>' +
        '<label for="md-notas">Notas para administración</label>' +
        '<textarea id="md-notas" rows="2" placeholder="Observaciones generales…"></textarea>' +
        '<label>Fotos de la obra</label>' +
        '<div class="md-fotos-acc"><button type="button" class="btn btn-outline" id="md-foto-cam"><i class="fas fa-camera"></i> Hacer foto</button>' +
        '<button type="button" class="btn btn-outline" id="md-foto-gal"><i class="fas fa-image"></i> Galería</button></div>' +
        '<div class="md-thumbs" id="md-thumbs"></div>' +
        '<button type="button" class="btn btn-primary md-datos-ok" id="md-datos-ok">Listo</button>' +
        '<input type="file" id="md-f-cam" accept="image/*" capture="environment" hidden><input type="file" id="md-f-gal" accept="image/*" multiple hidden>' +
      '</section>' +
      '<aside class="md-lista" id="md-lista" aria-label="Medidas"></aside>' +
      '<section class="md-vista"><div id="md-stage"></div></section>' +
      '<nav class="md-pills" id="md-pills" aria-label="Todas las medidas"></nav>' +
      '<section class="md-entrada" id="md-entrada">' +
        '<div class="md-e-top"><span class="md-e-n" id="md-e-n"></span><label class="md-e-lab" id="md-e-lab" for="md-e-in"></label><span class="md-e-u" id="md-e-u"></span></div>' +
        '<input id="md-e-in" class="md-e-in" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off">' +
        '<textarea id="md-e-ta" class="md-e-in" rows="2" hidden></textarea>' +
        '<div class="md-e-ops" id="md-e-ops" hidden></div>' +
        '<div class="md-e-nav"><button type="button" class="btn btn-outline" id="md-prev"><i class="fas fa-chevron-left"></i> Anterior</button>' +
        '<button type="button" class="btn btn-primary" id="md-next">Siguiente <i class="fas fa-chevron-right"></i></button></div>' +
      '</section>' +
      '<footer class="md-pie"><span class="md-prog" id="md-prog" aria-live="polite"></span>' +
        '<button type="button" class="btn btn-primary" id="md-guardar"><i class="fas fa-paper-plane"></i> Guardar</button></footer>';
    document.body.appendChild(root);
    ['x', 'sel', 'edit', 'cliente', 'busca', 'notas', 'lista', 'pills', 'entrada', 'prev', 'next', 'guardar', 'prog', 'datos', 'datos-btn', 'datos-x', 'datos-ok', 'thumbs', 'e-n', 'e-lab', 'e-u', 'e-in', 'e-ta', 'e-ops', 'tit', 'sub', 'stage', 'foto-cam', 'foto-gal', 'f-cam', 'f-gal', 'fotos-n']
      .forEach(k => { refs[k] = root.querySelector('#md-' + k); });

    refs.x.onclick = cerrar;
    refs.sel.onchange = () => elegirTpl(refs.sel.value);
    refs.edit.onclick = () => editarActual();
    refs.prev.onclick = () => mover(-1);
    refs.next.onclick = () => mover(1);
    // Los botones no roban el foco, así el teclado no se cierra al pasar de una medida a otra
    [refs.prev, refs.next].forEach(b => b.addEventListener('pointerdown', e => e.preventDefault()));
    refs.guardar.onclick = guardar;
    refs['datos-btn'].onclick = () => root.classList.add('datos-abierto');
    refs['datos-x'].onclick = refs['datos-ok'].onclick = () => { root.classList.remove('datos-abierto'); actualizarSub(); };
    refs.cliente.onchange = () => { estado.clienteId = refs.cliente.value; actualizarSub(); };
    refs.notas.oninput = () => { estado.notas = refs.notas.value; };
    refs.busca.oninput = () => pintarClientes(refs.busca.value);
    refs['foto-cam'].onclick = () => refs['f-cam'].click();
    refs['foto-gal'].onclick = () => refs['f-gal'].click();
    [refs['f-cam'], refs['f-gal']].forEach(inp => inp.addEventListener('change', async e => {
      const files = [...(e.target.files || [])]; e.target.value = '';
      for (const f of files) {
        try {
          const url = window.compressDoticsPhoto ? await window.compressDoticsPhoto(f)
            : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
          estado.fotos.push(url);
        } catch (err) { toast('No se pudo procesar la foto', 'error'); }
      }
      pintarThumbs();
    }));
    // Entrada de la medida activa
    refs['e-in'].addEventListener('input', () => entradaCambio(refs['e-in']));
    refs['e-ta'].addEventListener('input', () => entradaCambio(refs['e-ta']));
    refs['e-in'].addEventListener('keydown', teclaEntrada);
    refs['e-ta'].addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); mover(1); } });
    refs['e-ops'].addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) alternarOpcion(campoActual().id, b.dataset.v); });
    refs.pills.addEventListener('click', e => { const b = e.target.closest('.md-pill'); if (b) ir(+b.dataset.i, true); });
    refs.lista.addEventListener('focusin', e => { const r = e.target.closest('.md-fila'); if (r) ir(+r.dataset.i, false, true); });
    refs.lista.addEventListener('input', e => { const i = e.target.closest('[data-i]'); if (i && e.target.matches('input,textarea')) listaCambio(e.target); });
    refs.lista.addEventListener('keydown', e => {
      if (e.target.matches('input') && e.key === 'Enter') { e.preventDefault(); mover(e.shiftKey ? -1 : 1); }
    });
    refs.lista.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) alternarOpcion(b.dataset.f, b.dataset.v); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); if (root.classList.contains('datos-abierto')) root.classList.remove('datos-abierto'); else cerrar(); } });

    vv = window.visualViewport;
    const ajustarVV = () => {
      if (root.hidden) return;
      const h = vv ? vv.height : window.innerHeight;
      root.style.height = h + 'px'; root.style.top = (vv ? vv.offsetTop : 0) + 'px';
      root.classList.toggle('md-teclado', !!vv && vv.height < window.innerHeight * 0.78 && window.innerWidth < 900);
    };
    if (vv) { vv.addEventListener('resize', ajustarVV); vv.addEventListener('scroll', ajustarVV); }
    window.addEventListener('resize', ajustarVV);
    root._ajustarVV = ajustarVV;
  }

  const campos = () => (estado && estado.tpl ? estado.tpl.campos : []);
  const campoActual = () => campos()[estado.idx] || null;
  const valor = id => estado.valores[id];
  const unidadDe = f => (f.tipo === 'num' && f.unidad ? f.unidad : '');
  const textoValor = (f, v) => Array.isArray(v) ? v.join(', ') : (hayValor(v) ? String(v) + (unidadDe(f) ? ' ' + unidadDe(f) : '') : '');

  function pintarClientes(filtro) {
    const q = window.TiposPuerta.norm(filtro || '');
    const lista = estado.clientes.filter(c => !q || window.TiposPuerta.norm(c.nombre).includes(q) || String(c.id) === String(estado.clienteId));
    refs.cliente.innerHTML = '<option value="">— Sin cliente —</option>' +
      lista.map(c => '<option value="' + esc(c.id) + '"' + (String(c.id) === String(estado.clienteId) ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');
  }
  function actualizarSub() {
    const c = estado.clientes.find(x => String(x.id) === String(estado.clienteId));
    refs.sub.textContent = c ? c.nombre : 'Sin cliente · toca 👤 para elegirlo';
  }
  function pintarThumbs() {
    refs.thumbs.innerHTML = estado.fotos.map((f, i) =>
      '<div class="md-th"><img src="' + esc(f) + '" alt="Foto ' + (i + 1) + '"><button type="button" data-i="' + i + '" aria-label="Quitar foto ' + (i + 1) + '">✕</button></div>').join('');
    refs.thumbs.querySelectorAll('button').forEach(b => b.onclick = () => { estado.fotos.splice(+b.dataset.i, 1); pintarThumbs(); });
    refs['fotos-n'].hidden = !estado.fotos.length; refs['fotos-n'].textContent = estado.fotos.length;
  }

  /* ── Lista (PC), tira de medidas y panel de entrada (móvil) ── */
  function pintarLista() {
    refs.lista.innerHTML = campos().map((f, i) => {
      const v = valor(f.id), u = unidadDe(f);
      let ctl;
      if (f.tipo === 'opcion') {
        ctl = '<div class="md-seg">' + f.opciones.map(o => {
          const sel = Array.isArray(v) ? v.includes(o.valor) : v === o.valor;
          return '<button type="button" data-f="' + esc(f.id) + '" data-v="' + esc(o.valor) + '" class="' + (sel ? 'sel' : '') + '" aria-pressed="' + sel + '">' + esc(o.valor) + '</button>';
        }).join('') + '</div>';
      } else if (f.ml) {
        ctl = '<textarea data-i="' + i + '" rows="2" id="md-l-' + i + '">' + esc(v || '') + '</textarea>';
      } else {
        ctl = '<div class="md-inp"><input data-i="' + i + '" id="md-l-' + i + '" type="text" ' + (f.tipo === 'num' ? 'inputmode="decimal" ' : '') + 'value="' + esc(v || '') + '" autocomplete="off">' + (u ? '<span>' + esc(u) + '</span>' : '') + '</div>';
      }
      return '<div class="md-fila' + (i === estado.idx ? ' activa' : '') + '" data-i="' + i + '"><label for="md-l-' + i + '">' + esc(f.etiqueta) + '</label>' + ctl + '</div>';
    }).join('');
  }
  function pintarPills() {
    refs.pills.innerHTML = campos().map((f, i) => {
      const t = textoValor(f, valor(f.id));
      return '<button type="button" class="md-pill' + (t ? ' lleno' : '') + (i === estado.idx ? ' activa' : '') + '" data-i="' + i + '"><span>' + esc(f.corto) + '</span><b>' + (t ? esc(t) : '—') + '</b></button>';
    }).join('');
  }
  function pintarEntrada(foco) {
    const f = campoActual(); if (!f) return;
    refs['e-n'].textContent = (estado.idx + 1) + '/' + campos().length;
    refs['e-lab'].textContent = f.etiqueta;
    refs['e-u'].textContent = unidadDe(f);
    const inp = refs['e-in'], ta = refs['e-ta'], ops = refs['e-ops'];
    inp.hidden = ta.hidden = ops.hidden = true;
    if (f.tipo === 'opcion') {
      const v = valor(f.id);
      ops.hidden = false;
      ops.innerHTML = f.opciones.map(o => {
        const sel = Array.isArray(v) ? v.includes(o.valor) : v === o.valor;
        return '<button type="button" data-v="' + esc(o.valor) + '" class="' + (sel ? 'sel' : '') + '" aria-pressed="' + sel + '">' + esc(o.valor) + '</button>';
      }).join('');
    } else if (f.ml) {
      ta.hidden = false; ta.value = valor(f.id) || ''; ta.placeholder = f.etiqueta;
      if (foco) ta.focus({ preventScroll: true });
    } else {
      inp.hidden = false; inp.value = valor(f.id) || '';
      inp.inputMode = f.tipo === 'num' ? 'decimal' : 'text';
      inp.placeholder = f.tipo === 'num' ? 'Escribe la medida' : f.etiqueta;
      inp.setAttribute('aria-label', f.etiqueta);
      if (foco) { inp.focus({ preventScroll: true }); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { } }
    }
    refs.prev.disabled = estado.idx === 0;
    refs.next.innerHTML = estado.idx === campos().length - 1 ? 'Terminar <i class="fas fa-check"></i>' : 'Siguiente <i class="fas fa-chevron-right"></i>';
  }
  function progreso() {
    const n = campos().filter(f => hayValor(valor(f.id))).length;
    refs.prog.textContent = n + ' de ' + campos().length + ' medidas';
  }

  // Cambia de medida activa
  function ir(i, desdePill, desdeLista) {
    i = clamp(i, 0, campos().length - 1);
    estado.idx = i;
    const f = campoActual();
    root.querySelectorAll('.md-pill').forEach(p => p.classList.toggle('activa', +p.dataset.i === i));
    root.querySelectorAll('.md-fila').forEach(p => p.classList.toggle('activa', +p.dataset.i === i));
    const pill = refs.pills.querySelector('.md-pill.activa'); if (pill) pill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    const movil = window.innerWidth < 900;
    pintarEntrada(movil && !desdeLista);
    if (lienzoCtl) lienzoCtl.activar(f.id);
    if (!movil && !desdeLista) {
      const inp = root.querySelector('#md-l-' + i) || null;
      if (inp) { inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      else { const fila = root.querySelector('.md-fila[data-i="' + i + '"]'); if (fila) fila.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
  }
  function mover(d) {
    if (d > 0 && estado.idx === campos().length - 1) { if (window.innerWidth < 900) document.activeElement?.blur(); toast('Última medida. Pulsa «Guardar» cuando termines.', 'info'); return; }
    ir(estado.idx + d);
  }
  function teclaEntrada(e) {
    if (e.key === 'Enter') { e.preventDefault(); mover(e.shiftKey ? -1 : 1); }
  }

  // Escritura de valores
  function limpiar(f, v) {
    if (f.tipo !== 'num') return v;
    return String(v).replace(/[^\d.,]/g, '').replace(/^([^.,]*[.,][^.,]*).*$/, '$1');
  }
  function fijar(id, v, origen) {
    const f = campos().find(c => c.id === id); if (!f) return;
    estado.valores[id] = v;
    if (lienzoCtl) lienzoCtl.refrescar();
    const i = campos().indexOf(f);
    const pill = refs.pills.querySelector('.md-pill[data-i="' + i + '"]');
    if (pill) { const t = textoValor(f, v); pill.classList.toggle('lleno', !!t); pill.querySelector('b').textContent = t || '—'; }
    if (origen !== 'lista') { const inp = root.querySelector('#md-l-' + i); if (inp && inp.value !== v && !Array.isArray(v)) inp.value = v; }
    if (origen !== 'entrada' && i === estado.idx) { if (f.tipo === 'opcion') pintarEntrada(false); else { const e = f.ml ? refs['e-ta'] : refs['e-in']; if (e.value !== v) e.value = v; } }
    progreso();
  }
  function entradaCambio(inp) {
    const f = campoActual(); const v = limpiar(f, inp.value);
    if (v !== inp.value) inp.value = v;
    fijar(f.id, v, 'entrada');
  }
  function listaCambio(inp) {
    const f = campos()[+inp.dataset.i]; const v = limpiar(f, inp.value);
    if (v !== inp.value) inp.value = v;
    fijar(f.id, v, 'lista');
  }
  function alternarOpcion(id, op) {
    const f = campos().find(c => c.id === id); if (!f) return;
    const i = campos().indexOf(f);
    if (i !== estado.idx) ir(i, false, true);
    let v = valor(id);
    if (f.multi) { v = Array.isArray(v) ? v.slice() : []; const k = v.indexOf(op); k >= 0 ? v.splice(k, 1) : v.push(op); }
    else v = v === op ? '' : op;
    fijar(id, v, 'opcion');
    // refresca los botones de la lista (PC) y de la entrada (móvil)
    root.querySelectorAll('.md-seg button[data-f="' + CSS.escape(id) + '"]').forEach(b => { const s = Array.isArray(v) ? v.includes(b.dataset.v) : v === b.dataset.v; b.classList.toggle('sel', s); b.setAttribute('aria-pressed', s); });
    refs['e-ops'].querySelectorAll('button').forEach(b => { const s = Array.isArray(v) ? v.includes(b.dataset.v) : v === b.dataset.v; b.classList.toggle('sel', s); b.setAttribute('aria-pressed', s); });
  }

  /* ── Selector de tipo cuando todavía no hay hoja ── */
  function pintarSelectorTipos() {
    refs.stage.className = ''; if (lienzoCtl) { lienzoCtl.destruir(); lienzoCtl = null; }
    refs.stage.innerHTML = '<div class="md-tipos"><h3>¿Qué puerta vas a medir?</h3><div class="md-tipos-g">' +
      estado.catalogo.map(p => '<button type="button" data-u="' + esc(p.uid) + '"><i class="fas fa-ruler-combined"></i><span>' + esc(p.nombre) + '</span></button>').join('') + '</div></div>';
    refs.stage.querySelectorAll('button').forEach(b => b.onclick = () => { refs.sel.value = b.dataset.u; elegirTpl(b.dataset.u); });
    refs.lista.innerHTML = ''; refs.pills.innerHTML = ''; refs.prog.textContent = '';
    root.classList.add('sin-tpl');
  }

  function elegirTpl(uid) {
    const tpl = buscarTpl(estado.catalogo, uid);
    if (!tpl) { estado.tpl = null; pintarSelectorTipos(); return; }
    // Al cambiar de hoja se conservan las medidas con el mismo nombre (ancho, alto…)
    const previos = estado.tpl ? estado.valores : aplicarAlias(tpl, estado.previos);
    estado.tpl = tpl; estado.idx = 0;
    estado.valores = {};
    tpl.campos.forEach(c => { if (hayValor(previos[c.id])) estado.valores[c.id] = previos[c.id]; });
    if (!estado.tpl.campos.length) { toast('Esta hoja no tiene casillas', 'error'); return; }
    root.classList.remove('sin-tpl');
    refs.sel.value = tpl.uid;
    refs.tit.textContent = tpl.nombre;
    refs.edit.hidden = !!(window.isTechnician && window.isTechnician());
    refs.stage.className = '';
    pintarLista(); pintarPills(); progreso();
    if (lienzoCtl) lienzoCtl.destruir();
    lienzoCtl = montarLienzo(refs.stage, tpl, valor, {
      seguir: true,
      onSel: id => ir(campos().findIndex(c => c.id === id), false),
      onOpcion: (id, v) => alternarOpcion(id, v),
      alListo: () => { lienzoCtl.activar(campos()[0].id, { ver: false }); }
    });
    pintarEntrada(false);
  }

  /* ── Abrir / cerrar ── */
  async function abrir(opts) {
    opts = opts || {};
    asegurarUI();
    estado = { tpl: null, catalogo: [], valores: {}, previos: opts.valoresPrevios || {}, idx: 0, fotos: [], notas: '',
      clientes: opts.clientes || [], clienteId: opts.clienteId || '', onGuardar: opts.onGuardar || null };
    root.hidden = false; root.classList.remove('datos-abierto'); root.classList.add('sin-tpl');
    document.documentElement.classList.add('md-bloqueo');
    root._ajustarVV();
    refs.tit.textContent = opts.titulo || 'Hoja de medidas';
    refs.stage.className = ''; refs.stage.innerHTML = '<div class="md-vacio"><i class="fas fa-spinner fa-spin"></i><p>Cargando hojas…</p></div>';
    refs.notas.value = ''; refs.busca.value = '';
    pintarClientes(''); actualizarSub(); pintarThumbs();
    estado.catalogo = await cargarCatalogo(true);
    refs.sel.innerHTML = '<option value="">— Tipo de puerta —</option>' + estado.catalogo.map(p => '<option value="' + esc(p.uid) + '">' + esc(p.nombre) + '</option>').join('');
    const ini = buscarTpl(estado.catalogo, opts.plantillaId || opts.tipo || '');
    if (ini) elegirTpl(ini.uid); else pintarSelectorTipos();
    window.MedicionesOutbox.run().catch(() => { });
  }
  function cerrar() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.documentElement.classList.remove('md-bloqueo');
    if (lienzoCtl) { lienzoCtl.destruir(); lienzoCtl = null; }
    refs.stage.innerHTML = '';
  }

  /* ── Guardar ── */
  async function subirFoto(dataUrl) {
    const userId = window.authState && window.authState.user && window.authState.user.id;
    if (!userId || !navigator.onLine || !window.supabaseDB) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const rand = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random()).replace(/-/g, '');
      const path = userId + '/' + rand + '.' + ext;
      const { error } = await window.supabaseDB.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      return window.supabaseDB.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) { return null; }
  }

  async function guardar() {
    const tpl = estado.tpl;
    if (!tpl) { toast('Elige primero el tipo de puerta', 'error'); return; }
    const valores = {};
    tpl.campos.forEach(c => { const v = estado.valores[c.id]; if (hayValor(v)) valores[c.id] = Array.isArray(v) ? v.slice() : String(v).trim(); });
    if (!Object.keys(valores).length) { toast('Rellena al menos una medida', 'error'); return; }
    const faltan = tpl.campos.filter(c => c.tipo === 'num' && !hayValor(valores[c.id])).length;
    const btn = refs.guardar; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    const cli = estado.clientes.find(c => String(c.id) === String(estado.clienteId));
    const emp = (window.authState && window.authState.employee) || {};
    const tecnico = emp.nombre || (window.authState && window.authState.user && window.authState.user.email) || '';
    const datosHoja = {
      sistema: 'hoja-v1', plantillaId: tpl.uid, plantillaNombre: tpl.nombre, tipoNombre: tpl.nombre,
      plantillaImagenUrl: tpl.imagen, imagenUrl: tpl.imagen, plantillaSvg: '',
      campos: clone(tpl.campos), valores: clone(valores), fecha: hoy(), tecnico, notas: estado.notas.trim()
    };
    const fila = {
      id: (window.SyncUtils && window.SyncUtils.randomId()) || undefined,   // id de cliente: reenviar nunca duplica
      plantillaid: tpl.remoteId || null, plantillanombre: tpl.nombre, clienteid: estado.clienteId || null,
      clientenombre: cli ? cli.nombre : '', tecnicoid: emp.id || null, tecniconombre: tecnico, fecha: hoy(),
      valores, notas: datosHoja.notas, fotos: estado.fotos.slice(), estado: 'pendiente',
      createdby: (window.authState && window.authState.user && window.authState.user.id) || null
    };
    try {
      fila.fotos = [];
      for (const f of estado.fotos) fila.fotos.push(f.startsWith('data:image/') ? (await subirFoto(f)) || f : f);
      const { data, error } = await supa().from(T_MEDICIONES).insert(fila).select().single();
      if (error) throw error;
      toast('✅ Medición enviada a administración' + (faltan ? ' (' + faltan + ' medida(s) sin rellenar)' : ''), 'success');
      const cb = estado.onGuardar; cerrar();
      if (cb) cb(Object.assign({}, datosHoja, { id: data && data.id }));
      if (typeof window.refrescarMediciones === 'function') window.refrescarMediciones();
    } catch (e) {
      console.warn('[Medidas] no se pudo enviar ahora:', e && e.message || e);
      try {
        const SU = window.SyncUtils, permanente = SU.classifyError(e, navigator.onLine) === 'permanent';
        // Nunca se pierde la medición: si el servidor la rechaza queda guardada como "fallida" y visible, sin reintentos infinitos
        await window.MedicionesOutbox.enqueue(fila, (window.authState && window.authState.user && window.authState.user.id) || null,
          permanente ? { estado: 'fallida', error: SU.errorMessage(e) } : {});
        toast(permanente
          ? 'No se pudo enviar (' + SU.errorMessage(e) + '). Queda guardada en el móvil: avisa a administración.'
          : 'Sin conexión: guardada en el móvil. Se enviará sola al volver la señal.', permanente ? 'warning' : 'info');
        const cb = estado.onGuardar; cerrar();
        if (cb) cb(datosHoja);
      } catch (e2) { toast('No se pudo guardar: ' + (e2.message || e2), 'error'); }
    } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Guardar'; }
  }


  /* ───────────── Dibujar la hoja rellena en un canvas (PDF, presupuestos) ───────────── */
  function normalizarMedidas(m) {
    // m: {tipoNombre|plantillaNombre, imagenUrl, campos, valores}  →  {tpl, valores}
    const catalogo = cacheCat || [];
    const nombre = m.tipoNombre || m.plantillaNombre || '';
    const conocida = buscarTpl(catalogo, nombre);
    const idsViejos = (m.campos || []).length && (m.campos || []).every(c => /^[a-f]_/.test(String(c.id)) || /^c\d+/.test(String(c.id)));
    // Datos de la versión anterior: se llevan a la hoja actual para que las cotas caigan en su casilla
    if (conocida && (conocida.origen === 'base') && idsViejos && !(m.campos || []).some(c => (c.espejos || []).length)) {
      return { tpl: conocida, valores: aplicarAlias(conocida, m.valores) };
    }
    const campos = (m.campos && m.campos.length ? m.campos : (conocida ? conocida.campos : [])).map(normCampo);
    const imagen = m.imagenUrl || m.plantillaImagenUrl || (conocida && conocida.imagen) || '';
    return { tpl: { nombre, imagen, campos, ratio: conocida && conocida.ratio }, valores: m.valores || {} };
  }

  function resumen(m) {
    const n = normalizarMedidas(m);
    return n.tpl.campos.filter(c => hayValor(n.valores[c.id])).map(c => [c.etiqueta, textoValor(c, n.valores[c.id])]);
  }

  async function renderizar(m, anchoPx) {
    await cargarCatalogo().catch(() => { });
    const { tpl, valores } = normalizarMedidas(m);
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('No se pudo cargar la imagen de la hoja')); img.src = rutaImagen(tpl.imagen); });
    const W = anchoPx || 1500, H = Math.round(W * img.naturalHeight / img.naturalWidth);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
    ctx.fillStyle = '#0b2a6f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    tpl.campos.forEach(f => {
      const v = valores[f.id]; if (!hayValor(v)) return;
      if (f.tipo === 'opcion') {
        const sel = Array.isArray(v) ? v : [v];
        (f.opciones || []).filter(o => sel.includes(o.valor)).forEach(o => {
          const cx = o.x / 100 * W, cy = o.y / 100 * H, r = W * 0.011;
          ctx.strokeStyle = '#dc2626'; ctx.lineWidth = Math.max(3, W * 0.0028); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r); ctx.stroke();
        });
        return;
      }
      const cajas = []; if (f.x !== undefined) cajas.push(f); (f.espejos || []).forEach(e => cajas.push(e));
      const txt = String(v);
      cajas.forEach(b => {
        const bw = b.w / 100 * W, bh = b.h / 100 * H, cx = b.x / 100 * W + bw / 2, cy = b.y / 100 * H + bh / 2;
        if (f.ml) {
          const fs = Math.min(bh * 0.28, W * 0.02); ctx.font = '600 ' + fs + 'px Arial,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          let linea = '', y = b.y / 100 * H + fs * 0.4; const x = b.x / 100 * W + fs * 0.5;
          txt.split(/\s+/).forEach(pal => { const t = linea ? linea + ' ' + pal : pal; if (ctx.measureText(t).width > bw - fs) { ctx.fillText(linea, x, y); y += fs * 1.2; linea = pal; } else linea = t; });
          if (linea) ctx.fillText(linea, x, y);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        } else {
          let fs = bh * 0.66; ctx.font = '700 ' + fs + 'px Arial,sans-serif';
          while (ctx.measureText(txt).width > bw - 6 && fs > 8) { fs -= 1; ctx.font = '700 ' + fs + 'px Arial,sans-serif'; }
          ctx.fillText(txt, cx, cy + 1);
        }
      });
    });
    return cv.toDataURL('image/jpeg', 0.92);
  }

  /* ───────────── Vista de solo lectura (administración) ───────────── */
  let vistaEl = null;
  async function abrirVista(m) {
    if (!m || m.sistema !== 'hoja-v1') { toast('Este presupuesto no tiene hoja de medidas adjunta', 'info'); return; }
    await cargarCatalogo().catch(() => { });
    const { tpl, valores } = normalizarMedidas(m);
    cerrarVista();
    vistaEl = el('div', 'md-root md-solo');
    vistaEl.setAttribute('role', 'dialog'); vistaEl.setAttribute('aria-modal', 'true');
    const filas = tpl.campos.filter(c => hayValor(valores[c.id])).map(c => '<div class="md-r"><span>' + esc(c.etiqueta) + '</span><b>' + esc(textoValor(c, valores[c.id])) + '</b></div>').join('');
    vistaEl.innerHTML = '<header class="md-head"><button type="button" class="md-ib" data-x aria-label="Cerrar"><i class="fas fa-xmark"></i></button>' +
      '<div class="md-tit"><strong>Hoja de medidas — ' + esc(m.tipoNombre || tpl.nombre) + '</strong><small>' + esc(m.fecha || '') + (m.tecnico ? ' · ' + esc(m.tecnico) : '') + '</small></div></header>' +
      '<section class="md-vista"><div id="md-stage-v"></div></section>' +
      '<section class="md-resumen">' + (filas || '<p>Sin medidas rellenas.</p>') + (m.notas ? '<div class="md-r md-r-n"><span>Notas</span><b>' + esc(m.notas) + '</b></div>' : '') + '</section>';
    document.body.appendChild(vistaEl);
    document.documentElement.classList.add('md-bloqueo');
    vistaEl.querySelector('[data-x]').onclick = cerrarVista;
    const ctl = montarLienzo(vistaEl.querySelector('#md-stage-v'), tpl, id => valores[id], {});
    vistaEl._ctl = ctl;
  }
  function cerrarVista() {
    if (!vistaEl) return false;
    if (vistaEl._ctl) vistaEl._ctl.destruir();
    vistaEl.remove(); vistaEl = null;
    if (!root || root.hidden) document.documentElement.classList.remove('md-bloqueo');
    return true;
  }

  /* ───────────── Editor de hojas (administrador) ───────────── */
  let edEl = null;
  async function abrirEditor(def, onGuardar) {
    const catalogo = await cargarCatalogo();
    cerrarEditor();
    const inicial = def && (buscarTpl(catalogo, def.tipoPuerta || def.nombre) || null);
    let tpl = clone(inicial || catalogo[0]);
    let nuevaImagen = null, ctl = null, sel = 0;
    edEl = el('div', 'md-root md-editor');
    edEl.setAttribute('role', 'dialog'); edEl.setAttribute('aria-modal', 'true'); edEl.setAttribute('aria-label', 'Editor de hoja de medidas');
    edEl.innerHTML = '<header class="md-head"><button type="button" class="md-ib" data-x aria-label="Cerrar"><i class="fas fa-xmark"></i></button>' +
      '<div class="md-tit"><strong>Editor de hoja de medidas</strong><small>Arrastra las casillas sobre la imagen</small></div></header>' +
      '<aside class="md-ed-panel"><label>Tipo de puerta</label><select id="ed-tipo">' + window.TiposPuerta.opciones(tpl.nombre, { por: 'nombre', vacio: false }) + '</select>' +
      '<label>Imagen de la hoja</label><div class="md-fotos-acc"><button type="button" class="btn btn-outline" id="ed-img"><i class="fas fa-file-import"></i> Subir imagen</button>' +
      '<button type="button" class="btn btn-outline" id="ed-orig"><i class="fas fa-rotate-left"></i> Restaurar original</button></div><input type="file" id="ed-file" accept="image/*" hidden>' +
      '<label>Casillas</label><div id="ed-lista"></div><button type="button" class="btn btn-outline" id="ed-add"><i class="fas fa-plus"></i> Añadir casilla</button>' +
      '<button type="button" class="btn btn-primary" id="ed-save"><i class="fas fa-save"></i> Guardar hoja</button></aside>' +
      '<section class="md-vista"><div id="md-stage-e"></div></section>';
    document.body.appendChild(edEl);
    document.documentElement.classList.add('md-bloqueo');
    const q = s => edEl.querySelector(s);
    q('[data-x]').onclick = cerrarEditor;

    function pintarLista() {
      q('#ed-lista').innerHTML = tpl.campos.map((c, i) =>
        '<div class="md-ed-f' + (i === sel ? ' activa' : '') + '" data-i="' + i + '"><input data-k="etiqueta" value="' + esc(c.etiqueta) + '" aria-label="Nombre de la casilla">' +
        (c.x !== undefined ? '<input data-k="w" type="number" min="2" max="100" step="0.5" value="' + (+c.w).toFixed(1) + '" title="Ancho %" aria-label="Ancho %"><input data-k="h" type="number" min="1" max="100" step="0.5" value="' + (+c.h).toFixed(1) + '" title="Alto %" aria-label="Alto %">' : '<small>marcas</small>') +
        '<button type="button" data-del aria-label="Quitar casilla">✕</button></div>').join('') || '<small>Sin casillas</small>';
    }
    function montar() {
      if (ctl) ctl.destruir();
      const t = Object.assign({}, tpl, { imagen: nuevaImagen || tpl.imagen });
      ctl = montarLienzo(q('#md-stage-e'), t, () => '', { alListo: dibujarCajas });
    }
    function dibujarCajas() {
      const capa = q('.md-capa'); if (!capa) return;
      capa.querySelectorAll('.md-chip,.md-marca').forEach(n => n.remove());
      const lienzo = q('.md-lienzo');
      tpl.campos.forEach((c, i) => {
        if (c.x === undefined) return;
        const b = el('div', 'md-chip md-ed-chip' + (i === sel ? ' activo' : ''));
        b.style.cssText = 'left:' + c.x + '%;top:' + c.y + '%;width:' + c.w + '%;height:' + c.h + '%;font-size:1.4cqw';
        b.innerHTML = '<span class="md-chip-t">' + (i + 1) + '. ' + esc(c.corto || c.etiqueta) + '</span><i class="md-asa" aria-label="Cambiar tamaño"></i>';
        capa.appendChild(b);
        let modo = null, o = null;
        b.addEventListener('pointerdown', e => {
          e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId);
          sel = i; modo = e.target.classList.contains('md-asa') ? 'tam' : 'mov';
          const r = lienzo.getBoundingClientRect(); o = { r, px: e.clientX, py: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h };
          pintarLista();
        });
        b.addEventListener('pointermove', e => {
          if (!modo) return;
          const dx = (e.clientX - o.px) / o.r.width * 100, dy = (e.clientY - o.py) / o.r.height * 100;
          if (modo === 'mov') { c.x = +clamp(o.x + dx, 0, 100 - c.w).toFixed(2); c.y = +clamp(o.y + dy, 0, 100 - c.h).toFixed(2); }
          else { c.w = +clamp(o.w + dx, 2, 100 - c.x).toFixed(2); c.h = +clamp(o.h + dy, 1, 100 - c.y).toFixed(2); }
          b.style.left = c.x + '%'; b.style.top = c.y + '%'; b.style.width = c.w + '%'; b.style.height = c.h + '%';
        });
        b.addEventListener('pointerup', () => { modo = null; pintarLista(); });
      });
    }
    pintarLista(); montar();
    q('#ed-lista').addEventListener('input', e => {
      const f = e.target.closest('.md-ed-f'); if (!f) return; const c = tpl.campos[+f.dataset.i]; const k = e.target.dataset.k;
      c[k] = k === 'etiqueta' ? e.target.value : (+e.target.value || c[k]);
      if (k === 'etiqueta') c.corto = String(c.etiqueta).split(' (')[0];
      dibujarCajas();
    });
    q('#ed-lista').addEventListener('click', e => {
      const f = e.target.closest('.md-ed-f'); if (!f) return; const i = +f.dataset.i;
      if (e.target.closest('[data-del]')) { tpl.campos.splice(i, 1); sel = 0; } else sel = i;
      pintarLista(); dibujarCajas();
    });
    q('#ed-add').onclick = () => {
      tpl.campos.push(normCampo({ id: 'c' + Date.now().toString(36), etiqueta: 'Medida ' + (tpl.campos.length + 1), x: 40, y: 40, w: 14, h: 5, tipo: 'num' }, tpl.campos.length));
      sel = tpl.campos.length - 1; pintarLista(); dibujarCajas();
    };
    q('#ed-tipo').onchange = e => { const t = buscarTpl(catalogo, e.target.value); if (t) { tpl = clone(t); nuevaImagen = null; sel = 0; pintarLista(); montar(); } };
    q('#ed-img').onclick = () => q('#ed-file').click();
    q('#ed-file').onchange = async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      nuevaImagen = await reducirImagen(f, 1600); montar();
    };
    q('#ed-orig').onclick = async () => {
      if (!tpl.remoteId) { toast('Esta hoja ya es la original', 'info'); return; }
      if (!confirm('¿Volver a la hoja original de «' + tpl.nombre + '»? Se borra la versión personalizada.')) return;
      try { const { error } = await supa().from(T_PLANTILLAS).delete().eq('id', tpl.remoteId); if (error) throw error; cacheCat = null; toast('Hoja original restaurada', 'success'); cerrarEditor(); if (estado && root && !root.hidden) { estado.catalogo = await cargarCatalogo(true); elegirTpl(tpl.key || tpl.uid); } }
      catch (err) { toast('No se pudo restaurar: ' + (err.message || err), 'error'); }
    };
    q('#ed-save').onclick = async () => {
      const b = q('#ed-save'); b.disabled = true;
      try {
        let url = tpl.imagen;
        if (nuevaImagen) url = (await subirFoto(nuevaImagen)) || nuevaImagen;
        const fila = { nombre: 'Hoja de medidas — ' + tpl.nombre, tipopuerta: tpl.nombre, descripcion: 'Hoja de toma de medidas', campos: tpl.campos, imagenurl: url, createdby: (window.authState && window.authState.user && window.authState.user.id) || null };
        const db = supa();
        if (tpl.remoteId) { const { error } = await db.from(T_PLANTILLAS).update(Object.assign({}, fila, { updatedat: new Date().toISOString() })).eq('id', tpl.remoteId); if (error) throw error; }
        else { const { error } = await db.from(T_PLANTILLAS).insert(fila); if (error) throw error; }
        cacheCat = null; toast('✅ Hoja guardada para «' + tpl.nombre + '»', 'success');
        cerrarEditor();
        if (onGuardar) onGuardar(fila);
        else if (estado && root && !root.hidden) { estado.catalogo = await cargarCatalogo(true); const keep = estado.valores; elegirTpl(tpl.key || tpl.uid); }
      } catch (err) { toast('Error al guardar: ' + (err.message || err), 'error'); b.disabled = false; }
    };
  }
  function cerrarEditor() {
    if (!edEl) return false;
    edEl.remove(); edEl = null;
    if (!root || root.hidden) document.documentElement.classList.remove('md-bloqueo');
    return true;
  }
  function editarActual() {
    if (!estado || !estado.tpl) { toast('Elige primero el tipo de puerta', 'error'); return; }
    abrirEditor(estado.tpl);
  }
  function reducirImagen(file, max) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = rej;
      r.onload = () => {
        const im = new Image();
        im.onerror = rej;
        im.onload = () => {
          const k = Math.min(1, max / im.width), cv = document.createElement('canvas');
          cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, cv.width, cv.height);
          res(cv.toDataURL('image/webp', 0.82));
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ───────────── Registro de mediciones (administración) ───────────── */
  async function leerMediciones() {
    try {
      const { data, error } = await supa().from(T_MEDICIONES).select('*').order('createdat', { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []).map(r => ({ id: r.id, plantillaNombre: r.plantillanombre, clienteNombre: r.clientenombre, tecnicoNombre: r.tecniconombre,
        fecha: r.fecha, valores: r.valores || {}, notas: r.notas || '', fotos: r.fotos || [], estado: r.estado || 'pendiente' }));
    } catch (e) { return []; }
  }
  async function registro() {
    await cargarCatalogo().catch(() => { });
    const salida = window.MedicionesOutbox.list();
    const pend = salida.filter(i => i.estado !== 'fallida'), falladas = salida.filter(i => i.estado === 'fallida');
    const lista = await leerMediciones();
    const puedeBorrar = esAdmin();
    const badge = e => e === 'pendiente' ? '<span class="badge badge-orange">Pendiente</span>' : e === 'presupuestado' ? '<span class="badge badge-green">Presupuestado</span>' : '<span class="badge badge-gray">Cancelada</span>';
    const tarjeta = mm => {
      const r = resumen({ plantillaNombre: mm.plantillaNombre, valores: mm.valores });
      return '<div class="md-reg"><div class="md-reg-h"><div><strong>' + esc(mm.plantillaNombre || 'Medición') + '</strong>' +
        '<div class="md-reg-s">' + esc(mm.clienteNombre || 'Sin cliente') + ' · ' + esc(mm.fecha || '') + ' · ' + esc(mm.tecnicoNombre || '—') + '</div></div>' + badge(mm.estado) + '</div>' +
        '<div class="md-reg-v">' + r.map(x => '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div>' +
        (mm.notas ? '<div class="md-reg-n"><i class="fas fa-comment-dots"></i> ' + esc(mm.notas) + '</div>' : '') +
        ((mm.fotos || []).length ? '<div class="md-reg-f">' + mm.fotos.map(f => '<img src="' + esc(f) + '" alt="Foto de la obra" loading="lazy" class="inc-foto">').join('') + '</div>' : '') +
        '<div class="md-reg-a"><button class="btn btn-outline btn-sm" onclick="MEDICIONES._pdf(\'' + esc(mm.id) + '\')"><i class="fas fa-file-pdf"></i> PDF</button>' +
        (mm.estado === 'pendiente' ? '<button class="btn btn-primary btn-sm" onclick="MEDICIONES._marcar(\'' + esc(mm.id) + '\',\'presupuestado\')"><i class="fas fa-check"></i> Presupuestado</button>' +
          '<button class="btn btn-outline btn-sm" onclick="MEDICIONES._marcar(\'' + esc(mm.id) + '\',\'cancelado\')"><i class="fas fa-ban"></i> Cancelar</button>' : '') +
        (puedeBorrar ? '<button class="btn btn-danger btn-sm" onclick="MEDICIONES._borrar(\'' + esc(mm.id) + '\')"><i class="fas fa-trash"></i> Eliminar</button>' : '') + '</div></div>';
    };
    const avisoPend = pend.length ? '<div class="md-reg-aviso"><i class="fas fa-cloud-arrow-up"></i> ' + pend.length + ' medición(es) guardada(s) en este móvil esperando señal. <button class="btn btn-outline btn-sm" onclick="MEDICIONES._sync()">Enviar ahora</button></div>' : '';
    const avisoFalladas = falladas.length ? '<div class="md-reg-aviso" style="border-color:var(--danger,#dc2626)"><div><i class="fas fa-triangle-exclamation"></i> <strong>' + falladas.length + ' medición(es) sin enviar</strong> (el servidor las rechazó). Siguen guardadas en este móvil:</div>' +
      falladas.map(f => '<div style="margin-top:8px"><strong>' + esc(f.fila.plantillanombre || 'Medición') + '</strong> · ' + esc(f.fila.clientenombre || 'Sin cliente') + ' · ' + esc(f.fila.fecha || '') +
        '<div style="font-size:12px;opacity:.8">' + esc(f.error || 'Error desconocido') + '</div>' +
        '<button class="btn btn-outline btn-sm" onclick="MEDICIONES._reintentar(\'' + esc(f.idLocal) + '\')">Reintentar</button> ' +
        '<button class="btn btn-danger btn-sm" onclick="MEDICIONES._descartar(\'' + esc(f.idLocal) + '\')">Eliminar</button></div>').join('') + '</div>' : '';
    const cuerpo = avisoFalladas + avisoPend + (lista.length ? lista.map(tarjeta).join('') : '<div class="md-reg-vacio"><i class="fas fa-inbox"></i>No hay mediciones todavía.</div>');
    window.openModal('📋 Mediciones' + (lista.length ? ' (' + lista.length + ')' : ''), cuerpo,
      '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>' +
      (puedeBorrar && lista.length ? '<button class="btn btn-danger" onclick="MEDICIONES._borrarTodas()"><i class="fas fa-trash"></i> Eliminar todas</button>' : ''));
    window.refrescarMediciones = registro;
  }
  const esAdmin = () => !!(window.isAdmin && window.isAdmin());

  // Las fotos viven en el bucket; se intenta quitarlas también (si no hay permiso sobre alguna, se ignora)
  async function quitarFotos(mediciones) {
    const rutas = [];
    mediciones.forEach(m => (m.fotos || []).forEach(u => {
      const i = String(u).indexOf('/' + BUCKET + '/');
      if (i >= 0) rutas.push(decodeURIComponent(String(u).slice(i + BUCKET.length + 2).split('?')[0]));
    }));
    if (!rutas.length || !window.supabaseDB) return;
    try { await window.supabaseDB.storage.from(BUCKET).remove(rutas); } catch (e) { }
  }
  async function borrar(id) {
    if (!esAdmin()) { toast('Solo administración puede eliminar mediciones', 'error'); return; }
    if (!window.confirm('¿Eliminar esta medición? No se puede deshacer.')) return;
    try {
      const mm = (await leerMediciones()).find(x => String(x.id) === String(id));
      const { data, error } = await supa().from(T_MEDICIONES).delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('no se pudo eliminar (sin permiso)');
      if (mm) await quitarFotos([mm]);
      toast('Medición eliminada', 'success'); registro();
    } catch (e) { toast('Error al eliminar: ' + (e.message || e), 'error'); }
  }
  async function borrarTodas() {
    if (!esAdmin()) { toast('Solo administración puede eliminar mediciones', 'error'); return; }
    const lista = await leerMediciones();
    if (!lista.length) { toast('No hay mediciones', 'info'); return; }
    if (!window.confirm('¿Eliminar TODAS las mediciones (' + lista.length + ')? No se puede deshacer.')) return;
    try {
      const { data, error } = await supa().from(T_MEDICIONES).delete().not('id', 'is', null).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('no se pudo eliminar (sin permiso)');
      await quitarFotos(lista);
      toast(data.length + ' medición(es) eliminada(s)', 'success'); registro();
    } catch (e) { toast('Error al eliminar: ' + (e.message || e), 'error'); }
  }
  async function marcar(id, est) {
    try { const { error } = await supa().from(T_MEDICIONES).update({ estado: est, updatedat: new Date().toISOString() }).eq('id', id); if (error) throw error; toast('Actualizada', 'success'); registro(); }
    catch (e) { toast('Error: ' + (e.message || e), 'error'); }
  }
  async function pdfMedicion(id) {
    const mm = (await leerMediciones()).find(x => String(x.id) === String(id)); if (!mm) return;
    try {
      await window.ensurePdfLibs();
      const img = await renderizar({ plantillaNombre: mm.plantillaNombre, valores: mm.valores }, 1600);
      const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFontSize(15); doc.text('Hoja de medidas — ' + (mm.plantillaNombre || ''), 14, 15);
      doc.setFontSize(9); doc.text('Cliente: ' + (mm.clienteNombre || '—') + '   ·   Fecha: ' + (mm.fecha || '—') + '   ·   Técnico: ' + (mm.tecnicoNombre || '—'), 14, 21);
      const p = doc.getImageProperties(img), k = Math.min(182 / p.width, 230 / p.height);
      doc.addImage(img, 'JPEG', 14 + (182 - p.width * k) / 2, 26, p.width * k, p.height * k, undefined, 'FAST');
      if (mm.notas) doc.text(doc.splitTextToSize('Notas: ' + mm.notas, 182), 14, 26 + p.height * k + 6);
      doc.save('medidas_' + String(mm.clienteNombre || 'sin_cliente').replace(/\s+/g, '_') + '_' + (mm.fecha || '') + '.pdf');
    } catch (e) { toast('No se pudo crear el PDF: ' + (e.message || e), 'error'); }
  }

  // Cierra lo que esté abierto (botón Atrás / Esc de la app)
  function cerrarSuperior() {
    if (cerrarEditor()) return true;
    if (cerrarVista()) return true;
    if (root && !root.hidden) { if (root.classList.contains('datos-abierto')) root.classList.remove('datos-abierto'); else cerrar(); return true; }
    return false;
  }

  /* ───────────── API pública ───────────── */
  const PLANTILLAS_INCLUIDAS = {};
  Object.entries(BASE()).forEach(([k, p]) => { PLANTILLAS_INCLUIDAS[p.nombre] = { imagenUrl: p.imagen, campos: p.campos }; });

  window.MEDICIONES = {
    abrir, cerrar, registro, cerrarSuperior,
    listarPlantillas: async f => (await cargarCatalogo(f)),
    _marcar: marcar, _pdf: pdfMedicion, _borrar: borrar, _borrarTodas: borrarTodas, _sync: async () => { const r = await window.MedicionesOutbox.run(); if (!r.sent && !r.failed) toast('No hay nada que se pueda enviar ahora (sin conexión o sin sesión)', 'info'); registro(); },
    _reintentar: async id => { window.MedicionesOutbox.retry(id); await window.MedicionesOutbox.run(); registro(); },
    _descartar: id => window.confirmDelete('esta medición sin enviar', async () => { await window.MedicionesOutbox.discard(id); registro(); })
  };
  window.HOJA_MEDIDAS = {
    abrirVista, abrirEditor, renderizar, resumen,
    cerrar: cerrar,
    // Compatibilidad: abrir la hoja de un tipo de puerta con valores previos
    abrirHoja: (tipo, _id, previos, onGuardar) => abrir({ plantillaId: tipo, valoresPrevios: previos, onGuardar }),
    cargarPlantillaDeTipo: async tipo => buscarTpl(await cargarCatalogo(), tipo),
    PLANTILLAS_INCLUIDAS
  };
  window.PLANTILLAS_MEDIDAS = { cerrar: cerrarSuperior };   // compatibilidad con app.js antiguo
})();
