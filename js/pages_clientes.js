window.render_clientes = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Clientes</h2><p>Gestión de clientes</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showClienteForm()"><i class="fas fa-plus"></i> Nuevo Cliente</button><button class="btn btn-success" onclick="showImportClientesModal()"><i class="fas fa-file-excel"></i> Importar Excel/CSV</button><button class="btn btn-secondary" onclick="showImportFolioModal()"><i class="fas fa-file-image"></i> Importar datos</button><button class="btn btn-secondary" onclick="showDuplicadosClientes()" title="Buscar y fusionar clientes duplicados"><i class="fas fa-clone"></i> Duplicados</button><button class="btn btn-secondary" onclick="mostrarBuscadorPuertas()" title="Buscar puertas y ver su histórico de intervenciones"><i class="fas fa-magnifying-glass"></i> Buscar puertas</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar cliente..." id="searchCliente" oninput="window.__cliPagina=0;renderClientes()">'+
      '<select id="filterTipo" onchange="window.__cliPagina=0;renderClientes()"><option value="">Todos</option><option value="empresa">Empresa</option><option value="particular">Particular</option></select>'+
      '<select id="filterModo" onchange="window.__cliPagina=0;renderClientes()"><option value="">Todos los clientes</option><option value="individual">Individuales</option><option value="central">Centrales (varias ubicaciones)</option><option value="mantenimiento">Con mantenimiento</option></select>'+
      '<select id="filterProvincia" onchange="window.__cliPagina=0;renderClientes()"><option value="">Todas las provincias</option></select></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>Nombre</th></tr>'+
    '</thead><tbody id="clientesBody"></tbody></table></div></div>'+
    '<div id="navClientes" style="display:none;text-align:center;margin-top:12px">'+
      '<button class="btn btn-outline btn-sm" id="btnCliPrev" style="display:none"><i class="fas fa-chevron-up"></i> Mostrar menos</button> '+
      '<button class="btn btn-outline btn-sm" id="btnCliMore">Mostrar más</button>'+
    '</div>'+
    '<div style="margin-top:10px"><small id="cliContador" style="color:var(--text-muted)"></small></div>';
  renderClientes();
};

// Extraer provincia de la dirección compuesta ("..., 30001 Murcia, Murcia")
window.__provinciaDeCliente = function(c){
  const dir = String(c.direccion||'');
  const partes = dir.split(',').map(s=>s.trim()).filter(Boolean);
  return partes.length>=2 ? partes[partes.length-1] : '';
};

