//  PRESUPUESTOS
window.render_presupuestos = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Presupuestos</h2><p>Genera y gestiona presupuestos</p></div>'+
    '<div class="header-actions">'+
      '<button class="btn btn-secondary" onclick="importarPresupuestoFoto()" title="Importar un presupuesto desde una foto (OCR)"><i class="fas fa-wand-magic-sparkles"></i> Importar desde foto</button>'+
      '<button class="btn btn-primary" onclick="showPresupuestoForm()"><i class="fas fa-plus"></i> Nuevo Presupuesto</button>'+
      '<button class="btn btn-secondary" onclick="showPlantillasPresupuesto()"><i class="fas fa-bookmark"></i> Plantillas</button>'+
      '<button class="btn btn-secondary" onclick="generatePDF_presupuestos()"><i class="fas fa-file-pdf"></i> Exportar todo</button>'+
      (window.isAdmin&&window.isAdmin()?'<button class="btn btn-secondary" onclick="exportarPresupuestosSage()" title="CSV de los presupuestos APROBADOS para Sage 50 (respeta cliente y fechas)"><i class="fas fa-file-csv"></i> Exportar a Sage</button>':'')+'</div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar..." id="searchPres" oninput="window.__presPagina=0;renderPresupuestos()">'+
      '<select id="filterCliPres" onchange="window.__presPagina=0;renderPresupuestos()"><option value="">Todos los clientes</option></select>'+
      '<select id="filterEstadoPres" onchange="window.__presPagina=0;renderPresupuestos()"><option value="">Todos los estados</option><option value="borrador">Borrador</option><option value="enviado">Enviado</option><option value="aprobado">Aprobado</option><option value="rechazado">Rechazado</option></select>'+
      '<input type="date" id="presDesde" onchange="window.__presPagina=0;renderPresupuestos()" title="Desde">'+
      '<input type="date" id="presHasta" onchange="window.__presPagina=0;renderPresupuestos()" title="Hasta">'+
    '</div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
      '<tr><th>ID</th><th>Cliente</th><th>Fecha</th><th>Válido hasta</th><th>Total</th><th>Parte</th><th>Estado</th></tr>'+
    '</thead><tbody id="presBody"></tbody></table></div></div>'+
    '<div id="navPres" style="display:none;text-align:center;margin-top:12px">'+
      '<button class="btn btn-outline btn-sm" id="btnPresPrev" style="display:none"><i class="fas fa-chevron-up"></i> Mostrar menos</button> '+
      '<button class="btn btn-outline btn-sm" id="btnPresMore">Mostrar más</button>'+
    '</div>'+
    '<div style="margin-top:10px"><small id="presContador" style="color:var(--text-muted)"></small></div>';
  renderPresupuestos();
  const more = document.getElementById('btnPresMore');
  const prev = document.getElementById('btnPresPrev');
  if(more && !more.__bound){ more.__bound = true; more.addEventListener('click', window.presupuestosMostrarMas); }
  if(prev && !prev.__bound){ prev.__bound = true; prev.addEventListener('click', window.presupuestosMostrarMenos); }
  try{
    const clientesPres = await dbGetAll('clientes');
    const selCliPres = document.getElementById('filterCliPres');
    if(selCliPres){
      selCliPres.innerHTML = '<option value="">Todos los clientes</option>' +
        clientesPres.slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))
          .map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.nombre)+'</option>').join('');
    }
  }catch(_){ }
};

window.renderPresupuestos = async function(){
  const presupuestos = await dbGetAll('presupuestos');
  window.__presupuestosCache = Object.fromEntries(presupuestos.map(p=>[p.id,p]));
  const q = (document.getElementById('searchPres')?.value||'').toLowerCase();
  const cliFiltro = document.getElementById('filterCliPres')?.value||'';
  const estFiltro = document.getElementById('filterEstadoPres')?.value||'';
  const desFiltro = document.getElementById('presDesde')?.value||'';
  const hasFiltro = document.getElementById('presHasta')?.value||'';
  const filtered = presupuestos.filter(p=>{
    if(q && !JSON.stringify(p).toLowerCase().includes(q)) return false;
    if(cliFiltro && String(p.clienteId||'')!==String(cliFiltro)) return false;
    if(estFiltro && p.estado!==estFiltro) return false;
    if(desFiltro && String(p.fecha||'') < desFiltro) return false;
    if(hasFiltro && String(p.fecha||'') > hasFiltro) return false;
    return true;
  }).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  const POR_PAG_PRES = 20;
  window.__presPagina = Math.max(0, Math.min(window.__presPagina||0, Math.floor(Math.max(filtered.length-1,0)/POR_PAG_PRES)));
  const inicioP = window.__presPagina * POR_PAG_PRES;
  const visibles = filtered.slice(inicioP, inicioP + POR_PAG_PRES);
  const tbodyP = document.getElementById('presBody');
  tbodyP.innerHTML = visibles.map(p=>
    '<tr data-pres-row="'+escapeHtml(p.id)+'" style="cursor:pointer"><td><strong>'+escapeHtml(p.id)+'</strong></td><td>'+escapeHtml(p.clienteNombre)+'</td>'+
    '<td>'+formatDate(p.fecha)+'</td><td>'+formatDate(p.validoHasta)+'</td>'+
    '<td>'+formatCurrency(p.total)+'</td>'+
    '<td>'+(p.parteId ? '<span class="badge badge-purple" title="Parte de trabajo asociado">'+escapeHtml(p.parteId)+'</span>' : '<span class="badge badge-gray">Individual</span>')+'</td>'+
    '<td><span class="badge '+getBadgeClass(p.estado)+'">'+getStatusLabel(p.estado)+'</span></td>'+
    '</tr>'
  ).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Sin presupuestos</td></tr>';

  // Botones mostrar más / menos
  const navP = document.getElementById('navPres');
  if(navP){
    navP.style.display = filtered.length > POR_PAG_PRES ? 'block' : 'none';
    document.getElementById('btnPresMore').style.display = (inicioP+POR_PAG_PRES < filtered.length) ? '' : 'none';
    document.getElementById('btnPresPrev').style.display = (inicioP > 0) ? '' : 'none';
  }
  const contP = document.getElementById('presContador');
  if(contP) contP.textContent = filtered.length ? ('Mostrando '+(inicioP+1)+'–'+Math.min(inicioP+POR_PAG_PRES, filtered.length)+' de '+filtered.length+' presupuestos') : '';

  if(!tbodyP.__fichaBound){
    tbodyP.__fichaBound = true;
    tbodyP.addEventListener('click', e => {
      if(e.target.closest('button') || e.target.closest('a')) return;
      const row = e.target.closest('tr[data-pres-row]');
      if(row) window.verFichaPresupuesto(row.dataset.presRow);
    });
  }
};

