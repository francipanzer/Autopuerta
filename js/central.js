/* =========================================================
 * central.js — Clientes con varias ubicaciones, rutas y puertas
 *
 * MODELO
 *   cliente individual → una nave; sus puertas cuelgan de él.
 *   cliente CENTRAL    → clientes.central = true; tiene UBICACIONES (naves con
 *                        todos los datos de un cliente) y cada ubicación sus PUERTAS.
 *   ruta               → pertenece a un cliente central y agrupa varias de sus
 *                        ubicaciones (ubicaciones.rutaId).
 *   mantenimiento      → clientes.mantenimiento = true: revisiones contratadas.
 *   periodicidad       → por puerta, según la tabla de periodicidades
 *                        (js/tipos-puerta.js → Periodicidad).
 *
 * Este módulo contiene:
 *   · acceso a datos (ubicaciones, rutas, puertas de un cliente)
 *   · motor único de revisiones  getEstadoRevisiones()  y avisos  getPendientesRevision()
 *   · reprogramación de puertas tras una revisión (técnico por RPC, admin directo)
 *   · pantallas: ubicaciones, rutas y puertas de un cliente
 * ========================================================= */
(function () {
  'use strict';

  const esc = s => (window.escapeHtml ? window.escapeHtml(s) : String(s ?? ''));
  const P = () => window.Periodicidad;
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));
  const esAdmin = () => typeof window.isAdmin === 'function' && window.isAdmin();
  const esTecnico = () => typeof window.isTechnician === 'function' && window.isTechnician();
  const txt = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base' });
  const idStr = v => (v === null || v === undefined ? '' : String(v));
  const q = id => document.getElementById(id);

  // ─────────────────────────────────────────────────────────
  //  ACCESO A DATOS
  // ─────────────────────────────────────────────────────────
  const porOrden = (a, b) =>
    (a.ordenRuta ?? Infinity) - (b.ordenRuta ?? Infinity) || txt(a.denominacion, b.denominacion);

  async function ubicacionesDe(clienteId) {
    const l = await dbGetByIndex('ubicaciones', 'clienteId', clienteId);
    return l.sort(porOrden);
  }
  async function rutasDe(clienteId) {
    const l = (await dbGetAll('rutas')).filter(r => idStr(r.clienteId) === idStr(clienteId));
    return l.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || txt(a.nombre, b.nombre));
  }
  async function puertasDe(clienteId, ubicacionId) {
    const l = await dbGetByIndex('puertas', 'clienteId', clienteId);
    return ubicacionId ? l.filter(p => idStr(p.ubicacionId) === idStr(ubicacionId)) : l;
  }
  const esCentral = c => !!(c && c.central === true);

  // ─────────────────────────────────────────────────────────
  //  ESTADO DE UNA FECHA (badge)
  // ─────────────────────────────────────────────────────────
  function diasHastaISO(f) {
    const m = String(f || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((d - hoy) / 86400000);
  }
  function badgeFecha(f) {
    const d = diasHastaISO(f);
    if (d === null) return { texto: 'Sin programar', clase: 'badge-yellow', dias: null };
    if (d < 0) return { texto: 'Vencida ' + Math.abs(d) + 'd', clase: 'badge-red', dias: d };
    if (d === 0) return { texto: 'Hoy', clase: 'badge-red', dias: d };
    if (d <= 30) return { texto: 'En ' + d + 'd', clase: 'badge-yellow', dias: d };
    return { texto: 'Al día', clase: 'badge-green', dias: d };
  }
  const minFecha = lista => lista.filter(Boolean).map(f => String(f).slice(0, 10)).sort()[0] || null;
  const maxFecha = lista => lista.filter(Boolean).map(f => String(f).slice(0, 10)).sort().pop() || null;
  const fmt = f => { try { return f ? new Date(String(f).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES') : '—'; } catch (e) { return String(f || '—'); } };

  // ─────────────────────────────────────────────────────────
  //  MOTOR ÚNICO DE REVISIONES
  //  Una fila por cliente CON MANTENIMIENTO contratado:
  //    · individual  → sus puertas
  //    · central     → sus ubicaciones agrupadas por ruta (+ las que no están en ninguna)
  //  La usan la página de Revisiones, el badge del menú, el panel y los PDF.
  // ─────────────────────────────────────────────────────────
  async function getEstadoRevisiones() {
    const [clientes, ubicaciones, rutas, puertas] = await Promise.all([
      dbGetAll('clientes'), dbGetAll('ubicaciones'), dbGetAll('rutas'), dbGetAll('puertas')
    ]);
    const puertasPorCliente = new Map();
    for (const p of puertas) {
      const k = idStr(p.clienteId);
      if (!puertasPorCliente.has(k)) puertasPorCliente.set(k, []);
      puertasPorCliente.get(k).push(p);
    }
    const ubicPorCliente = new Map();
    for (const u of ubicaciones) {
      const k = idStr(u.clienteId);
      if (!ubicPorCliente.has(k)) ubicPorCliente.set(k, []);
      ubicPorCliente.get(k).push(u);
    }
    const rutasPorCliente = new Map();
    for (const r of rutas) {
      const k = idStr(r.clienteId);
      if (!rutasPorCliente.has(k)) rutasPorCliente.set(k, []);
      rutasPorCliente.get(k).push(r);
    }

    const items = [];
    for (const c of clientes) {
      if (c.mantenimiento !== true) continue;
      const cid = idStr(c.id);
      const todasPuertas = (puertasPorCliente.get(cid) || []).slice();
      const ubics = (ubicPorCliente.get(cid) || []).filter(u => u.activa !== false).sort(porOrden);
      const central = esCentral(c) || ubics.length > 0;

      const ubicInfo = ubics.map(u => {
        const ps = todasPuertas.filter(p => idStr(p.ubicacionId) === idStr(u.id))
          .map(p => ({ ...p, ubicacionNombre: u.denominacion, clienteNombre: c.nombre }));
        return { ...u, puertas: ps, proximaRevision: minFecha(ps.map(p => p.proximaRevision)) };
      });
      const ubicById = new Map(ubicInfo.map(u => [idStr(u.id), u]));

      let rutasInfo = [], sinRuta = [], puertasSinUbic = [];
      if (central) {
        rutasInfo = (rutasPorCliente.get(cid) || [])
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || txt(a.nombre, b.nombre))
          .map(r => {
            const us = ubicInfo.filter(u => idStr(u.rutaId) === idStr(r.id));
            const ps = us.flatMap(u => u.puertas);
            return {
              ...r, ubicaciones: us, puertas: ps,
              proximaRevision: minFecha(ps.map(p => p.proximaRevision)),
              ultimaRevision: maxFecha(ps.map(p => p.ultimaRevision))
            };
          });
        const enRuta = new Set(rutasInfo.flatMap(r => r.ubicaciones.map(u => idStr(u.id))));
        sinRuta = ubicInfo.filter(u => !enRuta.has(idStr(u.id)));
        puertasSinUbic = todasPuertas.filter(p => !ubicById.has(idStr(p.ubicacionId)))
          .map(p => ({ ...p, clienteNombre: c.nombre }));
      }

      const puertasTodas = central
        ? [...ubicInfo.flatMap(u => u.puertas), ...puertasSinUbic]
        : todasPuertas.map(p => ({ ...p, clienteNombre: c.nombre }));

      items.push({
        id: cid, nombre: c.nombre, cliente: c, central,
        ubicaciones: ubicInfo, rutas: rutasInfo, sinRuta, puertasSinUbic,
        puertas: puertasTodas,
        proximaRevision: minFecha(puertasTodas.map(p => p.proximaRevision)),
        ultimaRevision: maxFecha(puertasTodas.map(p => p.ultimaRevision))
      });
    }
    items.sort((a, b) => String(a.proximaRevision || '9999').localeCompare(String(b.proximaRevision || '9999')) || txt(a.nombre, b.nombre));
    return items;
  }

  // Avisos del panel: clientes con mantenimiento y revisión vencida o a ≤ 30 días
  async function getPendientesRevision() {
    const out = [];
    try {
      for (const it of await getEstadoRevisiones()) {
        if (!it.proximaRevision) continue;
        const dias = diasHastaISO(it.proximaRevision);
        if (dias === null || dias > 30) continue;
        // En un central se indica la ruta (o la ubicación) más urgente
        let detalle = it.central ? '' : 'Cliente: ' + it.nombre;
        let rutaId = null;
        if (it.central) {
          const r = it.rutas.filter(x => x.proximaRevision).sort((a, b) => a.proximaRevision.localeCompare(b.proximaRevision))[0];
          if (r && r.proximaRevision === it.proximaRevision) { rutaId = r.id; detalle = 'Ruta ' + r.nombre; }
          else detalle = 'Ubicaciones pendientes';
        }
        out.push({
          id: it.id, tipo: it.central ? 'central' : 'cliente', clienteId: it.id, rutaId,
          nombre: it.nombre, detalle, proxima: it.proximaRevision, dias,
          clase: dias <= 0 ? 'badge-red' : 'badge-yellow'
        });
      }
    } catch (e) { console.warn('getPendientesRevision:', e); }
    return out.sort((a, b) => a.dias - b.dias);
  }

  // ─────────────────────────────────────────────────────────
  //  REPROGRAMAR UNA PUERTA TRAS REVISARLA
  //  Técnico: RPC (solo puede tocar las fechas/estado); admin: escritura directa.
  // ─────────────────────────────────────────────────────────
  async function reprogramarPuerta(puerta, fechaISO, estado) {
    const fecha = String(fechaISO || '').slice(0, 10);
    const meses = P().frecuenciaMeses(puerta);
    const proxima = P().proximaRevision(puerta, fecha);
    const nuevoEstado = estado || puerta.estado || 'operativa';
    if (esTecnico()) {
      const { error } = await window.supabaseDB.rpc('update_door_revision_schedule', {
        p_id: String(puerta.id), p_last_revision: fecha, p_state: nuevoEstado, p_next_revision: proxima
      });
      if (error) {
        console.error('update_door_revision_schedule:', error);
        throw new Error('No se pudo reprogramar la puerta' + (/function|schema/i.test(error.message || '') ? ' (falta ejecutar SUPABASE_REESTRUCTURA_CLIENTES.sql)' : ': ' + error.message));
      }
      try { await window.db.cacheInvalidate('puertas'); } catch (e) { /* sin caché */ }
    } else {
      await dbPut('puertas', { ...puerta, ultimaRevision: fecha, proximaRevision: proxima, frecuenciaMeses: meses, estado: nuevoEstado });
    }
    return { ...puerta, ultimaRevision: fecha, proximaRevision: proxima, frecuenciaMeses: meses, estado: nuevoEstado };
  }

  // Recalcula frecuencia (y próxima revisión de las ya revisadas) de TODAS las puertas.
  // Botón en Configuración. Las puertas sin última revisión conservan su fecha programada.
  async function recalcularPeriodicidades() {
    if (!esAdmin()) return toast('Solo el administrador puede recalcular', 'error');
    const puertas = await dbGetAll('puertas');
    let cambiadas = 0;
    for (const p of puertas) {
      const meses = P().frecuenciaMeses(p);
      const prox = p.ultimaRevision ? P().proximaRevision(p, p.ultimaRevision) : p.proximaRevision;
      if (Number(p.frecuenciaMeses) === meses && String(p.proximaRevision || '').slice(0, 10) === String(prox || '').slice(0, 10)) continue;
      await dbPut('puertas', { ...p, frecuenciaMeses: meses, proximaRevision: prox || null });
      cambiadas++;
    }
    toast(cambiadas + ' puerta' + (cambiadas === 1 ? '' : 's') + ' actualizada' + (cambiadas === 1 ? '' : 's') + ' de ' + puertas.length);
    return cambiadas;
  }

  // ─────────────────────────────────────────────────────────
  //  UBICACIONES (modal desde la ficha del cliente)
  // ─────────────────────────────────────────────────────────
  async function verUbicaciones(clienteId) {
    const cliente = await dbGet('clientes', clienteId);
    if (!cliente) return toast('Cliente no encontrado', 'error');
    const [ubics, rutas, puertas] = await Promise.all([ubicacionesDe(clienteId), rutasDe(clienteId), puertasDe(clienteId)]);
    const rutaNombre = new Map(rutas.map(r => [idStr(r.id), r.nombre]));
    const admin = esAdmin();
    const cid = esc(clienteId);

    const cuerpo = ubics.length
      ? ubics.map(u => {
        const n = puertas.filter(p => idStr(p.ubicacionId) === idStr(u.id)).length;
        const ruta = u.rutaId ? rutaNombre.get(idStr(u.rutaId)) : null;
        const datos = [u.contacto, u.telefono, u.email].filter(Boolean).map(esc).join(' · ');
        return '<div class="ubic-item"' + (u.activa === false ? ' style="opacity:.6"' : '') + '>' +
          '<div style="min-width:0">' +
            '<strong>' + esc(u.denominacion) + '</strong>' +
            (u.activa === false ? ' <span class="badge badge-gray badge-sm">Baja</span>' : '') +
            (ruta ? ' <span class="badge badge-blue badge-sm"><i class="fas fa-route"></i> ' + esc(ruta) + '</span>' : '') +
            '<br><small>' + esc(u.direccion || 'Sin dirección') + '</small>' +
            (datos ? '<br><small>' + datos + '</small>' : '') +
            (u.notas ? '<br><small style="color:var(--text-muted)">📝 ' + esc(u.notas) + '</small>' : '') +
            '<br><small style="color:var(--text-muted)">' + (u.lat ? '📍 ' + Number(u.lat).toFixed(4) + ', ' + Number(u.lng).toFixed(4) : '📍 Sin coordenadas') + '</small>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-direction:column;flex-shrink:0">' +
            '<button class="btn btn-sm btn-primary" onclick="gestionarPuertas(\'' + cid + '\',\'' + esc(u.id) + '\')"><i class="fas fa-door-open"></i> Puertas (' + n + ')</button>' +
            (admin ? '<button class="btn btn-sm btn-outline" onclick="Central.formUbicacion(\'' + cid + '\',\'' + esc(u.id) + '\')"><i class="fas fa-pen"></i> Editar</button>' +
              '<button class="btn btn-sm btn-danger" onclick="Central.eliminarUbicacion(\'' + cid + '\',\'' + esc(u.id) + '\')"><i class="fas fa-trash"></i></button>' : '') +
          '</div></div>';
      }).join('')
      : '<p class="ubic-vacio">Este cliente aún no tiene ubicaciones. ' + (admin ? 'Añade la primera con «Nueva ubicación».' : '') + '</p>';

    openModal('📍 Ubicaciones · ' + (cliente.nombre || ''),
      '<div style="max-height:62vh;overflow-y:auto">' + cuerpo + '</div>',
      '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>' +
      '<button class="btn btn-outline" onclick="Central.verRutas(\'' + cid + '\')"><i class="fas fa-route"></i> Rutas (' + rutas.length + ')</button>' +
      (admin ? '<button class="btn btn-primary" onclick="Central.formUbicacion(\'' + cid + '\')"><i class="fas fa-plus"></i> Nueva ubicación</button>' : ''));
  }

  async function formUbicacion(clienteId, ubicacionId) {
    if (!esAdmin()) return toast('Solo el administrador puede editar ubicaciones', 'error');
    const cliente = await dbGet('clientes', clienteId);
    const u = ubicacionId ? (await dbGet('ubicaciones', ubicacionId)) || {} : {};
    const rutas = await rutasDe(clienteId);
    const optRutas = '<option value="">— Sin ruta</option>' +
      rutas.map(r => '<option value="' + esc(r.id) + '"' + (idStr(u.rutaId) === idStr(r.id) ? ' selected' : '') + '>' + esc(r.nombre) + '</option>').join('');
    window.__geoUbicacion = null;

    const form = '<div class="form-grid">' +
      '<div class="form-group full"><label>Nombre de la ubicación *</label><input id="ub_den" value="' + esc(u.denominacion || '') + '" placeholder="Ej: Nave Alcalá, Hiper Sur…"></div>' +
      '<div class="form-group full"><label>Dirección</label><div style="display:flex;gap:6px">' +
        '<input id="ub_dir" value="' + esc(u.direccion || '') + '" style="flex:1">' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="Central.geoUbicacionForm()" title="Buscar coordenadas"><i class="fas fa-map-marker-alt"></i></button></div>' +
        '<small id="ub_geo" style="color:var(--text-muted);font-size:11px">' + (u.lat ? '📍 ' + Number(u.lat).toFixed(4) + ', ' + Number(u.lng).toFixed(4) : '📍 Sin coordenadas (se buscan al guardar)') + '</small></div>' +
      '<div class="form-group"><label>Persona de contacto</label><input id="ub_contacto" value="' + esc(u.contacto || '') + '"></div>' +
      '<div class="form-group"><label>Teléfono</label><input id="ub_tel" class="only-num" value="' + esc(u.telefono ? String(u.telefono).replace(/\D/g, '') : '') + '"></div>' +
      '<div class="form-group"><label>Email</label><input id="ub_email" type="email" value="' + esc(u.email || '') + '"></div>' +
      '<div class="form-group"><label>Ruta</label><select id="ub_ruta">' + optRutas + '</select></div>' +
      '<div class="form-group full"><label>Notas (acceso, horario…)</label><textarea id="ub_notas">' + esc(u.notas || '') + '</textarea></div>' +
      '<div class="form-group full"><label><input type="checkbox" id="ub_activa" ' + (u.activa === false ? '' : 'checked') + '> Ubicación activa (si se da de baja deja de salir en las revisiones)</label></div>' +
    '</div>';

    openModal((ubicacionId ? 'Editar ubicación' : 'Nueva ubicación') + ' · ' + (cliente?.nombre || ''), form,
      '<button class="btn btn-outline" onclick="Central.verUbicaciones(\'' + esc(clienteId) + '\')">Cancelar</button>' +
      '<button class="btn btn-primary" onclick="Central.guardarUbicacion(\'' + esc(clienteId) + '\',\'' + esc(ubicacionId || '') + '\')"><i class="fas fa-save"></i> Guardar</button>');
  }

  async function geoUbicacionForm() {
    const dir = (q('ub_dir')?.value || '').trim();
    if (!dir) return toast('Escribe una dirección primero', 'error');
    const est = q('ub_geo');
    if (est) est.textContent = '📍 Buscando coordenadas…';
    const g = await geocodificar(dir).catch(() => null);
    if (!g) { if (est) est.textContent = '📍 No se encontraron coordenadas'; return toast('No se encontraron coordenadas para esa dirección', 'error'); }
    window.__geoUbicacion = { lat: g.lat, lng: g.lng, dir };
    if (est) est.textContent = '📍 ' + Number(g.lat).toFixed(4) + ', ' + Number(g.lng).toFixed(4);
  }

  async function guardarUbicacion(clienteId, ubicacionId) {
    const existente = ubicacionId ? await dbGet('ubicaciones', ubicacionId) : null;
    const den = q('ub_den').value.trim();
    const email = q('ub_email').value.trim();
    const tel = q('ub_tel').value.trim();
    let ok = true;
    ok &= setFieldError('ub_den', validators.required(den, 'El nombre'));
    ok &= setFieldError('ub_email', validators.email(email));
    ok &= setFieldError('ub_tel', validators.telefono9(tel));
    if (!ok) return toast('Revisa los campos marcados', 'error');

    const direccion = q('ub_dir').value.trim();
    const dirCambiada = !existente || String(existente.direccion || '') !== direccion;
    let geo = null;
    if (window.__geoUbicacion && window.__geoUbicacion.dir === direccion) geo = window.__geoUbicacion;       // ya buscada con el botón
    else if (existente?.lat && !dirCambiada) geo = { lat: existente.lat, lng: existente.lng };              // sin cambios
    else if (direccion) { const g = await geocodificar(direccion).catch(() => null); if (g) geo = { lat: g.lat, lng: g.lng }; }
    const rutaId = q('ub_ruta').value || null;
    const rutaCambiada = !existente || idStr(existente.rutaId) !== idStr(rutaId);
    let orden = existente?.ordenRuta ?? null;
    if (rutaId && rutaCambiada) {
      const hermanas = (await ubicacionesDe(clienteId)).filter(x => idStr(x.rutaId) === idStr(rutaId) && idStr(x.id) !== idStr(ubicacionId));
      orden = hermanas.reduce((m, x) => Math.max(m, x.ordenRuta || 0), 0) + 1;
    }
    if (!rutaId) orden = null;

    const data = {
      ...(existente || {}),
      id: ubicacionId || window.db.nextId('UBI'),
      clienteId,
      denominacion: den, direccion,
      contacto: q('ub_contacto').value.trim(), telefono: tel, email,
      notas: q('ub_notas').value.trim(),
      lat: geo ? geo.lat : (dirCambiada ? null : existente?.lat ?? null), lng: geo ? geo.lng : (dirCambiada ? null : existente?.lng ?? null),
      rutaId, ordenRuta: orden,
      activa: q('ub_activa').checked
    };
    try {
      await dbPut('ubicaciones', data);
      window.__geoUbicacion = null;
      toast('Ubicación guardada');
      await verUbicaciones(clienteId);
    } catch (e) {
      console.error('guardarUbicacion:', e);
      toast('No se pudo guardar: ' + (e.message || e), 'error');
    }
  }

  async function eliminarUbicacion(clienteId, ubicacionId) {
    if (!esAdmin()) return;
    const n = (await puertasDe(clienteId, ubicacionId)).length;
    if (n) return toast('No se puede eliminar: tiene ' + n + ' puerta' + (n === 1 ? '' : 's') + '. Elimínalas o muévelas a otra ubicación primero.', 'error');
    const u = await dbGet('ubicaciones', ubicacionId);
    if (!confirm('¿Eliminar la ubicación «' + (u?.denominacion || '') + '»?')) return;
    try { await dbDelete('ubicaciones', ubicacionId); toast('Ubicación eliminada'); }
    catch (e) { toast('No se pudo eliminar: ' + (e.message || e), 'error'); }
    await verUbicaciones(clienteId);
  }

  // ─────────────────────────────────────────────────────────
  //  RUTAS (de un cliente central)
  // ─────────────────────────────────────────────────────────
  async function verRutas(clienteId) {
    const cliente = await dbGet('clientes', clienteId);
    if (!cliente) return toast('Cliente no encontrado', 'error');
    const [ubics, rutas] = await Promise.all([ubicacionesDe(clienteId), rutasDe(clienteId)]);
    const admin = esAdmin();
    const cid = esc(clienteId);
    const sin = ubics.filter(u => u.activa !== false && !rutas.some(r => idStr(r.id) === idStr(u.rutaId)));

    const cuerpo = (rutas.length ? rutas.map(r => {
      const us = ubics.filter(u => idStr(u.rutaId) === idStr(r.id)).sort(porOrden);
      return '<div class="ubic-item"><div style="min-width:0"><strong><i class="fas fa-route"></i> ' + esc(r.nombre) + '</strong> ' +
        '<span class="badge badge-blue badge-sm">' + us.length + ' ubicación' + (us.length === 1 ? '' : 'es') + '</span><br>' +
        '<small>' + (us.length ? us.map((u, i) => (i + 1) + '. ' + esc(u.denominacion)).join(' · ') : 'Sin ubicaciones asignadas') + '</small></div>' +
        (admin ? '<div style="display:flex;gap:6px;flex-direction:column;flex-shrink:0">' +
          '<button class="btn btn-sm btn-outline" onclick="Central.formRuta(\'' + cid + '\',\'' + esc(r.id) + '\')"><i class="fas fa-pen"></i> Editar</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Central.optimizarRuta(\'' + esc(r.id) + '\',\'' + cid + '\')"><i class="fas fa-wand-magic-sparkles"></i> Ordenar</button>' +
          '<button class="btn btn-sm btn-danger" onclick="Central.eliminarRuta(\'' + cid + '\',\'' + esc(r.id) + '\')"><i class="fas fa-trash"></i></button></div>' : '') +
        '</div>';
    }).join('') : '<p class="ubic-vacio">Este cliente aún no tiene rutas.' + (ubics.length ? '' : ' Primero añade sus ubicaciones.') + '</p>') +
      (sin.length ? '<p style="margin-top:12px;color:var(--text-muted);font-size:13px"><i class="fas fa-circle-info"></i> ' + sin.length + ' ubicación' + (sin.length === 1 ? '' : 'es') + ' sin ruta: ' + sin.map(u => esc(u.denominacion)).join(', ') + '</p>' : '');

    openModal('🛣️ Rutas · ' + (cliente.nombre || ''),
      '<div style="max-height:62vh;overflow-y:auto">' + cuerpo + '</div>',
      '<button class="btn btn-outline" onclick="Central.verUbicaciones(\'' + cid + '\')"><i class="fas fa-arrow-left"></i> Ubicaciones</button>' +
      (admin ? '<button class="btn btn-primary" onclick="Central.formRuta(\'' + cid + '\')"' + (ubics.length ? '' : ' disabled title="Añade ubicaciones primero"') + '><i class="fas fa-plus"></i> Nueva ruta</button>' : ''));
  }

  async function formRuta(clienteId, rutaId) {
    if (!esAdmin()) return toast('Solo el administrador puede editar rutas', 'error');
    const cliente = await dbGet('clientes', clienteId);
    const ruta = rutaId ? (await dbGet('rutas', rutaId)) || {} : {};
    const [ubics, rutas] = await Promise.all([ubicacionesDe(clienteId), rutasDe(clienteId)]);
    const rutaNombre = new Map(rutas.map(r => [idStr(r.id), r.nombre]));

    const filas = ubics.filter(u => u.activa !== false).map(u => {
      const enEsta = rutaId && idStr(u.rutaId) === idStr(rutaId);
      const enOtra = u.rutaId && !enEsta ? rutaNombre.get(idStr(u.rutaId)) : null;
      return '<label style="display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;background:var(--surface-alt)">' +
        '<input type="checkbox" class="rt-chk" value="' + esc(u.id) + '" ' + (enEsta ? 'checked' : '') + ' style="margin-top:3px">' +
        '<span><strong>' + esc(u.denominacion) + '</strong>' +
        (enOtra ? ' <span class="badge badge-yellow badge-sm">ahora en «' + esc(enOtra) + '»</span>' : '') +
        '<br><small style="color:var(--text-muted)">' + esc(u.direccion || 'Sin dirección') + '</small></span></label>';
    }).join('');

    const form = '<div class="form-grid"><div class="form-group full"><label>Nombre de la ruta *</label>' +
      '<input id="rt_nombre" value="' + esc(ruta.nombre || '') + '" placeholder="Ej: Ruta 1 · Murcia"></div></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px">' +
        '<strong>Ubicaciones de esta ruta</strong>' +
        '<span><button type="button" class="btn btn-outline btn-sm" onclick="Central.marcarTodasRuta(true)">Todas</button> ' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="Central.marcarTodasRuta(false)">Ninguna</button></span></div>' +
      '<div style="max-height:46vh;overflow-y:auto">' + (filas || '<p class="ubic-vacio">El cliente no tiene ubicaciones activas.</p>') + '</div>' +
      '<small style="color:var(--text-muted)">Si marcas una ubicación que ya está en otra ruta, pasa a esta.</small>';

    openModal((rutaId ? 'Editar ruta' : 'Nueva ruta') + ' · ' + (cliente?.nombre || ''), form,
      '<button class="btn btn-outline" onclick="Central.verRutas(\'' + esc(clienteId) + '\')">Cancelar</button>' +
      '<button class="btn btn-primary" onclick="Central.guardarRuta(\'' + esc(clienteId) + '\',\'' + esc(rutaId || '') + '\')"><i class="fas fa-save"></i> Guardar</button>');
  }

  function marcarTodasRuta(valor) { document.querySelectorAll('.rt-chk').forEach(c => { c.checked = !!valor; }); }

  async function guardarRuta(clienteId, rutaId) {
    const nombre = q('rt_nombre').value.trim();
    if (!setFieldError('rt_nombre', validators.required(nombre, 'El nombre'))) return toast('Pon un nombre a la ruta', 'error');
    const marcadas = new Set([...document.querySelectorAll('.rt-chk:checked')].map(c => idStr(c.value)));
    const [ubics, rutas] = await Promise.all([ubicacionesDe(clienteId), rutasDe(clienteId)]);
    if (rutas.some(r => idStr(r.id) !== idStr(rutaId) && txt(r.nombre, nombre) === 0)) {
      return setFieldError('rt_nombre', 'Ya existe una ruta con ese nombre');
    }
    try {
      const existente = rutaId ? await dbGet('rutas', rutaId) : null;
      const id = rutaId || window.db.nextId('RUT');
      await dbPut('rutas', { ...(existente || {}), id, clienteId, nombre, orden: existente?.orden ?? rutas.length + 1 });
      // Orden: las que ya estaban conservan su posición; las nuevas van al final
      let max = ubics.filter(u => idStr(u.rutaId) === idStr(id)).reduce((m, u) => Math.max(m, u.ordenRuta || 0), 0);
      for (const u of ubics) {
        const estaba = idStr(u.rutaId) === idStr(id);
        const debe = marcadas.has(idStr(u.id));
        if (debe && !estaba) await dbPut('ubicaciones', { ...u, rutaId: id, ordenRuta: ++max });
        else if (!debe && estaba) await dbPut('ubicaciones', { ...u, rutaId: null, ordenRuta: null });
      }
      toast('Ruta guardada');
      await verRutas(clienteId);
    } catch (e) {
      console.error('guardarRuta:', e);
      toast('No se pudo guardar la ruta: ' + (e.message || e), 'error');
    }
  }

  async function eliminarRuta(clienteId, rutaId) {
    if (!esAdmin()) return;
    const r = await dbGet('rutas', rutaId);
    if (!confirm('¿Eliminar la ruta «' + (r?.nombre || '') + '»? Sus ubicaciones no se borran: quedan sin ruta.')) return;
    try {
      for (const u of (await ubicacionesDe(clienteId)).filter(x => idStr(x.rutaId) === idStr(rutaId))) {
        await dbPut('ubicaciones', { ...u, rutaId: null, ordenRuta: null });
      }
      await dbDelete('rutas', rutaId);
      toast('Ruta eliminada');
    } catch (e) { toast('No se pudo eliminar: ' + (e.message || e), 'error'); }
    await verRutas(clienteId);
  }

  // Orden de visita con los mínimos km saliendo y volviendo a Ceutí (mismo cálculo que antes)
  function kmCircuito(pts) {
    const nodos = [BASE_CEUTI, ...pts, BASE_CEUTI];
    let s = 0;
    for (let i = 1; i < nodos.length; i++) s += kmEntreCoordenadasCore(nodos[i - 1].lat, nodos[i - 1].lng, nodos[i].lat, nodos[i].lng) * getFactorCarretera();
    return s;
  }
  function ordenOptimo(pts) {
    const n = pts.length;
    const nodos = [BASE_CEUTI, ...pts];
    const d = nodos.map(a => nodos.map(b => kmEntreCoordenadasCore(a.lat, a.lng, b.lat, b.lng) * getFactorCarretera()));
    const largo = t => { let s = d[0][t[0]]; for (let i = 1; i < t.length; i++) s += d[t[i - 1]][t[i]]; return s + d[t[t.length - 1]][0]; };
    let mejor = null, mejorLen = Infinity;
    const probar = t => { const l = largo(t); if (l < mejorLen - 1e-9) { mejor = t.slice(); mejorLen = l; } };
    if (n <= 8) {
      const permutar = (t, k) => {
        if (k === t.length) return probar(t);
        for (let i = k; i < t.length; i++) { [t[k], t[i]] = [t[i], t[k]]; permutar(t, k + 1); [t[k], t[i]] = [t[i], t[k]]; }
      };
      permutar(Array.from({ length: n }, (_, i) => i + 1), 0);
    } else {
      for (let inicio = 1; inicio <= n; inicio++) {
        const t = [inicio], libres = new Set(Array.from({ length: n }, (_, i) => i + 1));
        libres.delete(inicio);
        while (libres.size) {
          let sig = null, dm = Infinity;
          for (const c of libres) if (d[t[t.length - 1]][c] < dm) { dm = d[t[t.length - 1]][c]; sig = c; }
          t.push(sig); libres.delete(sig);
        }
        let mejora = true;
        while (mejora) {
          mejora = false;
          for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
            const nuevo = [...t.slice(0, i), ...t.slice(i, j + 1).reverse(), ...t.slice(j + 1)];
            if (largo(nuevo) < largo(t) - 1e-9) { t.splice(0, n, ...nuevo); mejora = true; }
          }
        }
        probar(t);
      }
    }
    return { orden: mejor.map(i => i - 1), km: Math.round(mejorLen) };
  }

  async function optimizarRuta(rutaId, clienteId) {
    if (!esAdmin()) return toast('Solo el administrador puede ordenar rutas', 'error');
    try {
      const todas = (await ubicacionesDe(clienteId)).filter(u => idStr(u.rutaId) === idStr(rutaId));
      if (todas.length < 2) return toast('La ruta necesita al menos 2 ubicaciones para ordenarla', 'warning');
      toast('Calculando el recorrido más corto…', 'info');
      const sinCoord = [];
      for (const u of todas) {
        if (Number(u.lat) && Number(u.lng)) continue;
        const g = u.direccion ? await geocodificar(u.direccion) : null;
        if (g) { u.lat = g.lat; u.lng = g.lng; await dbPut('ubicaciones', u); } else sinCoord.push(u);
        if (u.direccion) await new Promise(r => setTimeout(r, 1100));   // límite de Nominatim
      }
      const conCoord = todas.filter(u => !sinCoord.includes(u));
      if (conCoord.length < 2) return toast('Faltan coordenadas: revisa las direcciones de las ubicaciones', 'error');
      const pts = conCoord.map(u => ({ lat: Number(u.lat), lng: Number(u.lng) }));
      const antes = Math.round(kmCircuito(pts));
      const { orden, km } = ordenOptimo(pts);
      const nuevo = [...orden.map(i => conCoord[i]), ...sinCoord];
      for (let i = 0; i < nuevo.length; i++) if (nuevo[i].ordenRuta !== i + 1) await dbPut('ubicaciones', { ...nuevo[i], ordenRuta: i + 1 });
      toast('Ruta ordenada: ' + km + ' km (antes ' + antes + ' km)' + (sinCoord.length ? ' · ' + sinCoord.length + ' sin ubicar al final' : ''), sinCoord.length ? 'warning' : 'success');
      if (q('rev-lista-ubicaciones') && typeof window.verUbicacionesDeRuta === 'function') await window.verUbicacionesDeRuta(clienteId, rutaId);
      else if (q('modalBody')) await verRutas(clienteId);
    } catch (e) {
      console.error('optimizarRuta:', e);
      toast('No se pudo guardar el orden: ' + (e.message || e), 'error');
    }
  }

  // ─────────────────────────────────────────────────────────
  //  PUERTAS (de un cliente, o de una de sus ubicaciones)
  // ─────────────────────────────────────────────────────────
  const ESTADOS = { operativa: '🟢 Operativa', averiada: '🔴 Averiada', fuera_servicio: '⚪ Fuera de servicio' };
  const nombreTipo = t => { const x = (typeof getTipoPuerta === 'function') ? getTipoPuerta(t) : null; return x ? x.nombre : (t || '—'); };

  async function gestionarPuertas(clienteId, ubicacionId) {
    const cliente = await dbGet('clientes', clienteId);
    if (!cliente) return toast('Cliente no encontrado', 'error');
    const [ubics, todas] = await Promise.all([ubicacionesDe(clienteId), puertasDe(clienteId)]);
    const central = esCentral(cliente) || ubics.length > 0;
    const admin = esAdmin();
    const cid = esc(clienteId), uid = esc(ubicacionId || '');
    const ubicActual = ubicacionId ? ubics.find(u => idStr(u.id) === idStr(ubicacionId)) : null;
    const lista = ubicacionId ? todas.filter(p => idStr(p.ubicacionId) === idStr(ubicacionId)) : todas;
    const conAvisos = cliente.mantenimiento === true;

    const filaPuerta = p => {
      const per = P().periodicidad(p);
      const b = badgeFecha(p.proximaRevision);
      return '<div class="ubic-item"><div style="min-width:0">' +
        '<strong>' + esc(p.nombre) + '</strong> <small>· ' + esc(nombreTipo(p.tipo)) + '</small><br>' +
        (p.marca ? '<small>Marca: ' + esc(p.marca) + '</small> ' : '') + (p.numeroSerie ? '<small>S/N: ' + esc(p.numeroSerie) + '</small>' : '') +
        ((p.marca || p.numeroSerie) ? '<br>' : '') +
        '<small>' + (ESTADOS[p.estado] || esc(p.estado || '')) + '</small><br>' +
        '<small>Revisión cada <strong>' + per.meses + ' meses</strong> · ' + esc(per.motivo) + (per.completo ? '' : ' ⚠️') + '</small><br>' +
        (conAvisos ? '<small>Última: ' + fmt(p.ultimaRevision) + ' · Próxima: ' + fmt(p.proximaRevision) + '</small> <span class="badge ' + b.clase + ' badge-sm">' + b.texto + '</span>'
          : '<small style="color:var(--text-muted)">Cliente sin mantenimiento contratado</small>') +
        '</div><div style="display:flex;gap:6px;flex-direction:column;flex-shrink:0">' +
        '<button class="btn btn-sm btn-outline" onclick="verHistoricoPuerta(\'' + esc(p.id) + '\')"><i class="fas fa-clock-rotate-left"></i> Historial</button>' +
        (admin ? '<button class="btn btn-sm btn-outline" onclick="Central.formPuerta(\'' + cid + '\',\'' + esc(p.id) + '\',\'' + uid + '\')"><i class="fas fa-pen"></i> Editar</button>' +
          '<button class="btn btn-sm btn-danger" onclick="Central.eliminarPuerta(\'' + cid + '\',\'' + esc(p.id) + '\',\'' + uid + '\')"><i class="fas fa-trash"></i></button>' : '') +
        '</div></div>';
    };

    let cuerpo = '';
    if (!lista.length) {
      cuerpo = '<p class="ubic-vacio">' + (ubicActual ? 'Esta ubicación aún no tiene puertas.' : 'Este cliente aún no tiene puertas registradas.') + '</p>';
    } else if (central && !ubicacionId) {
      const grupos = ubics.map(u => ({ u, ps: lista.filter(p => idStr(p.ubicacionId) === idStr(u.id)) })).filter(g => g.ps.length);
      const huerfanas = lista.filter(p => !ubics.some(u => idStr(u.id) === idStr(p.ubicacionId)));
      cuerpo = grupos.map(g => '<details open style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:600;padding:6px 0">📍 ' + esc(g.u.denominacion) +
        ' <span class="badge badge-blue badge-sm">' + g.ps.length + '</span></summary>' + g.ps.map(filaPuerta).join('') + '</details>').join('') +
        (huerfanas.length ? '<details open><summary style="cursor:pointer;font-weight:600;padding:6px 0;color:#b45309">⚠️ Sin ubicación asignada <span class="badge badge-yellow badge-sm">' + huerfanas.length + '</span></summary>' + huerfanas.map(filaPuerta).join('') + '</details>' : '');
    } else {
      cuerpo = lista.slice().sort((a, b) => txt(a.nombre, b.nombre)).map(filaPuerta).join('');
    }

    openModal('🚪 Puertas · ' + (cliente.nombre || '') + (ubicActual ? ' · ' + ubicActual.denominacion : ''),
      '<div style="max-height:62vh;overflow-y:auto">' + cuerpo + '</div>',
      '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>' +
      (ubicacionId ? '<button class="btn btn-outline" onclick="gestionarPuertas(\'' + cid + '\')">Ver todas</button>' : '') +
      (central ? '<button class="btn btn-outline" onclick="Central.verUbicaciones(\'' + cid + '\')"><i class="fas fa-map-marker-alt"></i> Ubicaciones</button>' : '') +
      (admin ? '<button class="btn btn-primary" onclick="Central.formPuerta(\'' + cid + '\',\'\',\'' + uid + '\')"' + (central && !ubics.length ? ' disabled title="Añade ubicaciones primero"' : '') + '><i class="fas fa-plus"></i> Añadir puerta</button>' : ''));
  }

  async function formPuerta(clienteId, puertaId, ubicacionId) {
    if (!esAdmin()) return toast('Solo el administrador puede editar puertas', 'error');
    const cliente = await dbGet('clientes', clienteId);
    const p = puertaId ? (await dbGet('puertas', puertaId)) || {} : {};
    const ubics = (await ubicacionesDe(clienteId)).filter(u => u.activa !== false || idStr(u.id) === idStr(p.ubicacionId));
    const central = esCentral(cliente) || ubics.length > 0;
    const ubSel = idStr(p.ubicacionId || ubicacionId);
    const tipoSel = (typeof getTipoPuerta === 'function' && p.tipo && TIPOS_PUERTA[p.tipo]) ? p.tipo : (window.TiposPuerta?.resolver(p.tipo)?.key || p.tipo || 'seccional');

    const optTipos = Object.entries(TIPOS_PUERTA).map(([k, v]) => '<option value="' + esc(k) + '"' + (k === tipoSel ? ' selected' : '') + '>' + esc(v.nombre) + '</option>').join('');
    const optUbic = '<option value="">' + (central ? '— Elige la ubicación —' : 'Sin ubicación (cliente individual)') + '</option>' +
      ubics.map(u => '<option value="' + esc(u.id) + '"' + (idStr(u.id) === ubSel ? ' selected' : '') + '>' + esc(u.denominacion) + '</option>').join('');
    const optEstados = Object.entries(ESTADOS).map(([k, v]) => '<option value="' + k + '"' + ((p.estado || 'operativa') === k ? ' selected' : '') + '>' + v + '</option>').join('');
    const usoGuardado = P().USOS[String(p.uso || '').toLowerCase()] ? String(p.uso).toLowerCase() : '';

    const form = '<div class="form-grid">' +
      '<div class="form-group full"><label>Nombre / identificación *</label><input id="pu_nombre" value="' + esc(p.nombre || '') + '" placeholder="Ej: Muelle 3, Acceso A"></div>' +
      '<div class="form-group"><label>Tipo de puerta</label><select id="pu_tipo" onchange="Central.refrescarPeriodicidad()">' + optTipos + '</select></div>' +
      '<div class="form-group"><label>Ubicación' + (central ? ' *' : '') + '</label><select id="pu_ubic">' + optUbic + '</select></div>' +
      '<div class="form-group"><label>Marca</label><input id="pu_marca" value="' + esc(p.marca || '') + '"></div>' +
      '<div class="form-group"><label>Nº de serie</label><input id="pu_serie" value="' + esc(p.numeroSerie || '') + '"></div>' +
      '<div class="form-group"><label>Estado</label><select id="pu_estado">' + optEstados + '</select></div>' +
      '<div class="form-group"><label>Última revisión (si ya se revisó)</label><input id="pu_ultima" type="date" value="' + esc(String(p.ultimaRevision || '').slice(0, 10)) + '"></div>' +
      '<div class="form-group full" style="border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--surface-alt)">' +
        '<strong style="display:block;margin-bottom:8px"><i class="fas fa-calendar-check"></i> Periodicidad de revisión</strong>' +
        '<div class="form-grid">' +
          '<div class="form-group"><label>Uso de la puerta</label><select id="pu_uso" onchange="Central.refrescarPeriodicidad()">' +
            '<option value="">Automático según el tipo</option>' +
            Object.entries(P().USOS).map(([k, v]) => '<option value="' + k + '"' + (usoGuardado === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>' +
          '<div class="form-group" id="pu_g_veh"><label>Nº de vehículos</label><input id="pu_veh" type="number" min="0" value="' + esc(p.nVehiculos ?? '') + '" oninput="Central.refrescarPeriodicidad()"></div>' +
          '<div class="form-group" id="pu_g_est"><label><input type="checkbox" id="pu_est" ' + (p.usoEstacional ? 'checked' : '') + ' onchange="Central.refrescarPeriodicidad()"> Uso estacional (verano, vacaciones…)</label></div>' +
          '<div class="form-group" id="pu_g_cic"><label>Ciclos al día</label><input id="pu_cic" type="number" min="0" value="' + esc(p.ciclosDia ?? '') + '" oninput="Central.refrescarPeriodicidad()"></div>' +
        '</div>' +
        '<div id="pu_per" style="margin-top:8px;font-size:13.5px"></div>' +
      '</div>' +
      '<div class="form-group full"><label>Notas</label><textarea id="pu_notas">' + esc(p.notas || '') + '</textarea></div>' +
    '</div>';

    openModal((puertaId ? 'Editar puerta' : 'Nueva puerta') + ' · ' + (cliente?.nombre || ''), form,
      '<button class="btn btn-outline" onclick="gestionarPuertas(\'' + esc(clienteId) + '\',\'' + esc(ubicacionId || '') + '\')">Cancelar</button>' +
      '<button class="btn btn-primary" onclick="Central.guardarPuerta(\'' + esc(clienteId) + '\',\'' + esc(puertaId || '') + '\',\'' + esc(ubicacionId || '') + '\')"><i class="fas fa-save"></i> Guardar</button>');
    refrescarPeriodicidad();
  }

  // Lee los datos de periodicidad del formulario como si fueran una puerta
  function puertaDelFormulario() {
    return {
      tipo: q('pu_tipo')?.value || '',
      uso: q('pu_uso')?.value || '',
      nVehiculos: q('pu_veh')?.value === '' ? null : Number(q('pu_veh')?.value),
      usoEstacional: !!q('pu_est')?.checked,
      ciclosDia: q('pu_cic')?.value === '' ? null : Number(q('pu_cic')?.value)
    };
  }

  // Muestra solo los criterios que aplican al uso elegido y la periodicidad resultante
  function refrescarPeriodicidad() {
    const d = puertaDelFormulario();
    const uso = P().usoPuerta(d);
    const mostrar = (id, v) => { const el = q(id); if (el) el.style.display = v ? '' : 'none'; };
    mostrar('pu_g_veh', uso === 'garaje');
    mostrar('pu_g_est', uso === 'garaje');
    mostrar('pu_g_cic', uso === 'comercial' && !P().esEnrollable(d.tipo));
    const r = P().periodicidad(d);
    const el = q('pu_per');
    if (el) el.innerHTML = '<strong>Cada ' + r.meses + ' meses</strong> — ' + esc(r.motivo) +
      (r.completo ? '' : '<br><span style="color:#b45309">⚠️ Completa el dato que falta para afinar la periodicidad.</span>') +
      (!q('pu_uso')?.value && uso ? '<br><small style="color:var(--text-muted)">Uso asumido por el tipo: ' + esc(P().USOS[uso]) + '</small>' : '');
  }

  async function guardarPuerta(clienteId, puertaId, ubicacionIdInicial) {
    const nombre = q('pu_nombre').value.trim();
    if (!setFieldError('pu_nombre', validators.required(nombre, 'El nombre'))) return toast('Pon un nombre a la puerta', 'error');
    const cliente = await dbGet('clientes', clienteId);
    const ubics = await ubicacionesDe(clienteId);
    const central = esCentral(cliente) || ubics.length > 0;
    const ubicacionId = q('pu_ubic').value || null;
    if (central && !ubicacionId) return setFieldError('pu_ubic', 'Elige la ubicación de la puerta') || toast('Elige la ubicación de la puerta', 'error');

    const existente = puertaId ? await dbGet('puertas', puertaId) : null;
    const d = puertaDelFormulario();
    const ultima = q('pu_ultima').value || null;
    const base = {
      ...(existente || {}),
      id: puertaId || window.db.nextId('PRT'),
      nombre, tipo: d.tipo, marca: q('pu_marca').value.trim(), numeroSerie: q('pu_serie').value.trim(),
      clienteId, ubicacionId, estado: q('pu_estado').value, notas: q('pu_notas').value.trim(),
      uso: d.uso || null, nVehiculos: d.nVehiculos, usoEstacional: d.usoEstacional, ciclosDia: d.ciclosDia,
      ultimaRevision: ultima
    };
    base.frecuenciaMeses = P().frecuenciaMeses(base);
    if (ultima) base.proximaRevision = P().proximaRevision(base, ultima);
    else if (!existente || !existente.proximaRevision) base.proximaRevision = P().proximaRevision(base, null);   // alta nueva: hoy + periodicidad
    if (!existente) base.createdAt = P().hoyISO();
    try {
      await dbPut('puertas', base);
      toast('Puerta guardada · revisión cada ' + base.frecuenciaMeses + ' meses');
      await gestionarPuertas(clienteId, ubicacionIdInicial || '');
    } catch (e) {
      console.error('guardarPuerta:', e);
      toast('No se pudo guardar la puerta: ' + (e.message || e), 'error');
    }
  }

  async function eliminarPuerta(clienteId, puertaId, ubicacionId) {
    if (!esAdmin()) return;
    if (!confirm('¿Eliminar esta puerta? Sus partes y revisiones anteriores se conservan.')) return;
    try { await dbDelete('puertas', puertaId); toast('Puerta eliminada'); }
    catch (e) { toast('No se pudo eliminar: ' + (e.message || e), 'error'); }
    await gestionarPuertas(clienteId, ubicacionId || '');
  }

  // ─────────────────────────────────────────────────────────
  //  CONFIGURACIÓN: tabla de periodicidades + recálculo
  // ─────────────────────────────────────────────────────────
  function openConfigPeriodicidad() {
    const fila = (a, b, c) => '<tr><td>' + a + '</td><td>' + b + '</td><td><strong>' + c + '</strong></td></tr>';
    const tabla = '<div class="table-wrapper"><table><thead><tr><th>Puertas para uso</th><th>Criterio</th><th>Cada</th></tr></thead><tbody>' +
      fila('Garaje y residencial', 'Nº vehículos ≤ 5', '12 meses') + fila('', '5 &lt; nº vehículos ≤ 50', '6 meses') +
      fila('', 'Nº vehículos &gt; 50', '4 meses') + fila('', 'Uso estacional', '12 meses') +
      fila('Industrial', 'Todas, excepto puertas rápidas', '6 meses') + fila('', 'Puertas rápidas', '4 meses') +
      fila('Comercial', '≤ 10 ciclos/día', '6 meses') + fila('', '&gt; 10 ciclos/día', '4 meses') +
      fila('', 'Cierres o puertas enrollables', '12 meses') + '</tbody></table></div>';
    openModal('📅 Periodicidad de revisiones',
      tabla + '<p style="color:var(--text-muted);font-size:13px;margin-top:12px">Cada puerta indica su <strong>uso</strong> y el criterio que le toca (nº de vehículos, ciclos al día…) y de ahí sale su periodicidad. ' +
      'Si no se indica el uso, se asume el habitual del tipo de puerta. Para recalcular todas las puertas con esta tabla (por ejemplo, tras cambiar datos en masa) usa el botón; ' +
      'las puertas sin última revisión conservan su fecha programada.</p>',
      '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>' +
      (esAdmin() ? '<button class="btn btn-primary" onclick="Central.recalcularPeriodicidades().then(()=>closeModal())"><i class="fas fa-rotate"></i> Recalcular todas las puertas</button>' : ''));
  }

  // ─────────────────────────────────────────────────────────
  //  BORRADORES DE REVISIÓN (progreso tienda a tienda)
  //  Se guardan en el propio dispositivo (IndexedDB: admite las fotos). Clave:
  //  usuario | cliente | alcance (R:ruta · U:ubicaciones · todo). Caducan a los 30 días.
  // ─────────────────────────────────────────────────────────
  const Borradores = (() => {
    const DB = 'autopuerta-borradores', ST = 'revisiones', CADUCA_MS = 30 * 86400000;
    let _db = null;
    const abrir = () => _db ? Promise.resolve(_db) : new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('Este navegador no permite guardar borradores'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'key' });
      r.onsuccess = () => { _db = r.result; res(_db); };
      r.onerror = () => rej(r.error);
    });
    const tx = async (modo, fn) => {
      const db = await abrir();
      return new Promise((res, rej) => {
        const t = db.transaction(ST, modo); const rq = fn(t.objectStore(ST));
        t.oncomplete = () => res(rq ? rq.result : undefined);
        t.onerror = t.onabort = () => rej(t.error);
      });
    };
    const usuario = () => String((window.authState && window.authState.user && window.authState.user.id) || 'local');
    const alcance = (opts) => {
      const u = (opts.ubicacionIds || []).map(String);
      if (u.length === 1) return 'U:' + u[0];
      if (opts.rutaId) return 'R:' + opts.rutaId;
      if (u.length) return 'U:' + u.slice().sort().join(',');
      return 'todo';
    };
    const clave = opts => usuario() + '|' + opts.clienteId + '|' + alcance(opts);
    const vigente = r => r && (Date.now() - r.savedAt) < CADUCA_MS;
    return {
      clave, alcance,
      guardar: (key, opts, datos, resumen) => tx('readwrite', s => s.put({ key, usuario: usuario(), clienteId: String(opts.clienteId), alcance: alcance(opts), savedAt: Date.now(), resumen, datos })),
      obtener: async key => { const r = await tx('readonly', s => s.get(key)); if (r && !vigente(r)) { await tx('readwrite', s => s.delete(key)); return null; } return r || null; },
      borrar: key => tx('readwrite', s => s.delete(key)),
      // Borradores del usuario para un cliente (sin los datos pesados)
      listar: async clienteId => {
        const todos = await tx('readonly', s => s.getAll());
        return (todos || []).filter(r => r.usuario === usuario() && String(r.clienteId) === String(clienteId) && vigente(r))
          .map(r => ({ key: r.key, alcance: r.alcance, savedAt: r.savedAt, resumen: r.resumen }));
      }
    };
  })();

  // ─────────────────────────────────────────────────────────
  //  EXPORTACIÓN
  // ─────────────────────────────────────────────────────────
  window.Central = {
    ubicacionesDe, rutasDe, puertasDe, esCentral, badgeFecha, diasHastaISO, fmt, minFecha, maxFecha, porOrden,
    getEstadoRevisiones, getPendientesRevision, reprogramarPuerta, recalcularPeriodicidades,
    verUbicaciones, formUbicacion, guardarUbicacion, eliminarUbicacion, geoUbicacionForm,
    verRutas, formRuta, guardarRuta, eliminarRuta, marcarTodasRuta, optimizarRuta,
    gestionarPuertas, formPuerta, guardarPuerta, eliminarPuerta, refrescarPeriodicidad, Borradores
  };
  window.openConfigPeriodicidad = openConfigPeriodicidad;
  window.gestionarUbicaciones = verUbicaciones;
  window.gestionarPuertas = gestionarPuertas;
  window.getEstadoRevisiones = getEstadoRevisiones;
  window.getPendientesRevision = getPendientesRevision;
})();
