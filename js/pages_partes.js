//  PARTES DE TRABAJO (CON CAMPO HORAS)
window.render_partesTrabajo = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Partes de Trabajo</h2><p>Seguimiento de instalaciones y reparaciones</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showParteForm()"><i class="fas fa-plus"></i> Nuevo Parte</button>'+
      '<button class="btn btn-secondary" onclick="mostrarBuscadorPuertas()" title="Buscar puertas y ver su histórico de intervenciones"><i class="fas fa-magnifying-glass"></i> Buscar puertas</button>'+
      (window.isAdmin&&window.isAdmin()?'<button class="btn btn-secondary" onclick="exportarPartesSage()" title="CSV de los partes de clientes para Sage 50 (respeta cliente, técnico y fechas)">      <i class="fas fa-file-csv"></i> Exportar a Sage</button>':'')+'</div></div>'+
          '<div class="search-bar">'+
            '<input type="text" placeholder="Buscar..." id="searchParte" oninput="window.__partesPagina=0;renderPartes()">'+
            '<select id="filterClienteParte" onchange="window.__partesPagina=0;renderPartes()"><option value="">Todos los clientes</option></select>'+
      '<select id="filterTecnicoParte" onchange="window.__partesPagina=0;renderPartes()"><option value="">Todos los técnicos</option></select>'+
      '<input type="date" id="filterFechaDesde" onchange="window.__partesPagina=0;renderPartes()" title="Desde">'+
      '<input type="date" id="filterFechaHasta" onchange="window.__partesPagina=0;renderPartes()" title="Hasta">'+
    '</div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
            '<tr><th>ID</th><th data-titulo>Cliente</th><th>Ubicación</th><th>Puertas</th><th>Técnico</th><th>Tipo Puerta</th><th>Kms</th><th>Horas</th><th>Fotos</th><th>Fecha</th></tr>'+
    '</thead><tbody id="parteBody"></tbody></table></div></div>'+
    '<div id="navPartes" style="display:none;text-align:center;margin-top:12px">'+
      '<button class="btn btn-outline btn-sm" id="btnParPrev" style="display:none"><i class="fas fa-chevron-up"></i> Mostrar menos</button> '+
      '<button class="btn btn-outline btn-sm" id="btnParMore">Mostrar más</button>'+
    '</div>'+
    '<div style="margin-top:10px"><small id="partesContador" style="color:var(--text-muted)"></small></div>';

  // La tabla se pinta ya; el desplegable de clientes se rellena en paralelo
  renderPartes();
  const moreP = document.getElementById('btnParMore');
  const prevP = document.getElementById('btnParPrev');
  if(moreP && !moreP.__bound){ moreP.__bound = true; moreP.addEventListener('click', window.partesMostrarMas); }
  if(prevP && !prevP.__bound){ prevP.__bound = true; prevP.addEventListener('click', window.partesMostrarMenos); }
  const clientes = await dbGetAll('clientes');
  const empleados = await dbGetAll('empleados').catch(()=>[]);
  const selCli = document.getElementById('filterClienteParte');
  if(!selCli) return;
  selCli.innerHTML = '<option value="">Todos los clientes</option>' +
    clientes.slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))
      .map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.nombre)+'</option>').join('');
  const selTec = document.getElementById('filterTecnicoParte');
  if(selTec){
    selTec.innerHTML = '<option value="">Todos los técnicos</option>' +
      empleados.slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))
        .map(e=>'<option value="'+escapeHtml(e.id)+'">'+escapeHtml(e.nombre)+'</option>').join('');
  }
};

window.renderPartes = async function(){
  const [partes, puertas] = await Promise.all([dbGetAll('partesTrabajo'), dbGetAll('puertas')]);
  const mapPuertas = Object.fromEntries(puertas.map(p => [p.id, p.nombre]));
  mapPuertasCache = mapPuertas;

  const q = (document.getElementById('searchParte')?.value||'').toLowerCase();
  const clienteId = document.getElementById('filterClienteParte')?.value||'';
  const tecnicoId = document.getElementById('filterTecnicoParte')?.value||'';
  const desde = document.getElementById('filterFechaDesde')?.value||'';
  const hasta = document.getElementById('filterFechaHasta')?.value||'';

  const filtered = partes.filter(p=>{
    if(q && !JSON.stringify(p,(key,value)=>(key==='fotos'||key.startsWith('firma'))?undefined:value).toLowerCase().includes(q)) return false;
    if(clienteId && p.clienteId!==clienteId) return false;
    if(tecnicoId && String(p.empleadoId||'')!==String(tecnicoId)) return false;
    if(desde && p.fecha < desde) return false;
    if(hasta && p.fecha > hasta) return false;
    return true;
  });

  const POR_PAG_PAR = 20;
  window.__partesPagina = Math.max(0, Math.min(window.__partesPagina||0, Math.floor(Math.max(filtered.length-1,0)/POR_PAG_PAR)));
  const inicioPar = window.__partesPagina * POR_PAG_PAR;
  const visiblesPar = filtered.slice(inicioPar, inicioPar + POR_PAG_PAR);
  const tbodyPar = document.getElementById('parteBody');
  tbodyPar.innerHTML = visiblesPar.map(p=>
    '<tr data-parte-row="'+escapeHtml(String(p.id))+'" style="cursor:pointer"><td><strong>'+escapeHtml(p.id)+'</strong></td><td>'+(p.interno ? '<span class="badge badge-orange" title="Desplazamiento interno: '+escapeHtml(p.motivoInterno||'')+'">🔧 Interno</span>' : escapeHtml(p.clienteNombre))+'</td>'+
    '<td>'+(p.ubicacionNombre ? escapeHtml(p.ubicacionNombre)+'<br><small style="color:#666">'+escapeHtml(p.ubicacionDireccion||'')+'</small>' : '—')+'</td>'+
    '<td>' + ((p.puertaIds && p.puertaIds.length)
      ? p.puertaIds.map(id => '<span class="badge badge-blue" style="margin:1px">' + escapeHtml(mapPuertas[id] || id) + '</span>').join('')
      : '—') + '</td>' +
    '<td>'+(p.empleadoNombre ? escapeHtml(p.empleadoNombre) : '—')+'</td>'+
    '<td>'+(p.interno ? '<span class="badge badge-gray">Interno</span>' : '<span class="badge badge-blue">'+escapeHtml(p.tipoPuerta)+'</span>')+'</td>'+
    '<td>'+(p.kms||0)+' km</td>'+
    '<td>'+(p.horas ? p.horas+' h' : '—')+'</td>'+
    '<td>' + (p.fotosurls?.length || p.fotos?.length
  ? (p.fotosurls || p.fotos).map(f =>
      '<img class="inc-foto" loading="lazy" decoding="async" src="'+escapeHtml(f)+'" title="Ver foto" style="width:42px;height:42px;object-fit:cover;' +
        'border-radius:6px;margin-right:4px;border:1px solid var(--border);vertical-align:middle;cursor:zoom-in">').join('') +
    (p.fotoscount > (p.fotosurls?.length || 0) ? '<span class="badge badge-blue" title="Fotos antiguas: ábrelas al editar o en el PDF">+'+(p.fotoscount-(p.fotosurls?.length||0))+'</span>' : '')
  : (p.fotoscount ? '<span class="badge badge-blue" title="🔍 Ábrelas al editar o en el PDF">📸 '+p.fotoscount+'</span>' : '—')) + '</td>' +
    '<td>'+formatDate(p.fecha)+'</td>'+
    '</tr>'
  ).join('') || '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text-muted)">Sin partes de trabajo</td></tr>';

  // Botones mostrar más / menos
  const navPar = document.getElementById('navPartes');
  if(navPar){
    navPar.style.display = filtered.length > POR_PAG_PAR ? 'block' : 'none';
    document.getElementById('btnParMore').style.display = (inicioPar+POR_PAG_PAR < filtered.length) ? '' : 'none';
    document.getElementById('btnParPrev').style.display = (inicioPar > 0) ? '' : 'none';
  }
  const contPar = document.getElementById('partesContador');
  if(contPar) contPar.textContent = filtered.length ? ('Mostrando '+(inicioPar+1)+'–'+Math.min(inicioPar+POR_PAG_PAR, filtered.length)+' de '+filtered.length+' partes') : '';

  if(!tbodyPar.__fichaBound){
    tbodyPar.__fichaBound = true;
    tbodyPar.addEventListener('click', e => {
      if(e.target.closest('button') || e.target.closest('a')) return;
      const row = e.target.closest('tr[data-parte-row]');
      if(row) window.verFichaParte(row.dataset.parteRow);
    });
  }
};

window.partesMostrarMas = function(){ window.__partesPagina++; renderPartes(); };
window.partesMostrarMenos = function(){ window.__partesPagina = Math.max(0,(window.__partesPagina||0)-1); renderPartes(); };