window.presupuestosMostrarMas = function(){ window.__presPagina++; renderPresupuestos(); };
window.presupuestosMostrarMenos = function(){ window.__presPagina = Math.max(0,(window.__presPagina||0)-1); renderPresupuestos(); };

// Ficha del presupuesto en modal
window.verFichaPresupuesto = async function(id){
  const p = window.__presupuestosCache?.[id] || await dbGet('presupuestos', id);
  if(!p) return;
  window.__presupuestosCache[p.id] = p;
  await window.loadFeatures?.();
  let albaranRelacionado = null;
  if(window.isAdmin?.() && p.estado === 'aprobado'){
    const {data,error}=await window.supabaseDB.from('albaranes')
      .select('id,numero,fecha').eq('presupuestoid',String(p.id)).maybeSingle();
    if(error){
      console.error('[Presupuestos] No se pudo comprobar el albarán asociado:',error);
      showToast('No se pudo comprobar si este presupuesto ya tiene albarán: '+error.message,'error');
    }else{
      albaranRelacionado=data;
    }
  }
  const estadoLabels = {borrador:'Borrador',enviado:'Enviado',aprobado:'Aprobado',rechazado:'Rechazado'};
  const estadoBadge = '<span class="badge '+getBadgeClass(p.estado)+'">'+(estadoLabels[p.estado]||getStatusLabel(p.estado)||p.estado)+'</span>';
  const mp = p.medidasPlanta && p.medidasPlanta.sistema==='hoja-v1' ? p.medidasPlanta : null;
  const medidasChip = mp
    ? '<button type="button" class="btn btn-success btn-sm" title="Ver hoja de medidas" onclick="HOJA_MEDIDAS.abrirVista(window.__presupuestosCache[\''+escapeHtml(p.id)+'\'].medidasPlanta)"><i class="fas fa-ruler-combined"></i> '+escapeHtml(mp.tipoNombre||'Hoja de medidas')+'</button>' : '';
  const fichaItems = (p.lineItems||[]).map(it=>
    '<tr><td>'+escapeHtml(it.descripcion||'')+'</td>'+
    '<td>'+escapeHtml(it.ref||'')+'</td>'+
    '<td style="text-align:right">'+(Number(it.cantidad)||0)+'</td>'+
    '<td style="text-align:right">'+formatCurrency(it.precio)+'</td>'+
    '<td style="text-align:right"><strong>'+formatCurrency((Number(it.cantidad)||0)*(Number(it.precio)||0))+'</strong></td></tr>'
  ).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Sin conceptos</td></tr>';
  openModal('📋 '+(p.id||'Presupuesto'),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">'+
      '<div><small style="color:var(--text-muted)">Cliente</small><div><strong>'+escapeHtml(p.clienteNombre||'—')+'</strong></div></div>'+
      '<div><small style="color:var(--text-muted)">Estado</small><div>'+estadoBadge+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Fecha</small><div>'+formatDate(p.fecha)+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Válido hasta</small><div>'+formatDate(p.validoHasta)+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Plazo de entrega</small><div>'+escapeHtml(p.plazoEntrega||'—')+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Parte asociado</small><div>'+(p.parteId?escapeHtml(p.parteId):'<span class="badge badge-gray">Individual</span>')+'</div></div>'+
      (medidasChip?'<div><small style="color:var(--text-muted)">Hoja de medidas</small><div>'+medidasChip+'</div></div>':'')+
      (p.notas?'<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Notas</small><div>'+escapeHtml(p.notas)+'</div></div>':'')+
    '</div>'+
    '<h4 style="margin:16px 0 8px">Conceptos</h4>'+
    '<div class="table-wrapper"><table><thead><tr><th>Descripción</th><th>REF</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>'+fichaItems+'</tbody></table></div>'+
    '<div style="text-align:right;margin-top:8px">'+
      '<div><small style="color:var(--text-muted)">Subtotal</small> '+formatCurrency(p.subtotal ?? (p.lineItems||[]).reduce((s,i)=>s+(Number(i.cantidad)||0)*(Number(i.precio)||0),0))+'</div>'+
      '<div><small style="color:var(--text-muted)">IVA (21%)</small> '+formatCurrency(p.iva ?? 0)+'</div>'+
      '<div style="font-size:1.1rem"><strong>TOTAL: '+formatCurrency(p.total)+'</strong></div>'+
    '</div>',
    '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;width:100%">'+
      '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
      '<button class="btn btn-primary btn-sm" onclick="closeModal();showPresupuestoForm(\''+escapeHtml(p.id)+'\')"><i class="fas fa-pen"></i> Editar</button>'+
      '<button class="btn btn-success btn-sm" onclick="sendPresupuesto(\''+escapeHtml(p.id)+'\')"><i class="fas fa-paper-plane"></i> Enviar</button>'+
      (window.aprobacionOnlineBoton?window.aprobacionOnlineBoton(p):'')+
      '<button class="btn btn-outline btn-sm" onclick="generatePDF_presupuesto(\''+escapeHtml(p.id)+'\')"><i class="fas fa-file-pdf"></i> PDF</button>'+
      (window.isAdmin?.() && p.estado==='aprobado'
        ? (albaranRelacionado
          ? '<button class="btn btn-secondary btn-sm" onclick="closeModal();navigateTo(\'albaranes\')"><i class="fas fa-file-signature"></i> Albarán creado · ALB-'+String(albaranRelacionado.fecha||'').slice(0,4)+'-'+String(albaranRelacionado.numero).padStart(4,'0')+'</button>'
          : '<button class="btn btn-success btn-sm" onclick="closeModal();createAlbaranFromPresupuesto(\''+escapeHtml(p.id)+'\')"><i class="fas fa-file-signature"></i> Crear albarán</button>')
        : '')+
      '<button class="btn btn-outline btn-sm" onclick="savePresupuestoAsTemplate(\''+escapeHtml(p.id)+'\')"><i class="fas fa-bookmark"></i> Plantilla</button>'+
      '<button class="btn btn-outline btn-sm" onclick="closeModal();duplicatePresupuesto(\''+escapeHtml(p.id)+'\')"><i class="fas fa-copy"></i> Duplicar</button>'+
      '<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'Presupuesto '+escapeHtml(p.id)+'\', ()=>deletePresupuesto(\''+escapeHtml(p.id)+'\'))"><i class="fas fa-trash"></i> Eliminar</button>'+
    '</div>');
};

