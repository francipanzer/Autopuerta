/* ═══════════════════════════════════════════════════════════════════════════
   ARTÍCULOS DE SAGE 50 ⇄ ALMACÉN
   · Clave común: código de Sage (almacen.sagecodigo). Reimportar es seguro: se compara y solo se
     cambia lo que difiere (no duplica nunca).
   · Sage → app: datos del artículo (y existencias / precios si el informe los trae).
   · app → Sage: movimientos de stock pendientes de enviar (libro almacen_movimientos).
   Carga diferida (ver LAZY_SCRIPTS en index.html).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const norm = s => String(s ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
  // Los códigos de Sage distinguen mayúsculas: «ni000062» y «NI000062» son dos artículos distintos en tu informe
  const clave = s => String(s ?? '').trim();
  const vacio = v => v === undefined || v === null || String(v).trim() === '';

  // Cabeceras admitidas (ya normalizadas: minúsculas, sin acentos)
  const COLUMNAS = {
    codigo:         ['codigo', 'codigo articulo', 'cod articulo', 'referencia'],
    nombre:         ['nombre', 'nombre articulo', 'descripcion', 'descripcion articulo'],
    marca:          ['marca'],
    nombreMarca:    ['nombre marca'],
    codFamilia:     ['familia', 'codigo familia'],
    familia:        ['nombre familia'],
    subfamilia:     ['subfamilia', 'codigo subfamilia'],
    nombreSubfamilia: ['nombre subfamilia'],
    codigoAlt:      ['codigo alternativo', 'codigo de barras', 'codigo barras', 'ean'],
    localizacion:   ['localizacion', 'ubicacion'],
    descripcion:    ['ampliacion definicion', 'ampliacion de definicion', 'ampliacion', 'definicion'],
    observaciones:  ['observaciones'],
    tipoArticulo:   ['tipo articulo'],
    baja:           ['baja'],
    fechaBaja:      ['fecha baja'],
    // Opcionales: no vienen en el informe básico, pero si los añades en Sage se importan
    stock:          ['existencias', 'existencias actuales', 'stock', 'stock actual', 'unidades'],
    stockMinimo:    ['stock minimo', 'existencias minimas', 'minimo'],
    precioVenta:    ['pvp', 'precio venta', 'precio de venta', 'precio venta 1'],
    precioCompra:   ['precio compra', 'precio de compra', 'precio coste', 'precio de coste', 'coste', 'precio medio', 'ultimo precio compra'],
    proveedor:      ['proveedor', 'proveedor habitual', 'nombre proveedor'],
    unidad:         ['unidad', 'unidad medida', 'unidad de medida']
  };
  const CAMPOS_SAGEDATOS = ['marca', 'nombreMarca', 'subfamilia', 'nombreSubfamilia', 'observaciones', 'tipoArticulo'];
  const NOMBRE_GENERICO = /^art[ií]culo importado$/i;
  const SERVICIO_FAMILIA = /mano de obra|seguro|suministro/i;
  const SERVICIO_NOMBRE = /^(alquiler|desplazamiento|mano de obra|cuota)\b/i;

  // ── Conversión de valores de celda ─────────────────────────────────────────
  const esFecha = v => Object.prototype.toString.call(v) === '[object Date]';
  function aTexto(v) {
    if (esFecha(v)) return aFechaISO(v) || '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v ?? '').replace(/\r\n?/g, '\n').trim();
  }
  function aNumero(v) {
    if (vacio(v)) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[€\s]/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function aBool(v) {
    if (typeof v === 'boolean') return v;
    return /^(true|verdadero|si|sí|s|1|x)$/i.test(String(v ?? '').trim());
  }
  function aFechaISO(v) {
    if (esFecha(v) && !isNaN(v)) {
      const p = n => String(n).padStart(2, '0');
      return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
    }
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    return null;
  }

  // ── 1) Filas del archivo → artículos normalizados ──────────────────────────
  // opts.nombreDeAmpliacion: si el nombre es «ARTÍCULO IMPORTADO», usa la 1.ª línea de la ampliación
  function parseFilas(rows, opts) {
    opts = Object.assign({ nombreDeAmpliacion: true }, opts);
    if (!rows || rows.length < 2) throw new Error('El archivo está vacío.');
    const headers = rows[0].map(norm);
    const idx = {};
    Object.entries(COLUMNAS).forEach(([campo, alias]) => { idx[campo] = headers.findIndex(h => alias.includes(h)); });
    if (idx.codigo < 0) throw new Error('No encuentro la columna «Código». Cabeceras: ' + (rows[0].join(', ') || '(ninguna)'));
    if (idx.nombre < 0) throw new Error('No encuentro la columna «Nombre». Cabeceras: ' + (rows[0].join(', ') || '(ninguna)'));
    const usadas = new Set(Object.values(idx).filter(i => i >= 0));
    const ignoradas = rows[0].filter((h, i) => String(h || '').trim() && !usadas.has(i));
    const dato = (r, campo) => (idx[campo] >= 0 ? r[idx[campo]] : undefined);

    const avisos = [];
    const porCodigo = new Map();
    let sinCodigo = 0, nombresDeAmpliacion = 0, servicios = 0;
    rows.slice(1).forEach((r, i) => {
      if (!r || !r.some(c => !vacio(c))) return;
      const codigo = aTexto(dato(r, 'codigo'));
      if (!codigo) { sinCodigo++; return; }
      const nombreOrig = aTexto(dato(r, 'nombre')).replace(/\s+/g, ' ');
      const ampliacion = aTexto(dato(r, 'descripcion'));
      let nombre = nombreOrig, descripcion = ampliacion, deAmpliacion = false;
      if ((NOMBRE_GENERICO.test(nombreOrig) || !nombreOrig) && ampliacion && opts.nombreDeAmpliacion) {
        nombre = ampliacion.split('\n').map(l => l.trim()).find(Boolean).replace(/\s+/g, ' ').slice(0, 120);
        deAmpliacion = true; nombresDeAmpliacion++;
      }
      if (!nombre) nombre = codigo;
      if (descripcion.replace(/\s+/g, ' ') === nombre) descripcion = '';
      const familia = aTexto(dato(r, 'familia')), codFamilia = aTexto(dato(r, 'codFamilia'));
      const sageDatos = {};
      CAMPOS_SAGEDATOS.forEach(c => { const t = aTexto(dato(r, c)); if (t) sageDatos[c] = t; });
      const baja = aBool(dato(r, 'baja'));
      const esServicio = SERVICIO_FAMILIA.test(familia) || SERVICIO_NOMBRE.test(nombre);
      if (esServicio) servicios++;
      const fila = {
        sageCodigo: codigo, nombre, descripcion, familia, codFamilia,
        codigoAlt: aTexto(dato(r, 'codigoAlt')), localizacion: aTexto(dato(r, 'localizacion')),
        baja, fechaBaja: baja ? aFechaISO(dato(r, 'fechaBaja')) : null,
        sageDatos: Object.keys(sageDatos).length ? sageDatos : null,
        controlStock: !esServicio, nombreDeAmpliacion: deAmpliacion
      };
      ['stock', 'stockMinimo', 'precioVenta', 'precioCompra'].forEach(c => { const n = aNumero(dato(r, c)); if (n !== null) fila[c] = n; });
      ['proveedor', 'unidad'].forEach(c => { const t = aTexto(dato(r, c)); if (t) fila[c] = t; });
      if (porCodigo.has(clave(codigo))) avisos.push('Código repetido en el archivo: ' + codigo + ' (se usa la última fila).');
      porCodigo.set(clave(codigo), fila);
    });
    const filas = [...porCodigo.values()];
    if (!filas.length) throw new Error('No hay ninguna fila con código.');
    if (sinCodigo) avisos.push(sinCodigo + ' fila(s) sin código se han omitido.');
    return {
      filas, avisos, ignoradas,
      columnas: { stock: idx.stock >= 0, precios: idx.precioVenta >= 0 || idx.precioCompra >= 0, proveedor: idx.proveedor >= 0, unidad: idx.unidad >= 0, stockMinimo: idx.stockMinimo >= 0 },
      nombresDeAmpliacion, servicios
    };
  }

  // ── 2) Comparar con el almacén y decidir qué hacer con cada artículo ───────
  const SYNC = ['nombre', 'descripcion', 'familia', 'codFamilia', 'codigoAlt', 'localizacion', 'baja', 'fechaBaja'];
  const iguales = (a, b) => {
    if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
    if (typeof a === 'number' || typeof b === 'number') return Number(a ?? 0) === Number(b ?? 0);
    return String(a ?? '').trim() === String(b ?? '').trim();
  };
  const slug = c => 'ART-' + String(c).trim().replace(/[^A-Za-z0-9_-]+/g, '_');

  // existentes: artículos de la app · pendientes: Map(articuloId → suma de movimientos sin enviar a Sage)
  function planificar(filas, existentes, opts) {
    opts = Object.assign({ aplicarStock: true, aplicarPrecios: true, omitirBajasNuevas: true, vincularPorNombre: true, ahora: new Date().toISOString() }, opts);
    const pendientes = opts.pendientes || new Map();
    const porCodigo = new Map(), porRef = new Map();
    existentes.forEach(a => {
      if (!vacio(a.sageCodigo)) porCodigo.set(clave(a.sageCodigo), a);
      if (!vacio(a.referencia)) porRef.set(clave(a.referencia), a);
    });
    const libres = existentes.filter(a => vacio(a.sageCodigo));
    const nombresLibres = new Map();
    libres.forEach(a => { const k = norm(a.nombre); nombresLibres.set(k, (nombresLibres.get(k) || 0) + 1); });
    const nombresSage = new Map();
    filas.forEach(f => { const k = norm(f.nombre); nombresSage.set(k, (nombresSage.get(k) || 0) + 1); });
    const idsUsados = new Set(existentes.map(a => String(a.id)));
    const vinculados = new Set();

    const plan = { nuevos: [], cambios: [], iguales: 0, bajasOmitidas: 0, vinculados: [], ausentes: [], avisos: [] };
    filas.forEach(f => {
      let art = porCodigo.get(clave(f.sageCodigo)) || null;
      let via = art ? 'codigo' : '';
      if (!art) {
        const r = porRef.get(clave(f.sageCodigo));
        if (r && !vinculados.has(String(r.id)) && vacio(r.sageCodigo)) { art = r; via = 'referencia'; }
      }
      if (!art && opts.vincularPorNombre && !NOMBRE_GENERICO.test(f.nombre) && nombresSage.get(norm(f.nombre)) === 1) {
        const cand = libres.find(a => !vinculados.has(String(a.id)) && norm(a.nombre) === norm(f.nombre));
        if (cand && nombresLibres.get(norm(f.nombre)) === 1) { art = cand; via = 'nombre'; }
      }
      if (!art) {
        if (f.baja && opts.omitirBajasNuevas) { plan.bajasOmitidas++; return; }
        let id = slug(f.sageCodigo); for (let n = 2; idsUsados.has(id); n++) id = slug(f.sageCodigo) + '-' + n;
        idsUsados.add(id);
        const con = opts.aplicarStock && f.stock !== undefined;
        const nuevo = {
          id, referencia: f.sageCodigo, sageCodigo: f.sageCodigo, nombre: f.nombre, descripcion: f.descripcion || null,
          familia: f.familia || null, codFamilia: f.codFamilia || null, codigoAlt: f.codigoAlt || null, localizacion: f.localizacion || null,
          baja: f.baja, fechaBaja: f.fechaBaja, controlStock: f.controlStock, sageDatos: f.sageDatos,
          unidad: f.unidad || 'unidad', proveedor: f.proveedor || '', categoria: '',
          stock: f.controlStock && con ? f.stock : 0, stockMinimo: f.stockMinimo ?? 0,
          precioCompra: opts.aplicarPrecios ? (f.precioCompra ?? 0) : 0, precioVenta: opts.aplicarPrecios ? (f.precioVenta ?? 0) : 0
        };
        if (f.controlStock && con) { nuevo.sageStock = f.stock; nuevo.sageSyncAt = opts.ahora; }
        plan.nuevos.push(nuevo);
        return;
      }
      vinculados.add(String(art.id));
      const patch = {}, campos = [];
      const poner = (k, v) => { patch[k] = v; campos.push(k); };
      if (via !== 'codigo') { poner('sageCodigo', f.sageCodigo); if (vacio(art.referencia)) poner('referencia', f.sageCodigo); plan.vinculados.push({ id: art.id, nombre: art.nombre, codigo: f.sageCodigo, via }); }
      SYNC.forEach(k => {
        const nuevoVal = (k === 'baja') ? f.baja : (k === 'fechaBaja') ? f.fechaBaja : f[k];
        // un dato vacío en Sage no borra lo que se haya escrito en la app
        if (['descripcion', 'familia', 'codFamilia', 'codigoAlt', 'localizacion'].includes(k) && vacio(nuevoVal)) return;
        if (!iguales(art[k], nuevoVal)) poner(k, nuevoVal === '' ? null : nuevoVal);
      });
      if (JSON.stringify(art.sageDatos || null) !== JSON.stringify(f.sageDatos || null) && f.sageDatos) poner('sageDatos', f.sageDatos);
      const sinControl = art.controlStock === false || (art.controlStock == null && !f.controlStock);
      if (art.controlStock == null && !f.controlStock) poner('controlStock', false);
      if (opts.aplicarPrecios) {
        ['precioVenta', 'precioCompra'].forEach(k => { if (f[k] !== undefined && !iguales(art[k], f[k])) poner(k, f[k]); });
        ['proveedor', 'unidad'].forEach(k => { if (f[k] && !iguales(art[k], f[k])) poner(k, f[k]); });
        if (f.stockMinimo !== undefined && !iguales(art.stockMinimo, f.stockMinimo)) poner('stockMinimo', f.stockMinimo);
      }
      if (opts.aplicarStock && f.stock !== undefined && !sinControl) {
        const nuevoStock = f.stock + (pendientes.get(String(art.id)) || 0);
        if (!iguales(art.stock, nuevoStock) || !iguales(art.sageStock, f.stock)) {
          poner('stock', nuevoStock); poner('sageStock', f.stock); poner('sageSyncAt', opts.ahora);
        }
      }
      if (campos.length) plan.cambios.push({ id: art.id, nombre: art.nombre, codigo: f.sageCodigo, campos, patch, via });
      else plan.iguales++;
    });
    const enSage = new Set(filas.map(f => clave(f.sageCodigo)));
    plan.ausentes = existentes.filter(a => !vacio(a.sageCodigo) && !enSage.has(clave(a.sageCodigo)) && !a.baja)
      .map(a => ({ id: a.id, nombre: a.nombre, codigo: a.sageCodigo }));
    return plan;
  }

  // ── 3) Escritura en Supabase ───────────────────────────────────────────────
  const COL = {
    stockMinimo: 'stockminimo', precioCompra: 'preciocompra', precioVenta: 'precioventa', sageCodigo: 'sagecodigo',
    codigoAlt: 'codigoalt', codFamilia: 'codfamilia', fechaBaja: 'fechabaja', controlStock: 'controlstock',
    sageStock: 'sagestock', sageSyncAt: 'sagesyncat', sageDatos: 'sagedatos'
  };
  const aColumnas = obj => {
    const o = {};
    Object.entries(obj).forEach(([k, v]) => { o[COL[k] || k] = v === undefined ? null : v; });
    o.updatedat = new Date().toISOString();
    return o;
  };

  async function enLotes(items, tamano, fn) {
    for (let i = 0; i < items.length; i += tamano) await fn(items.slice(i, i + tamano), i);
  }
  async function conConcurrencia(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; await fn(items[k], k); }
    }));
  }

  async function ejecutarPlan(plan, sb, alAvanzar) {
    const total = plan.nuevos.length + plan.cambios.length;
    let hecho = 0;
    const avanzar = n => { hecho += n; if (alAvanzar) alAvanzar(hecho, total); };
    await enLotes(plan.nuevos, 200, async lote => {
      const { error } = await sb.from('almacen').insert(lote.map(aColumnas));
      if (error) throw error;
      avanzar(lote.length);
    });
    const errores = [];
    await conConcurrencia(plan.cambios, 6, async c => {
      const { error } = await sb.from('almacen').update(aColumnas(c.patch)).eq('id', c.id);
      if (error) errores.push(c.codigo + ': ' + error.message);
      avanzar(1);
    });
    if (window.db?.cacheInvalidate) await window.db.cacheInvalidate('almacen').catch(() => {});
    return { creados: plan.nuevos.length, actualizados: plan.cambios.length - errores.length, errores };
  }

  async function leerPendientes(sb) {
    const mapa = new Map(); let desde = 0, ok = true;
    for (;;) {
      const { data, error } = await sb.from('almacen_movimientos').select('articuloid,delta').eq('exportadosage', false).range(desde, desde + 999);
      if (error) { ok = false; break; }
      (data || []).forEach(m => mapa.set(String(m.articuloid), (mapa.get(String(m.articuloid)) || 0) + Number(m.delta || 0)));
      if (!data || data.length < 1000) break;
      desde += 1000;
    }
    return { mapa, ok };
  }

  // ── 4) app → Sage: movimientos pendientes ──────────────────────────────────
  function construirExportacion(articulos, movimientos) {
    const porId = new Map(articulos.map(a => [String(a.id), a]));
    const neto = new Map();
    movimientos.forEach(m => {
      const k = String(m.articuloid);
      const e = neto.get(k) || { delta: 0, ultimo: '', n: 0 };
      e.delta += Number(m.delta || 0); e.n++; if (String(m.createdat) > e.ultimo) e.ultimo = String(m.createdat);
      neto.set(k, e);
    });
    const movs = [], sinCodigo = [];
    neto.forEach((e, id) => {
      const a = porId.get(id) || {};
      const fila = { codigo: a.sageCodigo || '', nombre: a.nombre || '(artículo borrado) ' + id, cantidad: Math.round(e.delta * 1000) / 1000, movimientos: e.n, ultimo: e.ultimo.slice(0, 10) };
      if (e.delta === 0) return;
      (fila.codigo ? movs : sinCodigo).push(fila);
    });
    const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    movs.sort(orden); sinCodigo.sort(orden);
    const existencias = articulos.filter(a => a.sageCodigo && a.controlStock !== false && !a.baja)
      .map(a => ({ codigo: a.sageCodigo, nombre: a.nombre, stockApp: Number(a.stock) || 0, stockSage: a.sageStock ?? null }))
      .sort(orden);
    return { movs, sinCodigo, existencias, ids: movimientos.map(m => m.id) };
  }

  // ── Archivo ────────────────────────────────────────────────────────────────
  async function asegurarSheetJS() {
    if (window.XLSX) return;
    if (typeof window.__ensureSheetJS === 'function') { await window.__ensureSheetJS(); return; }
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel (¿sin conexión?)'));
      document.head.appendChild(s);
    });
  }
  async function leerArchivo(file) {
    await asegurarSheetJS();
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.csv$/i.test(file.name)) {
      let texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
      wb = XLSX.read(texto, { type: 'string', cellDates: true });
    } else {
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    }
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  }

  window.AlmacenSage = { norm, parseFilas, planificar, ejecutarPlan, leerPendientes, construirExportacion, leerArchivo, aNumero, aFechaISO };

  // ═══ Interfaz ═══════════════════════════════════════════════════════════════
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const campoEtiqueta = { nombre: 'nombre', descripcion: 'descripción', familia: 'familia', codFamilia: 'cód. familia', codigoAlt: 'cód. alternativo', localizacion: 'localización', baja: 'baja', fechaBaja: 'fecha baja', stock: 'stock', sageCodigo: 'código Sage', precioVenta: 'P. venta', precioCompra: 'P. compra', proveedor: 'proveedor', unidad: 'unidad', stockMinimo: 'mínimo', sageDatos: 'datos Sage', referencia: 'referencia', controlStock: 'control stock' };
  let est = null;

  window.showImportArticulosSage = function () {
    est = { parsed: null, existentes: [], pendientes: new Map(), pendOk: true, plan: null };
    openModal('Importar artículos de Sage 50',
      '<p style="color:var(--text-muted);margin-bottom:12px">Sube el informe de artículos de Sage (<strong>.xlsx / .xls / .csv</strong>). El <strong>Código</strong> es la clave común: los artículos que ya existan se actualizan y los nuevos se crean, sin duplicar. Puedes repetirlo cuando quieras.</p>' +
      '<div id="as_drop" style="border:2px dashed var(--border);border-radius:10px;padding:22px;text-align:center;cursor:pointer;background:var(--surface-alt)">' +
        '<input type="file" id="as_file" accept=".xlsx,.xls,.csv" style="display:none"><i class="fas fa-file-excel" style="font-size:28px;color:#16a34a"></i>' +
        '<p style="margin:8px 0 0">Clic o arrastra aquí el archivo</p></div>' +
      '<div id="as_status" style="margin-top:12px;font-size:13px"></div><div id="as_opts"></div><div id="as_preview"></div>',
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="as_go" disabled><i class="fas fa-download"></i> Importar</button>');
    const drop = document.getElementById('as_drop'), fi = document.getElementById('as_file');
    drop.addEventListener('click', () => fi.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; if (e.dataTransfer.files.length) cargar(e.dataTransfer.files[0]); });
    fi.addEventListener('change', () => { if (fi.files.length) cargar(fi.files[0]); });
    document.getElementById('as_go').addEventListener('click', importar);
  };

  async function cargar(file) {
    const status = document.getElementById('as_status');
    status.textContent = '⚙️ Leyendo archivo…';
    try {
      est.rows = await leerArchivo(file);
      est.parsed = parseFilas(est.rows, { nombreDeAmpliacion: true });
      est.existentes = await window.dbGetAll('almacen');
      const pend = await leerPendientes(window.supabaseDB);
      est.pendientes = pend.mapa; est.pendOk = pend.ok;
      status.innerHTML = '✅ <strong>' + esc(file.name) + '</strong> · ' + est.parsed.filas.length + ' artículos';
      pintarOpciones();
      recalcular();
    } catch (e) {
      status.innerHTML = '<span style="color:#dc2626">❌ ' + esc(e.message || e) + '</span>';
    }
  }

  function pintarOpciones() {
    const c = est.parsed.columnas;
    const chk = (id, txt, on, dis) => '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13.5px' + (dis ? ';opacity:.55' : '') + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '> <span>' + txt + '</span></label>';
    document.getElementById('as_opts').innerHTML = '<div style="margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-alt)">' +
      chk('as_nombre', 'Usar la «Ampliación definición» como nombre cuando el nombre es <em>ARTÍCULO IMPORTADO</em>' + (est.parsed.nombresDeAmpliacion ? ' <small>(' + est.parsed.nombresDeAmpliacion + ' artículos)</small>' : ''), true) +
      chk('as_stock', 'Aplicar las <strong>existencias</strong> del archivo (stock = Sage + lo pendiente de enviar a Sage)' + (c.stock ? '' : ' <small>— este informe no trae existencias</small>'), c.stock, !c.stock) +
      chk('as_precios', 'Actualizar <strong>precios, proveedor, unidad y mínimo</strong> con los del archivo' + (c.precios || c.proveedor || c.unidad ? '' : ' <small>— este informe no los trae</small>'), c.precios || c.proveedor || c.unidad, !(c.precios || c.proveedor || c.unidad)) +
      chk('as_bajas', 'No crear artículos que ya estén <strong>de baja</strong> en Sage', true) +
      chk('as_nombrevinc', 'Enlazar con artículos de la app sin código cuando el <strong>nombre</strong> coincide exactamente', true) +
      '</div>';
    ['as_nombre', 'as_stock', 'as_precios', 'as_bajas', 'as_nombrevinc'].forEach(id => document.getElementById(id).addEventListener('change', recalcular));
  }

  function recalcular() {
    const v = id => document.getElementById(id)?.checked;
    est.parsed = parseFilas(est.rows, { nombreDeAmpliacion: v('as_nombre') !== false });
    est.plan = planificar(est.parsed.filas, est.existentes, {
      aplicarStock: !!v('as_stock'), aplicarPrecios: !!v('as_precios'), omitirBajasNuevas: !!v('as_bajas'), vincularPorNombre: !!v('as_nombrevinc'), pendientes: est.pendientes
    });
    const p = est.plan, n = p.nuevos.length + p.cambios.length;
    const card = (num, txt, color) => '<div style="flex:1;min-width:110px;padding:10px;border:1px solid var(--border);border-radius:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:' + color + '">' + num + '</div><small>' + txt + '</small></div>';
    const avisos = [].concat(est.parsed.avisos.slice(0, 5));
    if (!est.pendOk) avisos.push('No se pudo leer el libro de movimientos (¿has ejecutado SUPABASE_ARTICULOS_SAGE.sql?). Las existencias no tendrán en cuenta lo pendiente de enviar.');
    if (est.parsed.ignoradas.length) avisos.push('Columnas no usadas: ' + est.parsed.ignoradas.join(', ') + '.');
    if (p.bajasOmitidas) avisos.push(p.bajasOmitidas + ' artículo(s) de baja no se crean.');
    if (est.parsed.servicios) avisos.push(est.parsed.servicios + ' artículo(s) son servicios (mano de obra, seguros…): se crean sin control de stock.');
    if (p.ausentes.length) avisos.push(p.ausentes.length + ' artículo(s) de la app con código Sage no vienen en este archivo (no se tocan).');
    const filasCambio = p.cambios.slice(0, 12).map(c => '<tr><td>' + esc(c.codigo) + '</td><td>' + esc(c.nombre) + '</td><td>' + esc(c.campos.map(k => campoEtiqueta[k] || k).join(', ')) + '</td></tr>').join('');
    const muestraNuevos = p.nuevos.slice(0, 8).map(a => '<tr><td>' + esc(a.sageCodigo) + '</td><td>' + esc(a.nombre) + '</td><td>' + esc(a.familia || '') + '</td></tr>').join('');
    document.getElementById('as_preview').innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      card(p.nuevos.length, 'nuevos', '#16a34a') + card(p.cambios.length, 'a actualizar', '#2563eb') + card(p.iguales, 'sin cambios', 'var(--text-muted)') + card(p.vinculados.length, 'enlazados a artículos existentes', '#d97706') + '</div>' +
      (avisos.length ? '<ul style="margin:10px 0 0 18px;font-size:12.5px;color:var(--text-muted)">' + avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '') +
      (muestraNuevos ? '<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Ejemplos de artículos nuevos</summary><table style="width:100%;font-size:12.5px;margin-top:6px"><tbody>' + muestraNuevos + '</tbody></table></details>' : '') +
      (filasCambio ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Qué cambia en los existentes</summary><table style="width:100%;font-size:12.5px;margin-top:6px"><tbody>' + filasCambio + '</tbody></table>' + (p.cambios.length > 12 ? '<small>…y ' + (p.cambios.length - 12) + ' más</small>' : '') + '</details>' : '');
    const go = document.getElementById('as_go');
    go.disabled = !n; go.innerHTML = '<i class="fas fa-download"></i> Importar' + (n ? ' (' + n + ')' : '');
  }

  async function importar() {
    if (!est?.plan) return;
    const go = document.getElementById('as_go');
    go.disabled = true;
    try {
      const res = await ejecutarPlan(est.plan, window.supabaseDB, (h, t) => { go.textContent = 'Importando… ' + h + '/' + t; });
      closeModal();
      showToast('Sage: ' + res.creados + ' creados, ' + res.actualizados + ' actualizados' + (res.errores.length ? ', ' + res.errores.length + ' con error' : ''), res.errores.length ? 'warning' : 'success');
      if (res.errores.length) console.warn('[Sage] errores:', res.errores);
      if (typeof window.navigateTo === 'function') window.navigateTo('almacen');
    } catch (e) {
      go.disabled = false; go.innerHTML = '<i class="fas fa-download"></i> Importar';
      showToast('No se pudo importar: ' + (e.message || e), 'error');
    }
  }

  // ── Exportar a Sage ────────────────────────────────────────────────────────
  window.showExportarSage = async function () {
    try {
      await asegurarSheetJS();
      const sb = window.supabaseDB;
      const movimientos = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await sb.from('almacen_movimientos').select('id,articuloid,delta,createdat').eq('exportadosage', false).order('id').range(desde, desde + 999);
        if (error) throw new Error('No se pudo leer el libro de movimientos. ¿Has ejecutado SUPABASE_ARTICULOS_SAGE.sql? (' + error.message + ')');
        movimientos.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const articulos = await window.dbGetAll('almacen');
      const ex = construirExportacion(articulos, movimientos);
      const filas = (arr, cols) => arr.map(r => cols.map(c => c(r)));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Código', 'Nombre', 'Cantidad (+entrada / −salida)', 'Nº movimientos', 'Último movimiento']].concat(filas(ex.movs, [r => r.codigo, r => r.nombre, r => r.cantidad, r => r.movimientos, r => r.ultimo]))), 'Movimientos pendientes');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Código', 'Nombre', 'Stock en la app', 'Último stock de Sage', 'Diferencia']].concat(filas(ex.existencias, [r => r.codigo, r => r.nombre, r => r.stockApp, r => r.stockSage ?? '', r => r.stockSage === null ? '' : r.stockApp - r.stockSage]))), 'Existencias');
      if (ex.sinCodigo.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nombre', 'Cantidad', 'Último movimiento']].concat(filas(ex.sinCodigo, [r => r.nombre, r => r.cantidad, r => r.ultimo]))), 'Sin código Sage');
      const resumen = ex.movs.length + ' artículo(s) con movimientos pendientes' + (ex.sinCodigo.length ? ', ' + ex.sinCodigo.length + ' sin código Sage' : '');
      openModal('Exportar a Sage',
        '<p><strong>' + esc(resumen) + '</strong> (' + movimientos.length + ' movimientos en total).</p>' +
        '<p style="color:var(--text-muted);font-size:13px;margin-top:8px">Se descarga un Excel con tres hojas: movimientos netos por código, existencias de la app frente a Sage y artículos sin código. Úsalo en Sage para regularizar existencias. Cuando lo hayas aplicado, márcalos como enviados para que no vuelvan a salir.</p>',
        '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>' +
        '<button class="btn btn-primary" id="ex_dl"><i class="fas fa-file-excel"></i> Descargar Excel</button>' +
        '<button class="btn btn-secondary" id="ex_mark" ' + (movimientos.length ? '' : 'disabled') + '><i class="fas fa-check"></i> Marcar como enviados</button>');
      document.getElementById('ex_dl').addEventListener('click', () => XLSX.writeFile(wb, 'stock_para_sage_' + new Date().toISOString().slice(0, 10) + '.xlsx'));
      document.getElementById('ex_mark').addEventListener('click', async () => {
        if (!confirm('¿Marcar ' + movimientos.length + ' movimientos como ya enviados a Sage? Dejarán de aparecer en la próxima exportación.')) return;
        try {
          for (let i = 0; i < ex.ids.length; i += 200) {
            const { error } = await sb.from('almacen_movimientos').update({ exportadosage: true, exportadoat: new Date().toISOString() }).in('id', ex.ids.slice(i, i + 200));
            if (error) throw error;
          }
          closeModal(); showToast('Movimientos marcados como enviados a Sage');
        } catch (e) { showToast('No se pudieron marcar: ' + (e.message || e), 'error'); }
      });
    } catch (e) {
      showToast(e.message || String(e), 'error');
    }
  };
})();
