window.render_almacen = async function(el){
  const tipos = await window.TiposPuerta.filasDB();
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  el.innerHTML =
    '<div class="page-header"><div><h2>Almacén</h2><p>Control de stock y artículos</p></div>'+
    '<div class="header-actions">'+
      '<button class="btn btn-primary" onclick="showArticuloForm()"><i class="fas fa-plus"></i> Nuevo Artículo</button>'+
      (window.isAdmin?.() ? '<button class="btn btn-secondary" onclick="showEntradaMaterial()" title="Leer un albarán o factura de proveedor (foto o PDF) y sumar el material al stock"><i class="fas fa-wand-magic-sparkles"></i> Entrada de material</button>'+
      '<button class="btn btn-secondary" onclick="showHistorialEntradas()" title="Historial de entradas de material"><i class="fas fa-clock-rotate-left"></i> Entradas</button>'+
      '<button class="btn btn-secondary" onclick="showImportArticulosSage()" title="Importar o actualizar artículos desde el informe de Sage 50 (el código es la clave común)"><i class="fas fa-file-import"></i> Importar Sage</button>'+
      '<button class="btn btn-secondary" onclick="showExportarSage()" title="Movimientos de stock pendientes de pasar a Sage 50"><i class="fas fa-file-export"></i> Exportar a Sage</button>' : '')+
      '<button class="btn btn-secondary" onclick="generatePDF_almacen()"><i class="fas fa-file-pdf"></i> PDF</button></div></div>'+
    '<div class="search-bar" style="flex-wrap:wrap">'+
      '<input type="text" placeholder="Buscar…" id="searchArt" oninput="artBuscar()">'+
      '<select id="searchCampoArt" onchange="artReset()" title="Campo donde buscar">'+
        '<option value="todos">Buscar en: todos los campos</option><option value="codigo">Código</option><option value="nombre">Nombre</option>'+
        '<option value="descripcion">Descripción</option><option value="proveedor">Proveedor</option><option value="familia">Familia</option></select>'+
      '<select id="filterFamArt" onchange="artReset()"><option value="">Todas las familias</option></select>'+
      '<select id="filterCatArt" onchange="artReset()"><option value="">Todas las categorías</option>'+tiposOptions+'</select>'+
      '<select id="filterEstadoArt" onchange="artReset()"><option value="">Todos los estados</option><option value="bajo">Stock bajo</option><option value="cero">Sin stock</option><option value="servicio">Servicios (sin stock)</option></select>'+
      '<label style="display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap"><input type="checkbox" id="filterBajaArt" onchange="artReset()"> Ver bajas</label></div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th></th><th>Código</th><th data-titulo>Nombre</th><th>Familia / categoría</th><th>Stock</th><th>Mín.</th><th>P. Venta</th><th>Estado</th></tr>'+
    '</thead><tbody id="artBody"></tbody></table></div></div>';
  window.__artVisibles = ART_PAGINA;
  renderAlmacen();
};

// Paginación: 20 artículos cada vez, con «Mostrar más» / «Mostrar menos»
const ART_PAGINA = 20;
window.__artVisibles = ART_PAGINA;
window.artReset = function(){ window.__artVisibles = ART_PAGINA; return window.renderAlmacen(); };
window.artBuscar = function(){ clearTimeout(window.__artTimer); window.__artTimer = setTimeout(window.artReset, 200); };
window.artMas = function(){ window.__artVisibles += ART_PAGINA; return window.renderAlmacen(); };
window.artMenos = function(){ window.__artVisibles = Math.max(ART_PAGINA, window.__artVisibles - ART_PAGINA); return window.renderAlmacen(); };

const ART_CAMPOS_BUSQUEDA = {
  codigo: a => [a.sageCodigo, a.referencia, a.codigoAlt],
  nombre: a => [a.nombre],
  descripcion: a => [a.descripcion],
  proveedor: a => [a.proveedor],
  familia: a => [a.familia, a.codFamilia],
  todos: a => [a.sageCodigo, a.referencia, a.codigoAlt, a.nombre, a.descripcion, a.familia, a.proveedor, a.localizacion]
};