// Líneas de concepto """""""""""""""""""?
window.__lineItems = {};

function renderLineItems(cid, items){
  const containerId = cid.endsWith('_items') ? cid : cid + '_items';
  const container = document.getElementById(containerId);
  if(!container) return;
  const almacen = window.__almacenPres || [];
  container.innerHTML = items.map((item,i)=>
    '<tr data-idx="'+i+'">'+
      '<td><select data-field="tipoId" onchange="onLineTipoChange(\''+cid+'\','+i+',this.value)" style="min-width:170px">'+
        '<option value="">— Sin tipo —</option>'+
        (window.__tipos||[]).map(t=>'<option value="'+t.id+'" '+(String(item.tipoId||'')===String(t.id)?'selected':'')+'>'+escapeHtml(t.nombre)+'</option>').join('')+'</td>'+
      // Referencia del repuesto (como en la hoja de presupuesto impresa)
      // Descripción: SELECT con los artículos del tipo elegido + opción manual
      '<td><div style="display:flex;flex-direction:column;gap:4px;min-width:240px">'+
        '<select data-field="descripcion_sel" onchange="onLineDescChange(\''+cid+'\','+i+',this)" style="min-width:240px">'+
          '<option value="">— Elegir artículo del almacén —</option>'+
          almacen.filter(a=>item.tipoId && String(a.categoria||a.tipoPuerta||'')===String(item.tipoId))
            .map(a=>'<option value="'+escapeHtml(a.nombre)+'" data-precio="'+(a.precioVenta||0)+'" data-ref="'+escapeHtml(a.referencia||'')+'" '+(a.nombre===item.descripcion?'selected':'')+'>'+escapeHtml(a.nombre)+' ('+escapeHtml(a.referencia||'')+')</option>').join('')+
          '<option value="__manual__" '+(!almacen.some(a=>a.nombre===item.descripcion && String(a.categoria||a.tipoPuerta||'')===String(item.tipoId)) && item.descripcion?'selected':'')+'>✏️ Escribir manualmente…</option>'+
        '</select>'+
        '<input type="text" data-field="descripcion" value="'+escapeHtml(item.descripcion)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'descripcion\',this.value)" style="display:'+(item.descripcion && !almacen.some(a=>a.nombre===item.descripcion && String(a.categoria||a.tipoPuerta||'')===String(item.tipoId))?'block':'none')+';min-width:240px" placeholder="Escribe el artículo a mano">'+
      '</div></td>'+
      '<td><input type="text" data-field="ref" value="'+escapeHtml(item.ref||'')+'" onchange="updateLineItem(\''+cid+'\','+i+',\'ref\',this.value)" style="width:100px" placeholder="REF"></td>'+
      '<td><input type="number" data-field="cantidad" class="only-num-dec" min="0" step="0.01" inputmode="decimal" value="'+(Number(item.cantidad)||0)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'cantidad\',this.value)" style="width:110px"></td>'+
      '<td><input type="number" data-field="precio" class="only-num-dec" min="0" step="0.01" inputmode="decimal" value="'+(Number(item.precio)||0)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'precio\',this.value)" style="width:110px"></td>'+
      '<td><strong id="'+cid+'_subtotal_'+i+'">'+formatCurrency(item.cantidad*item.precio)+'</strong></td>'+
      '<td><button class="btn btn-outline btn-sm btn-icon" onclick="removeLineItem(\''+cid+'\','+i+')" title="Eliminar línea"><i class="fas fa-minus"></i></button></td>'+
    '</tr>'
  ).join('');
}