window.__cliPagina = 0; // índice de bloque de 20
window.renderClientes = async function(){
  const [clientes, ubicaciones] = await Promise.all([ dbGetAll('clientes'), dbGetAll('ubicaciones') ]);
  const nUbic = new Map();
  ubicaciones.forEach(u=>{ const k=String(u.clienteId); nUbic.set(k,(nUbic.get(k)||0)+1); });
  const q = (document.getElementById('searchCliente')?.value||'').toLowerCase();
  const tipo = document.getElementById('filterTipo')?.value||'';
  const modo = document.getElementById('filterModo')?.value||'';
  const provSel = document.getElementById('filterProvincia');
  const prov = provSel?.value||'';
  window.__bindCliNav?.();
  if(provSel && provSel.options.length<=1){
    const provs = [...new Set(clientes.map(window.__provinciaDeCliente).filter(Boolean))].sort();
    provSel.innerHTML = '<option value="">Todas las provincias</option>' + provs.map(p=>'<option>'+escapeHtml(p)+'</option>').join('');
  }
  const filtered = clientes
    .filter(c=>{
      if(q && !(JSON.stringify(c).toLowerCase().includes(q) || ubicaciones.some(u=>String(u.clienteId)===String(c.id) && JSON.stringify(u).toLowerCase().includes(q)))) return false;
      if(tipo && c.tipo!==tipo) return false;
      if(modo==='central' && c.central!==true) return false;
      if(modo==='individual' && c.central===true) return false;
      if(modo==='mantenimiento' && c.mantenimiento!==true) return false;
      if(prov && window.__provinciaDeCliente(c)!==prov) return false;
      return true;
    })
    .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));

  const POR_PAG = 20;
  const total = filtered.length;
  const inicio = window.__cliPagina * POR_PAG;
  const visibles = filtered.slice(inicio, inicio + POR_PAG);

  const tbody = document.getElementById('clientesBody');
  if(!tbody) return;
  tbody.innerHTML = visibles.map(c=>
    '<tr data-cliente-row="'+escapeHtml(c.id)+'" style="cursor:pointer"><td style="padding:9px 14px"><strong>'+escapeHtml(c.nombre)+'</strong>'+
      (c.central===true ? ' <span class="badge badge-blue badge-sm"><i class="fas fa-sitemap"></i> Central · '+(nUbic.get(String(c.id))||0)+' ubicaci'+((nUbic.get(String(c.id))||0)===1?'ón':'ones')+'</span>' : '')+
      (c.mantenimiento===true ? ' <span class="badge badge-green badge-sm"><i class="fas fa-screwdriver-wrench"></i> Mantenimiento</span>' : '')+
      '</td></tr>'
  ).join('') || '<tr><td style="text-align:center;padding:30px;color:var(--text-muted)">Sin clientes</td></tr>';

  // Botones mostrar más / menos
  const nav = document.getElementById('navClientes');
  if(nav){
    nav.style.display = total > POR_PAG ? 'block' : 'none';
    document.getElementById('btnCliMore').style.display = (inicio+POR_PAG < total) ? '' : 'none';
    document.getElementById('btnCliPrev').style.display = (inicio > 0) ? '' : 'none';
  }
  const cont = document.getElementById('cliContador');
  if(cont) cont.textContent = total ? ('Mostrando ' + (inicio+1) + '–' + Math.min(inicio+POR_PAG, total) + ' de ' + total + ' clientes') : '';

  if(!tbody.__panelBound){
    tbody.__panelBound = true;
    tbody.addEventListener('click', e => {
      const row = e.target.closest('tr[data-cliente-row]');
      if(row) window.verFichaCliente(row.dataset.clienteRow);
    });
  }
};

window.clientesMostrarMas = function(){ window.__cliPagina++; renderClientes(); };
window.clientesMostrarMenos = function(){ window.__cliPagina = Math.max(0, window.__cliPagina-1); renderClientes(); };
window.__bindCliNav = function(){
  const more = document.getElementById('btnCliMore');
  const prev = document.getElementById('btnCliPrev');
  if(more && !more.__bound){ more.__bound = true; more.addEventListener('click', window.clientesMostrarMas); }
  if(prev && !prev.__bound){ prev.__bound = true; prev.addEventListener('click', window.clientesMostrarMenos); }
};

