window.render_empleados = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Empleados</h2><p>Gestión del equipo técnico</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showEmpleadoForm()"><i class="fas fa-plus"></i> Nuevo Empleado</button></div></div>'+
    '<div class="search-bar"><input type="text" placeholder="Buscar empleado..." id="searchEmp" oninput="renderEmpleados()"></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>ID</th><th>Nombre</th><th>Teléfono</th><th>DNI</th><th>Email</th><th>Acciones</th></tr>'+
    '</thead><tbody id="empBody"></tbody></table></div></div>';
  renderEmpleados();
};

window.renderEmpleados = async function(){
  const empleados = await dbGetAll('empleados');
  const q = (document.getElementById('searchEmp')?.value||'').toLowerCase();
  const filtered = empleados.filter(e=>JSON.stringify(e).toLowerCase().includes(q));
  document.getElementById('empBody').innerHTML = filtered.map(e=>
    '<tr><td><strong>'+escapeHtml(e.id)+'</strong></td><td>'+escapeHtml(e.nombre)+'</td>'+
    '<td>'+escapeHtml(e.telefono||'—')+'</td>'+
    '<td>'+escapeHtml(e.dni||'—')+'</td>'+
    '<td>'+escapeHtml(e.email||'—')+'</td>'+
    '<td class="actions-cell">'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Editar" onclick="showEmpleadoForm(\''+e.id+'\')"><i class="fas fa-pen"></i></button>'+
      '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Empleado '+escapeHtml(e.nombre)+'\', ()=>deleteEmpleado(\''+e.id+'\'))"><i class="fas fa-trash"></i></button>'+
    '</td></tr>'
  ).join('') || '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Sin empleados</td></tr>';
};

window.showEmpleadoForm = async function(id){
  id = id ? String(id) : null;
  const e = id ? await dbGet('empleados',id) : {};
  const nextId = e.id || window.db.nextId('EMP');

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="em_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Nombre completo *</label><input id="em_nombre" value="'+escapeHtml(e.nombre||'')+'" required></div>'+
    '<div class="form-group"><label>Teléfono</label><input id="em_telefono" class="only-num" value="'+(e.telefono ? String(e.telefono).replace(/\D/g,'') : '')+'"></div>'+
    '<div class="form-group"><label>DNI/NIE</label><input id="em_dni" oninput="this.value=this.value.toUpperCase()" value="'+escapeHtml(e.dni||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="em_email" type="email" value="'+escapeHtml(e.email||'')+'"></div>'+
    '<div class="form-group">'+
      '<label>Firma del empleado</label>'+
      '<div style="border:2px dashed var(--border);border-radius:8px;padding:8px">'+
        '<canvas id="em_firma_canvas" style="border:1px solid var(--border);border-radius:4px;touch-action:none;display:block;width:100%;height:120px;background:transparent"></canvas>'+
        '<div style="margin-top:8px;display:flex;gap:8px">'+
          '<button type="button" class="btn btn-outline btn-sm" onclick="clearFirmaCanvas(\'em_firma_canvas\');document.getElementById(\'em_load_firma\').style.display=\'none\'"><i class="fas fa-eraser"></i> Limpiar firma</button>'+
          '<button type="button" class="btn btn-outline btn-sm" id="em_load_firma" style="display:'+(e.firma?'inline-flex':'none')+'"><i class="fas fa-upload"></i> Cargar firma</button>'+
          '<input type="file" id="em_load_firma_input" accept="image/*" style="display:none">'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="saveEmpleado(' + (id ? "'"+escapeHtml(id)+"'" : 'null') + ')"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Empleado':'Nuevo Empleado',form,footer);

  setTimeout(()=>{
    initFirmaCanvas('em_firma_canvas');
    if(e.firma){
      pintarFirmaEnCanvas('em_firma_canvas', e.firma);
    }
    document.getElementById('em_load_firma')?.addEventListener('click',()=>{
      document.getElementById('em_load_firma_input').click();
    });
    document.getElementById('em_load_firma_input')?.addEventListener('change',function(){
      const file = this.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){
        pintarFirmaEnCanvas('em_firma_canvas', ev.target.result);
        document.getElementById('em_load_firma').style.display = 'none';
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  }, 150);
};

window.saveEmpleado = async function(id) {
  id = id ? String(id) : null;
  
  // Validar campos antes de guardar
  const validators = {
    required: (v) => v.length > 0,
    dni: (v) => /^[0-9]{8}[\w]$/i.test(v),
    telefono9: (v) => /^[679]\d{8}$/.test(v),
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  };

  const nombre = document.getElementById('em_nombre').value.trim();
  const telefono = document.getElementById('em_telefono').value.trim();
  const dni = document.getElementById('em_dni').value.trim().toUpperCase();
  const email = document.getElementById('em_email').value.trim();
  const firma = document.getElementById('em_firma_canvas');

  // Limpiar errores previos
  clearAllFieldErrors(['em_nombre', 'em_telefono', 'em_dni', 'em_email', 'em_firma_canvas']);

  // Validar nombre
  if (!validators.required(nombre)) {
    setFieldError('em_nombre', 'El nombre es obligatorio');
    return;
  }

  // Validar DNI (8 dígitos + letra)
  if (!validators.dni(dni)) {
    setFieldError('em_dni', 'DNI no válido (ej: 12345678A)');
    return;
  }

  // Validar teléfono (9 dígitos, empieza por 6, 7 o 9)
  if (!validators.telefono9(telefono)) {
    setFieldError('em_telefono', 'Teléfono no válido (9 dígitos, 6/7/9)');
    return;
  }

  // Validar email (opcional, pero si se rellena debe ser válido)
  if (email && !validators.email(email)) {
    setFieldError('em_email', 'Email no válido');
    return;
  }

  // Validar firma
  if (!firma || !hasSignature('em_firma_canvas')) {
    setFieldError('em_firma_canvas', 'Firma obligatoria');
    return;
  }

  try {
    const data = {
      id: id,
      nombre: nombre,
      telefono: telefono,
      dni: dni,
      email: email,
      firma: firma.toDataURL('image/png')
    };

    if (id) { await window.db.dbPut('empleados', data); }
else    { const r = await window.db.dbAdd('empleados', data); data.id = r.id; }
    closeModal();
    showToast('Empleado guardado');
    navigateTo('empleados');
  } catch(err) {
    console.error('Error al guardar empleado:', err);
    showToast('Error al guardar: ' + err.message, 'error');
  }

};

window.deleteEmpleado = async function(id){
  await dbDelete('empleados',id);
  showToast('Empleado eliminado');
  navigateTo('empleados');
};