// Al elegir un artículo del select de descripción: fija nombre y precio (o activa el input manual)
window.onLineDescChange = function(cid, idx, sel){
  if(!window.__lineItems[cid]) return;
  const item = window.__lineItems[cid][idx];
  if(!item) return;
  const fila = sel.closest('tr');
  const inpManual = fila?.querySelector('[data-field="descripcion"]');
  if(sel.value === '__manual__'){
    // Mostrar input manual, dejar vacío para escribir
    if(inpManual){ inpManual.style.display='block'; inpManual.value=''; inpManual.focus(); }
    item.descripcion = '';
  } else if(sel.value){
    // Artículo del almacén: fijar descripción, referencia y precio de venta
    item.descripcion = sel.value;
    item.precio = Number(sel.selectedOptions[0]?.dataset.precio)||0;
    item.ref = sel.selectedOptions[0]?.dataset.ref || item.ref || '';
    if(inpManual){ inpManual.style.display='none'; }
    const inpPrecio = fila?.querySelector('[data-field="precio"]');
    if(inpPrecio) inpPrecio.value = item.precio;
  } else {
    item.descripcion = '';
    if(inpManual){ inpManual.style.display='none'; inpManual.value=''; }
  }
  updateLineItem(cid, idx, 'descripcion', item.descripcion);
  const subtotalEl = document.getElementById(cid+'_subtotal_'+idx);
  if(subtotalEl) subtotalEl.textContent = formatCurrency(item.cantidad*item.precio);
};

// Al cambiar el tipo de una línea: vacía la descripción y repinta el datalist con artículos de ese tipo
window.onLineTipoChange = function(cid, idx, tipoId){
  if(!window.__lineItems[cid]) return;
  const item = window.__lineItems[cid][idx];
  if(!item) return;
  const anterior = String(item.tipoId||'');
  item.tipoId = tipoId;
  if(tipoId && anterior !== tipoId){
    // Sugerir el primer artículo de ese tipo, si lo hay
    const arts = (window.__almacenPres||[]).filter(a=>String(a.categoria||a.tipoPuerta||'')===String(tipoId));
    if(arts.length){
      item.descripcion = arts[0].nombre;
      item.precio = Number(arts[0].precioVenta)||0;
      item.ref = arts[0].referencia || item.ref || '';
    } else if(!item.descripcion){
      item.descripcion = '';
    }
  }
  renderLineItems(cid, window.__lineItems[cid]);
  // Al cambiar tipo y precargarse descripción/precio, recalcar
  const inpPrecio = document.querySelector('tr[data-idx="'+idx+'"] [data-field="precio"]');
  if(inpPrecio) inpPrecio.value = item.precio||0;
  const inpDesc = document.querySelector('tr[data-idx="'+idx+'"] [data-field="descripcion"]');
  if(inpDesc) inpDesc.value = item.descripcion||'';
};

window.updateLineItem = function(cid,idx,field,val){
  if(!window.__lineItems[cid]) return;
  window.__lineItems[cid][idx][field] = (field==='cantidad'||field==='precio') ? parseFloat(val)||0 : val;

  // Actualizar subtotal de la línea específica
  if(field==='cantidad' || field==='precio'){
    const item = window.__lineItems[cid][idx];
    const subtotalEl = document.getElementById(cid+'_subtotal_'+idx);
    if(subtotalEl){
      subtotalEl.textContent = formatCurrency(item.cantidad * item.precio);
    }
  }
};

window.removeLineItem = function(cid,idx){
  if(!window.__lineItems[cid]) return;
  window.__lineItems[cid].splice(parseInt(idx),1);
  renderLineItems(cid, window.__lineItems[cid]);
};

window.addLineItem = function(cid){
  const key = cid.endsWith('_items') ? cid.replace(/_items$/, '') : cid;
  if(!window.__lineItems[key]) window.__lineItems[key]=[];
  window.__lineItems[key].push({descripcion:'',tipoId:'',cantidad:1,precio:0});
  renderLineItems(key, window.__lineItems[key]);

  // Enfocar el campo de descripción de la nueva línea
  setTimeout(() => {
    const rows = document.querySelectorAll('#'+key+'_items tr');
    const lastRow = rows[rows.length - 1];
    if(lastRow){
      const descInput = lastRow.querySelector('[data-field="descripcion"]');
      if(descInput) descInput.focus();
    }
  }, 50);
};
function calcTotals(prefix){
  const rows = document.querySelectorAll('#'+prefix+'_items tr');
  let sub = 0;
  rows.forEach(r=>{
    const cant = parseFloat(r.querySelector('[data-field="cantidad"]')?.value)||0;
    const precio = parseFloat(r.querySelector('[data-field="precio"]')?.value)||0;
    sub += cant*precio;
  });
  const iva = sub*0.21;
  const el = document.getElementById(prefix+'_totals');
  if(el){
    el.querySelector('#'+prefix+'_subtotal')?.textContent && (el.querySelector('#'+prefix+'_subtotal').textContent = formatCurrency(sub));
    el.querySelector('#'+prefix+'_iva')?.textContent && (el.querySelector('#'+prefix+'_iva').textContent = formatCurrency(iva));
    el.querySelector('#'+prefix+'_total')?.textContent && (el.querySelector('#'+prefix+'_total').textContent = formatCurrency(sub+iva));
  }
}