window.verFichaCliente = async function(id){
  const c = await dbGet('clientes', id);
  if(!c) return;
  const dir = String(c.direccion||'');
  const central = c.central===true;
  const [ubics, rutas, puertas] = await Promise.all([ window.Central.ubicacionesDe(id), window.Central.rutasDe(id), window.Central.puertasDe(id) ]);
  const admin = window.isAdmin?.();
  const cid = escapeHtml(c.id);
  const resumenUbic = central
    ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Ubicaciones ('+ubics.length+') · Rutas ('+rutas.length+')</small><div>'+
        (ubics.length ? ubics.map(u=>'<span class="badge badge-blue" style="margin:2px">📍 '+escapeHtml(u.denominacion)+' · '+puertas.filter(p=>String(p.ubicacionId)===String(u.id)).length+' 🚪</span>').join('') : '<em style="color:var(--text-muted)">Aún sin ubicaciones</em>')+
      '</div></div>'
    : '';
  const fila = (k,v)=>'<div><small style="color:var(--text-muted)">'+k+'</small><div>'+v+'</div></div>';
  openModal('👤 ' + (c.nombre || 'Cliente'),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px">'+
      fila('ID','<strong>'+escapeHtml(c.id)+'</strong>')+
      fila('Tipo',c.tipo==='empresa'?'Empresa':'Particular')+
      fila('Modalidad',central?'Central (varias ubicaciones)':'Individual (una nave)')+
      fila('Mantenimiento',c.mantenimiento===true?'<span class="badge badge-green">Contratado</span>':'<span class="badge badge-gray">No contratado</span>')+
      fila('DNI / CIF','<strong>'+escapeHtml(c.dni||'—')+'</strong>')+
      fila('Contacto',escapeHtml(c.contacto||'—'))+
      fila('Teléfono',escapeHtml(c.telefono||'—'))+
      fila('Email',escapeHtml(c.email||'—'))+
      '<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Dirección</small><div>'+escapeHtml(dir||'—')+'</div></div>'+
      (c.lat ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Coordenadas</small><div>📍 '+Number(c.lat).toFixed(5)+', '+Number(c.lng).toFixed(5)+'</div></div>' : '')+
      resumenUbic+
    '</div>',
    '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
    (admin?'<button class="btn btn-primary btn-sm" onclick="closeModal();showClienteForm(\''+cid+'\')"><i class="fas fa-pen"></i> Editar ficha</button>':'')+
    (central?'<button class="btn btn-primary btn-sm" onclick="Central.verUbicaciones(\''+cid+'\')"><i class="fas fa-map-marker-alt"></i> Ubicaciones</button>':'')+
    (central?'<button class="btn btn-primary btn-sm" onclick="Central.verRutas(\''+cid+'\')"><i class="fas fa-route"></i> Rutas</button>':'')+
    '<button class="btn btn-primary btn-sm" onclick="gestionarPuertas(\''+cid+'\')"><i class="fas fa-door-open"></i> Puertas ('+puertas.length+')</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();verHistoricoPuertas(\''+cid+'\')"><i class="fas fa-clock-rotate-left"></i> Histórico</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();generatePDF_clientes(\''+cid+'\')"><i class="fas fa-file-pdf"></i> PDF</button>'+
    (admin?'<button class="btn btn-danger btn-sm" onclick="closeModal();confirmDelete(\'Cliente '+escapeHtml(c.nombre)+'\', ()=>deleteCliente(\''+cid+'\'))"><i class="fas fa-trash"></i> Eliminar</button>':''));
};
async function showClienteForm(editId = null, opts = {}) {
  const id = editId ? String(editId) : null;
  const c = id ? (await dbGet('clientes', id)) || {} : {};
  const nextId = c.id || window.db.nextId('CLI');
  const esCentral = opts?.central === true || c.central === true;
  const nUbic = id ? (await window.Central.ubicacionesDe(id)).length : 0;

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="cf_id" value="'+escapeHtml(nextId)+'"'+(id?' readonly':'')+'></div>'+
    '<div class="form-group"><label>Tipo</label><select id="cf_tipo"><option value="empresa" '+(c.tipo!=='particular'?'selected':'')+'>Empresa</option><option value="particular" '+(c.tipo==='particular'?'selected':'')+'>Particular</option></select></div>'+
    '<div class="form-group full" style="border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--surface-alt)">'+
      '<label style="display:block;margin-bottom:6px"><strong>¿Cuántas naves tiene?</strong></label>'+
      '<select id="cf_modo" onchange="document.getElementById(\'cf_modo_ayuda\').style.display=this.value===\'central\'?\'\':\'none\'">'+
        '<option value="individual" '+(esCentral?'':'selected')+'>Individual: una sola nave (las puertas cuelgan del cliente)</option>'+
        '<option value="central" '+(esCentral?'selected':'')+'>Central: varias naves / ubicaciones</option></select>'+
      '<small id="cf_modo_ayuda" style="display:'+(esCentral?'':'none')+';color:var(--text-muted);display:'+(esCentral?'block':'none')+'">Tras guardar podrás añadir sus ubicaciones (cada una con sus datos y sus puertas) y agruparlas en rutas.'+(nUbic?' Ahora tiene '+nUbic+' ubicación(es): no se puede volver a «Individual» mientras las tenga.':'')+'</small>'+
      '<label style="display:block;margin-top:10px"><input type="checkbox" id="cf_mant" '+(c.mantenimiento===true?'checked':'')+'> Tiene contratado el <strong>mantenimiento (revisiones periódicas)</strong> con nosotros</label>'+
    '</div>'+
    '<div class="form-group full"><label>Nombre / Razón social *</label><input id="cf_nombre" value="'+escapeHtml(c.nombre||'')+'" required></div>'+
    '<div class="form-group"><label>Persona de contacto</label><input id="cf_contacto" value="'+escapeHtml(c.contacto||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="cf_email" type="email" value="'+escapeHtml(c.email||'')+'"></div>'+
    '<div class="form-group"><label>DNI / CIF</label><input id="cf_dni" oninput="this.value=this.value.toUpperCase()" value="'+escapeHtml(c.dni||'')+'" placeholder="12345678Z o B12345678"></div>'+
    '<div class="form-group"><label>Teléfono</label><input id="cf_telefono" class="only-num" value="'+(c.telefono ? String(c.telefono).replace(/\D/g,'') : '')+'"></div>'+
    '<div class="form-group full"><label>Dirección</label>'+
      '<div style="display:flex;gap:6px">'+
        '<input id="cf_direccion" value="'+escapeHtml(c.direccion||'')+'" style="flex:1">'+
        '<button type="button" class="btn btn-outline btn-sm" onclick="geolocalizarCliente()" title="Buscar coordenadas"><i class="fas fa-map-marker-alt"></i></button>'+
        '<button type="button" id="cf_btn_gps" class="btn btn-outline btn-sm" onclick="usarUbicacionActualCliente()" title="Usar mi ubicación actual"><i class="fas fa-location-crosshairs"></i></button>'+
      '</div>'+
      '<small id="cf_geo_estado" style="color:var(--text-muted);font-size:11px">'+(c.lat ? '📍 '+Number(c.lat).toFixed(4)+', '+Number(c.lng).toFixed(4) : '📍 Sin coordenadas (pulsa el mapa)')+'</small>'+
    '</div>'+
    '<div class="form-group full"><label>Notas</label><textarea id="cf_nota">'+escapeHtml(c.nota||'')+'</textarea></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-cliente" data-action="save-cliente" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';

  window.__geoCliente = null;
  openModal(id?'Editar Cliente':'Nuevo Cliente',form,footer);
}

window.saveCliente = async function(id){
  id = id ? String(id) : null;
  try {
    const existing = id ? await dbGet('clientes', id) : null;
    const central = document.getElementById('cf_modo').value === 'central';
    if(existing && existing.central===true && !central){
      const n = (await window.Central.ubicacionesDe(id)).length;
      if(n){ showToast('No se puede pasar a «Individual»: tiene '+n+' ubicación(es). Elimínalas antes.','error'); return; }
    }
    const data = {
      id: document.getElementById('cf_id').value.trim(),
      tipo: document.getElementById('cf_tipo').value,
      nombre: document.getElementById('cf_nombre').value.trim(),
      contacto: document.getElementById('cf_contacto').value.trim(),
      email: document.getElementById('cf_email').value.trim(),
      telefono: document.getElementById('cf_telefono').value.trim(),
      dni: document.getElementById('cf_dni').value.trim().toUpperCase(),
      direccion: document.getElementById('cf_direccion').value.trim(),
      lat: window.__geoCliente?.lat || existing?.lat || null,
      lng: window.__geoCliente?.lng || existing?.lng || null,
      nota: document.getElementById('cf_nota').value.trim(),
      central,
      mantenimiento: document.getElementById('cf_mant').checked
    };

    let ok = true;
    ok &= setFieldError('cf_nombre',   validators.required(data.nombre, 'El nombre'));
    ok &= setFieldError('cf_email',    validators.email(data.email));
    ok &= setFieldError('cf_telefono', validators.telefono9(data.telefono));
    if(!ok){ showToast('Revisa los campos marcados','error'); return; }

    await dbPut('clientes', data);
    window.__geoCliente = null;
    showToast('Cliente guardado');
    if(central && !(existing && existing.central===true)){
      navigateTo('clientes');
      await window.Central.verUbicaciones(data.id);   // cliente central nuevo: a añadir sus ubicaciones
    } else { closeModal(); navigateTo('clientes'); }
  } catch(err){
    console.error('Error al guardar cliente:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};
window.geolocalizarCliente = async function(){
  const dir = document.getElementById('cf_direccion').value.trim();
  if(!dir){ showToast('Escribe una dirección primero','error'); return; }
  const estado = document.getElementById('cf_geo_estado');
  estado.textContent = 'Buscando...';
  const geo = await geocodificar(dir);
  if(!geo){
    estado.textContent = 'O No encontrada. Revisa la dirección.';
    showToast('Dirección no encontrada','error');
    return;
  }
  window.__geoCliente = geo;
  estado.textContent = 'o. ' + geo.nombreCompleto.split(',').slice(0,3).join(',');
  showToast('Coordenadas encontradas');
};

window.usarUbicacionActualCliente = function(){
  const estado = document.getElementById('cf_geo_estado');
  const btn = document.getElementById('cf_btn_gps');
  if(!navigator.geolocation){ showToast('Tu dispositivo no permite obtener la ubicación','error'); return; }
  estado.textContent = 'Y" Obteniendo ubicación...';
  if(btn) btn.disabled = true;
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const res = await geocodificarInverso(lat, lng);
    if(btn) btn.disabled = false;
    if(!document.getElementById('cf_direccion')) return;
    window.__geoCliente = { lat, lng, nombreCompleto: res?.nombreCompleto || '' };
    if(res) document.getElementById('cf_direccion').value = res.direccion;
    estado.textContent = 'o. ' + lat.toFixed(4) + ', ' + lng.toFixed(4)
      + (res ? '' : ' (dirección no encontrada, escríbela a mano)');
    showToast(res ? 'Dirección capturada. Revísala antes de guardar' : 'Coordenadas capturadas');
  }, err => {
    if(btn) btn.disabled = false;
    const msg = err.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación';
    estado.textContent = 'O ' + msg;
    showToast(msg,'error');
  }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
};

window.deleteCliente = async function(id){
  const [ubics, rutas, puertas] = await Promise.all([ window.Central.ubicacionesDe(id), window.Central.rutasDe(id), window.Central.puertasDe(id) ]);
  if(ubics.length || rutas.length || puertas.length){
    if(!confirm('Este cliente tiene '+ubics.length+' ubicación(es), '+rutas.length+' ruta(s) y '+puertas.length+' puerta(s). Se eliminarán también (los partes y revisiones ya hechos se conservan). ¿Continuar?')) return;
    for(const p of puertas) await dbDelete('puertas', p.id);
    for(const r of rutas) await dbDelete('rutas', r.id);
    for(const u of ubics) await dbDelete('ubicaciones', u.id);
  }
  await dbDelete('clientes',id);
  showToast('Cliente eliminado');navigateTo('clientes');
};

// ═══ Detector / fusionador de clientes duplicados ═══
function __normDup(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(s\.l|s\.l\.u|s\.a|sl|slu|sa|c\.b|cb|sociedad|limitada|anonima|cooperativa)\b/g,'').replace(/[^a-z0-9]/g,'');
}
window.showDuplicadosClientes = async function(){
  const clientes = await dbGetAll('clientes');
  if(clientes.length < 2){ showToast('No hay clientes suficientes','info'); return; }
  // Agrupar: mismo DNI/CIF, o nombre normalizado idéntico, o nombre+teléfono
  const grupos = [];
  const usados = new Set();
  const byDni = {};
  clientes.forEach(c=>{ const d=String(c.dni||'').trim().toUpperCase(); if(d && d!=='—') (byDni[d]=byDni[d]||[]).push(c); });
  Object.values(byDni).forEach(g=>{ if(g.length>1){ grupos.push(g); g.forEach(c=>usados.add(c.id)); } });
  const restantes = clientes.filter(c=>!usados.has(c.id));
  const byNombre = {};
  restantes.forEach(c=>{ const n=__normDup(c.nombre); if(n.length>=4) (byNombre[n]=byNombre[n]||[]).push(c); });
  Object.values(byNombre).forEach(g=>{ if(g.length>1){ grupos.push(g); g.forEach(c=>usados.add(c.id)); } });
  if(!grupos.length){
    openModal('🔍 Clientes duplicados',
      '<p style="text-align:center;padding:20px;color:var(--text-muted)"><i class="fas fa-circle-check" style="font-size:28px;display:block;margin-bottom:10px;color:var(--success,#16a34a)"></i>¡Buenas noticias! No he encontrado clientes duplicados.<br><small>Comparo por DNI/CIF y por nombre (ignorando mayúsculas, tildes y sufijos S.L./S.A.).</small></p>',
      '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
    return;
  }
  const html = grupos.map((g,i)=>
    '<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">'+
      '<strong>Grupo '+(i+1)+'</strong> <span class="badge badge-orange">'+g.length+' fichas</span>'+
      '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">'+g.map(c=>
        '<label style="display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--border);border-radius:8px;cursor:pointer">'+
          '<input type="radio" name="dupgrp'+i+'" value="'+escapeHtml(String(c.id))+'" '+(c.dni?'checked':'')+'>'+
          '<div style="flex:1"><strong>'+escapeHtml(c.nombre)+'</strong>'+
            '<div style="font-size:12px;color:var(--text-muted)">'+escapeHtml(c.id)+' · '+(c.dni?'DNI/CIF '+escapeHtml(c.dni):'sin DNI')+(c.telefono?' · ☎ '+escapeHtml(c.telefono):'')+(c.email?' · ✉ '+escapeHtml(c.email):'')+'</div></div>'+
        '</label>').join('')+
      '</div><small style="color:var(--text-muted);display:block;margin-top:6px">Marca la ficha que QUIERES CONSERVAR: se fusionan en ella los datos no vacíos de las demás y se reasignan sus puertas, ubicaciones, partes y presupuestos.</small>'+
    '</div>').join('');
  openModal('🔍 Clientes duplicados ('+grupos.length+' grupos)',
    '<div style="max-height:55vh;overflow:auto;padding-right:4px">'+html+'</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="fusionarDuplicadosClientes()"><i class="fas fa-code-merge"></i> Fusionar seleccionados</button>');
  window.__dupGrupos = grupos;
};

window.fusionarDuplicadosClientes = async function(){
  const grupos = window.__dupGrupos || [];
  const puertas = await dbGetAll('puertas');
  const ubicaciones = await dbGetAll('ubicaciones').catch(()=>[]);
  const partes = await dbGetAll('partesTrabajo');
  const presupuestos = await dbGetAll('presupuestos');
  let fusiones = 0, errores = 0;
  for(let i=0;i<grupos.length;i++){
    const sel = document.querySelector('input[name="dupgrp'+i+'"]:checked');
    if(!sel) continue;
    const conservar = grupos[i].find(c=>String(c.id)===sel.value);
    const demas = grupos[i].filter(c=>String(c.id)!==sel.value);
    if(!conservar || !demas.length) continue;
    // Fusionar campos no vacíos
    const fusion = {...conservar};
    ['dni','telefono','email','contacto','direccion','tipo','lat','lng'].forEach(k=>{
      if(!fusion[k] && fusion[k]!==0) demas.forEach(d=>{ if(d[k]!==undefined && d[k]!==null && d[k]!=='') fusion[k]=d[k]; });
    });
    try{
      await dbPut('clientes', fusion);
      // Reasignar registros hijos al cliente conservado
      for(const d of demas){
        for(const pu of puertas.filter(x=>String(x.clienteId)===String(d.id))){
          await dbPut('puertas', {...pu, clienteId: conservar.id});
        }
        for(const ub of ubicaciones.filter(x=>String(x.clienteId)===String(d.id))){
          await dbPut('ubicaciones', {...ub, clienteId: conservar.id});
        }
        for(const rt of (await dbGetAll('rutas')).filter(x=>String(x.clienteId)===String(d.id))){
          await dbPut('rutas', {...rt, clienteId: conservar.id});
        }
        for(const pt of partes.filter(x=>String(x.clienteId)===String(d.id))){
          await dbPut('partesTrabajo', {...pt, clienteId: conservar.id, clienteNombre: fusion.nombre});
        }
        for(const pr of presupuestos.filter(x=>String(x.clienteId)===String(d.id))){
          await dbPut('presupuestos', {...pr, clienteId: conservar.id, clienteNombre: fusion.nombre});
        }
        await dbDelete('clientes', d.id);
        fusiones++;
      }
    } catch(e){ console.error('Fusión:',e); errores++; }
  }
  closeModal();
  showToast(errores ? ('Fusionados '+fusiones+' con '+errores+' errores') : ('✅ Fusionados '+fusiones+' clientes duplicados'), errores?'warning':'success');
  navigateTo('clientes');
};