// Ficha del parte de trabajo en modal (TODOS los campos, organizados por secciones; los vacíos no se muestran)
window.verFichaParte = async function(id){
  // Cargar SIEMPRE el parte completo (con firmas y DNIs): el listado ligero los excluye
  let p = null;
  try{ p = await dbGet('partesTrabajo', isNaN(Number(id)) ? id : Number(id)); }catch(e){ console.warn('[ficha parte] dbGet:', e); }
  if(!p){
    try{ p = (await dbGetAll('partesTrabajo')).find(x=>String(x.id)===String(id)) || null; }catch(_){ }
  }
  if(!p) return;
  // Completar DNI del técnico desde la ficha del empleado si no vino en el registro
  if(!p.empleadoDni && p.empleadoId){
    try{
      const emp = await dbGet('empleados', p.empleadoId);
      if(emp?.dni) p.empleadoDni = emp.dni;
    }catch(_){ }
  }
  const puertaNombres = (p.puertaIds||[]).map(pid => mapPuertasCache[pid] || pid);
  const fotos = (p.fotosurls?.length ? p.fotosurls : (p.fotos||[]));
  const materiales = (p.materiales||[]).filter(m=>(m.descripcion||'').trim());
  const firmaTec = p.firmaTecnico || p.firma_tecnico || p.firmatecnico || null;
  const firmaCli = p.firmaCliente || p.firma_cliente || p.firmacliente || null;
  const selloCli = p.selloCliente || p.sellocliente || null;
  const dniCli = p.clienteDni || p.clientedni || p.cliente_dni || '';
  const fotosAlb = Array.isArray(p.fotosAlbaran) ? p.fotosAlbaran : [];
  const horaEntrada = (p.horaEntrada ?? p.hora_entrada ?? '').toString().slice(0,5);
  const horaSalida = (p.horaSalida ?? p.hora_salida ?? '').toString().slice(0,5);
  const origen = p.origenNombre || (typeof p.origen === 'object' ? p.origen?.nombre : p.origen) || '';
  const destino = p.destinoNombre || (typeof p.destino === 'object' ? p.destino?.nombre : p.destino) || '';

  const campo = (etiqueta, valor) => (valor===undefined||valor===null||String(valor).trim()===''||valor==='—') ? '' :
    '<div><small style="color:var(--text-muted);display:block">'+etiqueta+'</small><div style="font-weight:600">'+valor+'</div></div>';
  const firmaImg = (data,titulo)=> data
    ? '<div><small style="color:var(--text-muted);display:block">'+titulo+'</small><div><img src="'+escapeHtml(data)+'" style="max-width:220px;width:100%;background:#fff;border:1px solid var(--border);border-radius:8px"></div></div>' : '';
  const fotosRow = (lista) => lista.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">'+lista.map(f=>'<img src="'+escapeHtml(f)+'" loading="lazy" style="width:86px;height:86px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" onclick="window.open(this.src,\'_blank\')">').join('')+'</div>' : '';
  const seccion = (icono, titulo, contenido) => contenido
    ? '<div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;margin-top:4px">'+
        '<div style="font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--primary,#16a34a);margin-bottom:10px"><i class="fas '+icono+'" style="margin-right:6px"></i>'+titulo+'</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'+contenido+'</div></div>' : '';

  // ── Identificación ──
  const cabecera =
      campo('Cliente', p.interno?'🔧 Desplazamiento interno':escapeHtml(p.clienteNombre||''))+
      campo('Tipo de puerta', p.interno?'':escapeHtml(p.tipoPuerta||''))+
      campo('Técnico', escapeHtml(p.empleadoNombre||''))+
      campo('Fecha', formatDate(p.fecha))+
      campo('Horario', horaEntrada? horaEntrada+(horaSalida?' – '+horaSalida:''):'')+
      campo('Vehículo', p.matricula?'🚐 '+escapeHtml(p.matricula):'');

  // ── Lugar / desplazamiento ──
  const lugar =
      campo('Ubicación', p.ubicacionNombre?escapeHtml(p.ubicacionNombre)+(p.ubicacionDireccion?'<br><small style="font-weight:400;color:var(--text-muted)">'+escapeHtml(p.ubicacionDireccion)+'</small>':''):'')+
      campo('Kms', p.kms?p.kms+' km':'')+
      campo('Horas', p.horas?p.horas+' h':'')+
      campo('Salida (origen)', escapeHtml(origen))+
      campo('Llegada (destino)', escapeHtml(destino));

  // ── Trabajo realizado ──
  const detalleMap = p.puertasDetalle || p.puertasdetalle || {};
  const puertasHtml = puertaNombres.length
    ? campo('Puertas intervenidas', (p.puertaIds||[]).map(pid => {
        const obs = detalleMap[pid] || '';
        return '<span class="badge badge-blue" style="margin:2px;cursor:pointer" title="Ver historial de la puerta" ' +
          'onclick="verHistoricoPuerta(\'' + escapeHtml(String(pid)) + '\')">' + escapeHtml(mapPuertasCache[pid] || pid) +
          (obs ? '<br><small style="font-weight:400">' + escapeHtml(obs) + '</small>' : '') + '</span>';
      }).join('')) : '';
  const trabajo =
      campo('Descripción', escapeHtml(p.descripcion||''))+
      campo('Motivo interno', p.interno?escapeHtml(p.motivoInterno||''):'')+
      (p.incidenciaId ? campo('Origen','<span class="badge badge-blue" style="cursor:pointer" onclick="closeModal();verFichaIncidencia(\''+escapeHtml(String(p.incidenciaId))+'\')"><i class="fas fa-bullhorn"></i> Incidencia '+escapeHtml(String(p.incidenciaId))+'</span>') : '')+
      puertasHtml;

  const materialHtml = materiales.length
    ? '<div style="grid-column:1/-1"><small style="color:var(--text-muted);display:block;margin-bottom:4px">Material utilizado</small><ul style="margin:0;padding-left:18px">'+materiales.map(m=>'<li>'+escapeHtml(m.descripcion||'')+(m.cantidad?' — <strong>'+m.cantidad+'</strong> '+(m.unidad||'ud'):'')+'</li>').join('')+'</ul></div>' : '';

  // ── Identificación / validación ──
  // DNI del técnico: obligatorio al guardar; si no vino en el registro, se rescató de la ficha del empleado
  const dniTecFinal = p.empleadoDni || p.empleadodni || '';
  // Sello superpuesto sobre la firma del cliente (como en el PDF del presupuesto)
  const firmaCliHtml = (firmaCli || selloCli)
    ? '<div style="position:relative;display:inline-block">'+
        (firmaCli?'<img src="'+escapeHtml(firmaCli)+'" style="width:220px;max-width:100%;background:#fff;border:1px solid var(--border);border-radius:8px;display:block">':'')+
        (selloCli?'<img src="'+escapeHtml(selloCli)+'" style="position:absolute;right:2px;bottom:2px;width:82px;height:82px;object-fit:contain;opacity:.92;mix-blend-mode:multiply;border-radius:6px">':'')+
      '</div>' : '';
  const validacion =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;grid-column:1/-1">'+
      // Columna cliente: DNI justo encima de su firma
      '<div style="display:flex;flex-direction:column;gap:8px">'+
        (p.interno?'':campo('DNI / CIF cliente', escapeHtml(dniCli)))+
        '<div><small style="color:var(--text-muted);display:block;margin-bottom:4px">Firma del cliente'+(selloCli?' (con sello)':'')+'</small>'+
        (firmaCli||selloCli ? firmaCliHtml : '<div style="width:220px;max-width:100%;height:70px;background:#fff;border:1px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px">Sin firma</div>')+'</div>'+
      '</div>'+
      // Columna técnico: DNI justo encima de su firma
      '<div style="display:flex;flex-direction:column;gap:8px">'+
        campo('DNI del técnico', escapeHtml(dniTecFinal))+
        '<div><small style="color:var(--text-muted);display:block;margin-bottom:4px">Firma del técnico</small>'+
        (firmaTec?'<img src="'+escapeHtml(firmaTec)+'" style="width:220px;max-width:100%;background:#fff;border:1px solid var(--border);border-radius:8px;display:block">':'<div style="width:220px;max-width:100%;height:70px;background:#fff;border:1px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px">Sin firma</div>')+'</div>'+
      '</div>'+
      campo('Email secundario', escapeHtml(p.emailSecundario||''))+
    '</div>';

  openModal('🔧 '+(p.id||'Parte'),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'+cabecera+'</div>'+
    seccion('fa-location-dot','Lugar y desplazamiento',lugar)+
    seccion('fa-screwdriver-wrench','Trabajo realizado',trabajo)+
    (materialHtml?'<div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;margin-top:4px">'+materialHtml+'</div>':'')+
    ((fotos.length||fotosAlb.length)?'<div style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;margin-top:4px">'+(fotos.length?'<small style="color:var(--text-muted)">Fotos del trabajo ('+fotos.length+')</small>'+fotosRow(fotos):'')+(fotosAlb.length?'<div style="margin-top:10px"><small style="color:var(--text-muted)">Albarán (desplazamiento interno)</small>'+fotosRow(fotosAlb)+'</div>':'')+'</div>':'')+
    seccion('fa-id-card','Identificación y validación',validacion),
    '<button class="btn btn-outline btn-sm" onclick="closeModal()">Cerrar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="closeModal();showParteForm(\''+escapeHtml(String(p.id))+'\')"><i class="fas fa-pen"></i> Editar</button>'+
    '<button class="btn btn-primary btn-sm" onclick="generatePDF_partes(\''+escapeHtml(String(p.id))+'\')"><i class="fas fa-file-pdf"></i> PDF</button>'+
    '<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'Parte '+escapeHtml(String(p.id))+'\', ()=>deleteParte(\''+escapeHtml(String(p.id))+'\'))"><i class="fas fa-trash"></i> Eliminar</button>');
};
// Caché de nombres de puertas para la ficha
let mapPuertasCache = {};
window.tiposMapCache = window.tiposMapCache || new Map();   // (compartida con almacén)
const MATERIAL_UNIDADES = ['ud', 'l', 'kg', 'm', 'caja'];

// Búsqueda de artículos para el material del parte: todas las palabras deben aparecer (código, nombre,
// descripción o familia, sin distinguir mayúsculas ni acentos); primero los códigos y nombres que empiezan igual.
const matNorm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
window.buscarArticulosMaterial = function(articulos, texto, max){
  const palabras = matNorm(texto).split(/\s+/).filter(Boolean);
  if(!palabras.length) return { items: [], total: 0 };
  const puntuados = [];
  for(const a of articulos || []){
    if(a.baja) continue;
    const codigo = matNorm(a.sageCodigo || a.referencia);
    const nombre = matNorm(a.nombre);
    const resto = matNorm([a.codigoAlt, a.descripcion, a.familia].join(' '));
    const todo = codigo + ' ' + nombre + ' ' + resto;
    if(!palabras.every(p => todo.includes(p))) continue;
    const q = palabras.join(' ');
    puntuados.push({ a, puntos: (codigo === q ? 0 : codigo.startsWith(q) ? 1 : nombre.startsWith(q) ? 2 : palabras.every(p => codigo.includes(p) || nombre.includes(p)) ? 3 : 4) });
  }
  puntuados.sort((x, y) => x.puntos - y.puntos || String(x.a.nombre || '').localeCompare(String(y.a.nombre || ''), 'es', { sensitivity: 'base' }));
  return { items: puntuados.slice(0, max || 8).map(p => p.a), total: puntuados.length };
};