window.showPresupuestoForm = async function(id, tpl){
  id = id ? String(id) : null;
  await window.TiposPuerta.cargar().catch(()=>{}); window.__tipos=window.TiposPuerta.filas({servicios:true});   // catálogo único
  await dbGetAll('almacen').then(r=>{window.__almacenPres=r});
  window.__lineItems = {};
  const importado = !id && !tpl ? window.__presupuestoImportado : null;
  window.__presupuestoImportado = null;
  const p = id ? await dbGet('presupuestos',id)
    : (tpl ? {notas:tpl.notas||'', lineItems:JSON.parse(JSON.stringify(tpl.lineItems||[]))} : {});
  if(importado){
    if(importado.fecha) p.fecha=importado.fecha;
    if(importado.lineItems?.length) p.lineItems=importado.lineItems;
    if(importado.clienteNombre) p.__clienteNombreOCR=importado.clienteNombre;
  }
  window.__pfDatosActuales = p;
  const items = p.lineItems || [{descripcion:'',tipoId:'',cantidad:1,precio:0}];
  const lid = id ? 'pf_edit' : 'pf_new';
  window.__lineItems[lid] = items;

  const nextId = p.id || window.db.nextId('PRES');

  const clientes = await dbGetAll('clientes');
  // Coincidencia difusa del nombre detectado por OCR con la lista de clientes
  let clienteOCRId='';
  if(p.__clienteNombreOCR){
    const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const objetivo=norm(p.__clienteNombreOCR);
    const match=clientes.find(c=>norm(c.nombre)===objetivo)
      || clientes.find(c=>norm(c.nombre).includes(objetivo) || objetivo.includes(norm(c.nombre)));
    if(match) clienteOCRId=match.id;
  }
  // Partes de trabajo del día del presupuesto (por defecto hoy si es nuevo)
  const fechaBase = p.fecha || getToday();
  const partes = await dbGetAll('partesTrabajo');
  const partesDelDia = partes.filter(pt => pt.fecha === fechaBase)
    .map(pt => ({ id: pt.id, clienteNombre: pt.clienteNombre || '', desc: (pt.descripcion || '').slice(0, 60) }));
  const partesOptions = '<option value="">— Sin parte asociado (presupuesto individual) —</option>' +
    partesDelDia.map(pt => '<option value="' + escapeHtml(pt.id) + '" ' + (p.parteId === pt.id ? 'selected' : '') + '>' +
      escapeHtml(pt.id) + ' · ' + escapeHtml(pt.clienteNombre) + (pt.desc ? ' — ' + escapeHtml(pt.desc) : '') + '</option>').join('');

  const form = '<div class="form-grid">'+
    '<div class="form-group"><label>ID</label><input id="pf_id" value="'+escapeHtml(nextId)+'"></div>'+
    '<div class="form-group"><label>Cliente *</label><select id="pf_cliente">'+
      '<option value="">— Seleccionar</option>'+
      clientes.map(c=>'<option value="'+c.id+'" data-nombre="'+escapeHtml(c.nombre)+'" '+((p.clienteId===c.id||clienteOCRId===c.id)?'selected':'')+'>'+escapeHtml(c.nombre)+'</option>').join('')+'</select></div>'+
    '<div class="form-group"><label>Fecha</label><input id="pf_fecha" type="date" value="'+(p.fecha||getToday())+'"></div>'+
    '<div class="form-group"><label>Válido hasta</label><input id="pf_valido" type="date" value="'+(p.validoHasta||'')+'"></div>'+
    '<div class="form-group"><label>Estado</label><select id="pf_estado">'+
      ['borrador','enviado','aprobado','rechazado'].map(e=>'<option value="'+e+'" '+(p.estado===e?'selected':'')+'>'+getStatusLabel(e)+'</option>').join('')+'</select></div>'+
    '<div class="form-group"><label>Plazo de entrega</label><input id="pf_plazo" value="'+escapeHtml(p.plazoEntrega||'')+'" placeholder="p.ej. 10 días"></div>'+
    '<div class="form-group full"><label>Parte de trabajo del día (opcional)</label><select id="pf_parte">'+
      partesOptions+
    '</select>'+
    '<small style="color:var(--text-muted);display:block;margin-top:4px">Asocia este presupuesto a un parte de la misma fecha. Si es un presupuesto individual, deja "Sin parte asociado".</small></div>'+
    '<div class="form-group full"><label>Notas / Observaciones (visibles en el presupuesto)</label><textarea id="pf_notas" placeholder="Condiciones, forma de pago, notas para el cliente…">'+escapeHtml(p.notas||'')+'</textarea></div>'+
  '</div>'+
  '<div class="pf-medidas-row" style="margin:12px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
    '<label style="font-weight:600">Tipo de puerta:</label>'+
    '<select id="pf_tipo_hoja" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:14px">'+
      window.TiposPuerta.opciones(p.medidasPlanta?.tipoNombre,{por:'nombre',vacio:'— Elegir tipo —'})+
    '</select>'+
    '<button class="btn btn-outline btn-sm" id="pf_btn_hoja" onclick="abrirHojaMedidasPresupuesto(\''+lid+'\')"><i class="fas fa-ruler-combined"></i> Abrir hoja de medidas</button>'+
    '<span id="'+lid+'_medidas_info" class="pf-medidas-info" style="font-size:13px;color:var(--text-muted)">'+
      (p.medidasPlanta ? '<i class="fas fa-check-circle" style="color:#16a34a"></i> Hoja de medidas adjunta ('+escapeHtml(p.medidasPlanta.tipoNombre||'')+')' : 'Elige el tipo y rellena la hoja del técnico')+
    '</span>'+
  '</div>'+
  '<h3 style="margin:20px 0 10px">Conceptos</h3>'+
  '<div class="table-wrapper"><table><thead><tr><th>Tipo</th><th>Descripción</th><th>REF</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody id="'+lid+'_items"></tbody></table></div>'+
  '<button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="addLineItem(\''+lid+'\')"><i class="fas fa-plus"></i> Añadir línea</button>'+
  '<div class="totals-box" id="'+lid+'_totals" style="display:none">'+
    '<div class="row"><span>Subtotal:</span><span id="'+lid+'_subtotal">0,00 ,</span></div>'+
    '<div class="row"><span>IVA (21%):</span><span id="'+lid+'_iva">0,00 ,</span></div>'+
    '<div class="row grand"><span>TOTAL:</span><span id="'+lid+'_total">0,00 ,</span></div>'+
  '</div>'+
  '<p style="margin-top:12px;color:var(--text-muted);font-size:13px"><i class="fas fa-info-circle"></i> Los totales se calcularán al guardar el presupuesto</p>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary btn-save-presupuesto" data-action="save-presupuesto" data-id="'+(id ? escapeHtml(id) : '')+'"><i class="fas fa-save"></i> Guardar</button>';
  openModal(id?'Editar Presupuesto':'Nuevo Presupuesto',form,footer);

  // Al elegir un parte del día, autocompletar el cliente del parte
  document.getElementById('pf_parte').addEventListener('change', async e => {
    const parteId = e.target.value;
    if(!parteId) return;
    try {
      const parte = await dbGet('partesTrabajo', parteId);
      if(parte?.clienteId){
        const selCliente = document.getElementById('pf_cliente');
        selCliente.value = parte.clienteId;
        // Si el cliente no estaba en la lista, añadirlo
        if(selCliente.value !== parte.clienteId){
          const opt = document.createElement('option');
          opt.value = parte.clienteId;
          opt.dataset.nombre = parte.clienteNombre || '';
          opt.textContent = parte.clienteNombre || parte.clienteId;
          selCliente.appendChild(opt);
          selCliente.value = parte.clienteId;
        }
        showToast('Cliente cargado desde el parte ' + parteId, 'info');
      }
    } catch(err){ console.warn('No se pudo cargar el parte:', err); }
  });

  renderLineItems(lid, items);

  // Al cambiar el tipo de puerta, abrir la hoja de medidas automáticamente
  document.getElementById('pf_tipo_hoja')?.addEventListener('change', e=>{
    if(e.target.value) abrirHojaMedidasPresupuesto(lid);
  });
};

