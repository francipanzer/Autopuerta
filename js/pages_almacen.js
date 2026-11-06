window.render_almacen = async function(el){
  const tipos = await window.TiposPuerta.filasDB();
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  el.innerHTML =
    '<div class="page-header"><div><h2>Almacén</h2><p>Control de stock y artículos</p></div>'+
    '<div class="header-actions">'+
      '<button class="btn btn-primary" onclick="showArticuloForm()"><i class="fas fa-plus"></i> Nuevo Artículo</button>'+
      (window.isAdmin?.() ? '<button class="btn btn-secondary" onclick="showEntradaMaterial()" title="Leer un albarán o factura de proveedor (foto o PDF) y sumar el material al stock"><i class="fas fa-wand-magic-sparkles"></i> Entrada de material</button>'+
      '<button class="btn btn-secondary" onclick="showHistorialEntradas()" title="Historial de entradas de material"><i class="fas fa-clock-rotate-left"></i> Entradas</button>' : '')+
      '<button class="btn btn-secondary" onclick="generatePDF_almacen()"><i class="fas fa-file-pdf"></i> PDF</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar artículo..." id="searchArt" oninput="renderAlmacen()">'+
      '<select id="filterCatArt" onchange="renderAlmacen()"><option value="">Todas las categorías</option>'+
      tiposOptions+'</select></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th></th><th>Referencia</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Mín.</th><th>P. Venta</th><th>Estado</th></tr>'+
    '</thead><tbody id="artBody"></tbody></table></div></div>';
  renderAlmacen();
};