function materialesParteHtml() {
  const st = window.__materialesParte || { lines: [], almacen: [] };
  const optU = sel => MATERIAL_UNIDADES.map(u => '<option value="' + u + '"' + (u === sel ? ' selected' : '') + '>' + u + '</option>').join('');
  const rows = st.lines.map((l, i) => {
    const art = l.articuloId ? st.almacen.find(a => String(a.id) === String(l.articuloId)) : null;
    const hint = art ? 'Stock en almacén: ' + (Number(art.stock) || 0) : '';
    const campo = art
      ? '<div class="mat-chip"><span class="mat-chip-txt"><b>' + escapeHtml(art.nombre) + '</b><small>' + escapeHtml(art.sageCodigo || art.referencia || '') + (art.baja ? ' · de baja' : '') + '</small></span>' +
        '<button type="button" class="mat-chip-x" aria-label="Cambiar artículo" onclick="matCambiar(' + i + ')"><i class="fas fa-xmark"></i></button></div>'
      : '<input type="search" class="mat-search" id="pt_mat_q_' + i + '" autocomplete="off" enterkeyhint="search" placeholder="Buscar por código o nombre…" value="' + escapeHtml(l.descripcion || '') + '" ' +
        'oninput="matBuscar(' + i + ',this)" onfocus="matBuscar(' + i + ',this)" onkeydown="matTecla(event,' + i + ')">' +
        '<div class="mat-results" id="pt_mat_res_' + i + '" hidden></div>';
    return '<div class="mat-row">' +
      '<div class="mat-name">' + campo + '<small id="pt_mat_hint_' + i + '" class="mat-hint">' + escapeHtml(hint) + '</small></div>' +
      '<input type="number" min="0" step="0.01" inputmode="decimal" value="' + (l.cantidad || '') + '" placeholder="Cant." oninput="updateMaterialParte(' + i + ',\'cantidad\',this.value)">' +
      '<select onchange="updateMaterialParte(' + i + ',\'unidad\',this.value)">' + optU(l.unidad || 'ud') + '</select>' +
      '<button type="button" class="btn btn-danger btn-sm btn-icon" title="Quitar" onclick="removeMaterialParte(' + i + ')"><i class="fas fa-trash"></i></button>' +
    '</div>';
  }).join('');
  return rows || '<small style="color:var(--text-muted)">Sin material. Pulsa «Añadir material» si has usado alguno.</small>';
}

function matRepintar(enfocar){
  const box = document.getElementById('pt_materiales');
  if(box) box.innerHTML = materialesParteHtml();
  if(enfocar) box?.querySelectorAll('.mat-row')[enfocar.fila]?.querySelector(enfocar.selector)?.focus();
}

// Escribir en el buscador: guarda el texto como material libre y lista las coincidencias del almacén
window.matBuscar = function(i, input){
  const st = window.__materialesParte, line = st?.lines[i];
  if(!line) return;
  line.descripcion = input.value;
  line.articuloId = '';
  const res = document.getElementById('pt_mat_res_' + i);
  if(!res) return;
  const texto = input.value.trim();
  const { items, total } = window.buscarArticulosMaterial(st.almacen, texto, 8);
  let html = '';
  if(!texto) html = '<div class="mat-vacio">Escribe el código o parte del nombre.</div>';
  else {
    html = items.map(a => '<button type="button" class="mat-opt" data-id="' + escapeHtml(a.id) + '" onclick="matElegir(' + i + ',this.dataset.id)">' +
      '<b>' + escapeHtml(a.nombre) + '</b><small>' + escapeHtml(a.sageCodigo || a.referencia || '') + (a.familia ? ' · ' + escapeHtml(a.familia) : '') + ' · Stock ' + (a.controlStock === false ? '—' : (Number(a.stock) || 0)) + '</small></button>').join('');
    if(!items.length) html = '<div class="mat-vacio">Sin coincidencias en el almacén.</div>';
    else if(total > items.length) html += '<div class="mat-vacio">' + (total - items.length) + ' coincidencias más: sigue escribiendo para afinar.</div>';
    html += '<button type="button" class="mat-opt mat-opt-manual" onclick="matCerrar()"><i class="fas fa-pen"></i> Usar «' + escapeHtml(texto) + '» como material sin artículo (no descuenta stock)</button>';
  }
  res.innerHTML = html;
  res.hidden = false;
  const hint = document.getElementById('pt_mat_hint_' + i);
  if(hint) hint.textContent = '';
};

window.matTecla = function(ev, i){
  if(ev.key === 'Enter'){
    ev.preventDefault();
    const primero = document.querySelector('#pt_mat_res_' + i + ' .mat-opt[data-id]');
    if(primero) window.matElegir(i, primero.dataset.id);
  } else if(ev.key === 'Escape') window.matCerrar();
};

window.matElegir = function(i, id){
  const st = window.__materialesParte, line = st?.lines[i];
  const art = st && (st.almacen || []).find(a => String(a.id) === String(id));
  if(!line || !art) return;
  line.articuloId = art.id;
  line.descripcion = art.nombre;
  matRepintar({ fila: i, selector: 'input[type="number"]' });      // el siguiente paso es la cantidad
  const hint = document.getElementById('pt_mat_hint_' + i);
  if(hint) hint.textContent = 'Stock en almacén: ' + (art.controlStock === false ? 'sin control (servicio)' : (Number(art.stock) || 0));
};

window.matCambiar = function(i){
  const line = window.__materialesParte?.lines[i];
  if(!line) return;
  line.articuloId = ''; line.descripcion = '';
  matRepintar({ fila: i, selector: '.mat-search' });
};

window.matCerrar = function(){ document.querySelectorAll('.mat-results').forEach(r => { r.hidden = true; }); };
if(!window.__matCierreBound){
  window.__matCierreBound = true;
  document.addEventListener('click', e => { if(!e.target.closest('.mat-name')) window.matCerrar(); });
}

// Muestra/oculta un grupo del formulario (clase aparte para que aplicarModo no lo vuelva a mostrar)
function ptOcultar(id, oculto){ document.getElementById(id)?.classList.toggle('pt-oculto', !!oculto); }

// Buscador de clientes del parte: todas las palabras deben aparecer (sin distinguir mayúsculas ni tildes).
// opciones: [{value, label}]. El <select id="pt_cliente"> (oculto) sigue guardando el valor y lanzando «change».
window.ptBuscarOpciones = function(opciones, texto, max){
  const palabras = matNorm(texto).split(/\s+/).filter(Boolean);
  if(!palabras.length) return { items: [], total: 0 };
  const q = palabras.join(' ');
  const hits = (opciones || []).filter(o => { const n = matNorm(o.label); return palabras.every(p => n.includes(p)); });
  hits.sort((a, b) => (matNorm(a.label).startsWith(q) ? 0 : 1) - (matNorm(b.label).startsWith(q) ? 0 : 1) || String(a.label).localeCompare(String(b.label), 'es', { sensitivity: 'base' }));
  return { items: hits.slice(0, max || 8), total: hits.length };
};

function initBuscadorCliente(){
  const sel = document.getElementById('pt_cliente'), q = document.getElementById('pt_cliente_q'), res = document.getElementById('pt_cliente_res');
  if(!sel || !q || !res) return;
  const opciones = () => [...sel.options].filter(o => o.value).map(o => ({ value: o.value, label: o.textContent }));
  const textoActual = () => { const o = sel.options[sel.selectedIndex]; return sel.value && o ? o.textContent : ''; };
  const pintar = () => {
    const texto = q.value.trim();
    if(!texto){ res.hidden = true; return; }
    const { items, total } = window.ptBuscarOpciones(opciones(), texto, 8);
    res.innerHTML = items.map(o => '<button type="button" class="mat-opt" data-v="' + escapeHtml(o.value) + '"><b>' + escapeHtml(o.label) + '</b></button>').join('') +
      (!items.length ? '<div class="mat-vacio">Sin coincidencias. Puedes crear el cliente con el botón +.</div>' : '') +
      (total > items.length ? '<div class="mat-vacio">' + (total - items.length) + ' coincidencias más: sigue escribiendo para afinar.</div>' : '');
    res.hidden = false;
  };
  const elegir = v => { sel.value = v; sel.dispatchEvent(new Event('change')); q.value = textoActual(); res.hidden = true; };
  q.addEventListener('input', () => {
    if(!q.value.trim() && sel.value){ sel.value = ''; sel.dispatchEvent(new Event('change')); }
    pintar();
  });
  q.addEventListener('focus', () => { q.select(); });
  q.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); const primero = res.querySelector('.mat-opt'); if(primero) elegir(primero.dataset.v); }
    else if(e.key === 'Escape'){ res.hidden = true; }
  });
  res.addEventListener('click', e => { const b = e.target.closest('.mat-opt'); if(b) elegir(b.dataset.v); });
  sel.addEventListener('change', () => { q.value = textoActual(); });     // también si se cambia por código (cliente recién creado)
  q.value = textoActual();
  if(!window.__ptClienteCierre){
    window.__ptClienteCierre = true;
    document.addEventListener('click', e => {
      const r = document.getElementById('pt_cliente_res'), qq = document.getElementById('pt_cliente_q'), s = document.getElementById('pt_cliente');
      if(!r || !qq || !s || e.target.closest('#pt_cliente_q,#pt_cliente_res')) return;
      r.hidden = true;
      const o = s.options[s.selectedIndex];
      qq.value = s.value && o ? o.textContent : '';                       // lo escrito sin elegir se descarta
    });
  }
}

window.addMaterialParte = function() {
  window.__materialesParte.lines.push({ articuloId: '', descripcion: '', cantidad: '', unidad: 'ud' });
  const box = document.getElementById('pt_materiales');
  if (box) { box.innerHTML = materialesParteHtml(); box.querySelector('.mat-row:last-child input')?.focus(); }
};

window.removeMaterialParte = function(i) {
  window.__materialesParte.lines.splice(i, 1);
  const box = document.getElementById('pt_materiales');
  if (box) box.innerHTML = materialesParteHtml();
};

window.updateMaterialParte = function(i, field, value) {
  const st = window.__materialesParte;
  const line = st?.lines[i];
  if (!line) return;
  line[field] = value;
  if (field === 'descripcion') {
    // Si coincide con un artículo del almacén (nombre o referencia) se vincula y descontará stock
    const v = String(value).trim().toLowerCase();
    const art = v ? st.almacen.find(a => String(a.nombre || '').trim().toLowerCase() === v || String(a.referencia || '').trim().toLowerCase() === v) : null;
    line.articuloId = art ? art.id : '';
    if (art) line.descripcion = art.nombre;
  }
  const art = line.articuloId ? st.almacen.find(a => String(a.id) === String(line.articuloId)) : null;
  const hint = document.getElementById('pt_mat_hint_' + i);
  if (hint) {
    const stock = art ? Number(art.stock) || 0 : null;
    hint.textContent = art ? 'Stock en almacén: ' + stock + (parseFloat(line.cantidad) > stock ? ' (cantidad superior al stock)' : '') : '';
    hint.style.color = art && parseFloat(line.cantidad) > stock ? 'var(--danger)' : '';
  }
};