// Abre la hoja de medidas asociada al tipo de puerta elegido en el presupuesto.
window.abrirHojaMedidasPresupuesto = async function(lid){
  const tipo = document.getElementById('pf_tipo_hoja')?.value;
  if(!tipo){ showToast('Elige primero el tipo de puerta','error'); return; }
  const p = window.__pfDatosActuales || {};
  const mismoTipo = window.TiposPuerta.resolver(p.medidasPlanta?.tipoNombre)?.key === window.TiposPuerta.resolver(tipo)?.key;
  const previos = p.medidasPlanta?.sistema==='hoja-v1' && mismoTipo ? p.medidasPlanta.valores : {};
  const clientes = await dbGetAll('clientes');
  window.MEDICIONES.abrir({
    clientes,
    clienteId: document.getElementById('pf_cliente')?.value || '',
    plantillaId: tipo,
    titulo: 'Hoja de medidas — ' + tipo,
    valoresPrevios: previos,
    onGuardar: (datos) => {
      // La hoja ya sale en el formato hoja-v1 que espera el presupuesto (con casillas, repeticiones y marcas)
      window.__presupuestoMedidas = {
        sistema: 'hoja-v1',
        tipoId: datos.plantillaId || tipo,
        tipoNombre: datos.tipoNombre || tipo,
        plantillaNombre: datos.plantillaNombre || tipo,
        imagenUrl: datos.imagenUrl || datos.plantillaImagenUrl || '',
        svg: '',
        campos: datos.campos || [],
        valores: datos.valores || {},
        fecha: datos.fecha || getToday(),
        tecnico: datos.tecnico || window.authState?.employee?.nombre || window.authState?.user?.email || '',
        notas: datos.notas || ''
      };
      const info=document.getElementById(lid+'_medidas_info');
      if(info) info.innerHTML='<i class="fas fa-check-circle" style="color:#16a34a"></i> Hoja de medidas adjunta ('+escapeHtml(tipo)+')';
      showToast('Hoja de medidas lista: se adjuntará al guardar el presupuesto');
    }
  });
};

// ═══ Importar presupuesto desde una foto (OCR) ═══
window.importarPresupuestoFoto = async function(){
  if(!window.REPOSTAJES){ showToast('Módulo OCR no disponible','error'); return; }
  // Reutiliza el lector OCR de tickets exponiendo un helper específico
  const input=document.createElement('input');
  input.type='file'; input.accept='image/*'; input.capture='environment';
  input.onchange=async ()=>{
    const f=input.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=async ()=>{
      showToast('Leyendo presupuesto…','info');
      try{
        const {datos,texto}=await window.REPOSTAJES.ocrDocumento(r.result);
        abrirFormPresupuestoDesdeOCR(datos,texto);
      }catch(e){
        console.error(e);
        showToast('No se pudo leer la imagen: '+(e.message||e),'error');
      }
    };
    r.readAsDataURL(f);
  };
  input.click();
};

