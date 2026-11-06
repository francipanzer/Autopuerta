/* =========================================================
 * historico-puertas.js — Histórico de intervenciones por puerta
 *  · verHistoricoPuerta(id)     : timeline de partes y revisiones de una puerta
 *  · mostrarBuscadorPuertas()   : buscador por texto, cliente, tipo y estado
 * visible para admin y técnicos. Sin dependencias de SQL nuevo.
 * ========================================================= */
(function () {
  'use strict';
  const esc = s => window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '');

  // Todas las intervenciones registradas sobre una puerta: partes de trabajo + revisiones programadas
  async function recolectarHistorial(puertaId) {
    const [partes, revisiones] = await Promise.all([
      dbGetAll('partesTrabajo').catch(() => []),
      dbGetAll('revisiones').catch(() => [])
    ]);
    const eventos = [];

    // Partes de trabajo donde la puerta fue intervenida
    partes.forEach(pt => {
      if (!(pt.puertaIds || []).some(pid => String(pid) === String(puertaId))) return;
      const det = (pt.puertasDetalle || pt.puertasdetalle || {})[puertaId] || '';
      eventos.push({
        fecha: pt.fecha || '',
        tipo: 'parte',
        titulo: 'Parte de trabajo ' + (pt.id || ''),
        tecnico: pt.empleadoNombre || '—',
        detalle: det || pt.descripcion || '',
        enlace: `verFichaParte('${esc(pt.id)}')`
      });
    });

    // Revisiones programadas (checklist HIPERBER/Dotics) que incluyeron esta puerta
    revisiones.forEach(rev => {
      const items = (rev.items || []).filter(it => String(it.puertaId || '') === String(puertaId));
      if (!items.length) return;
      const it = items[0];
      const hallazgo = it.hallazgoTexto || (it.hallazgo === 'X' ? 'Hallazgo detectado' : '');
      const correctivo = it.correctivoTexto || '';
      const detalle = [hallazgo, correctivo].filter(Boolean).join(' · Correctivo: ') || 'Revisión sin incidencias';
      eventos.push({
        fecha: rev.fecha || '',
        tipo: 'revision',
        titulo: 'Revisión' + (rev.id ? ' ' + rev.id : ''),
        tecnico: rev.tecnicoNombre || '—',
        detalle,
        enlace: `generatePDF_revision('${esc(rev.id)}')`
      });
    });

    return eventos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  // Modal: historial de una puerta (timeline vertical con puntos verdes/naranjas)
  window.verHistoricoPuerta = async function (puertaId) {
    if (!puertaId) return;
    const puerta = await dbGet('puertas', puertaId).catch(() => null);
    const cliente = puerta?.clienteId ? await dbGet('clientes', puerta.clienteId).catch(() => null) : null;

    const eventos = await recolectarHistorial(puertaId);

    // Aviso inmediato: puerta sin ninguna intervención registrada (ni partes ni revisiones)
    if (!eventos.length) {
      showToast('La puerta «' + (puerta?.nombre || puertaId) + '» no tiene ninguna intervención registrada todavía', 'info');
    }

    openModal('🚪 Historial · ' + (puerta?.nombre || 'Puerta'),
      '<div id="hist-puerta-body" style="min-height:80px"><p style="color:var(--text-muted)">Cargando historial…</p></div>',
      '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>' +
      (puerta?.clienteId ? '<button class="btn btn-primary btn-sm" onclick="closeModal();gestionarPuertas(\'' + esc(puerta.clienteId) + '\')"><i class="fas fa-door-open"></i> Puertas del cliente</button>' : ''));

    const body = document.getElementById('hist-puerta-body');
    if (!body) return;

    const ficha =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">' +
      '<div><small style="color:var(--text-muted);display:block">Cliente</small><div style="font-weight:600">' + esc(cliente?.nombre || '—') + '</div></div>' +
      '<div><small style="color:var(--text-muted);display:block">Tipo</small><div style="font-weight:600">' + esc(puerta?.tipo || '—') + '</div></div>' +
      '<div><small style="color:var(--text-muted);display:block">Nº de serie</small><div style="font-weight:600">' + esc(puerta?.numeroSerie || '—') + '</div></div>' +
      '<div><small style="color:var(--text-muted);display:block">Próx. revisión</small><div style="font-weight:600">' + esc(puerta?.proximaRevision ? formatDate(puerta.proximaRevision) : '—') + '</div></div>' +
      '</div>';

    const timeline = eventos.length
      ? '<div style="border-left:3px solid var(--primary,#16a34a);margin-left:6px;padding-left:14px;display:flex;flex-direction:column;gap:12px;max-height:50vh;overflow:auto">' +
      eventos.map(ev => {
        const color = ev.tipo === 'parte' ? '#f59e0b' : '#16a34a';
        const icono = ev.tipo === 'parte' ? 'fa-screwdriver-wrench' : 'fa-clipboard-check';
        return '<div style="position:relative;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-alt)">' +
          '<span style="position:absolute;left:-24px;top:12px;width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid var(--surface)"></span>' +
          '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<strong style="font-size:13px"><i class="fas ' + icono + '" style="color:' + color + ';margin-right:6px"></i>' + esc(ev.titulo) + '</strong>' +
          '<small style="color:var(--text-muted)">' + esc(formatDate(ev.fecha)) + '</small>' +
          '</div>' +
          '<div style="font-size:13px;margin-top:4px">' + esc(ev.detalle || 'Sin observaciones') + '</div>' +
          '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;align-items:center">' +
          '<small style="color:var(--text-muted)">Técnico: ' + esc(ev.tecnico) + '</small>' +
          '<button class="btn btn-outline btn-sm" onclick="' + ev.enlace + '"><i class="fas fa-eye"></i> Ver</button>' +
          '</div>' +
          '</div>';
      }).join('') + '</div>'
      : '<div class="empty-state" style="padding:24px"><i class="fas fa-clock-rotate-left" style="font-size:28px;color:var(--text-muted)"></i>' +
      '<p style="margin-top:10px">Esta puerta todavía no tiene intervenciones registradas.<br><small>Cada parte o revisión donde la marques quedará aquí.</small></p></div>';

    body.innerHTML = ficha + timeline;
  };

  // Buscador de puertas: texto libre + filtro por cliente, tipo y estado
  window.mostrarBuscadorPuertas = async function () {
    const [puertas, clientes, tipos] = await Promise.all([
      dbGetAll('puertas'), dbGetAll('clientes'), window.TiposPuerta.filasDB()
    ]);
    const clientesMap = new Map(clientes.map(c => [String(c.id), c.nombre]));
    const tiposMap = new Map(tipos.map(t => [String(t.id), t.nombre]));
    window.__puertasBusqueda = { puertas, clientesMap, tiposMap };

    openModal('🔍 Buscador de puertas',
      '<div class="search-bar" style="margin-bottom:12px">' +
      '<input type="text" id="bp_q" placeholder="Nombre, nº de serie o cliente…" oninput="renderBuscadorPuertas()">' +
      '<select id="bp_cliente" onchange="renderBuscadorPuertas()"><option value="">Todos los clientes</option>' +
      clientes.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(c =>
        '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>').join('') + '</select>' +
      '<select id="bp_tipo" onchange="renderBuscadorPuertas()"><option value="">Todos los tipos</option>' +
      tipos.map(t => '<option value="' + esc(t.id) + '">' + esc(t.nombre) + '</option>').join('') + '</select>' +
      '<select id="bp_estado" onchange="renderBuscadorPuertas()">' +
      '<option value="">Todos los estados</option>' +
      '<option value="operativa">Operativa</option><option value="averiada">Averiada</option><option value="fuera_servicio">Fuera de servicio</option></select>' +
      '</div>' +
      '<div class="table-wrapper" style="max-height:50vh;overflow:auto"><table><thead>' +
      '<tr><th>Puerta</th><th>Cliente</th><th>Tipo</th><th>Nº serie</th><th>Estado</th><th></th></tr>' +
      '</thead><tbody id="bp_body"></tbody></table></div>',
      '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>');
    window.renderBuscadorPuertas();
  };

  // Pinta los resultados del buscador según los filtros
  window.renderBuscadorPuertas = function () {
    const datos = window.__puertasBusqueda;
    const body = document.getElementById('bp_body');
    if (!datos || !body) return;
    const q = (document.getElementById('bp_q')?.value || '').toLowerCase();
    const cli = document.getElementById('bp_cliente')?.value || '';
    const tip = document.getElementById('bp_tipo')?.value || '';
    const est = document.getElementById('bp_estado')?.value || '';
    const filas = datos.puertas.filter(p => {
      const clienteNombre = datos.clientesMap.get(String(p.clienteId)) || '';
      const texto = [p.nombre, p.numeroSerie, p.marca, clienteNombre].join(' ').toLowerCase();
      if (q && !texto.includes(q)) return false;
      if (cli && String(p.clienteId) !== String(cli)) return false;
      // El tipo se compara en CUALQUIER formato (key/nombre/id): antes solo
      // coincidía si la puerta guardaba el id exacto del select y nunca encontraba nada
      if (tip && !(window.mismoTipoPuerta || mismoTipoPuerta)(p.tipo, tip)) return false;
      if (est && p.estado !== est) return false;
      return true;
    }).sort((a, b) => (datos.clientesMap.get(String(a.clienteId)) || '').localeCompare(datos.clientesMap.get(String(b.clienteId)) || ''));
    const estados = { operativa: ['🟢 Operativa', 'badge-green'], averiada: ['🔴 Averiada', 'badge-red'], fuera_servicio: ['⚪ Fuera de servicio', 'badge-gray'] };
    body.innerHTML = filas.map(p => {
      const [txt, cls] = estados[p.estado] || [p.estado || '—', 'badge-gray'];
      const tipoNombre = tiposMapCache.get(String(p.tipo)) || datos.tiposMap.get(String(p.tipo)) || p.tipo || '—';
      return '<tr style="cursor:pointer" onclick="closeModal();verHistoricoPuerta(\'' + esc(p.id) + '\')">' +
        '<td><strong>' + esc(p.nombre) + '</strong></td>' +
        '<td>' + esc(datos.clientesMap.get(String(p.clienteId)) || '—') + '</td>' +
        '<td><span class="badge badge-blue">' + esc(tipoNombre) + '</span></td>' +
        '<td>' + esc(p.numeroSerie || '—') + '</td>' +
        '<td><span class="badge ' + cls + '">' + esc(txt) + '</span></td>' +
        '<td><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();closeModal();verHistoricoPuerta(\'' + esc(p.id) + '\')"><i class="fas fa-clock-rotate-left"></i> Historial</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Sin resultados</td></tr>';
  };
})();