window.renderAlmacen = async function(){
  const [items, tipos] = await Promise.all([dbGetAll('almacen'), window.TiposPuerta.filasDB()]);
  const tiposMap = new Map(tipos.map(t => [t.id, t.nombre]));
  window.tiposMapCache = tiposMap;
  const q = (document.getElementById('searchArt')?.value||'').toLowerCase().trim();
  const campo = document.getElementById('searchCampoArt')?.value || 'todos';
  const cat = document.getElementById('filterCatArt')?.value||'';
  const fam = document.getElementById('filterFamArt')?.value||'';
  const estado = document.getElementById('filterEstadoArt')?.value||'';
  const verBajas = !!document.getElementById('filterBajaArt')?.checked;
  const famSel = document.getElementById('filterFamArt');
  if(famSel && famSel.options.length <= 1){
    [...new Set(items.map(a=>a.familia).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).forEach(f=>{ famSel.add(new Option(f,f)); });
    famSel.value = fam;
  }
  const textoDe = ART_CAMPOS_BUSQUEDA[campo] || ART_CAMPOS_BUSQUEDA.todos;
  const filtered = items.filter(a=>{
    if(a.baja && !verBajas) return false;
    if(q && !textoDe(a).join(' ').toLowerCase().includes(q)) return false;
    if(fam && a.familia!==fam) return false;
    // Filtrar por categoria o tipoPuerta (para compatibilidad)
    if(cat && a.categoria!==cat && a.tipoPuerta!==cat) return false;
    if(estado === 'servicio' && a.controlStock !== false) return false;
    if(estado === 'bajo' && !window.articuloStockBajo(a)) return false;
    if(estado === 'cero' && (a.controlStock === false || Number(a.stock) > 0)) return false;
    return true;
  }).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es',{sensitivity:'base'}));
  const visibles = Math.min(window.__artVisibles || ART_PAGINA, Math.max(filtered.length, ART_PAGINA));
  const tbody = document.getElementById('artBody');
  tbody.innerHTML = filtered.slice(0, visibles).map(a=>{
    const sinControl = a.controlStock === false;
    const bajo = window.articuloStockBajo(a);
    const catId = a.categoria || a.tipoPuerta; // compatibilidad con registros antiguos
    const catNombre = a.familia || (catId ? tiposMap.get(catId) || a.categoria || '—' : '—');
    return '<tr data-art-row="'+escapeHtml(String(a.id))+'" style="cursor:pointer'+(a.baja?';opacity:.55':'')+'"><td>'+(a.foto?'<img src="'+escapeHtml(a.foto)+'" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">':'<div style="width:40px;height:40px;border-radius:6px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted)"><i class="fas fa-image"></i></div>')+'</td>'+ // foto
      '<td><strong>'+escapeHtml(a.sageCodigo||a.referencia)+'</strong></td><td>'+escapeHtml(a.nombre)+(a.descripcion?'<br><small style="color:var(--text-muted)">'+escapeHtml(String(a.descripcion).split('\n')[0].slice(0,90))+'</small>':'')+'</td>'+
      '<td><span class="badge badge-blue">'+escapeHtml(catNombre)+'</span></td>'+
      '<td style="font-weight:700;color:'+(bajo?'var(--danger)':'var(--text)')+'">'+(sinControl?'—':a.stock)+'</td>'+
      '<td>'+(sinControl?'—':a.stockMinimo)+'</td><td>'+formatCurrency(a.precioVenta)+'</td>'+
      '<td><span class="badge '+(a.baja?'badge-gray':sinControl?'badge-blue':bajo?'badge-red':'badge-green')+'">'+(a.baja?'Baja':sinControl?'Servicio':bajo?'Stock bajo':'OK')+'</span></td>'+
    '</tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Sin artículos</td></tr>';
  if(filtered.length){
    const mostrando = Math.min(visibles, filtered.length);
    tbody.insertAdjacentHTML('beforeend','<tr><td colspan="8" style="text-align:center;padding:14px"><span style="color:var(--text-muted);margin-right:12px">Mostrando '+mostrando+' de '+filtered.length+'</span>'+
      (visibles > ART_PAGINA ? '<button type="button" class="btn btn-outline btn-sm" onclick="artMenos()"><i class="fas fa-chevron-up"></i> Mostrar menos</button> ' : '')+
      (mostrando < filtered.length ? '<button type="button" class="btn btn-outline btn-sm" onclick="artMas()"><i class="fas fa-chevron-down"></i> Mostrar más</button>' : '')+
    '</td></tr>');
  }
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
  const bajo = window.articuloStockBajo(a);
  const sinControl = a.controlStock === false;
  const campo = (etiqueta, valor) => (valor===undefined||valor===null||String(valor).trim()==='') ? '' :
    '<div><small style="color:var(--text-muted);display:block">'+etiqueta+'</small><div style="font-weight:600">'+valor+'</div></div>';
  const fotoHtml = a.foto
    ? '<div style="grid-column:1/-1"><img src="'+escapeHtml(a.foto)+'" style="max-width:220px;max-height:220px;object-fit:contain;border-radius:10px;border:1px solid var(--border);background:#fff"></div>' : '';
  const descripcionHtml = a.descripcion
    ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted);display:block">Descripción</small><div style="white-space:pre-line">'+escapeHtml(a.descripcion)+'</div></div>' : '';
  const sageHtml = a.sageCodigo
    ? campo('Stock según Sage', a.sageStock==null?'':escapeHtml(String(a.sageStock))+(a.sageSyncAt?' <small style="font-weight:400;color:var(--text-muted)">('+escapeHtml(new Date(a.sageSyncAt).toLocaleDateString('es-ES'))+')</small>':''))
    : '';
  const estado = a.baja ? ['badge-gray','Baja'+(a.fechaBaja?' ('+escapeHtml(String(a.fechaBaja).slice(0,10))+')':'')]
    : sinControl ? ['badge-blue','Servicio (sin stock)'] : bajo ? ['badge-red','Stock bajo'] : ['badge-green','OK'];
  openModal('📦 '+(a.nombre||a.id),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'+
      fotoHtml+
      campo('Código', escapeHtml(String(a.sageCodigo||a.referencia||a.id)))+
      sageHtml+
      campo('Familia', escapeHtml(a.familia||''))+
      campo('Categoría', (a.categoria||a.tipoPuerta)?escapeHtml(window.tiposMapCache.get(a.categoria||a.tipoPuerta)||a.categoria||''):'')+
      (sinControl ? '' : campo('Stock', '<span style="color:'+(bajo?'var(--danger)':'var(--text)')+'">'+a.stock+'</span>')+
      campo('Stock mínimo', a.stockMinimo))+
      campo('Precio compra', formatCurrency(a.precioCompra))+
      campo('Precio venta', formatCurrency(a.precioVenta))+
      campo('Proveedor', escapeHtml(a.proveedor||''))+
      campo('Unidad', escapeHtml(a.unidad||''))+
      campo('Localización', escapeHtml(a.localizacion||''))+
      campo('Estado', '<span class="badge '+estado[0]+'">'+estado[1]+'</span>')+
      descripcionHtml+
    '</div>',
    '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();showArticuloForm(\''+escapeHtml(String(a.id))+'\')"><i class="fas fa-pen"></i> Editar</button>'+
    (sinControl ? '' : '<button class="btn btn-primary btn-sm" onclick="ajustarStock(\''+escapeHtml(String(a.id))+'\')"><i class="fas fa-arrows-rotate"></i> Ajustar stock</button>')+
    '<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'Artículo '+escapeHtml(a.nombre)+'\', ()=>deleteArticulo(\''+escapeHtml(String(a.id))+'\'))"><i class="fas fa-trash"></i> Eliminar</button>');
};

window.deleteArticulo = async function(id){
  await dbDelete('almacen',id);
  showToast('Artículo eliminado');navigateTo('almacen');
};

window.showArticuloForm = async function(id){
  id = id ? String(id) : null;
  const a = id ? await dbGet('almacen',id) : {};
  window.__articuloActual = a;
  
  // Cargar tipos de puerta
  const tipos = await window.TiposPuerta.filasDB();
  const catId = a.categoria || a.tipoPuerta; // Usar categoria o tipoPuerta para compatibilidad
  const tiposOptions = tipos.map(t => `<option value="${t.id}" ${String(catId)===String(t.id)?'selected':''}>${escapeHtml(t.nombre)}</option>`).join('');
  const enlazado = !!a.sageCodigo;   // un código ya enlazado con Sage no se cambia desde aquí

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>Código del artículo'+(id?'':' *')+' <small style="color:var(--text-muted)">(el mismo que en Sage 50)</small></label>'+
      '<div style="display:flex;gap:6px"><input id="ar_cod" value="'+escapeHtml(a.sageCodigo||'')+'" maxlength="12" placeholder="Ej. PU000123" autocomplete="off" style="flex:1;text-transform:none'+(enlazado?';background:var(--surface-alt)':'')+'"'+(enlazado?' readonly':'')+'>'+
      (enlazado?'':'<button type="button" class="btn btn-outline btn-sm" title="Escribe el prefijo (p. ej. PU) y propone el siguiente código libre" onclick="sugerirCodigoArticulo()"><i class="fas fa-wand-magic-sparkles"></i></button>')+'</div>'+
      '<small style="color:var(--text-muted)">8 caracteres como en Sage: 2 letras + 6 números (PU000123). Sin espacios.</small></div>'+
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
    '<div class="form-group"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ar_ctrl"'+(a.controlStock===false?'':' checked')+'> Lleva control de stock</label>'+
      '<label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="ar_baja"'+(a.baja?' checked':'')+'> Artículo de baja</label></div>'+
    '<div class="form-group full"><label>Foto del artículo</label>'+
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
        '<img id="ar_foto_thumb" src="'+(a.foto||'')+'" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);'+(a.foto?'':'display:none')+'">'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
          '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'ar_foto_input\').click()"><i class="fas fa-image"></i> Elegir foto</button>'+
          '<input id="ar_foto_input" type="file" accept="image/*" style="display:none">'+
          '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'ar_foto_cam\').click()"><i class="fas fa-camera"></i> Hacer foto</button>'+
          '<input id="ar_foto_cam" type="file" accept="image/*" capture="environment" style="display:none">'+
          '<button type="button" class="btn btn-danger btn-sm" id="ar_foto_borrar" style="'+(a.foto?'':'display:none')+'"><i class="fas fa-trash"></i> Quitar</button>'+
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

// Siguiente código libre para un prefijo (PU → PU000615): rellena con ceros hasta 8 caracteres, como Sage
window.siguienteCodigoArticulo = function(prefijo, articulos){
  const p = String(prefijo || '').trim();
  let max = 0;
  (articulos || []).forEach(a => {
    const c = String(a.sageCodigo || '');
    const m = c.startsWith(p) ? c.slice(p.length).match(/^\d+$/) : null;
    if(m) max = Math.max(max, parseInt(m[0], 10));
  });
  return p + String(max + 1).padStart(Math.max(3, 8 - p.length), '0');
};

window.sugerirCodigoArticulo = async function(){
  const input = document.getElementById('ar_cod');
  const prefijo = (input.value.match(/^[A-Za-z]+/) || [''])[0];
  if(!prefijo){ showToast('Escribe primero el prefijo del código (por ejemplo PU) y pulsa de nuevo','warning'); input.focus(); return; }
  input.value = window.siguienteCodigoArticulo(prefijo, await dbGetAll('almacen'));
};

window.saveArticulo = async function(id){
  id = id ? String(id) : null;
  try {
    const actual = window.__articuloActual || {};
    const codigo = document.getElementById('ar_cod').value.trim();
    if(!id && !codigo){ showToast('El código del artículo es obligatorio','error'); return; }
    if(codigo && !/^[A-Za-z0-9_-]{1,12}$/.test(codigo)){ showToast('El código solo admite letras, números, guion y guion bajo (sin espacios), máximo 12','error'); return; }
    const data = {
      id: id || 'ART-' + codigo,
      referencia: codigo || actual.referencia || 'ART-' + codigo,
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
    if(codigo && codigo !== actual.sageCodigo){
      const otros = await dbGetAll('almacen');
      const dup = otros.find(x => String(x.id) !== String(data.id) && (x.sageCodigo === codigo || (!id && String(x.id) === data.id)));
      if(dup){ showToast('El código '+codigo+' ya lo tiene «'+(dup.nombre||dup.id)+'»','error'); return; }
      data.sageCodigo = codigo;
    }
    // Campos de Sage: solo se envían si hay algo que guardar (así no hace falta la migración para el uso normal)
    const lleva = document.getElementById('ar_ctrl').checked;
    if(lleva !== (actual.controlStock !== false)) data.controlStock = lleva;
    const deBaja = document.getElementById('ar_baja').checked;
    if(deBaja !== !!actual.baja) data.baja = deBaja;
    await dbPut('almacen', data);
    closeModal();
    showToast('Artículo guardado');
    navigateTo('almacen');
  } catch(err){
    console.error('Error al guardar artículo:', err);
    showToast(/sagecodigo/i.test(String(err.message)) ? 'Ese código de Sage ya pertenece a otro artículo' : 'Error al guardar: '+err.message,'error');
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