function abrirFormPresupuestoDesdeOCR(datos,texto){
  // Líneas: cada línea del texto con importe se convierte en concepto
  const lineas=[];
  (texto||'').split(/\n+/).forEach(linea=>{
    const m=linea.replace(/,/g,'.').match(/^(.{3,60}?)[\s.:\-]+(\d+(?:\.\d{1,2})?)\s*(?:€|EUR|EUROS)?\s*$/i);
    if(m && m[1] && !/^(TOTAL|SUBTOTAL|IVA|BASE)/i.test(m[1].trim())){
      const precio=parseFloat(m[2]);
      if(precio>0) lineas.push({descripcion:m[1].trim().replace(/^[\d.\-\s]+/,''),tipoId:'',cantidad:1,precio});
    }
  });
  const total=lineas.reduce((s,l)=>s+l.precio*l.cantidad,0);
  window.__presupuestoImportado={
    clienteNombre:datos.cliente||'',
    fecha:datos.fecha||getToday(),
    lineItems:lineas.length?lineas:[{descripcion:'(edita la descripción)',tipoId:'',cantidad:1,precio:0}],
    totalDetectado:datos.importe||total||null
  };
  window.showPresupuestoForm(null);
  showToast(lineas.length?('Detectadas '+lineas.length+' líneas — revisa y ajusta'):('No he detectado líneas claras; rellena el formulario a mano'),'info');
}

window.savePresupuesto = async function(id){
  id = id ? String(id) : null;
  try {
    const sel = document.getElementById('pf_cliente');
    const clienteId = sel.value;
    const clienteNombre = sel.options[sel.selectedIndex]?.dataset.nombre||'';
    const lid = id ? 'pf_edit' : 'pf_new';
    const items = [];
    document.querySelectorAll('#'+lid+'_items tr').forEach(r=>{
      items.push({
        descripcion: (r.querySelector('[data-field="descripcion"]')?.value||'').trim(),
        tipoId: r.querySelector('[data-field="tipoId"]')?.value||'',
        ref: (r.querySelector('[data-field="ref"]')?.value||'').trim(),
        cantidad: parseFloat(r.querySelector('[data-field="cantidad"]')?.value)||0,
        precio: parseFloat(r.querySelector('[data-field="precio"]')?.value)||0
      });
    });

    // Validación en línea
    let ok = true;

    // Cliente obligatorio
    if(!clienteId){
      setFieldError('pf_cliente', 'Selecciona un cliente');
      ok = false;
    } else {
      clearFieldError('pf_cliente');
    }

    // Fecha obligatoria
    const fecha = document.getElementById('pf_fecha').value;
    const fechaError = validators.required(fecha, 'La fecha');
    if(fechaError){
      setFieldError('pf_fecha', fechaError);
      ok = false;
    } else {
      clearFieldError('pf_fecha');
    }

    // Válido hasta no anterior a la fecha
    const valido = document.getElementById('pf_valido').value;
    if(valido && fecha && valido < fecha){
      setFieldError('pf_valido', 'La validez no puede ser anterior a la fecha');
      ok = false;
    } else {
      clearFieldError('pf_valido');
    }

    // Ninguna línea puede quedar sin descripción
    const lineTbody = document.getElementById(lid+'_items');
    const descInputs = [...(lineTbody?.querySelectorAll('[data-field="descripcion"]')||[])];
    descInputs.forEach(input => { input.style.outline = ''; });
    lineTbody?.querySelectorAll('[data-field="cantidad"]').forEach(input => { input.style.outline = ''; });
    if(lineTbody) lineTbody.style.outline = '';
    let lineErrorShown = false;
    const emptyLines = items.reduce((list,item,index)=>item.descripcion.trim() ? list : list.concat(index+1), []);
    if(!items.length){
      showToast('Añade al menos un concepto con descripción','error');
      if(lineTbody) lineTbody.style.outline = '2px solid #dc2626';
      lineErrorShown = true;
      ok = false;
    } else if(emptyLines.length){
      emptyLines.forEach(n => { if(descInputs[n-1]) descInputs[n-1].style.outline = '2px solid #dc2626'; });
      descInputs[emptyLines[0]-1]?.focus();
      showToast(emptyLines.length===1
        ? 'La línea '+emptyLines[0]+' no tiene descripción'
        : 'Hay líneas sin descripción: '+emptyLines.join(', ')+'. Complétalas o elimínalas','error');
      lineErrorShown = true;
      ok = false;
    } else {
      const badQty = items.reduce((list,item,index)=>item.cantidad>0 ? list : list.concat(index+1), []);
      if(badQty.length){
        const qtyInputs = [...lineTbody.querySelectorAll('[data-field="cantidad"]')];
        badQty.forEach(n => { if(qtyInputs[n-1]) qtyInputs[n-1].style.outline = '2px solid #dc2626'; });
        qtyInputs[badQty[0]-1]?.focus();
        showToast('La cantidad debe ser mayor que 0 (línea '+badQty.join(', ')+')','error');
        lineErrorShown = true;
        ok = false;
      }
    }

    if(!ok){ if(!lineErrorShown) showToast('Revisa los campos marcados','error'); return; }

    // Calcular totales al guardar
    const sub = items.reduce((s,i)=>s+i.cantidad*i.precio,0);
    const data = {
      id: document.getElementById('pf_id').value.trim(),
      clienteId, clienteNombre,
      fecha,
      validoHasta: valido || null,
      estado: document.getElementById('pf_estado').value,
      plazoEntrega: (document.getElementById('pf_plazo')?.value||'').trim()||null,
      parteId: document.getElementById('pf_parte')?.value || null,
      notas: document.getElementById('pf_notas').value.trim(),
      lineItems: items,
      subtotal: sub,
      iva: sub*0.21,
      total: sub*1.21
    };
    // Adjuntar plantilla de medidas si el usuario la preparó en esta sesión
    if(window.__presupuestoMedidas){
      data.medidasPlanta = window.__presupuestoMedidas;
    } else if(!(data.id && window.__pfDatosActuales?.medidasPlanta)){
      // Si edita y no ha tocado la hoja, conserva la existente
      delete data.medidasPlanta;
    }
    if(id && window.__pfDatosActuales?.medidasPlanta && !window.__presupuestoMedidas){
      data.medidasPlanta = window.__pfDatosActuales.medidasPlanta;
    }

    await dbPut('presupuestos', data);
    closeModal();
    showToast('Presupuesto guardado');

    // Generar PDF automáticamente
    try {
      await window.generatePDF_presupuesto(data.id);
      showToast('PDF generado automáticamente');
    } catch(pdfError) {
      console.warn('No se pudo generar el PDF:', pdfError);
      showToast('Presupuesto guardado (error al generar PDF)', 'warning');
    }

    navigateTo('presupuestos');
  } catch(err){
    console.error('Error al guardar presupuesto:', err);
    showToast('Error al guardar: '+err.message,'error');
  }
};

