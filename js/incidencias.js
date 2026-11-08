// Incidencias: el administrador las asigna a un técnico (con datos y ubicación).
(function () {
  const ESTADOS = {
    pendiente: { label: 'Pendiente', color: '#f59e0b' },
    aceptada: { label: 'Aceptada', color: '#2563eb' },
    en_camino: { label: 'En camino', color: '#7c3aed' },
    resuelta: { label: 'Resuelta', color: '#16a34a' }
  };
  const esc = value => escapeHtml(String(value ?? ''));

  function estadoBadge(estado) {
    const info = ESTADOS[estado] || { label: estado || '—', color: '#6b7280' };
    return `<span class="badge" style="background:${info.color}22;color:${info.color};border:1px solid ${info.color}55">${esc(info.label)}</span>`;
  }

  function prioridadBadge(prioridad) {
    return prioridad === 'urgente'
      ? '<span class="badge" style="background:#dc262622;color:#dc2626;border:1px solid #dc262655">🚨 Urgente</span>'
      : '<span class="badge" style="background:#6b728022;color:#6b7280;border:1px solid #6b728055">Normal</span>';
  }

  // Modal de cierre: nota de cierre + opción de crear el parte de trabajo asociado.
  // Es el único punto por el que pasa una incidencia a «resuelta» (botón del técnico o edición).
  function modalResolver(inc, alGuardar) {
    const esTecnico = !(window.isAdmin && window.isAdmin());
    openModal('✅ Resolver incidencia',
      `<div class="form-grid">
        <div class="form-group full"><label>Cliente</label><div style="font-weight:600">${esc(inc.clienteNombre)}</div></div>
        <div class="form-group full"><label>Nota de cierre (¿qué se hizo?)</label><textarea id="inc_res_nota" rows="3" placeholder="Descripción del trabajo realizado…">${esc(inc.notaTecnico || '')}</textarea></div>
        <div class="form-group full">
          <small style="color:var(--text-muted)">Si guardas y creas el parte, se abrirá el formulario de parte de trabajo precargado con estos datos y quedará vinculado a la incidencia.</small>
        </div>
      </div>`,
      '<button class="btn btn-outline" id="inc_res_solo">Solo cerrar</button>' +
      '<button class="btn btn-primary" id="inc_res_parte"><i class="fas fa-clipboard-list"></i> Guardar y crear parte</button>');
    const cerrar = async (crearParte) => {
      const nota = document.getElementById('inc_res_nota')?.value?.trim() || '';
      closeModal();
      await alGuardar(nota, crearParte);
    };
    document.getElementById('inc_res_solo').onclick = () => cerrar(false);
    document.getElementById('inc_res_parte').onclick = () => cerrar(true);
  }

  function mapsUrl(inc) {
    if (inc.lat && inc.lng) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(inc.lat + ',' + inc.lng)}`;
    if (inc.direccion) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(inc.direccion)}`;
    return '';
  }

  const MAX_FOTOS = 4;

  // Reduce la foto a JPEG de ~150 KB para guardarla dentro de la incidencia
  async function compressPhoto(file) {
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = source;
    });
    let scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    let quality = .7;
    let result = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL('image/jpeg', quality);
      if (result.length * .75 <= 150 * 1024) return result;
      if (quality > .5) quality -= .08;
      else scale *= .82;
    }
    return result;
  }

  const fotosOf = inc => (Array.isArray(inc.fotos) ? inc.fotos : []).filter(f => typeof f === 'string' && f.startsWith('data:image/'));

  function fotosHtml(inc, size = 72) {
    return fotosOf(inc).map((src, i) =>
      `<img class="inc-foto" src="${esc(src)}" alt="Foto ${i + 1}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in">`).join('');
  }

  // Ver una foto a pantalla completa al pulsarla
  document.addEventListener('click', event => {
    const img = event.target.closest('img.inc-foto');
    if (!img) return;
    const overlay = document.createElement('div');
    overlay.className = 'valgom-lightbox';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:12px;cursor:zoom-out';
    overlay.innerHTML = `<img src="${esc(img.src)}" alt="Foto de la incidencia" style="max-width:100%;max-height:100%;object-fit:contain">`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  });

  function telHref(phone) {
    const clean = String(phone || '').replace(/[^\d+]/g, '');
    return clean ? `tel:${clean}` : '';
  }

  async function loadIncidencias() {
    if (navigator.onLine) {
      const { data, error } = await window.supabaseDB.from('incidencias').select();
      if (!error) return fromJSArray(data || []);
      console.warn('[Incidencias]', error.message);
    }
    return dbGetAll('incidencias');
  }

  const isActive = inc => inc.estado !== 'resuelta';
  const sortList = list => list.slice().sort((a, b) =>
    (isActive(b) - isActive(a)) ||
    ((b.prioridad === 'urgente') - (a.prioridad === 'urgente')) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  window.refreshIncidenciasBadge = async function () {
    if (!window.authState?.user || !window.setNavBadge) return;
    try {
      const list = await loadIncidencias();
      const count = window.isAdmin()
        ? list.filter(i => isActive(i) && !i.empleadoId).length
        : list.filter(i => i.estado === 'pendiente').length;
      window.setNavBadge('incidencias', count);
    } catch (error) {
      console.warn('[Incidencias] badge:', error.message);
    }
  };

  // ───────── Administrador ─────────
  async function renderAdmin(container) {
    const filter = container.dataset.incFilter || 'activas';
    const list = sortList(await loadIncidencias());
    const shown = list.filter(i => filter === 'todas' || (filter === 'activas' ? isActive(i) : !isActive(i)));
    container.innerHTML = `
      <div class="page-header"><div><h2>Incidencias</h2><p>Asigna los avisos de los clientes a un técnico</p></div>
        <div class="header-actions"><button class="btn btn-primary" id="incNew"><i class="fas fa-plus"></i> Nueva incidencia</button></div></div>
      <div class="search-bar"><select id="incFilter">
        <option value="activas" ${filter === 'activas' ? 'selected' : ''}>Activas</option>
        <option value="resueltas" ${filter === 'resueltas' ? 'selected' : ''}>Resueltas</option>
        <option value="todas" ${filter === 'todas' ? 'selected' : ''}>Todas</option></select></div>
      <div class="card"><div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Incidencia</th><th>Prioridad</th><th>Técnico</th><th>Estado</th></tr></thead><tbody>
        ${shown.map(i => `<tr data-inc-row="${esc(i.id)}" style="cursor:pointer">
          <td>${esc(formatDate(String(i.createdAt || '').slice(0, 10)))}</td>
          <td><strong>${esc(i.clienteNombre)}</strong><div style="font-size:12px;color:var(--text-muted)">${esc(i.direccion)}</div></td>
          <td style="max-width:280px">${esc(i.descripcion)}</td>
          <td>${prioridadBadge(i.prioridad)}</td>
          <td>${i.empleadoNombre ? esc(i.empleadoNombre) : '<span style="color:#dc2626">Sin asignar</span>'}</td>
          <td>${estadoBadge(i.estado)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Sin incidencias</td></tr>'}
      </tbody></table></div></div>`;
    container.querySelector('#incNew').onclick = () => showIncidenciaForm();
    container.querySelector('#incFilter').onchange = event => { container.dataset.incFilter = event.target.value; renderAdmin(container); };
    container.querySelector('tbody').addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      const row = e.target.closest('tr[data-inc-row]');
      if (row) verFichaIncidencia(row.dataset.incRow, () => renderAdmin(container));
    });
    window.refreshIncidenciasBadge();
  }

  // Ficha completa de la incidencia en modal (datos + acciones)
  window.verFichaIncidencia = function (id, refresh) {
    loadIncidencias().then(async list => {
      const i = list.find(x => String(x.id) === String(id));
      if (!i) return;
      // Parte de trabajo vinculado (creado al resolver la incidencia)
      let parteVinculado = null;
      try {
        const partes = await dbGetAll('partesTrabajo');
        parteVinculado = partes.find(pt => String(pt.incidenciaId || '') === String(i.id)) || null;
      } catch (_) { }
      const fila = (etiqueta, valor) => (valor === undefined || valor === null || String(valor).trim() === '') ? '' :
        `<div><small style="color:var(--text-muted);display:block">${etiqueta}</small><div style="font-weight:600">${valor}</div></div>`;
      const mapa = mapsUrl(i);
      const tel = telHref(i.telefono);
      const actions = [
        '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>',
        '<button class="btn btn-primary btn-sm" onclick="closeModal();showIncidenciaForm(\'' + esc(i.id) + '\')"><i class="fas fa-pen"></i> Editar</button>'
      ];
      if (mapa) actions.push(`<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="${esc(mapa)}"><i class="fas fa-location-dot"></i> Ver ubicación</a>`);
      if (tel) actions.push(`<a class="btn btn-primary btn-sm" href="${esc(tel)}"><i class="fas fa-phone"></i> Llamar</a>`);
      actions.push('<button class="btn btn-danger btn-sm" onclick="closeModal();confirmDelete(\'esta incidencia\', ()=>{ dbDelete(\'incidencias\', \'' + esc(i.id) + '\').then(()=>{ showToast(\'Incidencia eliminada\'); window.refreshIncidenciasBadge();' + (typeof refresh === 'function' ? ' (window.__incRefresh||function(){})();' : ' navigateTo(\'incidencias\');') + '}); })"><i class="fas fa-trash"></i> Eliminar</button>');
      openModal('🔔 Incidencia · ' + esc(i.clienteNombre),
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
          fila('Fecha', esc(formatDate(String(i.createdAt || '').slice(0, 10)))) +
          fila('Cliente', esc(i.clienteNombre)) +
          fila('Teléfono', esc(i.telefono || '—')) +
          fila('Dirección / ubicación', esc(i.direccion || '—')) +
          fila('Prioridad', prioridadBadge(i.prioridad)) +
          fila('Técnico', i.empleadoNombre ? esc(i.empleadoNombre) : '<span style="color:#dc2626">Sin asignar</span>') +
          fila('Estado', estadoBadge(i.estado)) +
          (i.resueltaAt ? fila('Resuelta', esc(formatDate(String(i.resueltaAt).slice(0, 10)))) : '') +
          (parteVinculado ? fila('Parte de trabajo', '<span class="badge badge-blue" style="cursor:pointer" onclick="closeModal();verFichaParte(\'' + esc(parteVinculado.id) + '\')"><i class="fas fa-clipboard-list"></i> ' + esc(parteVinculado.id) + '</span>') : '') +
          '<div style="grid-column:1/-1"><small style="color:var(--text-muted);display:block">Descripción</small><div>' + esc(i.descripcion) + '</div></div>' +
          (i.notaTecnico ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted);display:block">Nota del técnico</small><div>' + esc(i.notaTecnico) + '</div></div>' : '') +
          (fotosOf(i).length ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted);display:block">Fotos</small><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' + fotosHtml(i, 84) + '</div></div>' : '') +
        '</div>',
        actions.join(''));
    });
  };

  async function getEmployeesWithAccess() {
    try {
      const { data } = await window.supabaseDB.from('user_profiles').select('employee_id,role,is_active');
      return new Set((data || []).filter(p => p.role === 'technician' && p.is_active && p.employee_id).map(p => String(p.employee_id)));
    } catch (_) {
      return null;
    }
  }

  window.showIncidenciaForm = async function (id) {
    const [clientes, empleados, withAccess, existing] = await Promise.all([
      dbGetAll('clientes'), dbGetAll('empleados'), getEmployeesWithAccess(),
      id ? loadIncidencias().then(list => list.find(i => String(i.id) === String(id))) : Promise.resolve(null)
    ]);
    const inc = existing || { prioridad: 'normal', estado: 'pendiente' };
    let coords = inc.lat && inc.lng ? { lat: inc.lat, lng: inc.lng } : null;
    let fotos = fotosOf(inc);

    const form = `<div class="form-grid">
      <div class="form-group full"><label>Cliente</label><select id="inc_cliente">
        <option value="">— Cliente no registrado —</option>
        ${clientes.map(c => `<option value="${esc(c.id)}" ${String(inc.clienteId) === String(c.id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Nombre del cliente *</label><input id="inc_nombre" value="${esc(inc.clienteNombre)}"></div>
      <div class="form-group"><label>Teléfono</label><input id="inc_tel" type="tel" value="${esc(inc.telefono)}"></div>
      <div class="form-group full"><label>Dirección / ubicación</label><input id="inc_dir" value="${esc(inc.direccion)}" placeholder="Calle, número, localidad">
        <small id="inc_geo" style="color:var(--text-muted);font-size:11px">${coords ? '✅ Con coordenadas' : 'El técnico verá un botón “Cómo llegar” con esta dirección'}</small></div>
      <div class="form-group full"><label>Descripción de la incidencia *</label><textarea id="inc_desc" rows="3">${esc(inc.descripcion)}</textarea></div>
      <div class="form-group full"><label>Fotos (máx. ${MAX_FOTOS})</label>
        <div id="inc_fotos" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"></div>
        <button type="button" class="btn btn-outline btn-sm" id="inc_foto_btn"><i class="fas fa-camera"></i> Añadir fotos</button>
        <input id="inc_foto_input" type="file" accept="image/*" multiple hidden></div>
      <div class="form-group"><label>Prioridad</label><select id="inc_prio">
        <option value="normal" ${inc.prioridad !== 'urgente' ? 'selected' : ''}>Normal</option>
        <option value="urgente" ${inc.prioridad === 'urgente' ? 'selected' : ''}>🚨 Urgente</option></select></div>
      <div class="form-group"><label>Asignar a</label><select id="inc_emp">
        <option value="">— Sin asignar —</option>
        ${empleados.map(e => `<option value="${esc(e.id)}" ${String(inc.empleadoId) === String(e.id) ? 'selected' : ''}>${esc(e.nombre)}${withAccess && !withAccess.has(String(e.id)) ? ' (sin acceso a la app)' : ''}</option>`).join('')}</select></div>
      ${existing ? `<div class="form-group"><label>Estado</label><select id="inc_estado">${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${inc.estado === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>` : ''}
    </div>`;
    const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="incSave"><i class="fas fa-paper-plane"></i> Guardar y avisar</button>';
    openModal(existing ? 'Editar incidencia' : 'Nueva incidencia', form, footer);

    const $ = sel => document.getElementById(sel);
    $('inc_cliente').onchange = () => {
      const cliente = clientes.find(c => String(c.id) === $('inc_cliente').value);
      if (!cliente) { coords = null; return; }
      $('inc_nombre').value = cliente.nombre || '';
      $('inc_tel').value = cliente.telefono || '';
      $('inc_dir').value = cliente.direccion || '';
      coords = cliente.lat && cliente.lng ? { lat: cliente.lat, lng: cliente.lng } : null;
      $('inc_geo').textContent = coords ? '✅ Con coordenadas' : 'El técnico verá un botón “Cómo llegar” con esta dirección';
    };
    const paintFotos = () => {
      $('inc_fotos').innerHTML = fotos.map((src, i) =>
        `<div style="position:relative;width:80px;height:80px"><img class="inc-foto" src="${esc(src)}" alt="Foto ${i + 1}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:2px solid var(--primary)">
          <button type="button" data-inc-foto-del="${i}" style="position:absolute;top:2px;right:2px;width:22px;height:22px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:13px">×</button></div>`).join('');
      $('inc_fotos').querySelectorAll('[data-inc-foto-del]').forEach(btn => btn.onclick = () => {
        fotos.splice(Number(btn.dataset.incFotoDel), 1);
        paintFotos();
      });
      $('inc_foto_btn').disabled = fotos.length >= MAX_FOTOS;
    };
    paintFotos();
    $('inc_foto_btn').onclick = () => $('inc_foto_input').click();
    $('inc_foto_input').onchange = async event => {
      const files = [...event.target.files].slice(0, MAX_FOTOS - fotos.length);
      event.target.value = '';
      for (const file of files) {
        try {
          fotos.push(await compressPhoto(file));
        } catch (error) {
          showToast(error.message || 'No se pudo procesar la foto', 'error');
        }
      }
      paintFotos();
    };
    $('inc_dir').oninput = () => { coords = null; $('inc_geo').textContent = 'El técnico verá un botón “Cómo llegar” con esta dirección'; };

    $('incSave').onclick = async () => {
      const nombre = $('inc_nombre').value.trim();
      const descripcion = $('inc_desc').value.trim();
      if (!nombre || !descripcion) { showToast('Indica el cliente y la descripción', 'error'); return; }
      const empleadoId = $('inc_emp').value || null;
      const empleado = empleados.find(e => String(e.id) === String(empleadoId));
      const reassigned = existing && String(existing.empleadoId || '') !== String(empleadoId || '');
      const data = {
        ...(existing || {}),
        id: existing ? existing.id : window.db.nextId('INC'),
        clienteId: $('inc_cliente').value || null,
        clienteNombre: nombre,
        telefono: $('inc_tel').value.trim(),
        direccion: $('inc_dir').value.trim(),
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        descripcion,
        prioridad: $('inc_prio').value,
        empleadoId,
        empleadoNombre: empleado ? empleado.nombre : '',
        estado: reassigned ? 'pendiente' : ($('inc_estado')?.value || 'pendiente'),
        createdBy: existing?.createdBy || window.authState.user.id
      };
      // Solo se envía "fotos" si hay o había, así sigue funcionando hasta ejecutar el SQL de fotos
      if (fotos.length || existing?.fotos !== undefined) data.fotos = fotos;
      if (data.estado !== 'resuelta') data.resueltaAt = null;
      $('incSave').disabled = true;
      try {
        const estabaResuelta = existing && existing.estado === 'resuelta';
        if (data.estado === 'resuelta' && !estabaResuelta) {
          // Primera vez que pasa a resuelta: ofrecer el parte de trabajo vinculado
          closeModal();
          modalResolver(data, async (nota, crearParte) => {
            data.notaTecnico = nota || data.notaTecnico || '';
            data.resueltaAt = new Date().toISOString();
            try {
              await dbPut('incidencias', data);
              showToast('Incidencia marcada como resuelta');
              if (crearParte) {
                await navigateTo('partesTrabajo');
                showParteForm(null, {
                  clienteId: data.clienteId || '',
                  clienteNombre: data.clienteNombre || '',
                  descripcion: (data.descripcion || '') + (nota ? '\n— Resolución: ' + nota : ''),
                  incidenciaId: data.id
                });
              } else {
                navigateTo('incidencias');
              }
            } catch (error) {
              console.error(error);
              showToast('No se pudo guardar: ' + error.message, 'error');
            }
          });
          return;
        }
        await dbPut('incidencias', data);
        closeModal();
        showToast(empleado ? `Incidencia asignada a ${empleado.nombre}` : 'Incidencia guardada');
        navigateTo('incidencias');
      } catch (error) {
        console.error(error);
        showToast('No se pudo guardar: ' + error.message, 'error');
        $('incSave').disabled = false;
      }
    };
  };

  // ───────── Técnico ─────────
  const NEXT_ACTION = {
    pendiente: { estado: 'aceptada', label: 'Aceptar', icon: 'fa-check' },
    aceptada: { estado: 'en_camino', label: 'Voy de camino', icon: 'fa-van-shuttle' },
    en_camino: { estado: 'resuelta', label: 'Marcar como resuelta', icon: 'fa-circle-check' }
  };

  function techCard(inc) {
    const maps = mapsUrl(inc);
    const tel = telHref(inc.telefono);
    const action = NEXT_ACTION[inc.estado];
    return `<div class="card" style="margin-bottom:12px;border-left:4px solid ${inc.prioridad === 'urgente' ? '#dc2626' : (ESTADOS[inc.estado]?.color || '#6b7280')}">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <strong style="font-size:16px">${esc(inc.clienteNombre)}</strong><span>${prioridadBadge(inc.prioridad)} ${estadoBadge(inc.estado)}</span></div>
        <p style="margin:6px 0">${esc(inc.descripcion)}</p>
        ${inc.direccion ? `<p style="margin:4px 0;color:var(--text-muted)"><i class="fas fa-location-dot"></i> ${esc(inc.direccion)}</p>` : ''}
        ${fotosOf(inc).length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">${fotosHtml(inc, 84)}</div>` : ''}
        ${inc.notaTecnico ? `<p style="margin:4px 0;font-size:13px"><em>Tu nota: ${esc(inc.notaTecnico)}</em></p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${maps ? `<a class="btn btn-outline" target="_blank" rel="noopener" href="${esc(maps)}"><i class="fas fa-route"></i> Cómo llegar</a>` : ''}
          ${tel ? `<a class="btn btn-outline" href="${esc(tel)}"><i class="fas fa-phone"></i> Llamar</a>` : ''}
          ${action ? `<button class="btn btn-primary" data-inc-next="${esc(inc.id)}" data-estado="${action.estado}"><i class="fas ${action.icon}"></i> ${action.label}</button>` : ''}
          <button class="btn btn-outline" data-inc-parte="${esc(inc.id)}"><i class="fas fa-clipboard-list"></i> Crear parte</button>
        </div></div></div>`;
  }

  async function renderTech(container) {
    const myEmployee = String(window.authState.profile?.employee_id || '');
    const all = sortList((await loadIncidencias()).filter(i => String(i.empleadoId || '') === myEmployee));
    const active = all.filter(isActive);
    const done = all.filter(i => !isActive(i)).slice(0, 10);
    container.innerHTML = `
      <div class="page-header"><div><h2>Mis incidencias</h2><p>Avisos de clientes asignados a ti</p></div></div>
      ${active.map(techCard).join('') || '<div class="card"><div class="card-body">No tienes incidencias pendientes. 👌</div></div>'}
      ${done.length ? `<h3 style="margin:20px 0 10px">Resueltas recientes</h3>${done.map(techCard).join('')}` : ''}`;
    container.querySelectorAll('[data-inc-next]').forEach(btn => btn.onclick = () => {
      const estado = btn.dataset.estado;
      const inc = all.find(i => String(i.id) === btn.dataset.incNext);
      if (estado !== 'resuelta') {
        marcarEstado(inc.id, estado, null, container);
        return;
      }
      // Cierre con modal: nota + opción de crear el parte de trabajo vinculado
      modalResolver(inc, async (nota, crearParte) => {
        const ok = await marcarEstado(inc.id, estado, nota, container);
        if (ok && crearParte) {
          await navigateTo('partesTrabajo');
          showParteForm(null, {
            clienteId: inc.clienteId || '',
            clienteNombre: inc.clienteNombre || '',
            descripcion: (inc.descripcion || '') + (nota ? '\n— Resolución: ' + nota : ''),
            incidenciaId: inc.id
          });
        }
      });
    });
    container.querySelectorAll('[data-inc-parte]').forEach(btn => btn.onclick = async () => {
      const inc = all.find(i => String(i.id) === btn.dataset.incParte);
      await navigateTo('partesTrabajo');
      showParteForm(null, {
        clienteId: inc.clienteId || '',
        clienteNombre: inc.clienteNombre || '',
        descripcion: inc.descripcion || '',
        incidenciaId: inc.id
      });
    });
    window.refreshIncidenciasBadge();
  }

  // Actualiza el estado de una incidencia vía RPC del técnico. Devuelve true si fue bien.
  async function marcarEstado(id, estado, nota, container) {
    const { error } = await window.supabaseDB.rpc('update_incidencia_estado', { p_id: id, p_estado: estado, p_nota: nota });
    if (error) { showToast('No se pudo actualizar: ' + error.message, 'error'); return false; }
    showToast(estado === 'resuelta' ? 'Incidencia marcada como resuelta' : 'Estado actualizado');
    if (container) renderTech(container);
    window.refreshIncidenciasBadge();
    return true;
  }

  window.render_incidencias = async function (container) {
    return window.isAdmin() ? renderAdmin(container) : renderTech(container);
  };

  // Tarjeta de incidencias en el panel del técnico
  const originalTechDashboard = window.renderTechnicianDashboard;
  if (originalTechDashboard) {
    window.renderTechnicianDashboard = async function (container) {
      await originalTechDashboard(container);
      try {
        const myEmployee = String(window.authState.profile?.employee_id || '');
        const active = sortList((await loadIncidencias()).filter(i => isActive(i) && String(i.empleadoId || '') === myEmployee));
        if (!active.length) return;
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><h3>Incidencias asignadas (${active.length})</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('incidencias')">Ver todas</button></div>
          <div class="card-body">${active.slice(0, 4).map(i => `<p class="help-notice" style="border-left:4px solid ${i.prioridad === 'urgente' ? '#dc2626' : '#f59e0b'}"><strong>${esc(i.clienteNombre)}</strong> · ${esc(i.descripcion).slice(0, 90)}</p>`).join('')}</div>`;
        container.querySelector('.page-header')?.after(card);
      } catch (error) {
        console.warn('[Incidencias] panel:', error.message);
      }
    };
  }

  window.addEventListener('valgom:authenticated', () => window.refreshIncidenciasBadge());
  setInterval(() => { if (window.authState?.user && !document.hidden) window.refreshIncidenciasBadge(); }, 60000);
})();
