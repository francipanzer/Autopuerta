//  VEHÍCULOS
window.render_vehiculos = async function(el){
  const vehiculos = await dbGetAll('vehiculos');
  el.innerHTML =
    '<div class="page-header"><div><h2>Vehículos</h2><p>Gestión de flota de trabajo</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showVehiculoForm()"><i class="fas fa-plus"></i> Nuevo Vehículo</button></div></div>'+
    '<div class="stats-grid stats-3">'+
      '<div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-truck"></i></div><div class="stat-info"><h3>'+vehiculos.length+'</h3><p>Total vehículos</p></div></div>'+
      '<div class="stat-card"><div class="stat-icon" style="background:#dcfce7;color:#16a34a"><i class="fas fa-check-circle"></i></div><div class="stat-info"><h3>'+vehiculos.filter(v=>v.estado==='disponible').length+'</h3><p>Disponibles</p></div></div>'+
      '<div class="stat-card"><div class="stat-icon" style="background:#ffedd5;color:#ea580c"><i class="fas fa-route"></i></div><div class="stat-info"><h3>'+vehiculos.filter(v=>v.estado==='en_ruta').length+'</h3><p>En ruta</p></div></div>'+
    '</div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>Matrícula</th><th>Marca</th><th>Modelo</th><th>Año</th><th>Km</th><th>ITV</th><th>Estado</th></tr>'+
    '</thead><tbody id="vehBody"></tbody></table></div></div>';
  renderVehiculos();
};