window.duplicatePresupuesto = async function(id){
  const orig = await dbGet('presupuestos',id);
  if(!orig) return;
  const dup = {...orig, id:'PRES-'+uid().slice(0,4).toUpperCase(), fecha:getToday(), estado:'borrador'};
  await dbAdd('presupuestos',dup);
  showToast('Presupuesto duplicado');navigateTo('presupuestos');
};

window.deletePresupuesto = async function(id){
  await dbDelete('presupuestos',id);
  showToast('Presupuesto eliminado');navigateTo('presupuestos');
};

// Plantillas de presupuesto (guardadas en este dispositivo)
const PLANTILLAS_KEY = 'valgom_plantillas_presupuesto';
function getPlantillasPresupuesto(){
  try { return JSON.parse(localStorage.getItem(PLANTILLAS_KEY)) || []; } catch(e){ return []; }
}
function setPlantillasPresupuesto(list){ localStorage.setItem(PLANTILLAS_KEY, JSON.stringify(list)); }

window.savePresupuestoAsTemplate = async function(id){
  const p = await dbGet('presupuestos',id);
  if(!p) return;
  const nombre = (prompt('Nombre de la plantilla:', 'Plantilla de '+(p.clienteNombre||p.id))||'').trim();
  if(!nombre) return;
  const list = getPlantillasPresupuesto();
  list.push({id:uid(), nombre, notas:p.notas||'', lineItems:p.lineItems||[]});
  setPlantillasPresupuesto(list);
  showToast('Plantilla guardada');
};

window.showPlantillasPresupuesto = function(){
  const list = getPlantillasPresupuesto();
  const body = list.length
    ? '<div style="display:flex;flex-direction:column;gap:8px">'+list.map(t=>
        '<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:10px;border:1px solid var(--border,#e5e7eb);border-radius:8px">'+
        '<div><strong>'+escapeHtml(t.nombre)+'</strong><div style="font-size:12px;color:var(--text-muted)">'+(t.lineItems||[]).length+' conceptos</div></div>'+
        '<div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" onclick="usarPlantillaPresupuesto(\''+escapeHtml(t.id)+'\')">Usar</button>'+
        '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="borrarPlantillaPresupuesto(\''+escapeHtml(t.id)+'\')"><i class="fas fa-trash"></i></button></div></div>'
      ).join('')+'</div>'
    : '<p style="color:var(--text-muted)">Aún no hay plantillas. Usa el icono de marcador en un presupuesto para guardarlo como plantilla.</p>';
  openModal('Plantillas de presupuesto', body, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

window.usarPlantillaPresupuesto = function(tid){
  const t = getPlantillasPresupuesto().find(x=>x.id===tid);
  if(!t) return;
  closeModal();
  showPresupuestoForm(null, t);
};

window.borrarPlantillaPresupuesto = function(tid){
  setPlantillasPresupuesto(getPlantillasPresupuesto().filter(x=>x.id!==tid));
  showPlantillasPresupuesto();
};
// Acceso desde Configuración → Plantillas
window.getPlantillasPresupuestoPublic = getPlantillasPresupuesto;
window.setPlantillasPresupuestoPublic = setPlantillasPresupuesto;

// Enviar presupuesto por email / compartir
window.sendPresupuesto = async function(id){
  const p = await dbGet('presupuestos',id);
  if(!p){ showToast('Presupuesto no encontrado','error'); return; }
  const cliente = p.clienteId ? await dbGet('clientes',p.clienteId) : null;
  const email = (cliente && cliente.email) || '';
  const asunto = 'Presupuesto '+p.id+' — Valgom';
  const texto = 'Hola'+(p.clienteNombre? ' '+p.clienteNombre:'')+',\n\nTe adjuntamos el presupuesto '+p.id+' por un total de '+formatCurrency(p.total)+' (IVA incluido).\n\nQuedamos a tu disposición para cualquier duda.\n\nUn saludo,\nValgom';
  let enviado = false;
  try {
    const file = await window.generatePDF_presupuesto(id, {asFile:true});
    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:asunto, text:texto});
      enviado = true;
    } else if(file){
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 5000);
      window.location.href = 'mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(asunto)+'&body='+encodeURIComponent(texto+'\n\n(Adjunta el PDF descargado: '+file.name+')');
      showToast('PDF descargado: adjúntalo al correo que se ha abierto');
      enviado = true;
    }
  } catch(err){
    if(err && err.name === 'AbortError') return;
    console.error(err);
    showToast('No se pudo enviar: '+err.message,'error');
    return;
  }
  if(enviado && p.estado === 'borrador'){
    await dbPut('presupuestos', {...p, estado:'enviado'});
    renderPresupuestos();
  }
};