window.renderAlmacen = async function(){
  const [items, tipos] = await Promise.all([dbGetAll('almacen'), window.TiposPuerta.filasDB()]);
  const tiposMap = new Map(tipos.map(t => [t.id, t.nombre]));
  window.tiposMapCache = tiposMap;
  const q = (document.getElementById('searchArt')?.value||'').toLowerCase();
  const cat = document.getElementById('filterCatArt')?.value||'';
  const filtered = items.filter(a=>{
    if(q && !JSON.stringify(a).toLowerCase().includes(q)) return false;
    // Filtrar por categoria o tipoPuerta (para compatibilidad)
    if(cat && a.categoria!==cat && a.tipoPuerta!==cat) return false;
    return true;
  }).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
  const tbody = document.getElementById('artBody');
  tbody.innerHTML = filtered.map(a=>{
    const bajo = a.stock <= a.stockMinimo;
    const cat = a.categoria || a.tipoPuerta || ''; // compatibilidad con registros antiguos
    const catId = a.categoria || a.tipoPuerta;
    const catNombre = catId ? tiposMap.get(catId) || a.categoria || '—' : '—';
    return '<tr data-art-row="'+escapeHtml(String(a.id))+'" style="cursor:pointer"><td>'+((window.__articuloFoto||a.foto)?'<img src="'+escapeHtml(a.foto)+'" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">':'<div style="width:40px;height:40px;border-radius:6px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted)"><i class="fas fa-image"></i></div>')+'</td>'+ // foto
      '<td><strong>'+escapeHtml(a.referencia)+'</strong></td><td>'+escapeHtml(a.nombre)+'</td>'+
      '<td><span class="badge badge-blue">'+escapeHtml(catNombre)+'</span></td>'+
      '<td style="font-weight:700;color:'+(bajo?'var(--danger)':'var(--text)')+'">'+a.stock+'</td>'+
      '<td>'+a.stockMinimo+'</td><td>'+formatCurrency(a.precioVenta)+'</td>'+
      '<td><span class="badge '+(bajo?'badge-red':'badge-green')+'">'+(bajo?'Stock bajo':'OK')+'</span></td>'+
    '</tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Sin artículos</td></tr>';
  if(!tbody.__fichaBound){
    tbody.__fichaBound = true;
    tbody.addEventListener('click', e => {
      if(e.target.closest('button') || e.target.closest('a')) return;
      const row = e.target.closest('tr[data-art-row]');
      if(row) window.verFichaArticulo(row.dataset.artRow);
    });
  }
};

// Ficha del artículo en modal (datos + acciones)
window.verFichaArticulo = async function(id){
  const a = await dbGet('almacen', id);
  if(!a) return;
  const bajo = a.stock <= a.stockMinimo;
  const campo = (etiqueta, valor) => (valor===undefined||valor===null||String(valor).trim()==='') ? '' :
    '<div><small style="color:var(--text-muted);display:block">'+etiqueta+'</small><div style="font-weight:600">'+valor+'</div></div>';
  const fotoHtml = a.foto
    ? '<div style="grid-column:1/-1"><img src="'+escapeHtml(a.foto)+'" style="max-width:220px;max-height:220px;object-fit:contain;border-radius:10px;border:1px solid var(--border);background:#fff"></div>' : '';
  openModal('📦 '+(a.nombre||a.id),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'+
      fotoHtml+
      campo('Referencia / ID', escapeHtml(String(a.id)))+
      campo('Categoría', (a.categoria||a.tipoPuerta)?escapeHtml(window.tiposMapCache.get(a.categoria||a.tipoPuerta)||a.categoria||''):'')+
      campo('Stock', '<span style="color:'+(bajo?'var(--danger)':'var(--text)')+'">'+a.stock+'</span>')+
      campo('Stock mínimo', a.stockMinimo)+
      campo('Precio compra', formatCurrency(a.precioCompra))+
      campo('Precio venta', formatCurrency(a.precioVenta))+
      campo('Proveedor', escapeHtml(a.proveedor||''))+
      campo('Unidad', escapeHtml(a.unidad||''))+
      campo('Estado', '<span class="badge '+(bajo?'badge-red':'badge-green')+'">'+(bajo?'Stock bajo':'OK')+'</span>')+
    '</div>',
    '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();showArticuloForm(\''+escapeHtml(String(a.id))+'\')"><i class="fas fa-pen"></i> Editar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="ajustarStock(\''+escapeHtml(String(a.id))+'\')"><i class="fas fa-arrows-rotate"></i> Ajustar stock</button>'+
    '<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'Artículo '+escapeHtml(a.nombre)+'\', ()=>deleteArticulo(\''+escapeHtml(String(a.id))+'\'))"><i class="fas fa-trash"></i> Eliminar</button>');
};

window.deleteArticulo = async function(id){
  await dbDelete('almacen',id);
  showToast('Artículo eliminado');navigateTo('almacen');
};

window.showArticuloForm = async function(id){
  id = id ? String(id) : null;
  const a = id ? await dbGet('almacen',id) : {};
  const nextId = a.id || window.db.nextId('ART');
  
  // Cargar tipos de puerta
  const tipos = await window.TiposPuerta.filasDB();
  const catId = a.categoria || a.tipoPuerta; // Usar categoria o tipoPuerta para compatibilidad
  const tiposOptions = tipos.map(t => `<option value="${t.id}" ${String(catId)===String(t.id)?'selected':''}>${escapeHtml(t.nombre)}</option>`).join('');

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID (autogenerado)</label><input id="ar_id" value="'+escapeHtml(nextId)+'" readonly style="background:var(--surface-alt)"></div>'+
    '<div class="form-group"><label>Categoría</label><select id="ar_tipo">'+
      '<option value="">— Sin tipo</option>'+
      tiposOptions+
    '</select></div>'+
    '<div class="form-group full"><label>Nombre *</label><input id="ar_nom" value="'+escapeHtml(a.nombre||'')+'"></div>'+
    '<div class="form-group"><label>Unidad</label><input id="ar_unid" value="'+escapeHtml(a.unidad||'unidad')+'"></div>'+
    '<div class="form-group"><label>Stock</label><input id="ar_stock" type="number" class="only-num" value="'+(a.stock||0)+'"></div>'+
    '<div class="form-group"><label>Stock mínimo</label><input id="ar_min" type="number" class="only-num" value="'+(a.stockMinimo||0)+'"></div>'+
   '<div class="form-group"><label>Precio compra</label><input id="ar_pc" type="number" class="only-num-dec" step="0.01" value="'+(Number(a.precioCompra)||0)+'"></div>'+
'<div class="form-group"><label>Precio venta</label><input id="ar_pv" type="number" class="only-num-dec" step="0.01" value="'+(Number(a.precioVenta)||0)+'"></div>'+
    '<div class="form-group"><label>Proveedor</label><input id="ar_prov" value="'+escapeHtml(a.proveedor||'')+'"></div>'+
    '<div class="form-group full"><label>Foto del artículo</label>'+
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
        '<img id="ar_foto_thumb" src="'+(a.foto||'')+'" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);'+(a.foto?'':'display:none')+'">'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
          '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'ar_foto_input\').click()"><i class="fas fa-image"></i> Elegir foto</button>'+
          '<input id="ar_foto_input" type="file" accept="image/*" style="display:none">'+
          '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'ar_foto_cam\').click()"><i class="fas fa-camera"></i> Hacer foto</button>'+
          '<input id="ar_foto_cam" type="file" accept="image/*" capture="environment" style="display:none">'+
          '<button type="button" class="btn btn-outline btn-sm" id="ar_foto_borrar" style="'+(a.foto?'':'display:none')+'"><i class="fas fa-trash"></i> Quitar</button>'+
        '</div>'+
      '</div>'+
      '<small style="color:var(--text-muted);display:block;margin-top:4px">Opcional · se guarda comprimida con el artículo</small>'+
    '</div>'+
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-articulo" data-action="save-articulo" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Artículo':'Nuevo Artículo',form,footer);

  // --- Gestión de la foto del artículo ---
  window.__articuloFoto = a.foto || null;
  const thumb=document.getElementById('ar_foto_thumb'),
        btnBorrar=document.getElementById('ar_foto_borrar');
  const pintarFoto=()=>{
    if(window.__articuloFoto){ thumb.src=window.__articuloFoto; thumb.style.display=''; btnBorrar.style.display=''; }
    else { thumb.src=''; thumb.style.display='none'; btnBorrar.style.display='none'; }
  };
  const cargarFoto=async file=>{
    if(!file) return;
    try{ window.__articuloFoto=await compressDoticsPhoto(file); pintarFoto(); }
    catch(e){ showToast(e.message||'No se pudo procesar la foto','error'); }
  };
  document.getElementById('ar_foto_input').addEventListener('change',e=>{ cargarFoto(e.target.files[0]); e.target.value=''; });
  document.getElementById('ar_foto_cam').addEventListener('change',e=>{ cargarFoto(e.target.files[0]); e.target.value=''; });
  btnBorrar.addEventListener('click',()=>{ window.__articuloFoto=null; pintarFoto(); });
};

window.saveArticulo = async function(id){
  id = id ? String(id) : null;
  try {
    const data = {
      id: document.getElementById('ar_id').value.trim(),
      referencia: document.getElementById('ar_id').value.trim(), // Usar ID como referencia
      nombre: document.getElementById('ar_nom').value.trim(),
      unidad: document.getElementById('ar_unid').value.trim(),
      categoria: document.getElementById('ar_tipo').value, // Guardar en categoria para compatibilidad
      stock: parseInt(document.getElementById('ar_stock').value)||0,
      stockMinimo: parseInt(document.getElementById('ar_min').value)||0,
      precioCompra: parseFloat(document.getElementById('ar_pc').value)||0,
      precioVenta: parseFloat(document.getElementById('ar_pv').value)||0,
      proveedor: document.getElementById('ar_prov').value.trim(),
      foto: window.__articuloFoto || null
    };
    if(!data.nombre){ showToast('El nombre es obligatorio','error'); return; }
    await dbPut('almacen', data);
    closeModal();
    showToast('Artículo guardado');
    navigateTo('almacen');
  } catch(err){
    console.error('Error al guardar artículo:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};

window.ajustarStock = async function(id){
  const a = await dbGet('almacen',id);
  if(!a) return;
  const form = '<div class="form-group"><label>Ajustar stock de: <strong>'+escapeHtml(a.nombre)+'</strong> (actual: '+a.stock+')</label></div>'+
    '<div class="form-grid" style="margin-top:12px">'+
      '<div class="form-group"><label>Entrada (+)</label><input id="as_ent" type="number" class="only-num" value="0" min="0"></div>'+
      '<div class="form-group"><label>Salida (-)</label><input id="as_sal" type="number" class="only-num" value="0" min="0"></div>'+
    '</div>'+
    '<p style="margin-top:12px;font-size:13px;color:var(--text-muted)">Nuevo stock: <strong id="as_new">'+a.stock+'</strong></p>';
     const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="applyStock(\''+id+'\')"><i class="fas fa-check"></i> Aplicar</button>';
  openModal('Ajustar Stock',form,footer);
  setTimeout(()=>{
    ['as_ent','as_sal'].forEach(fid=>{
      document.getElementById(fid)?.addEventListener('input',()=>{
        const e=parseInt(document.getElementById('as_ent').value)||0;
        const s=parseInt(document.getElementById('as_sal').value)||0;
        document.getElementById('as_new').textContent = Math.max(0,a.stock+e-s);
      });
    });
  },100);
};

window.applyStock = async function(id){
  const a = await dbGet('almacen',id);
  const e = parseInt(document.getElementById('as_ent').value)||0;
  const s = parseInt(document.getElementById('as_sal').value)||0;
  a.stock = Math.max(0,a.stock+e-s);
  await dbPut('almacen',a);
  closeModal();showToast('Stock actualizado: '+a.stock);navigateTo('almacen');
};

// CONFIGURACIÓN
