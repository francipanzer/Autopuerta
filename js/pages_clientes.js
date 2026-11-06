window.render_clientes = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Clientes</h2><p>Gestión de clientes</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showClienteForm()"><i class="fas fa-plus"></i> Nuevo Cliente</button><button class="btn btn-success" onclick="showImportClientesModal()"><i class="fas fa-file-excel"></i> Importar Excel/CSV</button><button class="btn btn-secondary" onclick="showImportFolioModal()"><i class="fas fa-file-image"></i> Importar datos</button><button class="btn btn-secondary" onclick="showDuplicadosClientes()" title="Buscar y fusionar clientes duplicados"><i class="fas fa-clone"></i> Duplicados</button><button class="btn btn-secondary" onclick="mostrarBuscadorPuertas()" title="Buscar puertas y ver su histórico de intervenciones"><i class="fas fa-magnifying-glass"></i> Buscar puertas</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar cliente..." id="searchCliente" oninput="window.__cliPagina=0;renderClientes()">'+
      '<select id="filterTipo" onchange="window.__cliPagina=0;renderClientes()"><option value="">Todos</option><option value="empresa">Empresa</option><option value="particular">Particular</option></select>'+
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
  const [clientes, cadenas, rutas] = await Promise.all([
    dbGetAll('clientes'), dbGetAll('cadenas'), dbGetAll('rutas')
  ]);
  const q = (document.getElementById('searchCliente')?.value||'').toLowerCase();
  const tipo = document.getElementById('filterTipo')?.value||'';
  const provSel = document.getElementById('filterProvincia');
  const prov = provSel?.value||'';
  window.__bindCliNav?.();
  if(provSel && provSel.options.length<=1){
    const provs = [...new Set(clientes.map(window.__provinciaDeCliente).filter(Boolean))].sort();
    provSel.innerHTML = '<option value="">Todas las provincias</option>' + provs.map(p=>'<option>'+escapeHtml(p)+'</option>').join('');
  }
  const filtered = clientes
    .filter(c=>{
      if(q && !JSON.stringify(c).toLowerCase().includes(q)) return false;
      if(tipo && c.tipo!==tipo) return false;
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
    '<tr data-cliente-row="'+escapeHtml(c.id)+'" style="cursor:pointer"><td style="padding:9px 14px"><strong>'+escapeHtml(c.nombre)+'</strong></td></tr>'
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
  openModal('👤 ' + (c.nombre || 'Cliente'),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px">'+
      '<div><small style="color:var(--text-muted)">ID</small><div><strong>'+escapeHtml(c.id)+'</strong></div></div>'+
      '<div><small style="color:var(--text-muted)">Tipo</small><div>'+(c.tipo==='empresa'?'Empresa':'Particular')+'</div></div>'+
      '<div><small style="color:var(--text-muted)">DNI / CIF</small><div><strong>'+escapeHtml(c.dni||'—')+'</strong></div></div>'+
      '<div><small style="color:var(--text-muted)">Contacto</small><div>'+escapeHtml(c.contacto||'—')+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Teléfono</small><div>'+escapeHtml(c.telefono||'—')+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Email</small><div>'+escapeHtml(c.email||'—')+'</div></div>'+
      '<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Dirección</small><div>'+escapeHtml(dir||'—')+'</div></div>'+
      (c.lat ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Coordenadas</small><div>📍 '+c.lat.toFixed(5)+', '+c.lng.toFixed(5)+'</div></div>' : '')+
    '</div>',
    '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();showClienteForm(\''+escapeHtml(c.id)+'\')"><i class="fas fa-pen"></i> Editar ficha</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();gestionarUbicaciones(\''+escapeHtml(c.id)+'\')"><i class="fas fa-map-marker-alt"></i> Ubicaciones</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();gestionarPuertas(\''+escapeHtml(c.id)+'\')"><i class="fas fa-door-open"></i> Puertas</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();verHistoricoPuertas(\''+escapeHtml(c.id)+'\')"><i class="fas fa-clock-rotate-left"></i> Histórico</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();generatePDF_clientes(\''+escapeHtml(c.id)+'\')"><i class="fas fa-file-pdf"></i> PDF</button>'+
    '<button class="btn btn-danger btn-sm" onclick="closeModal();confirmDelete(\'Cliente '+escapeHtml(c.nombre)+'\', ()=>deleteCliente(\''+escapeHtml(c.id)+'\'))"><i class="fas fa-trash"></i> Eliminar</button>');
};
async function showClienteForm(editId = null, opts = {}) {
  const id = editId ? String(editId) : null;
  const c = id ? (await dbGet('clientes', id)) || {} : {};

  // Solo cadenas padre para el selector "Pertenece a"
  const allClientes = await dbGetAll('clientes');
  const cadenasPadre = allClientes.filter(x => x.esCadena);
  const nextId = c.id || window.db.nextId('CLI');

  // Cadenas de mantenimiento (store 'cadenas') + sus rutas
  const cadenasMant = await getAllCadenas();
  let rutasCache = [];
  if (c.cadenaId) {
    try { rutasCache = await getRutasByCadena(String(c.cadenaId)); } catch(e){ rutasCache = []; }
  }

  const opcionesCadenaMant = '<option value="">— Sin cadena</option>' +
    cadenasMant.map(cm => `<option value="${cm.id}" ${c.cadenaId==cm.id?'selected':''}>${escapeHtml(cm.nombre)}</option>`).join('');

  const opcionesRuta = '<option value="">— Sin ruta</option>' +
    rutasCache.map(r => `<option value="${r.id}" ${c.rutaId==r.id?'selected':''}>${escapeHtml(r.nombre)}</option>`).join('');

  const opcionesPadre = '<option value="">— Ninguno (cliente suelto)</option>' +
    cadenasPadre.map(p => `<option value="${p.id}" ${c.padreId==p.id?'selected':''}>${escapeHtml(p.nombre)}</option>`).join('');

  const esCadenaChecked = (opts?.nuevoPadre === true || c.esCadena) ? 'checked' : '';

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="cf_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Tipo</label><select id="cf_tipo"><option value="empresa" '+(c.tipo==='empresa'?'selected':'')+'>Empresa</option><option value="particular" '+(c.tipo==='particular'?'selected':'')+'>Particular</option></select></div>'+
    '<div class="form-group full"><label><input type="checkbox" id="cf_escadena" '+esCadenaChecked+'> Es empresa / cadena principal (agrupa sucursales)</label></div>'+
    '<div class="form-group"><label>Pertenece a (cadena principal)</label>'+
      '<select id="cf_padre">'+opcionesPadre+'</select>'+
      '<div style="margin-top:6px;font-size:12px;">'+
        '<a href="#" onclick="event.preventDefault(); document.getElementById(\'cf_escadena\').checked=true; document.getElementById(\'cf_nombre\').focus(); return false;" style="color:var(--primary);text-decoration:none;">+ Marcar como empresa/cadena principal</a>'+
      '</div>'+
    '</div>'+
    '<div class="form-group"><label>Nombre / Razón social *</label><input id="cf_nombre" value="'+escapeHtml(c.nombre||'')+'" required></div>'+
    '<div class="form-group"><label>Cadena de mantenimiento</label><select id="cf_cadena">'+opcionesCadenaMant+'</select></div>'+
    '<div class="form-group"><label>Ruta</label><select id="cf_ruta">'+opcionesRuta+'</select></div>'+
    '<div class="form-group"><label>Persona de contacto</label><input id="cf_contacto" value="'+escapeHtml(c.contacto||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="cf_email" type="email" value="'+escapeHtml(c.email||'')+'"></div>'+
    '<div class="form-group"><label>DNI / CIF</label><input id="cf_dni" oninput="this.value=this.value.toUpperCase()" value="'+escapeHtml(c.dni||'')+'" placeholder="12345678Z o B12345678"></div>'+
    '<div class="form-group"><label>Teléfono</label><input id="cf_telefono" class="only-num" value="'+(c.telefono ? c.telefono.replace(/\D/g,'') : '')+'"></div>'+
    '<div class="form-group"><label>Dirección</label>'+
      '<div style="display:flex;gap:6px">'+
        '<input id="cf_direccion" value="'+escapeHtml(c.direccion||'')+'" style="flex:1">'+
        '<button type="button" class="btn btn-outline btn-sm" onclick="geolocalizarCliente()" title="Buscar coordenadas">'+
          '<i class="fas fa-map-marker-alt"></i></button>'+
        '<button type="button" id="cf_btn_gps" class="btn btn-outline btn-sm" onclick="usarUbicacionActualCliente()" title="Usar mi ubicación actual">'+
          '<i class="fas fa-location-crosshairs"></i></button>'+
      '</div>'+
      '<small id="cf_geo_estado" style="color:var(--text-muted);font-size:11px">'+
        (c.lat ? 'o. '+c.lat.toFixed(4)+', '+c.lng.toFixed(4) : '📍 Sin coordenadas (pulsa el mapa)')+
      '</small>'+
    '</div>'+
    '<div class="form-group full"><label>Notas</label><textarea id="cf_nota">'+escapeHtml(c.nota||'')+'</textarea></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-cliente" data-action="save-cliente" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';

  openModal(id?'Editar Cliente':'Nuevo Cliente',form,footer);

  // Al cambiar la cadena de mantenimiento, recargar rutas
  document.getElementById('cf_cadena').addEventListener('change', async (e) => {
    const sel = document.getElementById('cf_ruta');
    const cid = e.target.value;
    sel.innerHTML = '<option value="">— Sin ruta</option>';
    if (!cid) return;
    const rutas = await getRutasByCadena(cid);
    sel.innerHTML += rutas.map(r => `<option value="${r.id}">${escapeHtml(r.nombre)}</option>`).join('');
  });
}

window.saveCliente = async function(id){
  id = id ? String(id) : null;
  try {
    const existing = id ? await dbGet('clientes', id) : null;
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
      esCadena: document.getElementById('cf_escadena')?.checked || false,
      padreId: document.getElementById('cf_padre')?.value || null,
      cadenaId: document.getElementById('cf_cadena')?.value || null,
      rutaId:   document.getElementById('cf_ruta')?.value || null,
    };

    // Validación en línea
    let ok = true;
    ok &= setFieldError('cf_nombre',   validators.required(data.nombre, 'El nombre'));
    ok &= setFieldError('cf_email',    validators.email(data.email));
    ok &= setFieldError('cf_telefono', validators.telefono9(data.telefono));

    if(!ok){ showToast('Revisa los campos marcados','error'); return; }

    await dbPut('clientes', data);
    closeModal();
    window.__geoCliente = null;
    showToast('Cliente guardado');
    navigateTo('clientes');
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
