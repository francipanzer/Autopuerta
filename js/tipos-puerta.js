/* =========================================================
 * tipos-puerta.js — CATÁLOGO ÚNICO de tipos de puerta
 *
 * Antes había 4 listas distintas (utils.js, tabla tipos_puerta,
 * listas escritas a mano en revisiones y nombres propios de cada
 * plantilla), así que según la pantalla salían tipos diferentes.
 * Ahora TODOS los selects salen de aquí:
 *   · plantillas de medidas (selector, editor, presupuestos)
 *   · revisiones (tipo de producto del equipo)
 *   · puertas de clientes, partes, almacén, manuales…
 *
 * El catálogo base está en código; los tipos que el administrador
 * añada en Configuración (tabla tipos_puerta) se suman solos.
 * Se cargan una sola vez y se reutilizan (sin esperas).
 * ========================================================= */
(function () {
  'use strict';

  // key = clave interna · nombre = lo que ve el usuario · codigo = valor histórico de revisiones
  const BASE = [
    { key: 'seccional', nombre: 'Puerta Seccional', codigo: 'SECCIONAL', diasRevision: 365, alias: ['seccional'],
      checklist: ['Paneles / juntas', 'Guías / rodillos', 'Muelles de torsión', 'Motor', 'Células', 'Cierre manual'] },
    
    { key: 'rapida', nombre: 'Puerta Rápida de Lona', codigo: 'RAPIDA', diasRevision: 90, alias: ['rapida', 'rapida de lona', 'rapida lona'],
      checklist: ['Lona / estructura', 'Motor / mandos', 'Sensores', 'Borde de seguridad', 'Guías laterales'] },
    
    { key: 'rapida_apilable', nombre: 'Puerta Rápida Apilable', codigo: 'RAPIDA APILABLE', diasRevision: 90, alias: ['rapida apilable'],
      checklist: ['Lona / estructura', 'Motor / mandos', 'Sensores', 'Borde de seguridad', 'Guías laterales'] },
    
    { key: 'corredera', nombre: 'Puerta Corredera', codigo: 'CORREDERA', diasRevision: 180, alias: ['corredera'],
      checklist: ['Células fotoeléctricas', 'Banda de seguridad', 'Motor / reductora', 'Guías y rodillos', 'Estructura', 'Muelle contrapeso'] },
    
    { key: 'cortafuegos', nombre: 'Puerta Cortafuegos', codigo: 'CORTAFUEGOS', diasRevision: 365, alias: ['cortafuegos'],
      checklist: ['Hojas / marco', 'Cierre automático', 'Manija antipánico', 'Juntas de dilatación', 'Documentación'] },
    
    { key: 'corredera_cristal', nombre: 'Corredera Cristal', codigo: 'CORREDERA CRISTAL', diasRevision: 180, alias: ['corredera cristal', 'corredera de cristal'],
      checklist: ['Células fotoeléctricas', 'Banda de seguridad', 'Motor / reductora', 'Guías y rodillos', 'Cristales y marcos', 'Estructura'] },
    
    { key: 'basculante', nombre: 'Puerta Basculante', codigo: 'BASCULANTE', diasRevision: 365, alias: ['basculante'],
      checklist: ['Estado general', 'Bisagras', 'Rodamientos', 'Guías', 'Motor'] },
    
    { key: 'enrollable', nombre: 'Persiana Enrollable', codigo: 'ENROLLABLE', diasRevision: 365, alias: ['enrollable', 'persiana enrollable'],
      checklist: ['Lamas', 'Guías', 'Cajón / eje', 'Motor / manivela', 'Topes'] },
    
      { key: 'barrera', nombre: 'Barrera', codigo: 'BARRERA', diasRevision: 180, alias: ['barrera'],
      checklist: ['Pluma', 'Motor / reductora', 'Células', 'Mandos', 'Estructura'] },
    
      // Servicios: se usan en partes, almacén y manuales, pero NO en plantillas de medidas ni revisiones
    { key: 'automatizacion', nombre: 'Motor / Automatización', codigo: 'AUTOMATIZACION', diasRevision: 365, servicio: true,
      alias: ['motor automatizacion', 'motorizacion automatizacion', 'automatizacion', 'motorizacion'],
      checklist: ['Motor', 'Electrónica', 'Mandos', 'Limitadores', 'Cadenas'] },
    { key: 'mantenimiento', nombre: 'Mantenimiento', codigo: 'MANTENIMIENTO', diasRevision: 365, servicio: true, alias: ['mantenimiento'],
      checklist: ['Limpieza', 'Lubricación', 'Ajuste', 'Pruebas', 'Documentación'] },
    { key: 'reparacion', nombre: 'Reparación', codigo: 'REPARACION', diasRevision: 365, servicio: true, alias: ['reparacion'],
      checklist: ['Diagnóstico', 'Componente', 'Prueba', 'Limpieza', 'Documentación'] }
  ];

  const norm = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_\-\/.]+/g, ' ')
    .replace(/^(puerta|persiana)\s+/, '').replace(/\s+/g, ' ').trim();
  const tiposExcluidos = new Set(['batiente', 'plegable', 'rapida plegable']);

  let rowsDB = [];           // filas de la tabla tipos_puerta
  let extras = [];           // tipos añadidos por el admin que no están en el catálogo base
  let cargado = null;        // promesa de la carga

  const esTipoExcluido = valor => tiposExcluidos.has(norm(valor)) ||
    rowsDB.some(f => String(f.id) === String(valor) && tiposExcluidos.has(norm(f.nombre)));

  const idDe = item => 'TP-' + item.key.toUpperCase().replace(/_/g, '-');

  // Une base + extras. dbId = id del registro en la tabla (para almacén, manuales, líneas de presupuesto)
  function todos() {
    return BASE.concat(extras);
  }

  function resolver(valor) {
    if (valor == null || valor === '') return null;
    const v = String(valor);
    if (esTipoExcluido(v)) return null;
    const n = norm(v);
    for (const t of todos()) {
      if (t.key === v || t.codigo === v.toUpperCase() || t.dbId === v || norm(t.nombre) === n) return t;
      if ((t.alias || []).includes(n)) return t;
    }
    // ¿es el id de una fila de la tabla (TP001…)?
    const fila = rowsDB.find(f => String(f.id) === v);
    if (fila) return resolver(fila.nombre);
    return null;
  }

  function lista(opts) {
    const o = opts || {};
    return todos().filter(t => ![t.key, t.nombre, t.codigo, ...(t.alias || [])].some(esTipoExcluido))
      .filter(t => o.servicios ? true : !t.servicio);
  }

  function nombre(valor) {
    const t = resolver(valor);
    return t ? t.nombre : String(valor == null ? '' : valor);
  }

  // <option>s listos. por: 'nombre' | 'key' | 'codigo' | 'dbId'. etiqueta: 'nombre' | 'codigo'
  function opciones(seleccionado, o) {
    o = o || {};
    const por = o.por || 'nombre';
    const sel = resolver(seleccionado);
    const esc = window.escapeHtml || (s => String(s));
    const items = lista({ servicios: !!o.servicios });
    let html = o.vacio === false ? '' : '<option value="">' + esc(o.vacio || '— Seleccionar tipo —') + '</option>';
    html += items.map(t => {
      const val = por === 'codigo' ? t.codigo : por === 'key' ? t.key : por === 'dbId' ? (t.dbId || idDe(t)) : t.nombre;
      const et = o.etiqueta === 'codigo' ? t.codigo : t.nombre;
      return '<option value="' + esc(val) + '"' + (sel && sel.key === t.key ? ' selected' : '') + '>' + esc(et) + '</option>';
    }).join('');
    // Valor guardado que ya no existe en el catálogo: se conserva para no perderlo al editar
    if (seleccionado && !sel && !esTipoExcluido(seleccionado)) {
      html += '<option value="' + esc(seleccionado) + '" selected>' + esc(seleccionado) + '</option>';
    }
    return html;
  }

  // Filas con el formato de la tabla tipos_puerta ({id, nombre, descripcion, checklist}) para almacén/manuales/partes
  function filas(opts) {
    return lista(opts || { servicios: true }).map(t => ({
      id: t.dbId || idDe(t), nombre: t.nombre, descripcion: t.descripcion || '', checklist: t.checklist || []
    }));
  }

  async function cargar() {
    if (cargado) return cargado;
    cargado = (async () => {
      try { rowsDB = (await window.dbGetAll('tiposPuerta')) || []; } catch (e) { rowsDB = []; }
      extras = [];
      const usadas = new Set();
      // Enlaza cada fila de la tabla con su tipo base (para conservar sus ids: TP001…)
      for (const f of rowsDB) {
        if (esTipoExcluido(f.nombre)) continue;
        const t = BASE.find(b => b.key === norm(f.nombre).replace(/ /g, '_') || b.nombre === f.nombre || (b.alias || []).includes(norm(f.nombre)));
        if (t && !t.dbId) { t.dbId = String(f.id); usadas.add(String(f.id)); }
        else if (!t) extras.push({ key: 'db_' + f.id, nombre: f.nombre, codigo: String(f.nombre).toUpperCase(), diasRevision: 365,
          checklist: f.checklist || [], descripcion: f.descripcion || '', dbId: String(f.id), alias: [norm(f.nombre)], propio: true });
      }
      // Tipos base que aún no existen en la tabla: se crean (solo el administrador puede escribir)
      const puedeEscribir = typeof window.isAdmin === 'function' && window.isAdmin();
      for (const t of BASE) {
        if (t.dbId) continue;
        t.dbId = idDe(t);
        if (puedeEscribir && typeof window.dbPut === 'function') {
          try { await window.dbPut('tiposPuerta', { id: t.dbId, nombre: t.nombre, descripcion: t.descripcion || '', checklist: t.checklist || [] }); }
          catch (e) { /* sin permisos o sin red: el tipo sigue disponible en esta sesión */ }
        }
      }
      if (!rowsDB.length) cargado = null;   // base de datos aún vacía/no lista: se reintentará en la próxima llamada
      return lista();
    })();
    return cargado;
  }

  // Tras añadir/editar un tipo en Configuración hay que volver a leer la tabla
  function recargar() { cargado = null; BASE.forEach(t => { delete t.dbId; }); return cargar(); }

  // Filas {id,nombre,…} de todos los tipos (puertas + servicios) ya cargados: para almacén, manuales, partes…
  async function filasDB() { await cargar().catch(() => {}); return filas({ servicios: true }); }


  // ═══════════════════════════════════════════════════════════
  //  PERIODICIDAD DE REVISIONES (tabla de periodicidades por uso/criterio)
  //  Única fuente: la usan fichas de puertas, revisiones, avisos y la base de datos.
  //
  //    Garaje y residencial   nº vehículos ≤ 5 ........ 12 meses
  //                           5 < nº vehículos ≤ 50 .... 6 meses
  //                           nº vehículos > 50 ........ 4 meses
  //                           uso estacional ........... 12 meses
  //    Industrial             todas excepto rápidas .... 6 meses
  //                           puertas rápidas .......... 4 meses
  //    Comercial              ≤ 10 ciclos/día .......... 6 meses
  //                           > 10 ciclos/día .......... 4 meses
  //                           cierres / enrollables .... 12 meses
  // ═══════════════════════════════════════════════════════════
  const USOS = {
    garaje:     'Garaje y residencial',
    industrial: 'Industrial',
    comercial:  'Comercial'
  };
  // Uso más habitual de cada tipo, para cuando la puerta aún no tiene uso indicado
  const USO_POR_TIPO = {
    seccional: 'industrial', rapida: 'industrial', rapida_apilable: 'industrial',
    corredera: 'comercial', corredera_cristal: 'comercial', enrollable: 'comercial',
    basculante: 'garaje', barrera: 'garaje', cortafuegos: 'industrial'
  };
  const FRECUENCIA_DEFECTO = 12;     // servicios y tipos sin regla en la tabla

  const claveTipo = tipo => { const t = resolver(tipo); return t ? t.key : ''; };
  const esRapida = tipo => ['rapida', 'rapida_apilable'].includes(claveTipo(tipo));
  const esEnrollable = tipo => claveTipo(tipo) === 'enrollable';
  const entero = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };

  function usoPuerta(puerta) {
    const u = String((puerta && puerta.uso) || '').toLowerCase();
    if (USOS[u]) return u;
    return USO_POR_TIPO[claveTipo(puerta && (puerta.tipo || puerta.tipoPuerta))] || '';
  }

  // → { meses, uso, motivo, completo }   (completo=false: falta un dato y se ha supuesto)
  function periodicidad(puerta) {
    const p = puerta || {};
    const tipo = p.tipo || p.tipoPuerta;
    const uso = usoPuerta(p);
    if (!uso) return { meses: FRECUENCIA_DEFECTO, uso: '', motivo: 'Sin regla en la tabla: 12 meses', completo: true };

    if (uso === 'garaje') {
      if (p.usoEstacional === true || p.usoestacional === true)
        return { meses: 12, uso, motivo: 'Garaje · uso estacional', completo: true };
      const n = entero(p.nVehiculos ?? p.nvehiculos);
      if (n === null) return { meses: 6, uso, motivo: 'Garaje · sin nº de vehículos (se asumen 6 meses)', completo: false };
      if (n <= 5)  return { meses: 12, uso, motivo: 'Garaje · hasta 5 vehículos', completo: true };
      if (n <= 50) return { meses: 6,  uso, motivo: 'Garaje · de 6 a 50 vehículos', completo: true };
      return { meses: 4, uso, motivo: 'Garaje · más de 50 vehículos', completo: true };
    }
    if (uso === 'industrial') {
      return esRapida(tipo)
        ? { meses: 4, uso, motivo: 'Industrial · puerta rápida', completo: true }
        : { meses: 6, uso, motivo: 'Industrial · todas excepto rápidas', completo: true };
    }
    // comercial
    if (esEnrollable(tipo)) return { meses: 12, uso, motivo: 'Comercial · cierre / puerta enrollable', completo: true };
    const c = entero(p.ciclosDia ?? p.ciclosdia);
    if (c === null) return { meses: 6, uso, motivo: 'Comercial · sin ciclos/día (se asumen 6 meses)', completo: false };
    return c > 10
      ? { meses: 4, uso, motivo: 'Comercial · más de 10 ciclos/día', completo: true }
      : { meses: 6, uso, motivo: 'Comercial · hasta 10 ciclos/día', completo: true };
  }

  const frecuenciaMeses = puerta => periodicidad(puerta).meses;

  const pad2 = n => String(n).padStart(2, '0');
  const hoyISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };

  // Suma meses a una fecha YYYY-MM-DD sin pasar por UTC (31-ene + 1 mes = 28/29-feb)
  function sumarMeses(fechaISO, meses) {
    const m = String(fechaISO || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Number(meses);
    const anio = Math.floor(total / 12), mes = total % 12;
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    return anio + '-' + pad2(mes + 1) + '-' + pad2(Math.min(Number(m[3]), ultimoDia));
  }

  // Próxima revisión de una puerta a partir de la fecha de la última (o de hoy si aún no se ha revisado)
  function proximaRevision(puerta, ultimaRevision) {
    return sumarMeses(ultimaRevision || hoyISO(), frecuenciaMeses(puerta));
  }

  const Periodicidad = { USOS, USO_POR_TIPO, periodicidad, frecuenciaMeses, proximaRevision, sumarMeses, usoPuerta, esRapida, esEnrollable, hoyISO };

  window.Periodicidad = Periodicidad;
  window.TiposPuerta = { lista, resolver, nombre, opciones, filas, filasDB, cargar, recargar, norm, esExcluido: esTipoExcluido, BASE, Periodicidad };
  // Carga en segundo plano en cuanto exista la base de datos local
  window.addEventListener('load', () => { setTimeout(() => { cargar().catch(() => {}); }, 800); });
  window.addEventListener('autopuerta:sync-state', () => { if (cargado) recargar().catch(() => {}); });
})();