window.renderVehiculos = async function(){
  const vehiculos = await dbGetAll('vehiculos');
  const tbody = document.getElementById('vehBody');
  tbody.innerHTML = vehiculos.map(v=>{
    let itvClass = 'badge-gray';
    let itvLabel = '—';
    if(v.itv && v.itv !== ''){
      const hoy = new Date();
      const itvDate = new Date(v.itv);
      hoy.setHours(0,0,0,0);
      itvDate.setHours(0,0,0,0);
      const diffTime = itvDate - hoy;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if(diffDays < 0) {
        itvClass = 'badge-red';
        itvLabel = 'Vencida';
      } else if(diffDays <= 30) { 
        itvClass = 'badge-yellow';
        itvLabel = 'Próxima (' + diffDays + 'd)';
      } else {
        itvClass = 'badge-green';
        itvLabel = formatDate(v.itv);
      }
    }
    return '<tr data-veh-row="'+escapeHtml(String(v.id))+'" style="cursor:pointer"><td><strong>'+escapeHtml(v.matricula)+'</strong></td><td>'+escapeHtml(v.marca)+'</td>'+
      '<td>'+escapeHtml(v.modelo)+'</td><td>'+v.anno+'</td><td>'+v.km.toLocaleString('es-ES')+'</td>'+
      '<td><span class="badge '+(itvClass)+'">'+itvLabel+'</span></td>'+
      '<td><span class="badge badge-gray">'+getStatusLabel(v.estado)+'</span></td>'+
    '</tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Sin vehículos</td></tr>';
  if(!tbody.__fichaBound){
    tbody.__fichaBound = true;
    tbody.addEventListener('click', e => {
      if(e.target.closest('button') || e.target.closest('a')) return;
      const row = e.target.closest('tr[data-veh-row]');
      if(row) window.verFichaVehiculo(row.dataset.vehRow);
    });
  }
};

// Ficha del vehículo en modal (datos + acciones)
window.verFichaVehiculo = async function(id){
  const v = await dbGet('vehiculos', id);
  if(!v) return;
  const campo = (etiqueta, valor) => (valor===undefined||valor===null||String(valor).trim()==='') ? '' :
    '<div><small style="color:var(--text-muted);display:block">'+etiqueta+'</small><div style="font-weight:600">'+valor+'</div></div>';
  openModal('🚚 '+(v.matricula||v.id),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'+
      campo('ID', escapeHtml(String(v.id)))+
      campo('Matrícula', '<strong>'+escapeHtml(v.matricula)+'</strong>')+
      campo('Marca', escapeHtml(v.marca||''))+
      campo('Modelo', escapeHtml(v.modelo||''))+
      campo('Año', v.anno||'')+
      campo('Kilómetros', (v.km||0).toLocaleString('es-ES'))+
      campo('Próxima ITV', v.itv?formatDate(v.itv):'—')+
      campo('Estado', '<span class="badge badge-gray">'+getStatusLabel(v.estado)+'</span>')+
      (v.notas ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted);display:block">Notas</small><div>'+escapeHtml(v.notas)+'</div></div>' : '')+
    '</div>',
    '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();showVehiculoForm(\''+escapeHtml(String(v.id))+'\')"><i class="fas fa-pen"></i> Editar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="showConfirmITV(\''+escapeHtml(String(v.id))+'\')"><i class="fas fa-calendar-check"></i> ITV realizada</button>'+
    '<button class="btn btn-primary btn-sm" onclick="toggleVehiculoEstado(\''+escapeHtml(String(v.id))+'\')"><i class="fas fa-right-left"></i> Cambiar estado</button>'+
    '<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'Vehículo '+escapeHtml(v.matricula)+'\', ()=>deleteVehiculo(\''+escapeHtml(String(v.id))+'\'))"><i class="fas fa-trash"></i> Eliminar</button>');
};

window.deleteVehiculo = async function(id){
  await dbDelete('vehiculos',id);
  showToast('Vehículo eliminado');navigateTo('vehiculos');
};

//  ITV
window.marcarITVPasada = async function(id){
  try {
    const v = await dbGet('vehiculos', id);
    if(!v){ showToast('Vehículo no encontrado','error'); return; }
    const nuevaFecha = new Date();
    nuevaFecha.setMonth(nuevaFecha.getMonth() + 6);
    const itvStr = nuevaFecha.toISOString().split('T')[0];
    v.itv = itvStr;
    await dbPut('vehiculos', v);
    closeModal();
    showToast('o. ITV registrada. Próxima: ' + formatDate(itvStr));
    navigateTo('vehiculos');
  } catch(err){
    console.error('Error al registrar ITV:', err);
    showToast('Error al registrar ITV: '+err.message,'error');
  }
};

window.showConfirmITV = function(id){
  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-confirm-itv" data-action="confirm-itv" data-id="'+escapeHtml(id)+'"><i class="fas fa-check"></i> Confirmar ITV</button>';
  openModal('Registrar ITV',
    '<p>Se registrará la ITV como <strong>realizada hoy</strong>.</p>'+
    '<p style="margin-top:12px">La próxima ITV se fijará automáticamente <strong>6 meses después</strong>.</p>',
    footer);
};

window.showVehiculoForm = async function(id){
  id = id ? String(id) : null;
  const v = id ? await dbGet('vehiculos',id) : {};
  const nextId = v.id || window.db.nextId('VEH');
  const defaultItv = v.itv || new Date(new Date().setFullYear(new Date().getFullYear() + 4)).toISOString().split('T')[0];

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="vh_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Matrícula *</label><input id="vh_mat" value="'+escapeHtml(v.matricula||'')+'" style="text-transform:uppercase"></div>'+
    '<div class="form-group"><label>Marca</label><input id="vh_marca" value="'+escapeHtml(v.marca||'')+'"></div>'+
    '<div class="form-group"><label>Modelo</label><input id="vh_modelo" value="'+escapeHtml(v.modelo||'')+'"></div>'+
    '<div class="form-group"><label>Año</label><input id="vh_anno" type="number" class="only-num" value="'+(v.anno||new Date().getFullYear())+'"></div>'+
    '<div class="form-group"><label>Kilómetros</label><input id="vh_km" type="number" class="only-num" value="'+(v.km||0)+'"></div>'+
    '<div class="form-group"><label>ITV (Próxima)</label><input id="vh_itv" type="date" value="'+escapeHtml(defaultItv)+'"></div>'+
    '<div class="form-group"><label>Estado</label><select id="vh_estado">'+
      ['disponible','en_ruta','en_mantenimiento'].map(e=>'<option value="'+e+'" '+(v.estado===e?'selected':'')+'>'+getStatusLabel(e)+'</option>').join('')+'</select></div>'+
    '<div class="form-group full"><label>Notas</label><textarea id="vh_nota">'+escapeHtml(v.nota||'')+'</textarea></div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-vehiculo" data-action="save-vehiculo" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Vehículo':'Nuevo Vehículo',form,footer);
};


window.saveVehiculo = async function(id){
  id = id ? String(id) : null;
  try {
    const data = {
      id: document.getElementById('vh_id').value.trim() || null,
      matricula: document.getElementById('vh_mat').value.trim().replace(/\s/g,'').toUpperCase(),
      marca: document.getElementById('vh_marca').value.trim(),
      modelo: document.getElementById('vh_modelo').value.trim(),
      anno: parseInt(document.getElementById('vh_anno').value)||new Date().getFullYear(),
      km: parseInt(document.getElementById('vh_km').value)||0,
      km_inicial: parseInt(document.getElementById('vh_km').value)||0,
      itv: document.getElementById('vh_itv').value,
      estado: document.getElementById('vh_estado').value,
      nota: document.getElementById('vh_nota').value.trim()
    };
    if(!data.matricula){ showToast('La matrícula es obligatoria','error'); return; }

    if (id) { await window.db.dbPut('vehiculos', data); }
    else    { const r = await window.db.dbAdd('vehiculos', data); data.id = r.id; }

    closeModal();
    showToast('Vehículo guardado');
    navigateTo('vehiculos');
  } catch(err){
    console.error('Error al guardar vehículo:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};

window.toggleVehiculoEstado = async function(id){
  const v = await dbGet('vehiculos',id);
  if(!v) return;
  v.estado = v.estado==='disponible' ? 'en_ruta' : 'disponible';
  await dbPut('vehiculos',v);
  showToast('Estado actualizado a: '+getStatusLabel(v.estado));
  navigateTo('vehiculos');
};

//  ALMAC?N