window.showParteForm = async function(id, prefill) {
  id = id ? String(id) : null;
  const p = id ? await dbGet('partesTrabajo', id) : (prefill || {});
  // Vínculo con la incidencia de origen (nuevo parte desde una incidencia resuelta)
  window.__parteIncidenciaOrigen = (prefill && prefill.incidenciaId) || p.incidenciaId || null;
  const clientes = await dbGetAll('clientes');
  const vehiculos = await dbGetAll('vehiculos');
  const almacenArticulos = await dbGetAll('almacen').catch(() => []);
  // Tipos de puerta para el select (mismo catálogo que Almacén/Manuales)
  window.__tiposPuertaCache = await window.TiposPuerta.filasDB();
  window.__materialesParte = {
    almacen: almacenArticulos,
    lines: (Array.isArray(p.materiales) ? p.materiales : []).map(m => ({
      articuloId: m.articuloId || '', descripcion: m.descripcion || '', cantidad: m.cantidad ?? '', unidad: m.unidad || 'ud'
    }))
  };
  const empleados = window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const all = await dbGetAll('partesTrabajo');
  const nextId = p.id || 'PT-' + String(all.length + 1).padStart(3, '0');

  const clienteSeleccionado = clientes.find(c => String(c.id) === String(p.clienteId)) ||
    clientes.find(c => String(c.nombre || '').trim().toLocaleLowerCase() === String(p.clienteNombre || '').trim().toLocaleLowerCase());
  const clienteIdSeleccionado = clienteSeleccionado?.id || '';
  const clienteNombrePrefill = String(p.clienteNombre || clienteSeleccionado?.nombre || '').trim();
  const clienteSinFicha = !clienteSeleccionado && clienteNombrePrefill;
  const clienteDni = p.clienteDni || clienteSeleccionado?.dni || '';

  // Matrícula preseleccionada: directa (p.matricula) o vía vehiculoId
  let matriculaSel = p.matricula || '';
  if (!matriculaSel && p.vehiculoId) {
    matriculaSel = vehiculos.find(v => v.id === p.vehiculoId || normMatricula(v.matricula) === normMatricula(p.vehiculoId))?.matricula || '';
  }

  // Fotos del formulario: las ya guardadas más las nuevas (todas como imagen comprimida)
  window.__fotosParte = { form: Array.isArray(p.fotos) ? p.fotos.filter(f => typeof f === 'string' && /^(data:image\/|https?:)/.test(f)) : [] };
  // Observaciones por puerta intervenida (ediciones): {puertaId: texto}
  window.__puertasDetalle = Object.assign({}, p.puertasDetalle || {});
  // Fotos del albarán (desplazamiento interno): guardadas + nuevas
  window.__fotosAlbaran = Array.isArray(p.fotosAlbaran) ? p.fotosAlbaran.filter(f => typeof f === 'string' && /^(data:image\/|https?:)/.test(f)) : [];

  const form = '<div class="form-grid">' +
    // Tipo de parte: normal (con cliente) o interno (desplazamiento sin cliente)
    '<div class="form-group full"><label>Tipo de parte</label>' +
      '<div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap">' +
        '<label style="flex:1 1 130px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-alt);cursor:pointer"><input type="radio" name="pt_tipo_parte" id="pt_tipo_normal" value="normal" ' + (!p.interno ? 'checked' : '') + '> Trabajo normal</label>' +
        '<label style="flex:1 1 130px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-alt);cursor:pointer"><input type="radio" name="pt_tipo_parte" id="pt_tipo_interno" value="interno" ' + (p.interno ? 'checked' : '') + '> Desplazamiento interno</label>' +
      '</div>' +
      '<small style="color:var(--text-muted);display:block;margin-top:4px">Desplazamiento interno = recogida de material, taller, formación… Sin cliente; sus KMs cuentan para el vehículo.</small>' +
    '</div>' +
    '<div class="form-group full"><label>Técnico asignado</label><select id="pt_empleado">' +
      '<option value="">— Sin asignar</option>' +
      empleados.map(e => '<option value="' + e.id + '" data-nombre="' + escapeHtml(e.nombre) + '" ' + (p.empleadoId === e.id ? 'selected' : '') + '>' + escapeHtml(e.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group full normal-only"><label>Cliente * <span id="pt_cliente_geo_icon"></span></label><div style="display:flex;gap:6px"><div style="flex:1;min-width:0;position:relative">' +
      '<input type="search" id="pt_cliente_q" class="mat-search" data-sin-voz autocomplete="off" enterkeyhint="search" placeholder="Buscar cliente por nombre…">' +
      '<div id="pt_cliente_res" class="mat-results" hidden></div>' +
      '<select id="pt_cliente" style="display:none">' +
      '<option value="">— Seleccionar</option>' +
      (clienteSinFicha ? '<option value="__incidencia__" data-nombre="' + escapeHtml(clienteNombrePrefill) + '" selected>' + escapeHtml(clienteNombrePrefill) + ' (incidencia)</option>' : '') +
      clientes.map(c => '<option value="' + c.id + '" data-nombre="' + escapeHtml(c.nombre) + '" ' + (String(clienteIdSeleccionado) === String(c.id) ? 'selected' : '') + '>' + escapeHtml(c.nombre) + '</option>').join('') +
    '</select></div>' +
    '<button type="button" class="btn btn-outline btn-sm" onclick="abrirFichaClienteDesdeParte()" title="Crear un cliente nuevo y dejarlo seleccionado en este parte" style="flex-shrink:0"><i class="fas fa-user-plus"></i></button></div></div>' +
    '<div class="form-group full normal-only pt-oculto" id="pt_ubic_group"><label>Ubicación del trabajo</label><select id="pt_ubicacion"><option value="">-- Selecciona un cliente primero --</option></select></div>' +
    '<div class="form-group full normal-only"><label>Tipo Puerta *</label><select id="pt_tipo">' +
      '<option value="">— Seleccionar tipo —</option>' +
      (window.__tiposPuertaCache || []).map(t => '<option value="' + escapeHtml(t.nombre) + '" ' + (String(p.tipoPuerta || '') === String(t.nombre) ? 'selected' : '') + '>' + escapeHtml(t.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group full normal-only pt-oculto" id="pt_puertas_group"><label>Puertas a revisar</label>' +
      '<div id="pt_puertas_lista" style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px">' +
        '<small style="color:var(--text-muted)">Selecciona cliente, ubicación y tipo de puerta para ver las puertas</small>' +
      '</div>' +
      '<small style="color:var(--text-muted);display:block;margin-top:4px">Marca con el check ✔ la(s) puerta(s) con intervención: son las que aparecen destacadas en el PDF.</small>' +
    '</div>' +
    '<div class="form-group full normal-only"><label>Descripción del trabajo *</label><textarea id="pt_desc" rows="3">' + escapeHtml(p.descripcion || '') + '</textarea></div>' +
    '<div class="form-group normal-only"><label>Kms (Ceuti — Cliente)</label>' +
      '<input id="pt_kms" class="only-num" value="' + (p.kms || '') + '" placeholder="Se calcula al elegir cliente">' +
    '</div>' +
    // ===== Desplazamiento interno: origen / destino / kms calculados =====
    '<div class="form-group interno-only" style="display:' + (p.interno ? 'block' : 'none') + '"><label>Salida (origen)</label>' +
      '<select id="pt_int_origen"></select>' +
    '</div>' +
    '<div class="form-group interno-only" style="display:' + (p.interno ? 'block' : 'none') + '"><label>Llegada (destino)</label>' +
      '<select id="pt_int_destino"></select>' +
    '</div>' +
    '<div class="form-group interno-only" style="display:' + (p.interno ? 'block' : 'none') + '"><label>Kms del desplazamiento</label>' +
      '<input id="pt_kms_interno" class="only-num" value="' + (p.kms || '') + '" placeholder="Se calculan al elegir salida y llegada">' +
      '<small id="pt_int_kms_hint" style="color:var(--text-muted);display:block;margin-top:4px">Se calculan solos si origen y destino tienen coordenadas. Si no, escríbelos a mano.</small>' +
    '</div>' +
    '<div class="form-group interno-only" style="display:' + (p.interno ? 'block' : 'none') + '"><label>Motivo del desplazamiento</label>' +
      '<input id="pt_motivo_interno" value="' + escapeHtml(p.motivoInterno || '') + '" placeholder="Ej: recogida de material en proveedor, taller...">' +
    '</div>' +
    // ===== Desplazamiento interno: foto del albarán recogido/entregado =====
    '<div class="form-group full interno-only" style="display:' + (p.interno ? 'block' : 'none') + '"><label>Foto del albarán (recogido / entregado)</label>' +
      '<small style="color:var(--text-muted);display:block;margin-top:2px">Constancia visual del albarán para administración. Se adjunta al parte.</small>' +
      '<div id="pt_albaran_thumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">' +
        (p.fotosAlbaran || []).map((f,i) => '<div style="position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)"><img class="inc-foto" src="' + f + '" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in"><button type="button" onclick="eliminarFotoAlbaran(' + i + ')" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:12px;">-</button></div>').join('') +
      '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'pt_albaran_input\').click()"><i class="fas fa-camera"></i> Añadir foto de albarán</button>' +
      '<input type="file" id="pt_albaran_input" accept="image/*" capture="environment" multiple style="display:none" onchange="addFotosAlbaran(this)">' +
    '</div>' +
    '<div class="form-group normal-only"><label>Horas *</label><input id="pt_horas" type="number" step="0.5" class="only-num-dec" value="' + (p.horas ?? '') + '" placeholder="Ej: 1.5" required></div>' +
    '<div class="form-group"><label>Vehículo *</label><select id="pt_vehiculo"><option value="">— Seleccionar vehículo</option>' +
        vehiculos.map(v => '<option value="' + escapeHtml(v.id) + '" data-matricula="' + escapeHtml(v.matricula) + '" ' + (normMatricula(matriculaSel) === normMatricula(v.matricula) ? 'selected' : '') + '>' + escapeHtml(v.matricula) + ' - ' + escapeHtml(v.marca) + ' ' + escapeHtml(v.modelo) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group"><label>ID</label><input id="pt_id" value="' + escapeHtml(nextId) + '"></div>' +
    '<div class="form-group"><label>Fecha</label><input id="pt_fecha" type="date" value="' + (p.fecha || getToday()) + '"></div>' +
    '<div class="form-group full normal-only"><label>Material utilizado</label>' +
      '<div id="pt_materiales">' + materialesParteHtml() + '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="addMaterialParte()"><i class="fas fa-plus"></i> Añadir material</button>' +
    '</div>' +
    '<div class="form-group full normal-only"><label>Fotos (máx. ' + window.MAX_FOTOS_PARTE + ')</label>' +
      '<div id="pt_fotos_thumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        window.__fotosParte.form.map((f,i) => '<div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)"><img class="inc-foto" src="' + f + '" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in"><button type="button" onclick="eliminarFotoParte(' + i + ')" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:12px;">-</button></div>').join('') +
      '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'pt_foto_input\').click()"><i class="fas fa-camera"></i> Añadir fotos</button>' +
      '<input type="file" id="pt_foto_input" accept="image/*" multiple style="display:none" onchange="addFotosParte(this)">' +
    '</div>' +
  '</div>' +
  '<div class="normal-only" style="margin-top:24px;padding-top:20px;border-top:2px solid var(--border)">' +
    '<h3 style="margin-bottom:16px;font-size:16px;color:var(--primary)">Firmas y validación</h3>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">' +
      '<div>' +
        '<label style="display:block;margin-bottom:6px;font-weight:600">Firma del Técnico</label>' +
        '<div style="border:2px dashed var(--border);border-radius:8px;padding:8px">' +
          '<canvas id="pt_firma_tecnico" data-firma-titulo="Firma del técnico" style="display:block;width:100%"></canvas>' +
          '<div style="margin-top:8px"><small class="firma-hint" style="color:var(--text-muted)">Se carga automáticamente desde la ficha del empleado</small></div>' +
        '</div>' +
        '<div style="margin-top:8px"><small style="color:var(--text-muted)">DNI del técnico:</small></div>' +
        '<div class="form-group" style="margin-top:4px"><input id="pt_dni_tecnico" value="' + escapeHtml(p.empleadoDni || '') + '" placeholder="Se rellena con el técnico" readonly></div>' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:6px;font-weight:600">Firma del Cliente</label>' +
        '<div style="border:2px dashed var(--border);border-radius:8px;padding:8px">' +
          '<canvas id="pt_firma_cliente" data-firma-titulo="Firma del cliente" style="display:block;width:100%"></canvas>' +
          '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="clearFirmaCanvas(\'pt_firma_cliente\')"><i class="fas fa-eraser"></i> Limpiar firma</button>' +
            '<small class="firma-hint" style="color:var(--text-muted)">Toca el recuadro para firmar</small>' +
          '</div>' +
        '</div>' +
        '<div style="margin-top:8px"><small style="color:var(--text-muted)">DNI / CIF del cliente:</small></div>' +
        '<div class="form-group" style="margin-top:4px"><input id="pt_dni_cliente" value="' + escapeHtml(clienteDni) + '" placeholder="12345678Z o B12345678"></div>' +
        '<div class="form-group" style="margin-top:10px"><label>Email secundario</label>' +
          '<input id="pt_email_sec" type="email" value="' + escapeHtml(p.emailSecundario || '') + '" placeholder="Vacío = email de la ficha">' +
          '<small style="color:var(--text-muted);display:block;margin-top:2px">Si lo rellenas, se envía también a esta dirección.</small>' +
        '</div>' +
        '<div class="form-group" style="margin-top:10px">' +
          '<label>Sello del cliente (hoy)</label>' +
          '<div style="display:flex;gap:10px;align-items:center">' +
            '<img id="pt_sello_thumb" src="' + (window.__selloClienteParte || '') + '" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:8px;border:1px solid var(--border);' + (window.__selloClienteParte ? '' : 'display:none') + '">' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById(\'pt_sello_input\').click()"><i class="fas fa-camera"></i> ' + (window.__selloClienteParte ? 'Repetir foto' : 'Fotografiar sello') + '</button>' +
              '<input type="file" id="pt_sello_input" accept="image/*" capture="environment" style="display:none">' +
              '<button type="button" class="btn btn-danger btn-sm" id="pt_sello_borrar" style="' + (window.__selloClienteParte ? '' : 'display:none') + '"><i class="fas fa-trash"></i> Quitar</button>' +
            '</div>' +
          '</div>' +
          '<small style="color:var(--text-muted);display:block;margin-top:4px">Pide al cliente que selle un folio en blanco y hazle una foto. Se imprime sobre su firma en el PDF.</small>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary btn-save-parte" data-action="save-parte" data-id="' + (id ? escapeHtml(id) : '') + '"><i class="fas fa-save"></i> Guardar</button>';

  openModal(id ? 'Editar Parte' : 'Nuevo Parte', form, footer);

  // --- Sello del cliente: foto en el momento (va con la fecha del día) ---
  window.__selloClienteParte = p.selloCliente || null;
  document.getElementById('pt_sello_input')?.addEventListener('change', function(){
    const file = this.files?.[0]; this.value='';
    if(!file) return;
    const r = new FileReader();
    r.onload = ev => {
      // Comprimir y recuadrar: el sello debe verse nítido pero no pesar
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const lado = 320;
        const escala = Math.max(lado / img.width, lado / img.height);
        c.width = lado; c.height = lado;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,lado,lado);
        ctx.drawImage(img, (lado-img.width*escala)/2, (lado-img.height*escala)/2, img.width*escala, img.height*escala);
        window.__selloClienteParte = c.toDataURL('image/jpeg', 0.75);
        const th = document.getElementById('pt_sello_thumb');
        th.src = window.__selloClienteParte; th.style.display='';
        document.getElementById('pt_sello_borrar').style.display='';
        showToast('Sello capturado','success');
      };
      img.src = ev.target.result;
    };
    r.readAsDataURL(file);
  });
  document.getElementById('pt_sello_borrar')?.addEventListener('click', function(){
    window.__selloClienteParte = null;
    document.getElementById('pt_sello_thumb').style.display = 'none';
    this.style.display = 'none';
  });

  // --- Toggle interno/normal: muestra u oculta campos según el tipo ---
  const aplicarModo = () => {
    const interno = document.getElementById('pt_tipo_interno')?.checked;
    document.querySelectorAll('.interno-only').forEach(el => el.style.display = interno ? 'block' : 'none');
    document.querySelectorAll('.normal-only').forEach(el => el.style.display = interno ? 'none' : '');
    // Puertas a revisar: oculto en Mantenimiento/Reparación, visible en el resto
    const grupoPuertas = document.getElementById('pt_puertas_group');
    if(grupoPuertas && !interno){
      const tipo = document.getElementById('pt_tipo')?.value || '';
      const ocultarPuertas = /^(mantenimiento|reparaci[oó]n)$/i.test(tipo.trim());
      grupoPuertas.style.display = ocultarPuertas ? 'none' : '';
    }
function confirmDeleteDouble(title, deleteCallback) {
  // First confirmation modal
  const firstTitle = '¿Eliminar esta parte?';
  const firstContent = `
    <p>${title}</p>
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-danger" onclick="showSecondConfirmation()">Eliminar</button>
  `;
  openModal(firstTitle, firstContent);
  
  // Store the delete callback
  window.deleteCallback = deleteCallback;
  
  function showSecondConfirmation() {
    const secondTitle = '¿Estás seguro?';
    const secondContent = `
      <p>¿Estás seguro de que deseas eliminar esta parte?</p>
      <button class="btn btn-secondary" onclick="closeModal()">No</button>
      <button class="btn btn-danger" onclick="finalDelete()">Sí</button>
    `;
    openModal(secondTitle, secondContent);
  }
  
  function finalDelete() {
    deleteCallback();
    closeModal();
  }
}
function filterClienteQuick() {
  const input = document.getElementById('filterClienteParteQuick');
  const select = document.getElementById('filterClienteParte');
  const filter = input ? input.value.toLowerCase() : '';
  const options = select.options;
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (filter && !option.value.toLowerCase().includes(filter)) {
      option.style.display = 'none';
    } else {
      option.style.display = '';
    }
  }
}
  };
  document.querySelectorAll('input[name="pt_tipo_parte"]').forEach(r => r.addEventListener('change', aplicarModo));
  document.getElementById('pt_tipo')?.addEventListener('change', async () => {
    // Conservar marcas antes de repintar
    p_prevPuertas = puertasIntervenidasActuales();
    aplicarModo();
    const selCli = document.getElementById('pt_cliente');
    if(selCli?.value) window.pintarPuertasParte(selCli.value, null, p_prevPuertas);
  });
  document.getElementById('pt_ubicacion')?.addEventListener('change', async () => {
    p_prevPuertas = puertasIntervenidasActuales();
    const selCli = document.getElementById('pt_cliente');
    if(selCli?.value) window.pintarPuertasParte(selCli.value, null, p_prevPuertas);
    // Recalcular KMs desde la ubicación elegida (no desde la ficha del cliente)
    try {
      const ubId = document.getElementById('pt_ubicacion')?.value;
      const kmsInput = document.getElementById('pt_kms');
      if (kmsInput && !document.getElementById('pt_tipo_interno')?.checked) {
        if (ubId) {
          const ub = await dbGet('ubicaciones', ubId);
          if (ub?.lat && ub?.lng) {
            const kms = await kmIdaVuelta({ lat: ub.lat, lng: ub.lng });
            kmsInput.value = kms;
            kmsInput.readOnly = true;
            showToast('Kms recalculados desde "' + ub.denominacion + '": ' + kms);
          } else {
            showToast('📍 Ubicación sin coordenadas: geolocalízala en Clientes → Ubicaciones (📍 Geo)', 'error');
          }
        } else if (selCli?.value) {
          kmsInput.readOnly = false;
        }
      }
    } catch(e) { console.warn('[parte] kms ubicación:', e); }
  });
  aplicarModo();
  initBuscadorCliente();

  // --- Desplazamiento interno: origen/destino (oficina, proveedores y clientes) + kms automáticos ---
  (async () => {
    try {
      const [proveedores, todosClientes] = await Promise.all([dbGetAll('proveedores').catch(() => []), dbGetAll('clientes')]);
      const selOrigen = document.getElementById('pt_int_origen');
      const selDestino = document.getElementById('pt_int_destino');
      if (!selOrigen || !selDestino) return;

      // Punto = { id, nombre, lat, lng }. OFICINA (Ceuti) siempre disponible como origen.
      const puntos = [
        { id: '__oficina__', nombre: '🏠 Oficina (Ceuti)', lat: BASE_CEUTI.lat, lng: BASE_CEUTI.lng },
        ...proveedores.map(v => ({ id: 'prov:' + v.id, nombre: '📦 ' + v.nombre, lat: v.lat, lng: v.lng })),
        ...todosClientes.map(c => ({ id: 'cli:' + c.id, nombre: '🔧 ' + c.nombre, lat: c.lat, lng: c.lng }))
      ];

      const optHtml = (lista, selId) => '<option value="">— Seleccionar —</option>' +
        lista.map(x => `<option value="${escapeHtml(x.id)}" data-lat="${x.lat ?? ''}" data-lng="${x.lng ?? ''}" ${x.id === selId ? 'selected' : ''}>${escapeHtml(x.nombre)}</option>`).join('');
      selOrigen.innerHTML = optHtml(puntos, p.internoOrigen || '__oficina__');
      selDestino.innerHTML = optHtml(puntos, p.internoDestino || '');

      const coordsDe = (sel) => {
        const o = sel.selectedOptions[0];
        if (!o || !o.value) return null;
        const lat = parseFloat(o.dataset.lat), lng = parseFloat(o.dataset.lng);
        return (isNaN(lat) || isNaN(lng)) ? null : { lat, lng };
      };

      const recalcKms = async () => {
        const a = coordsDe(selOrigen), b = coordsDe(selDestino);
        const hint = document.getElementById('pt_int_kms_hint');
        const input = document.getElementById('pt_kms_interno');
        if (!a || !b) {
          input.readOnly = false;
          if (hint) { hint.textContent = 'Se calculan solos si origen y destino tienen coordenadas. Si no, escríbelos a mano.'; hint.style.color = ''; }
          return;
        }
        // Misma coordenada: inválido — aviso y no se calcula nada
        if (selOrigen.value === selDestino.value) {
          input.value = '';
          input.readOnly = false;
          if (hint) { hint.textContent = '⚠️ El punto de salida y de llegada son el mismo: elige puntos distintos.'; hint.style.color = 'var(--danger)'; }
          showToast('El punto de salida y el de llegada son el mismo', 'error');
          return;
        }
        if (hint) hint.style.color = '';
        // Ruta real por carretera (OSRM); si no hay conexión, estimación haversine × FACTOR_CARETERA
        const hint0 = '⏳ Calculando ruta real…';
        if (hint) hint.textContent = hint0;
        const real = await kmRutaReal(a.lat, a.lng, b.lat, b.lng).catch(() => null);
        const kms = Math.round(real != null ? real : kmEntreCoordenadasCore(a.lat, a.lng, b.lat, b.lng) * getFactorCarretera());
        input.value = kms || '';
        input.readOnly = true;
        if (hint) hint.textContent = '✅ ' + kms + ' km (trayecto de salida). Si el vehículo vuelve al origen, crea otro desplazamiento de vuelta.';
      };
      selOrigen.addEventListener('change', recalcKms);
      selDestino.addEventListener('change', recalcKms);
      recalcKms();
    } catch (e) { console.warn('[parte interno] init:', e); }
  })();

  // Icono junto al cliente: solo visible si el cliente elegido NO tiene coordenadas.
  // Abre la ficha del cliente para editarla/geolocalizarla; al guardar, el estado se refresca.
  window.actualizarIconoGeoCliente = function(cli){
    const span = document.getElementById('pt_cliente_geo_icon');
    if(!span) return;
    if(!cli || !cli.id || (Number(cli.lat) && Number(cli.lng))){ span.innerHTML=''; return; }
    span.innerHTML = '<button type="button" class="btn btn-outline btn-sm btn-icon" title="Cliente sin coordenadas: pulsa para geolocalizarlo"  '+
      'onclick="event.stopPropagation(); abrirFichaClienteDesdeParte(\''+escapeHtml(String(cli.id))+'\')" '+
      'style="padding:2px 6px;font-size:12px;vertical-align:middle;margin-left:6px;color:#f59e0b">'+
      '<i class="fas fa-triangle-exclamation"></i>📍</button>';
  };
  // Abre DIRECTAMENTE el formulario de edición del cliente (para geolocalizarlo) y,
  // al guardar o cancelar, restaura el parte exactamente como estaba: mismos datos,
  // fotos, firmas y materiales. Técnica: los nodos del modal del parte se mueven a un
  // DocumentFragment (los listeners y canvas sobreviven al traslado) y se devuelven al volver.
  // También se usa para CREAR un cliente nuevo desde el parte (sin clienteId): al guardar,
  // el cliente recién creado queda seleccionado en el parte y se cargan sus datos.
  window.abrirFichaClienteDesdeParte = function(clienteId){
    const overlay = document.getElementById('modalOverlay');
    const body = document.getElementById('modalBody');
    const foot = document.getElementById('modalFooter');
    const title = document.getElementById('modalTitle');
    if(!overlay || !body || !overlay.classList.contains('open') || window.__parteStash){
      window.showClienteForm(clienteId);
      return;
    }
    // 1. Apilar el formulario del parte
    const stash = { t: title.textContent, b: document.createDocumentFragment(), f: document.createDocumentFragment() };
    while(body.firstChild) stash.b.appendChild(body.firstChild);
    while(foot.firstChild) stash.f.appendChild(foot.firstChild);
    window.__parteStash = true;
    const restore = (nuevoClienteId) => {
      window.closeModal = origClose;                    // desparchear SIEMPRE
      if (typeof window.__origNavigateToParcheado === 'function') window.__origNavigateToParcheado = null;
      // Desinstalar los parches de alta de cliente si siguen puestos (se canceló el alta)
      if (window.__parchesClienteDesdeParte) {
        if (window.navigateTo === window.__parchesClienteDesdeParte.nav) window.navigateTo = window.__parchesClienteDesdeParte.origNav;
        if (window.saveCliente === window.__parchesClienteDesdeParte.save) window.saveCliente = window.__parchesClienteDesdeParte.origSave;
        window.__parchesClienteDesdeParte = null;
      }
      window.__clienteCreadoDesdeParte = null;
      window.__parteStash = null;
      title.textContent = stash.t;
      body.replaceChildren(stash.b);                    // nodos de vuelta, con sus listeners
      foot.replaceChildren(stash.f);
      overlay.classList.add('open');
      // 2. Refrescar icono y, si el cliente ya tiene coordenadas y faltaban los KMs, calcularlos
      const sel = document.getElementById('pt_cliente');
      if (sel && nuevoClienteId) {
        // Cliente recién creado: añadirlo al select, seleccionarlo y disparar la carga de datos
        const yaEsta = sel.querySelector('option[value="' + CSS.escape(String(nuevoClienteId)) + '"]');
        if (yaEsta) { sel.value = String(nuevoClienteId); sel.dispatchEvent(new Event('change')); return; }
        dbGet('clientes', String(nuevoClienteId)).then(cli => {
          if (cli && sel.isConnected) {
            const opt = document.createElement('option');
            opt.value = cli.id;
            opt.dataset.nombre = cli.nombre || '';
            opt.textContent = cli.nombre || cli.id;
            sel.appendChild(opt);
            sel.value = String(nuevoClienteId);
            sel.dispatchEvent(new Event('change'));
          }
        }).catch(() => {});
        return;
      }
      if(sel && sel.value && sel.value !== '__incidencia__'){
        dbGet('clientes', sel.value).then(cli => {
          window.actualizarIconoGeoCliente(cli);
          const interno = document.getElementById('pt_tipo_interno')?.checked;
          const kmsInput = document.getElementById('pt_kms');
          if(cli && cli.lat && cli.lng && !interno && kmsInput && !kmsInput.value && typeof kmIdaVuelta === 'function'){
            kmIdaVuelta({ lat: cli.lat, lng: cli.lng }).then(k => { if(k) kmsInput.value = k; }).catch(()=>{});
          }
        }).catch(()=>{});
      }
    };
    const origClose = window.closeModal;
    // La PRIMERA llamada a closeModal tras abrir el cliente (Cancelar, Guardar, Escape o
    // clic fuera) restaura el parte en lugar de cerrar el modal. Las siguientes ya son normales.
    window.closeModal = function(){ restore(); };
    // 3. Abrir el formulario del cliente encima
    if (clienteId) {
      window.showClienteForm(clienteId);
    } else {
      // Cliente NUEVO: al guardar, saveCliente navega a 'clientes'; interceptamos esa
      // navegación (solo la primera vez) para quedarnos en el parte y seleccionarlo allí.
      window.__clienteCreadoDesdeParte = null;
      const origNavigate = window.navigateTo;
      const origSave = window.saveCliente;
      const navParche = function(page){
        if (page === 'clientes') {
          if (window.navigateTo === navParche) window.navigateTo = origNavigate;
          const creado = window.__clienteCreadoDesdeParte;
          window.__clienteCreadoDesdeParte = null;
          restore(creado || undefined);
          return Promise.resolve();
        }
        return origNavigate.apply(this, arguments);
      };
      const saveParche = function(idGuardado){
        window.__clienteCreadoDesdeParte = idGuardado || (document.getElementById('cf_id')?.value ?? null);
        return origSave.apply(this, arguments);
      };
      window.__parchesClienteDesdeParte = { nav: navParche, origNav: origNavigate, save: saveParche, origSave: origSave };
      window.navigateTo = navParche;
      window.saveCliente = saveParche;
      window.showClienteForm(null);
    }
  };

  setTimeout(async ()=>{
    const sel = document.getElementById('pt_cliente');
    if (sel) {
      // Estado inicial del icono según el cliente precargado
      if(sel.value && sel.value !== '__incidencia__'){ dbGet('clientes', sel.value).then(actualizarIconoGeoCliente); }
      sel.addEventListener('change', async () => {
        if (!sel.value) {                                   // sin cliente: se esconden ubicaciones y puertas
          ptOcultar('pt_ubic_group', true); ptOcultar('pt_puertas_group', true);
          const u = document.getElementById('pt_ubicacion'); if (u) u.innerHTML = '<option value="">-- Selecciona un cliente primero --</option>';
          actualizarIconoGeoCliente(null);
          return;
        }
        if (sel.value === '__incidencia__') {
          actualizarIconoGeoCliente(null);
          document.getElementById('pt_kms').value = '';
          document.getElementById('pt_dni_cliente').value = '';
          document.getElementById('pt_ubicacion').innerHTML = '<option value="">Sin ficha de cliente</option>';
          ptOcultar('pt_ubic_group', true); ptOcultar('pt_puertas_group', true);
          return;
        }
        const cli = await dbGet('clientes', sel.value);
        actualizarIconoGeoCliente(cli);

        // --- Cálculo de KMs ---
        // Si el cliente tiene ubicaciones, los KMs se calculan desde la UBICACIÓN elegida
        // (la ficha del cliente suele ser la razón social/central, no donde están las puertas).
        const ubicacionesCli = sel.value ? await dbGetByIndex('ubicaciones', 'clienteId', sel.value).catch(() => []) : [];
        const ubConCoord = ubicacionesCli.find(u => u.lat && u.lng);
        if (ubConCoord) {
          const kms = await kmIdaVuelta({ lat: ubConCoord.lat, lng: ubConCoord.lng });
          document.getElementById('pt_kms').value = kms;
          showToast('Kms calculados: ' + kms + ' (ida+vuelta, desde "' + ubConCoord.denominacion + '")');
        } else if (cli?.lat && cli?.lng) {
          const kms = await kmIdaVuelta({ lat: cli.lat, lng: cli.lng });
          document.getElementById('pt_kms').value = kms;
          showToast('Kms calculados: ' + kms + ' (ida+vuelta)');
        } else if (!(ubicacionesCli.length)) {
          document.getElementById('pt_kms').value = '';
          showToast('📍 Cliente sin coordenadas: rellena los KMs a mano y geolocalízalo en Clientes', 'error');
        } else {
          document.getElementById('pt_kms').value = '';
          showToast('📍 El cliente tiene ubicaciones pero ninguna con coordenadas: geolocalízalas en Clientes → Ubicaciones (📍 Geo)', 'error');
        }

        if (cli?.dni) {
          document.getElementById('pt_dni_cliente').value = cli.dni;
        }
        // --- Ubicaciones dinámicas ---
        const selUbicacion = document.getElementById('pt_ubicacion');
        if (selUbicacion) {
          selUbicacion.innerHTML = '<option value="">-- Selecciona una ubicación --</option>';
          if (sel.value) {
            const ubicaciones = await dbGetByIndex('ubicaciones', 'clienteId', sel.value);
            ptOcultar('pt_ubic_group', !ubicaciones.length);      // sin ubicaciones, el campo no se muestra
            if (ubicaciones.length) {
              selUbicacion.innerHTML = '<option value="">-- Selecciona ubicación --</option>' +
                ubicaciones.map(u =>
                  '<option value="' + u.id + '" data-nombre="' + escapeHtml(u.denominacion) + '" data-direccion="' + escapeHtml(u.direccion || '') + '">' +
                    escapeHtml(u.denominacion) + (u.direccion ? ' — ' + escapeHtml(u.direccion) : '') +
                  '</option>'
                ).join('');
            } else {
              selUbicacion.innerHTML = '<option value="">Sin ubicaciones para este cliente</option>';
            }
          }
        }
        // --- Puertas dinámicas (checkboxes) ---
        pintarPuertasParte(sel.value, null, p.puertaIntervenidas);
      });
    }
    const empSel = document.getElementById('pt_empleado');
    if (empSel) {
      empSel.addEventListener('change', async () => {
        const emp = await dbGet('empleados', empSel.value);
        document.getElementById('pt_dni_tecnico').value = emp?.dni || '';
        pintarFirmaEnCanvas('pt_firma_tecnico', emp?.firma || null);
      });
    }
    initFirmaCanvas('pt_firma_tecnico', { readOnly: true });
    initFirmaCanvas('pt_firma_cliente');

    // DNI y firma del técnico salen siempre de su ficha de empleado
    const fillTecnico = emp => {
      if (!emp) return;
      const dniInput = document.getElementById('pt_dni_tecnico');
      if (dniInput && emp.dni) dniInput.value = emp.dni;
      if (emp.firma && !p.firmaTecnico) pintarFirmaEnCanvas('pt_firma_tecnico', emp.firma);
    };
    if (window.isTechnician?.()) {
      fillTecnico(window.authState.employee);
    } else if (p.empleadoId) {
      dbGet('empleados', p.empleadoId).then(fillTecnico);
    }
    if (p.firmaTecnico) {
      pintarFirmaEnCanvas('pt_firma_tecnico', p.firmaTecnico);
    }
    if (p.firmaCliente) {
      pintarFirmaEnCanvas('pt_firma_cliente', p.firmaCliente);
    }
    // --- Cargar ubicaciones si hay cliente preseleccionado (edición) ---
    if (clienteIdSeleccionado) {
      const selUbicacion = document.getElementById('pt_ubicacion');
      if (selUbicacion) {
        const ubicaciones = await dbGetByIndex('ubicaciones', 'clienteId', clienteIdSeleccionado);
        ptOcultar('pt_ubic_group', !ubicaciones.length);
        if (ubicaciones.length) {
          selUbicacion.innerHTML = '<option value="">-- Selecciona ubicación --</option>' +
            ubicaciones.map(u =>
              '<option value="' + u.id + '" data-nombre="' + escapeHtml(u.denominacion) + '" data-direccion="' + escapeHtml(u.direccion || '') + '" ' + (u.id === p.ubicacionId ? 'selected' : '') + '>' +
                escapeHtml(u.denominacion) + (u.direccion ? ' — ' + escapeHtml(u.direccion) : '') +
              '</option>'
            ).join('');
        } else {
          selUbicacion.innerHTML = '<option value="">Sin ubicaciones para este cliente</option>';
        }
      }
      // --- Cargar puertas si hay cliente preseleccionado (edición) ---
      pintarPuertasParte(clienteIdSeleccionado, null, p.puertaIntervenidas);
    }
  }, 200);
};

// ═══ Puertas del parte: lista con checkbox de intervención ═══
// Las marcadas (intervenidas) son las que van al PDF destacadas.
function puertasIntervenidasActuales(){
  return [...document.querySelectorAll('#pt_puertas_lista .pt-puerta-chk:checked')].map(chk => chk.dataset.pid);
}
window.pintarPuertasParte = async function(clienteId, _unused, intervenidasPrev){
  const lista = document.getElementById('pt_puertas_lista');
  if(!lista) return;
  const selUbic = document.getElementById('pt_ubicacion');
  const tipoPuerta = document.getElementById('pt_tipo')?.value || '';
  const ubicacionId = selUbic?.value || '';
  if(!clienteId || clienteId === '__incidencia__'){
    lista.innerHTML = '<small style="color:var(--text-muted)">Selecciona un cliente para ver sus puertas</small>';
    ptOcultar('pt_puertas_group', true);
    return;
  }
  let puertas = [];
  try{ puertas = await dbGetByIndex('puertas', 'clienteId', clienteId); }catch(_){ }
  // Filtrar por ubicación (si está elegida) y por tipo de puerta
  if(ubicacionId) puertas = puertas.filter(pu => !pu.ubicacionId || String(pu.ubicacionId) === String(ubicacionId));
  // Comparación tolerante de tipo (key/nombre/id): antes solo coincidía con el
  // texto exacto y "no encontraba ninguna" aunque la puerta existiera
  if(tipoPuerta) puertas = puertas.filter(pu => (window.mismoTipoPuerta||mismoTipoPuerta)(pu.tipo||pu.tipoPuerta, tipoPuerta));
  if(!puertas.length){
    lista.innerHTML = '<small style="color:var(--text-muted)">' +
      (tipoPuerta ? 'Este cliente no tiene puertas de tipo "' + escapeHtml(tipoPuerta) + '"' : 'Este cliente no tiene puertas dadas de alta') + '</small>';
    ptOcultar('pt_puertas_group', true);                      // sin puertas de ese tipo, el campo no se muestra
    return;
  }
  ptOcultar('pt_puertas_group', false);
  const prev = intervenidasPrev || p_prevPuertas || [];
  const detallePrev = window.__puertasDetalle || {};
  lista.innerHTML = puertas.map(pu => {
    const marcada = prev.includes(pu.id);
    const obs = detallePrev[pu.id] || '';
    return '<div class="pt-puerta-fila" style="border:1px solid var(--border);border-radius:8px;padding:6px 10px;margin-bottom:6px;background:var(--surface-alt)">' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
        '<input type="checkbox" class="pt-puerta-chk" data-pid="' + escapeHtml(pu.id) + '" ' + (marcada ? 'checked' : '') + ' onchange="__toggleObsPuerta(this,\'' + escapeHtml(pu.id) + '\')"> ' +
        '<span>' + escapeHtml(pu.nombre) + (pu.tipo ? ' <small style="color:var(--text-muted)">(' + escapeHtml(pu.tipo) + ')</small>' : '') + '</span>' +
      '</label>' +
      '<div id="pt_obs_' + escapeHtml(pu.id) + '" style="display:' + (marcada ? 'block' : 'none') + ';margin-top:6px">' +
        '<input type="text" class="pt-puerta-obs" data-pid="' + escapeHtml(pu.id) + '" value="' + escapeHtml(obs) + '" ' +
          'placeholder="¿Qué se le ha hecho? (motor cambiado, atascada…)" ' +
          'style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text)">' +
      '</div>' +
    '</div>';
  }).join('');
  window.__puertasDetalle = detallePrev;
};
// Al marcar/desmarcar una puerta en el parte: mostrar/ocultar su campo de observaciones
window.__toggleObsPuerta = function(chk, pid){
  const caja = document.getElementById('pt_obs_' + pid);
  if(caja){ caja.style.display = chk.checked ? 'block' : 'none'; if(chk.checked) caja.querySelector('input')?.focus(); }
};
// Recolecta {puertaId: observaciones} de las puertas intervenidas del parte
function recogerPuertasDetalle(){
  const out = {};
  document.querySelectorAll('#pt_puertas_lista .pt-puerta-obs').forEach(inp => {
    const v = inp.value.trim();
    if(v) out[inp.dataset.pid] = v;
  });
  return out;
}
let p_prevPuertas = null; // puertas marcadas antes de repintar (para no perder marcas al cambiar tipo)
window.saveParte = async function(id){
  id = id ? String(id) : null;
  try {
    const existingPart = id ? await dbGet('partesTrabajo', id) : null;
    const sel = document.getElementById('pt_cliente');
    const clienteOption = sel.options[sel.selectedIndex];
    const clienteSinFicha = sel.value === '__incidencia__';
    const clienteId = clienteSinFicha ? null : sel.value;
    const clienteNombre = clienteOption?.dataset.nombre || '';
    const empSel = document.getElementById('pt_empleado');

    // --- UBICACI"N ---
    const selUbic = document.getElementById('pt_ubicacion');
    const ubicacionId = selUbic?.value || '';
    const ubicacionNombre = selUbic?.options[selUbic.selectedIndex]?.dataset.nombre || '';
    const ubicacionDireccion = selUbic?.options[selUbic.selectedIndex]?.dataset.direccion || '';

    // --- PUERTAS: checkboxes de intervención ---
    const puertaIds = [...document.querySelectorAll('#pt_puertas_lista .pt-puerta-chk:checked')].map(chk => chk.dataset.pid);

    const dniCliente = document.getElementById('pt_dni_cliente').value.trim();
    const dniTecnico = document.getElementById('pt_dni_tecnico').value.trim();

    // --- VEHÍCULO ---
    const vehSel = document.getElementById('pt_vehiculo');
    const vehiculoId = vehSel?.value || null;
    const selOption = vehSel?.options[vehSel.selectedIndex];
    const matriculaRaw = selOption?.dataset?.matricula || null;

    // Tipo de parte: interno (sin cliente) o normal
    const esInterno = document.getElementById('pt_tipo_interno')?.checked;

    // Validación en línea
    let ok = true;

    // Cliente obligatorio (solo en partes normales)
    if (!esInterno && !clienteId && !(clienteSinFicha && clienteNombre)) {
      setFieldError('pt_cliente', 'Selecciona un cliente');
      ok = false;
    } else {
      clearFieldError('pt_cliente');
    }

    // Vehículo obligatorio
    if(!vehiculoId){
      setFieldError('pt_vehiculo', 'Selecciona un vehículo');
      ok = false;
    } else {
      clearFieldError('pt_vehiculo');
    }

    // Tipo de puerta obligatorio (solo en partes normales)
    ok = setFieldError('pt_tipo', esInterno ? '' : validators.required(document.getElementById('pt_tipo').value.trim(), 'El tipo de puerta')) && ok;

    // Descripción obligatoria (en internos se genera sola desde motivo + origen/destino)
    if (esInterno && !document.getElementById('pt_desc').value.trim()) {
      const origen = document.getElementById('pt_int_origen')?.selectedOptions[0]?.textContent.trim() || '';
      const destino = document.getElementById('pt_int_destino')?.selectedOptions[0]?.textContent.trim() || '';
      document.getElementById('pt_desc').value = 'Desplazamiento interno: ' + origen + ' → ' + destino +
        (document.getElementById('pt_motivo_interno').value.trim() ? ' (' + document.getElementById('pt_motivo_interno').value.trim() + ')' : '');
    }
    ok = setFieldError('pt_desc', validators.required(document.getElementById('pt_desc').value.trim(), 'La descripción')) && ok;

    // En internos, los kms calculados/manual del bloque interno son los del parte
    if (esInterno) {
      const selO = document.getElementById('pt_int_origen'), selD = document.getElementById('pt_int_destino');
      if (!selO.value || !selD.value) { showToast('Elige el punto de salida y de llegada', 'error'); return; }
      if (selO.value === selD.value) { showToast('El punto de salida y el de llegada son el mismo', 'error'); return; }
      const kmsInt = parseInt(document.getElementById('pt_kms_interno').value) || 0;
      document.getElementById('pt_kms').value = kmsInt || '';
      if (!kmsInt) { showToast('Indica los kilómetros del desplazamiento', 'error'); return; }
    }

    // Fecha obligatoria
    ok = setFieldError('pt_fecha', validators.required(document.getElementById('pt_fecha').value, 'La fecha')) && ok;

    // Horas obligatorias
    const horas = document.getElementById('pt_horas').value.trim();
    ok = setFieldError('pt_horas', validators.required(horas, 'El número de horas')) && ok;

    // DNI técnico (si se rellena, debe ser válido)
    if(dniTecnico){
      ok = setFieldError('pt_dni_tecnico', !validarDNI(dniTecnico) ? 'DNI del técnico no válido' : '') && ok;
    } else {
      clearFieldError('pt_dni_tecnico');
    }

    // DNI cliente (si se rellena, debe ser válido)
    if(dniCliente){
      ok = setFieldError('pt_dni_cliente', !validarDNI(dniCliente) ? 'DNI del cliente no válido' : '') && ok;
    } else {
      clearFieldError('pt_dni_cliente');
    }

    // Email secundario (si se rellena, debe ser válido)
    const emailSec = document.getElementById('pt_email_sec')?.value.trim() || '';
    if(emailSec){
      ok = setFieldError('pt_email_sec', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSec) ? 'Email no válido' : '') && ok;
    } else {
      clearFieldError('pt_email_sec');
    }

    // Material utilizado: las líneas vacías se descartan; con material debe haber cantidad > 0
    const materialesParte = [];
    for (const [index, line] of (window.__materialesParte?.lines || []).entries()) {
      const descripcion = String(line.descripcion || '').trim();
      const cantidad = parseFloat(line.cantidad) || 0;
      if (!descripcion && !cantidad) continue;
      if (!descripcion || cantidad <= 0) {
        showToast('Material, línea ' + (index + 1) + ': indica el material y una cantidad mayor que 0', 'error');
        return;
      }
      materialesParte.push({ articuloId: line.articuloId || '', descripcion, cantidad, unidad: line.unidad || 'ud' });
    }

    if(!ok){ 
      showToast('Revisa los campos marcados','error'); 
      return; 
    }

    let firmaTecnico = null;
    if(hasSignature('pt_firma_tecnico')){
      firmaTecnico = document.getElementById('pt_firma_tecnico').toDataURL('image/png');
    }

    let firmaCliente = null;
    if(hasSignature('pt_firma_cliente')){
      firmaCliente = document.getElementById('pt_firma_cliente').toDataURL('image/png');
    }

    const parteData = {
      createdBy: existingPart?.createdBy ?? (id ? null : window.authState?.user?.id ?? null),
      interno: !!esInterno,
      motivoInterno: esInterno ? (document.getElementById('pt_motivo_interno').value.trim() || null) : null,
      internoOrigen: esInterno ? (document.getElementById('pt_int_origen').value || null) : null,
      internoDestino: esInterno ? (document.getElementById('pt_int_destino').value || null) : null,
      clienteId: esInterno ? null : clienteId,
      clienteNombre: esInterno ? 'Interno' : clienteNombre,
      empleadoId: empSel.value || null,
      empleadoNombre: empSel.value ? empSel.options[empSel.selectedIndex].dataset.nombre : '',
      empleadoDni: dniTecnico,
      clienteDni: dniCliente,
      tipoPuerta: document.getElementById('pt_tipo').value.trim(),
      descripcion: document.getElementById('pt_desc').value.trim(),
      vehiculoId: vehiculoId,
      matricula: (matriculaRaw || '').replace(/\s/g, '').toUpperCase(),
      kms: parseInt(document.getElementById('pt_kms').value)||0,
      horas: parseFloat(horas),
      fotos: window.__fotosParte?.form || [],
      firmaTecnico: firmaTecnico,
      firmaCliente: firmaCliente,
      estado: 'completado',
      fecha: document.getElementById('pt_fecha').value,
      notas: (existingPart?.notas) || '', // campo retirado del formulario; se conserva lo guardado
      materiales: materialesParte,
      ubicacionId,
      ubicacionNombre,
      ubicacionDireccion,
      puertaIds: puertaIds.length > 0 ? puertaIds : null,
      puertasDetalle: puertaIds.length > 0 ? recogerPuertasDetalle() : null,
      emailSecundario: emailSec || null,
      selloCliente: window.__selloClienteParte || null,
      // Vínculo con la incidencia de origen (si el parte nace de una incidencia resuelta)
      incidenciaId: existingPart?.incidenciaId || window.__parteIncidenciaOrigen || null
    };
    window.__parteIncidenciaOrigen = null;

    // 1. Guardar fotos PRIMERO
    try{
      parteData.fotos = await guardarFotosParte();
    }catch(e){
      console.error('Error subiendo fotos:', e);
      showToast('Parte guardado pero sin fotos','error');
    }
    window.__fotosParte = { form: [] };

    // 1b. Guardar fotos del albarán (desplazamiento interno) en Storage
    if(esInterno && (window.__fotosAlbaran || []).length){
      const subidas = [];
      for(const f of window.__fotosAlbaran){
        if(typeof f === 'string' && f.startsWith('data:image/')) subidas.push(await window.uploadParteFoto(f) || f);
        else subidas.push(f);
      }
      parteData.fotosAlbaran = subidas;
    } else if(!esInterno) {
      parteData.fotosAlbaran = []; // nunca null: la columna es NOT NULL en Supabase
    }
    window.__fotosAlbaran = [];
    window.__selloClienteParte = null;

    // 2. Persistir en DB
    let parteGuardado;
    if (id) {
      parteGuardado = await dbPut('partesTrabajo', { ...parteData, id: String(id) });
    } else {
      parteGuardado = await dbCreate('partesTrabajo', parteData);
    }

    // 3. Sync
    // 4. Recalcular KMs
    if (parteGuardado.matricula) {
      await recalcVehicleKms(parteGuardado.matricula);
    }

    closeModal();
    showToast('Parte guardado');
    navigateTo('partesTrabajo');

    // 5. Envío por email: siempre al email de la ficha del cliente (si tiene);
    //    si hay email secundario, también a él.
    if(!esInterno){
      let emailFicha = '';
      try{ emailFicha = (await dbGet('clientes', clienteId))?.email || ''; }catch(_){ }
      const destinos = [...new Set([emailFicha, emailSec].map(e => String(e || '').trim()).filter(Boolean))];
      if(destinos.length){
        const asunto = 'Parte de trabajo ' + (parteGuardado.id || '') + ' — ' + clienteNombre;
        const cuerpo =
          'Buenos días:\n\n' +
          'Le adjuntamos / le remitimos el detalle del parte de trabajo realizado el ' + parteGuardado.fecha + '.\n\n' +
          'Cliente: ' + clienteNombre + '\n' +
          'Tipo de puerta: ' + parteGuardado.tipoPuerta + '\n' +
          'Técnico: ' + parteGuardado.empleadoNombre + '\n' +
          'Descripción: ' + parteGuardado.descripcion + '\n\n' +
          'Un saludo.\n';
        for(const dest of destinos){
          try{ await window.enviarCorreo(dest, asunto, cuerpo); }catch(e){ console.warn('Email a ' + dest + ':', e); }
        }
      }
    }
  } catch(err){
    console.error('Error al guardar parte:', err);
    showToast('Error al guardar: ' + err.message, 'error');
  }
};

window.deleteParte = async function(id) {
  try {
    // 1. Leer el parte ANTES de borrarlo (para saber la matrícula)
    const parte = await dbGet('partesTrabajo', id);
    
    // 2. Borrar
    await dbDelete('partesTrabajo', id);

    // 3. Recalcular KMs si el parte borrado tenía vehículo
    if (parte?.matricula) {
      await recalcVehicleKms(parte.matricula);
    }

    showToast('Parte eliminado');
    navigateTo('partesTrabajo');
  } catch(err) {
    console.error('Error al eliminar parte:', err);
    showToast('Error al eliminar: ' + err.message, 'error');
  }
};
