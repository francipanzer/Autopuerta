//  DASHBOARD — ACTUALIZADO (CON BANNER PENDIENTES)
let dashboardItvCountdownTimer=null;

function diasHastaFechaITV(value){
  const match=String(value||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return null;
  const target=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
  const today=new Date();
  const todayUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
  return Math.round((target-todayUtc)/86400000);
}

function textoCuentaAtrasITV(days){
  if(days<0){
    const overdue=Math.abs(days);
    return `<strong>CADUCADA</strong> hace ${overdue} día${overdue===1?'':'s'}`;
  }
  if(days===0) return '<strong>CADUCA HOY</strong>';
  return `Caduca en <strong>${days}</strong> día${days===1?'':'s'}`;
}

function actualizarCuentaAtrasITV(){
  if(dashboardItvCountdownTimer) clearTimeout(dashboardItvCountdownTimer);
  const countdowns=document.querySelectorAll('.itv-countdown[data-date]');
  countdowns.forEach(element=>{
    const days=window.diasHastaFechaITV(element.dataset.date);
    if(days===null) return;
    element.innerHTML=window.textoCuentaAtrasITV(days);
    const row=element.closest('.itv-alert-item');
    if(row){
      row.style.borderLeftColor=days<0?'#ef4444':'#f59e0b';
      row.style.backgroundColor=days<0?'rgba(239,68,68,.1)':'rgba(245,158,11,.1)';
    }
  });
  if(countdowns.length){
    const now=new Date();
    const nextMidnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1);
    dashboardItvCountdownTimer=setTimeout(actualizarCuentaAtrasITV,Math.max(1000,nextMidnight-now));
  }
}

window.render_dashboard = async function(el){
  const clientes = await dbGetAll('clientes');
  const presupuestos = await dbGetAll('presupuestos');
  const partes = await dbGetAll('partesTrabajo');
  const vehiculos = await dbGetAll('vehiculos');
  const almacen = await dbGetAll('almacen');

  // Banner Pendientes (revisión de rutas + clientes sin cadena + puertas sueltas)
  const pendientes = await getPendientesRevision();
  let bannerHTML = '';
  if (pendientes.length > 0) {
    const urgencias = pendientes.filter(p => p.dias <= 0).length;
    const proximas = pendientes.length - urgencias;
    bannerHTML = `
      <div class="card" style="border-left:4px solid ${urgencias > 0 ? '#e11d48' : '#f59e0b'}; margin-bottom:20px;">
        <div class="card-body" style="padding:14px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;">
            <strong style="color:${urgencias > 0 ? '#e11d48' : '#f59e0b'};">
              <i class="fas fa-exclamation-triangle"></i> ${urgencias > 0 ? urgencias + (urgencias === 1 ? ' vencida  hoy' : ' vencidas  hoy') : ''}${urgencias > 0 && proximas > 0 ? ' · ' : ''}${proximas > 0 ? proximas + ' próximas' : ''}
            </strong>
            <button class="btn btn-sm btn-primary" onclick="navigateTo('revisionesProgramadas')">Ver todo</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${pendientes.slice(0, 5).map(p => {
              const col = p.dias <= 0 ? '#e11d48' : '#f59e0b';
              const cuando = p.dias < 0 ? `Vencida hace ${Math.abs(p.dias)} d` : p.dias === 0 ? '¡Vence HOY!' : `En ${p.dias} d`;
              // Título + destino según el tipo (fila clicable)
              const titulo = p.tipo === 'ruta'
                ? `<strong>${escapeHtml(p.cadenaNombre)}</strong> · ${escapeHtml(p.rutaNombre || '')}`
                : `<strong>${escapeHtml(p.nombre)}</strong>`;
              const accion = p.tipo === 'ruta'
                ? `verRutasDeCadena('${String(p.cadenaId || '').replace(/'/g, "")}')`
                : p.tipo === 'cliente'
                  ? `verTiendasDeCliente('${String(p.id || '').replace(/'/g, "")}')`
                  : p.clienteId
                    ? `gestionarPuertas('${String(p.clienteId).replace(/'/g, "")}')`
                    : `navigateTo('revisionesProgramadas')`;
              return `<div onclick="${accion}" title="Abrir revisión" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${col}14;border:1px solid ${col}40;">
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fas fa-${p.tipo === 'ruta' ? 'route' : p.tipo === 'cliente' ? 'user' : 'door-open'}" style="color:${col};margin-right:8px;"></i>${titulo}</span>
                <span style="color:${col};font-weight:700;font-size:12px;white-space:nowrap;">${cuando} <i class="fas fa-chevron-right" style="font-size:10px;margin-left:4px"></i></span>
              </div>`;
            }).join('')}
            ${pendientes.length > 5 ? `<small style="color:var(--text-muted);">y ${pendientes.length - 5} más…</small>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Métricas
  const totalPresupuesto = presupuestos.reduce((s,p)=>s+(p.total||0),0);
  const partesTotal = partes.length;
  const vehiculosEnRuta = vehiculos.filter(v=>v.estado==='en_ruta').length;
  const stockBajoItems = almacen.filter(a=>a.stock<=a.stockMinimo);

  // Lógica de Alertas ITV
  let alertasHTML = '';
  let numAlertas = 0;

  vehiculos.forEach(v => {
    const fechaStr = v.fechaITV || v.itv || v.fecha_itv;
    if(fechaStr){
      const dias=window.diasHastaFechaITV(fechaStr);
      if(dias!==null){
        let estado = 'ok';
        if(dias < 0) estado = 'caducada';
        else if(dias <= 30) estado = 'proxima';
        
        if(estado !== 'ok'){
          numAlertas++;
          const bgColor = estado === 'caducada' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
          const borderColor = estado === 'caducada' ? '#ef4444' : '#f59e0b';
          const fechaITVIso=String(fechaStr).slice(0,10);
          
          alertasHTML += `
            <div class="itv-alert-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:6px; margin-bottom:8px; border-left:4px solid ${borderColor}; background-color:${bgColor};">
              <div>
                <strong style="display:block; font-size:1rem;">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</strong>
                <span style="font-weight:bold; color:#2563eb; font-size:0.95rem; letter-spacing:1px;">${escapeHtml(v.matricula)}</span>
                <small style="color:#6b7280; display:block; margin-top:2px;"><span class="itv-countdown" data-date="${fechaITVIso}">${textoCuentaAtrasITV(dias)}</span></small>
              </div>
              <button class="btn btn-primary btn-sm" onclick="navigateTo('vehiculos')">Ir</button>
            </div>
          `;
        }
      }
    }
  });

  // Próximas revisiones agrupadas por cliente
  const puertas = await dbGetAll('puertas');
  let revHTML = '';
  let numRev = 0;

  const pendientesPuertas = puertas.filter(p => p.proximaRevision && diasHasta(p.proximaRevision) <= 7);
  
  const grupos = {};
  pendientesPuertas.forEach(p => {
    if(!grupos[p.clienteId]) grupos[p.clienteId] = [];
    grupos[p.clienteId].push(p);
  });

  Object.entries(grupos).forEach(([clienteId, lista]) => {
    numRev++;
    const cliente = clientes.find(c => c.id === clienteId);
    const nombreCliente = cliente ? cliente.nombre : 'Cliente desconocido';
    
    const conteoTipos = {};
    lista.forEach(p => {
      const tipo = getTipoPuerta(p.tipo);
      const nombreTipo = tipo ? tipo.nombre : p.tipo;
      conteoTipos[nombreTipo] = (conteoTipos[nombreTipo] || 0) + 1;
    });
    
    const resumenTipos = Object.entries(conteoTipos)
      .map(([tipo, cant]) => `${tipo} -${cant}`)
      .join(', ');
    
    const proximaFecha = lista.map(p=>p.proximaRevision).sort()[0];
    const diasMin = diasHasta(proximaFecha);
    
    let color, etiqueta;
    if(diasMin < 0){       color='#ef4444'; etiqueta=`<strong>ATRASADA</strong> ${Math.abs(diasMin)} día(s)`; }
    else if(diasMin === 0){ color='#ef4444'; etiqueta=`<strong>¡VENCE HOY!</strong>`; }
    else if(diasMin === 1){ color='#f97316'; etiqueta=`Vence <strong>mañana</strong>`; }
    else if(diasMin <= 3){ color='#f97316'; etiqueta=`Revisar en <strong>${diasMin}</strong> días`; }
    else {                 color='#22c55e'; etiqueta=`Próxima en <strong>${diasMin}</strong> días`; }

    revHTML += `
      <div onclick="gestionarPuertas('${clienteId}')" title="Ver puertas y revisiones de este cliente" style="cursor:pointer;display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:6px; margin-bottom:8px; border-left:4px solid ${color}; background-color:${color}18;">
        <div>
          <strong style="display:block; font-size:1rem;">${escapeHtml(nombreCliente)}</strong>
          <small style="color:#6b7280; display:block; margin-top:2px;">Puertas (${lista.length} puerta(s): ${escapeHtml(resumenTipos)}</small>
          <small style="color:#6b7280; display:block; margin-top:2px;">Próxima: ${proximaFecha} — ${etiqueta}</small>
        </div>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); gestionarPuertas('${clienteId}')">Ver</button>
      </div>`;
  });

  // Saludo dinámico
  const h = new Date().getHours();
  const saludo = h<12 ? 'Buenos días' : h<20 ? 'Buenas tardes' : 'Buenas noches';

  // Nombre del técnico
  const nombreTecnico = window.authState?.employee?.nombre || window.authState?.profile?.full_name || '';
  const nombreTecnicoMayus = nombreTecnico ? nombreTecnico.toUpperCase() : '';

  // Renderizado HTML: Dashboard
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${saludo}</h2>
        <p>Resumen general · ${new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>
      ${nombreTecnicoMayus ? `<div class="tecnico-badge">${escapeHtml(nombreTecnicoMayus)}</div>` : ''}
    </div>

    ${bannerHTML}

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-users"></i></div><div class="stat-info"><h3>${clientes.length}</h3><p>Clientes</p></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#dcfce7;color:#16a34a"><i class="fas fa-file-invoice-dollar"></i></div><div class="stat-info"><h3>${formatCurrency(totalPresupuesto)}</h3><p>Presupuestos</p></div></div>
      <div class="stat-card" onclick="navigateTo('partesTrabajo')" style="cursor:pointer"><div class="stat-icon" style="background:#ffedd5;color:#ea580c"><i class="fas fa-clipboard-list"></i></div><div class="stat-info"><h3>${partesTotal}</h3><p>Partes de trabajo</p></div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#d97706"><i class="fas fa-truck"></i></div><div class="stat-info"><h3>${vehiculosEnRuta}</h3><p>Vehículos en ruta</p></div></div>
      <div class="stat-card" style="cursor:pointer${stockBajoItems.length?';border-left:4px solid #dc2626':''}" onclick="navigateTo('almacen')" title="Ver almacén"><div class="stat-icon" style="background:#fee2e2;color:#dc2626"><i class="fas fa-triangle-exclamation"></i></div><div class="stat-info"><h3>${stockBajoItems.length}</h3><p>Stock bajo</p></div></div>
    </div>

    ${numAlertas > 0 ? `
    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header">
        <h3><i class="fas fa-exclamation-triangle" style="color:#f59e0b; margin-right:8px;"></i>Alertas ITV (${numAlertas})</h3>
      </div>
      <div style="padding: 15px;">
        ${alertasHTML}
      </div>
    </div>
    ` : ''}
     ${numRev > 0 ? `
    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header">
        <h3><i class="fas fa-door-open" style="color:#3b82f6; margin-right:8px;"></i>Próximas revisiones (${numRev})</h3>
        <button class="btn btn-primary btn-sm" onclick="abrirRondaRevisiones()"><i class="fas fa-clipboard-check"></i> Ronda rápida</button>
      </div>
      <div style="padding: 15px;">
        ${revHTML}
      </div>
    </div>
    ` : ''}

    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header"><h3><i class="fas fa-chart-line" style="color:#3b82f6;margin-right:8px"></i>Actividad últimos 30 días</h3></div>
      <canvas id="dashChart" height="90"></canvas>
    </div>

    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header"><h3>Últimos presupuestos</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('presupuestos')">Ver todos</button></div>
      <div class="table-wrapper"><table><thead><tr><th>ID</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody>
        ${presupuestos.slice(-5).reverse().map(p =>
          `<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.clienteNombre)}</td><td>${formatDate(p.fecha)}</td><td>${formatCurrency(p.total)}</td>
          <td><span class="badge ${getBadgeClass(p.estado)}">${getStatusLabel(p.estado)}</span></td></tr>`
        ).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin presupuestos</td></tr>'}
      </tbody></table></div>
    </div>

    <div class="card" style="margin-top:20px; grid-column: 1 / -1;">
      <div class="card-header"><h3>Últimas tareas en curso</h3><button class="btn btn-outline btn-sm" onclick="navigateTo('partesTrabajo')">Ver todos</button></div>
      <div class="table-wrapper"><table><thead><tr><th>Parte</th><th>Cliente</th><th>Tipo</th><th>Fecha</th></tr></thead><tbody>
        ${partes.slice(-5).reverse().map(p =>
          `<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.clienteNombre)}</td><td>${escapeHtml(p.tipoPuerta)}</td>
          <td>${formatDate(p.fecha)}</td></tr>`
        ).join('') || '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted)">Sin tareas en curso</td></tr>'}
      </tbody></table></div>
    </div>

    <div id="dailyReportContainer" style="margin-top:20px; grid-column: 1 / -1;"></div>
  `;

  actualizarCuentaAtrasITV();

  // Gráfico actividad
  setTimeout(async () => {
    try {
      const canvas = document.getElementById('dashChart');
      if(!canvas) return;
      await window.ensureChart();
      if(!document.body.contains(canvas)) return;
      
      const prev = Chart.getChart('dashChart'); 
      if(prev) prev.destroy();

      const dias = [], counts = [];
      for(let i=29;i>=0;i--){
        const d = new Date(); d.setDate(d.getDate()-i);
        const iso = d.toISOString().substring(0,10);
        dias.push(d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}));
        counts.push(partes.filter(p=>p.fecha===iso).length);
      }

      // (8) Degradado suave bajo la línea, con el color primario del tema
      const primary=getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#16a34a';
      const ctx2d=canvas.getContext('2d');
      const grad=ctx2d.createLinearGradient(0,0,0,canvas.clientHeight||180);
      grad.addColorStop(0,primary+'55');
      grad.addColorStop(1,primary+'00');

      new Chart(canvas,{
        type:'line',
        data:{ labels:dias, datasets:[{ label:'Partes', data:counts, borderColor:primary, backgroundColor:grad, fill:true, tension:0.35, pointRadius:2 }] },
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1}}} }
      });
    } catch(e){ console.warn('Error gráfico dashboard:', e); }
  }, 100);

  // Informe diario de flota
  render_daily_report('dailyReportContainer').catch(console.error);
};

//  CLIENTES
// Pinta filas por tandas y carga la siguiente al llegar al final (o con el botón)
window.renderPaginatedRows = function(tbody, items, renderRow, { colspan = 1, empty = '', pageSize = 50 } = {}) {
  if (!tbody) return;
  tbody.__moreObserver?.disconnect();
  if (!items.length) { tbody.innerHTML = empty; return; }
  let shown = Math.min(pageSize, items.length);
  const paint = () => {
    tbody.__moreObserver?.disconnect();
    let html = items.slice(0, shown).map(renderRow).join('');
    if (shown < items.length) {
      html += '<tr class="load-more-row"><td colspan="' + colspan + '" style="text-align:center;padding:14px"><button type="button" class="btn btn-outline btn-sm" data-load-more>Mostrar más (' + shown + ' de ' + items.length + ')</button></td></tr>';
    }
    tbody.innerHTML = html;
    const button = tbody.querySelector('[data-load-more]');
    if (!button) return;
    const loadMore = () => { shown = Math.min(shown + pageSize, items.length); paint(); };
    button.addEventListener('click', loadMore);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); loadMore(); }
      }, { rootMargin: '200px' });
      observer.observe(button);
      tbody.__moreObserver = observer;
    }
  };
  paint();
};

window.render_clientes = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Clientes</h2><p>Gestión de clientes</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showClienteForm()"><i class="fas fa-plus"></i> Nuevo Cliente</button><button class="btn btn-success" onclick="showImportClientesModal()"><i class="fas fa-file-excel"></i> Importar Excel/CSV</button><button class="btn btn-secondary" onclick="showImportFolioModal()"><i class="fas fa-file-image"></i> Importar datos</button><button class="btn btn-secondary" onclick="showDuplicadosClientes()" title="Buscar y fusionar clientes duplicados"><i class="fas fa-clone"></i> Duplicados</button></div></div>'+
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
  const items = (p.lineItems||[]).map(it=>
    '<tr><td>'+escapeHtml(it.descripcion||'')+'</td>'+
    '<td style="text-align:right">'+(Number(it.cantidad)||0)+'</td>'+
    '<td style="text-align:right">'+formatCurrency(it.precio)+'</td>'+
    '<td style="text-align:right"><strong>'+formatCurrency((Number(it.cantidad)||0)*(Number(it.precio)||0))+'</strong></td></tr>'
  ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin conceptos</td></tr>';
  openModal('📋 '+(p.id||'Presupuesto'),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">'+
      '<div><small style="color:var(--text-muted)">Cliente</small><div><strong>'+escapeHtml(p.clienteNombre||'—')+'</strong></div></div>'+
      '<div><small style="color:var(--text-muted)">Estado</small><div>'+estadoBadge+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Fecha</small><div>'+formatDate(p.fecha)+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Válido hasta</small><div>'+formatDate(p.validoHasta)+'</div></div>'+
      '<div><small style="color:var(--text-muted)">Parte asociado</small><div>'+(p.parteId?escapeHtml(p.parteId):'<span class="badge badge-gray">Individual</span>')+'</div></div>'+
      (medidasChip?'<div><small style="color:var(--text-muted)">Hoja de medidas</small><div>'+medidasChip+'</div></div>':'')+
      (p.notas?'<div style="grid-column:1/-1"><small style="color:var(--text-muted)">Notas</small><div>'+escapeHtml(p.notas)+'</div></div>':'')+
    '</div>'+
    '<h4 style="margin:16px 0 8px">Conceptos</h4>'+
    '<div class="table-wrapper"><table><thead><tr><th>Descripción</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>'+items+'</tbody></table></div>'+
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
      // Descripción: SELECT con los artículos del tipo elegido + opción manual
      '<td><div style="display:flex;flex-direction:column;gap:4px;min-width:240px">'+
        '<select data-field="descripcion_sel" onchange="onLineDescChange(\''+cid+'\','+i+',this)" style="min-width:240px">'+
          '<option value="">— Elegir artículo del almacén —</option>'+
          almacen.filter(a=>item.tipoId && String(a.categoria||a.tipoPuerta||'')===String(item.tipoId))
            .map(a=>'<option value="'+escapeHtml(a.nombre)+'" data-precio="'+(a.precioVenta||0)+'" '+(a.nombre===item.descripcion?'selected':'')+'>'+escapeHtml(a.nombre)+' ('+escapeHtml(a.referencia||'')+')</option>').join('')+
          '<option value="__manual__" '+(!almacen.some(a=>a.nombre===item.descripcion && String(a.categoria||a.tipoPuerta||'')===String(item.tipoId)) && item.descripcion?'selected':'')+'>✏️ Escribir manualmente…</option>'+
        '</select>'+
        '<input type="text" data-field="descripcion" value="'+escapeHtml(item.descripcion)+'" onchange="updateLineItem(\''+cid+'\','+i+',\'descripcion\',this.value)" style="display:'+(item.descripcion && !almacen.some(a=>a.nombre===item.descripcion && String(a.categoria||a.tipoPuerta||'')===String(item.tipoId))?'block':'none')+';min-width:240px" placeholder="Escribe el artículo a mano">'+
      '</div></td>'+
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
    // Artículo del almacén: fijar descripción y precio de venta
    item.descripcion = sel.value;
    item.precio = Number(sel.selectedOptions[0]?.dataset.precio)||0;
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
    '<div class="form-group full"><label>Parte de trabajo del día (opcional)</label><select id="pf_parte">'+
      partesOptions+
    '</select>'+
    '<small style="color:var(--text-muted);display:block;margin-top:4px">Asocia este presupuesto a un parte de la misma fecha. Si es un presupuesto individual, deja "Sin parte asociado".</small></div>'+
    '<div class="form-group full" style="display:none"><label>Notas</label><textarea id="pf_notas">'+escapeHtml(p.notas||'')+'</textarea></div>'+
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
  '<div class="table-wrapper"><table><thead><tr><th>Tipo</th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody id="'+lid+'_items"></tbody></table></div>'+
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

//  PARTES DE TRABAJO (CON CAMPO HORAS)
window.render_partesTrabajo = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Partes de Trabajo</h2><p>Seguimiento de instalaciones y reparaciones</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showParteForm()"><i class="fas fa-plus"></i> Nuevo Parte</button>'+
      (window.isAdmin&&window.isAdmin()?'<button class="btn btn-secondary" onclick="exportarPartesSage()" title="CSV de los partes de clientes para Sage 50 (respeta cliente, técnico y fechas)">      <i class="fas fa-file-csv"></i> Exportar a Sage</button>':'')+'</div></div>'+
          '<div class="search-bar">'+
            '<input type="text" placeholder="Buscar..." id="searchParte" oninput="window.__partesPagina=0;renderPartes()">'+
            '<select id="filterClienteParte" onchange="window.__partesPagina=0;renderPartes()"><option value="">Todos los clientes</option></select>'+
      '<select id="filterTecnicoParte" onchange="window.__partesPagina=0;renderPartes()"><option value="">Todos los técnicos</option></select>'+
      '<input type="date" id="filterFechaDesde" onchange="window.__partesPagina=0;renderPartes()" title="Desde">'+
      '<input type="date" id="filterFechaHasta" onchange="window.__partesPagina=0;renderPartes()" title="Hasta">'+
    '</div>'+
    '<div class="card"><div  class="table-wrapper"><table><thead>'+
            '<tr><th>ID</th><th>Cliente</th><th>Ubicación</th><th>Puertas</th><th>Técnico</th><th>Tipo Puerta</th><th>Kms</th><th>Horas</th><th>Fotos</th><th>Fecha</th></tr>'+
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
  const puertasHtml = puertaNombres.length
    ? campo('Puertas revisadas', puertaNombres.map(n=>'<span class="badge badge-blue" style="margin:2px">'+escapeHtml(n)+'</span>').join('')) : '';
  const trabajo =
      campo('Descripción', escapeHtml(p.descripcion||''))+
      campo('Motivo interno', p.interno?escapeHtml(p.motivoInterno||''):'')+
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
    '<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'Parte '+escapeHtml(String(p.id))+'\', ()=>deleteParte('+JSON.stringify(String(p.id))+'))"><i class="fas fa-trash"></i> Eliminar</button>');
};
// Caché de nombres de puertas para la ficha
let mapPuertasCache = {};
let tiposMapCache = new Map();
const MATERIAL_UNIDADES = ['ud', 'l', 'kg', 'm', 'caja'];

function materialesParteHtml() {
  const st = window.__materialesParte || { lines: [], almacen: [] };
  const optU = sel => MATERIAL_UNIDADES.map(u => '<option value="' + u + '"' + (u === sel ? ' selected' : '') + '>' + u + '</option>').join('');
  const rows = st.lines.map((l, i) => {
    const art = l.articuloId ? st.almacen.find(a => String(a.id) === String(l.articuloId)) : null;
    const hint = art ? 'Stock en almacén: ' + (Number(art.stock) || 0) : '';
    const artSel = art ? art.nombre : (l.descripcion || '');
    return '<div class="mat-row">' +
      '<div class="mat-name"><select onchange="updateMaterialParteDeLista(' + i + ',this)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:14px">' +
        '<option value="">— Elegir artículo —</option>' +
        (st.__almacenOrdenado || []).map(a => '<option value="' + escapeHtml(a.nombre) + '"' + (a.nombre === artSel ? ' selected' : '') + '>' + escapeHtml(a.nombre) + (a.referencia ? ' (' + escapeHtml(a.referencia) + ')' : '') + '</option>').join('') +
        (artSel && !(st.__almacenOrdenado || []).some(a => a.nombre === artSel) ? '<option value="' + escapeHtml(artSel) + '" selected>' + escapeHtml(artSel) + ' (manual)</option>' : '') +
      '</select>' +
        '<small id="pt_mat_hint_' + i + '" class="mat-hint">' + escapeHtml(hint) + '</small></div>' +
      '<input type="number" min="0" step="0.01" inputmode="decimal" value="' + (l.cantidad || '') + '" placeholder="Cant." oninput="updateMaterialParte(' + i + ',\'cantidad\',this.value)">' +
      '<select onchange="updateMaterialParte(' + i + ',\'unidad\',this.value)">' + optU(l.unidad || 'ud') + '</select>' +
      '<button type="button" class="btn btn-outline btn-sm btn-icon" title="Quitar" onclick="removeMaterialParte(' + i + ')"><i class="fas fa-trash"></i></button>' +
    '</div>';
  }).join('');
  return rows || '<small style="color:var(--text-muted)">Sin material. Pulsa «Añadir material» si has usado alguno.</small>';
}

// Al elegir un artículo del desplegable: fija descripción y articuloId
window.updateMaterialParteDeLista = function(i, sel){
  const st = window.__materialesParte;
  const line = st?.lines[i];
  if(!line) return;
  line.descripcion = sel.value;
  const art = (st.almacen || []).find(a => a.nombre === sel.value);
  line.articuloId = art ? art.id : '';
  const hint = document.getElementById('pt_mat_hint_' + i);
  if(hint) hint.textContent = art ? 'Stock en almacén: ' + (Number(art.stock) || 0) : '';
};

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
  const clientes = await dbGetAll('clientes');
  const vehiculos = await dbGetAll('vehiculos');
  const almacenArticulos = await dbGetAll('almacen').catch(() => []);
  // Tipos de puerta para el select (mismo catálogo que Almacén/Manuales)
  window.__tiposPuertaCache = await window.TiposPuerta.filasDB();
  window.__materialesParte = {
    almacen: almacenArticulos,
    __almacenOrdenado: [...almacenArticulos].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' })),
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
  // Fotos del albarán (desplazamiento interno): guardadas + nuevas
  window.__fotosAlbaran = Array.isArray(p.fotosAlbaran) ? p.fotosAlbaran.filter(f => typeof f === 'string' && /^(data:image\/|https?:)/.test(f)) : [];

  const form = '<div class="form-grid">' +
    // Tipo de parte: normal (con cliente) o interno (desplazamiento sin cliente)
    '<div class="form-group full"><label>Tipo de parte</label>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<label style="display:flex;align-items:center;gap:6px;font-weight:600"><input type="radio" name="pt_tipo_parte" id="pt_tipo_normal" value="normal" ' + (!p.interno ? 'checked' : '') + '> Trabajo normal</label>' +
        '<label style="display:flex;align-items:center;gap:6px;font-weight:600"><input type="radio" name="pt_tipo_parte" id="pt_tipo_interno" value="interno" ' + (p.interno ? 'checked' : '') + '> Desplazamiento interno</label>' +
      '</div>' +
      '<small style="color:var(--text-muted);display:block;margin-top:4px">"Desplazamiento interno" = recogida de material, taller, formación... No se asigna a ningún cliente y sus KMs cuentan para el vehículo.</small>' +
    '</div>' +
    '<div class="form-group"><label>ID</label><input id="pt_id" value="' + escapeHtml(nextId) + '"></div>' +
    '<div class="form-group normal-only"><label>Cliente *</label><select id="pt_cliente">' +
      '<option value="">— Seleccionar</option>' +
      (clienteSinFicha ? '<option value="__incidencia__" data-nombre="' + escapeHtml(clienteNombrePrefill) + '" selected>' + escapeHtml(clienteNombrePrefill) + ' (incidencia)</option>' : '') +
      clientes.map(c => '<option value="' + c.id + '" data-nombre="' + escapeHtml(c.nombre) + '" ' + (String(clienteIdSeleccionado) === String(c.id) ? 'selected' : '') + '>' + escapeHtml(c.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group normal-only"><label>Tipo Puerta *</label><select id="pt_tipo">' +
      '<option value="">— Seleccionar tipo —</option>' +
      (window.__tiposPuertaCache || []).map(t => '<option value="' + escapeHtml(t.nombre) + '" ' + (String(p.tipoPuerta || '') === String(t.nombre) ? 'selected' : '') + '>' + escapeHtml(t.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group"><label>Técnico asignado</label><select id="pt_empleado">' +
      '<option value="">— Sin asignar</option>' +
      empleados.map(e => '<option value="' + e.id + '" data-nombre="' + escapeHtml(e.nombre) + '" ' + (p.empleadoId === e.id ? 'selected' : '') + '>' + escapeHtml(e.nombre) + '</option>').join('') +
    '</select></div>' +
    '<div class="form-group full normal-only" id="pt_puertas_group"><label>Puertas a revisar</label>' +
      '<div id="pt_puertas_lista" style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px">' +
        '<small style="color:var(--text-muted)">Selecciona cliente, ubicación y tipo de puerta para ver las puertas</small>' +
      '</div>' +
      '<small style="color:var(--text-muted);display:block;margin-top:4px">Marca con el check ✔ la(s) puerta(s) con intervención: son las que aparecen destacadas en el PDF.</small>' +
    '</div>' +
    '<div class="form-group normal-only"><label>Ubicación del trabajo</label><select id="pt_ubicacion"><option value="">-- Selecciona un cliente primero --</option></select></div>' +
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
    '<div class="form-group"><label>Fecha</label><input id="pt_fecha" type="date" value="' + (p.fecha || getToday()) + '"></div>' +
    '<div class="form-group full normal-only"><label>Material utilizado</label>' +
      '<div id="pt_materiales">' + materialesParteHtml() + '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-top:6px" onclick="addMaterialParte()"><i class="fas fa-plus"></i> Añadir material</button>' +
    '</div>' +
    '<div class="form-group full normal-only"><label>Fotos (máx. ' + MAX_FOTOS_PARTE + ')</label>' +
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
              '<button type="button" class="btn btn-outline btn-sm" id="pt_sello_borrar" style="' + (window.__selloClienteParte ? '' : 'display:none') + '"><i class="fas fa-trash"></i> Quitar</button>' +
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
  });
  aplicarModo();

  // --- Desplazamiento interno: origen/destino (oficina, proveedores y clientes) + kms automáticos ---
  (async () => {
    try {
      const [proveedores, todosClientes] = await Promise.all([dbGetAll('proveedores').catch(() => []), dbGetAll('clientes')]);
      const selOrigen = document.getElementById('pt_int_origen');
      const selDestino = document.getElementById('pt_int_destino');
      if (!selOrigen || !selDestino) return;

      // Punto = { id, nombre, lat, lng }. OFICINA (Ceuti) siempre disponible como origen.
      const puntos = [
        { id: '__oficina__', nombre: '🏠 Oficina (Ceuti)', lat: OFICINA.lat, lng: OFICINA.lng },
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
        const kms = Math.round(real != null ? real : kmEntreCoordenadas(a.lat, a.lng, b.lat, b.lng) * getFactorCarretera());
        input.value = kms || '';
        input.readOnly = true;
        if (hint) hint.textContent = '✅ ' + kms + ' km (trayecto de salida). Si el vehículo vuelve al origen, crea otro desplazamiento de vuelta.';
      };
      selOrigen.addEventListener('change', recalcKms);
      selDestino.addEventListener('change', recalcKms);
      recalcKms();
    } catch (e) { console.warn('[parte interno] init:', e); }
  })();

  setTimeout(async ()=>{
    const sel = document.getElementById('pt_cliente');
    if (sel) {
      sel.addEventListener('change', async () => {
        if (sel.value === '__incidencia__') {
          document.getElementById('pt_kms').value = '';
          document.getElementById('pt_dni_cliente').value = '';
          document.getElementById('pt_ubicacion').innerHTML = '<option value="">Sin ficha de cliente</option>';
          document.getElementById('pt_puertas').innerHTML = '<option value="">Sin ficha de cliente</option>';
          return;
        }
        const cli = await dbGet('clientes', sel.value);

        // --- Cálculo de KMs ---
        if (cli?.lat && cli?.lng) {
          const kms = await kmIdaVuelta({ lat: cli.lat, lng: cli.lng });
          document.getElementById('pt_kms').value = kms;
          showToast('Kms calculados: ' + kms + ' (ida+vuelta)');
        } else {
          document.getElementById('pt_kms').value = '';
          showToast('📍 Cliente sin coordenadas: rellena los KMs a mano y geolocalízalo en Clientes', 'error');
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
    return;
  }
  let puertas = [];
  try{ puertas = await dbGetByIndex('puertas', 'clienteId', clienteId); }catch(_){ }
  // Filtrar por ubicación (si está elegida) y por tipo de puerta
  if(ubicacionId) puertas = puertas.filter(pu => !pu.ubicacionId || String(pu.ubicacionId) === String(ubicacionId));
  if(tipoPuerta) puertas = puertas.filter(pu => String(pu.tipo || '') === String(tipoPuerta));
  if(!puertas.length){
    lista.innerHTML = '<small style="color:var(--text-muted)">' +
      (tipoPuerta ? 'Este cliente no tiene puertas de tipo "' + escapeHtml(tipoPuerta) + '"' : 'Este cliente no tiene puertas dadas de alta') + '</small>';
    return;
  }
  const prev = intervenidasPrev || p_prevPuertas || [];
  lista.innerHTML = puertas.map(pu => {
    const marcada = prev.includes(pu.id);
    return '<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:14px">' +
      '<input type="checkbox" class="pt-puerta-chk" data-pid="' + escapeHtml(pu.id) + '" ' + (marcada ? 'checked' : '') + '> ' +
      '<span>' + escapeHtml(pu.nombre) + (pu.tipo ? ' <small style="color:var(--text-muted)">(' + escapeHtml(pu.tipo) + ')</small>' : '') + '</span>' +
    '</label>';
  }).join('');
};
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
      emailSecundario: emailSec || null,
      selloCliente: window.__selloClienteParte || null
    };

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
//  VEHÍCULOS
window.render_vehiculos = async function(el){
  const vehiculos = await dbGetAll('vehiculos');
  el.innerHTML =
    '<div class="page-header"><div><h2>Vehículos</h2><p>Gestión de flota de trabajo</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showVehiculoForm()"><i class="fas fa-plus"></i> Nuevo Vehículo</button></div></div>'+
    '<div class="stats-grid">'+
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
window.render_almacen = async function(el){
  const tipos = await window.TiposPuerta.filasDB();
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  el.innerHTML =
    '<div class="page-header"><div><h2>Almacén</h2><p>Control de stock y artículos</p></div>'+
    '<div class="header-actions">'+
      '<button class="btn btn-primary" onclick="showArticuloForm()"><i class="fas fa-plus"></i> Nuevo Artículo</button>'+
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
  tiposMapCache = tiposMap;
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
      campo('Categoría', (a.categoria||a.tipoPuerta)?escapeHtml(tiposMapCache.get(a.categoria||a.tipoPuerta)||a.categoria||''):'')+
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
window.render_configuracion = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Configuración</h2><p>Ajustes de la aplicación</p></div></div>'+
    '<div class="config-menu">'+
      '<div class="config-menu-item" draggable="true" onclick="navigateTo(\'empleados\')">'+
        '<div class="config-menu-icon"><i class="fas fa-users-gear"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Empleados</h3>'+
          '<p>Gestión de empleados y asignación de roles</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="navigateTo(\'vehiculos\')">'+
        '<div class="config-menu-icon"><i class="fas fa-truck"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Vehículos</h3>'+
          '<p>Gestión de la flota y mantenimiento</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" onclick="navigateTo(\'almacen\')">'+
        '<div class="config-menu-icon"><i class="fas fa-boxes-stacked"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Almacén</h3>'+
          '<p>Inventario y control de stock</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="navigateTo(\'informesKms\')">'+
        '<div class="config-menu-icon"><i class="fas fa-chart-pie"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Informes KMs</h3>'+
          '<p>Reportes de kilometraje de vehículos</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="navigateTo(\'cadenas\')">'+
        '<div class="config-menu-icon"><i class="fas fa-route"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Cadenas y Rutas</h3>'+
          '<p>Gestión de cadenas de mantenimiento</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigApariencia()">'+
        '<div class="config-menu-icon"><i class="fas fa-palette"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Apariencia</h3>'+
          '<p>Color de la aplicación y de los botones</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openProveedores()">'+
        '<div class="config-menu-icon"><i class="fas fa-boxes-packing"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Puntos de recogida (proveedores)</h3>'+
          '<p>Empresas y talleres donde recoges material — origen/destino de desplazamientos internos</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigCorreo()">'+
        '<div class="config-menu-icon"><i class="fas fa-envelope"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Configuración de Correo</h3>'+
          '<p>Configurar servidor SMTP para envío de emails</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigEmpresa()">'+
        '<div class="config-menu-icon"><i class="fas fa-building"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Datos de empresa</h3>'+
          '<p>Identidad y contacto para los PDF de presupuestos</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigAprobacionOnline()">'+
        '<div class="config-menu-icon"><i class="fas fa-file-circle-check"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Aprobación online de presupuestos</h3>'+
          '<p>El cliente acepta desde su móvil y se genera el albarán y el material a pedir</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigFactorCarretera()">'+
        '<div class="config-menu-icon"><i class="fas fa-road"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Factor carretera</h3>'+
          '<p>Ajuste de kms reales en partes de trabajo cuando la geolocalización falla</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigSync()">'+
        '<div class="config-menu-icon"><i class="fas fa-sync"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Sincronización de Datos</h3>'+
          '<p>Exportar, importar y borrar datos</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigPlantillasMedidas()">'+
        '<div class="config-menu-icon"><i class="fas fa-ruler-combined"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Plantillas de medidas</h3>'+
          '<p>Plantillas para anotar mediciones (incl. lonas puertas rápidas) y añadir las tuyas</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="navigateTo(\'manuales\')">'+
        '<div class="config-menu-icon"><i class="fas fa-book"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Manuales</h3>'+
          '<p>Manuales técnicos por tipo de puerta y avería</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openAndroidNavigationHelp()">'+
        '<div class="config-menu-icon"><i class="fas fa-bars-staggered"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Botones de navegación Android</h3>'+
          '<p>Cómo activar Atrás, Inicio y Recientes</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigAndroid()">'+
        '<div class="config-menu-icon"><i class="fas fa-mobile"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Instalación en Android</h3>'+
          '<p>Instrucciones para instalar como PWA</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigInfo()">'+
        '<div class="config-menu-icon"><i class="fas fa-info-circle"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Información</h3>'+
          '<p>Versión y detalles de la aplicación</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
    '</div>';

  initConfigMenuDrag(el);
};

/* ── Drag & drop del menú de configuración ───────────────────────── */
function initConfigMenuDrag(el){
  const container = el.querySelector('.config-menu');
  if(!container) return;

  // Aplicar el orden guardado por el usuario (antes de nada visible)
  applyConfigOrder(container);

  // Asegurar draggable en todos los items (por si acaso)
  container.querySelectorAll('.config-menu-item').forEach(item => {
    item.setAttribute('draggable', 'true');
  });

  // CSS inyectado una sola vez
  if(!document.getElementById('config-drag-style')){
    const s = document.createElement('style');
    s.id = 'config-drag-style';
    s.textContent =
      '.config-menu-item.dragging{opacity:.5;box-shadow:0 6px 18px rgba(0,0,0,.18)}'+
      '.config-menu-item[draggable="true"]{-webkit-user-select:none;user-select:none;touch-action:pan-y}';
    document.head.appendChild(s);
  }

  if(container.dataset.dragBound === '1') return;
  container.dataset.dragBound = '1';

  let draggedItem = null;
  // Touch: estado del arrastre táctil (long-press)
  let touchState = null; // { item, startY, startX, moved, timer, startY2, suppressClick }

  const getAfterElement = (y) => {
    const items = Array.from(container.querySelectorAll('.config-menu-item:not(.dragging)'));
    return items.find(child => {
      const box = child.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
  };

  container.addEventListener('dragstart', e => {
    const item = e.target.closest('.config-menu-item');
    if(!item) return;
    draggedItem = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });

  container.addEventListener('dragover', e => {
    if(!draggedItem) return;
    e.preventDefault();                        // ← crítico: sin esto → icono prohibido
    e.dataTransfer.dropEffect = 'move';        // ← cambia cursor a "mover"
    const after = getAfterElement(e.clientY);
    if(after == null) container.appendChild(draggedItem);
    else if(after !== draggedItem) container.insertBefore(draggedItem, after);
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
  });

  container.addEventListener('dragend', () => {
    if(!draggedItem) return;
    draggedItem.classList.remove('dragging');
    saveConfigOrder(container);
    draggedItem = null;
  });

  /* ─ Soporte táctil (móvil): mantén pulsado 400 ms y arrastra ─ */
  if(!container.dataset.touchBound){
    container.dataset.touchBound = '1';

    const touchCSS = document.createElement('style');
    touchCSS.textContent = '.config-menu-item.touch-dragging{transform:scale(1.02);box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:50;position:relative}' +
      '.config-menu.dragging-touch{overflow:visible}';
    document.head.appendChild(touchCSS);

    const startLongPress = (e) => {
      const t = e.touches[0];
      if(!t) return;
      const item = e.target.closest('.config-menu-item');
      if(!item) return;
      touchState = { item, startY: t.clientY, startX: t.clientX, moved: false, timer: null, active: false };
      touchState.timer = setTimeout(() => {
        if(!touchState) return;
        touchState.active = true;
        touchState.item.classList.add('touch-dragging');
        if(navigator.vibrate) navigator.vibrate(30);
        showToast('Arrastra la opción y suéltala donde quieras', 'info');
      }, 400);
    };

    const moveTouch = (e) => {
      if(!touchState) return;
      const t = e.touches[0];
      if(!t) return;
      if(!touchState.active){
        // Cancelar si mueve el dedo antes de activarse (scroll normal)
        if(Math.abs(t.clientY - touchState.startY) > 12 || Math.abs(t.clientX - touchState.startX) > 12){
          clearTimeout(touchState.timer);
          touchState = null;
        }
        return;
      }
      e.preventDefault(); // evita el scroll mientras arrastra
      touchState.moved = true;
      const after = getAfterElement(t.clientY);
      if(after == null) container.appendChild(touchState.item);
      else if(after !== touchState.item) container.insertBefore(touchState.item, after);
    };

    const endTouch = () => {
      if(!touchState) return;
      clearTimeout(touchState.timer);
      const wasDrag = touchState.active && touchState.moved;
      if(touchState.active){
        touchState.item.classList.remove('touch-dragging');
        if(wasDrag) saveConfigOrder(container);
      }
      touchState = null;
      if(wasDrag){
        container.__suppressClick = true;
        setTimeout(() => { container.__suppressClick = false; }, 200);
      }
    };

    container.addEventListener('touchstart', startLongPress, { passive: true });
    container.addEventListener('touchmove', moveTouch, { passive: false });
    container.addEventListener('touchend', endTouch);
    container.addEventListener('touchcancel', endTouch);

    // Evita que el click navegue tras un arrastre táctil
    container.addEventListener('click', (e) => {
      if(container.__suppressClick){
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}

/* ── Persistencia del orden ──────────────────────────────────────── */
const CONFIG_ORDER_KEY = 'valgom_config_menu_order';

function saveConfigOrder(container){
  const order = Array.from(container.querySelectorAll('.config-menu-item'))
    .map(item => item.getAttribute('onclick') || '')
    .filter(Boolean);
  localStorage.setItem(CONFIG_ORDER_KEY, JSON.stringify(order));
}

function applyConfigOrder(container){
  const raw = localStorage.getItem(CONFIG_ORDER_KEY);
  if(!raw) return;
  let order;
  try { order = JSON.parse(raw); } catch(_) { return; }
  if(!Array.isArray(order)) return;

  const map = new Map(
    Array.from(container.querySelectorAll('.config-menu-item'))
      .map(item => [item.getAttribute('onclick'), item])
  );
  order.forEach(key => {
    const item = map.get(key);
    if(item){ container.appendChild(item); map.delete(key); }
  });
}

const COMPANY_SETTINGS_KEY='valgom_company_settings';
const COMPANY_SETTINGS_DEFAULTS={trade_name:'Valgom',legal_name:'',tax_id:'',address:'',phone:'',email:'',website:'',id:null};

window.getCompanySettings=async function(){
  let cached={};
  try{cached=JSON.parse(localStorage.getItem(COMPANY_SETTINGS_KEY)||'{}');}catch(error){}
  try{
    if(!window.authState?.user) return {...COMPANY_SETTINGS_DEFAULTS,...cached};
    const {data,error}=await window.supabaseDB.from('company_settings')
      .select('trade_name,legal_name,tax_id,address,phone,email,website,id')
      .maybeSingle();
    if(error) throw error;
    const settings={
      trade_name: data?.trade_name ?? '',
      legal_name: data?.legal_name ?? '',
      tax_id: data?.tax_id ?? '',
      address: data?.address ?? '',
      phone: data?.phone ?? '',
      email: data?.email ?? '',
      website: data?.website ?? '',
      id: data?.id ?? null
    };
    localStorage.setItem(COMPANY_SETTINGS_KEY,JSON.stringify(settings));
    return settings;
  }catch(error){
    console.warn('[Configuración] No se pudieron cargar los datos de empresa:',error.message);
    return {...COMPANY_SETTINGS_DEFAULTS,...cached};
  }
};

window.isValidCifCif = function(nif) {
  const text = String(nif || '').trim();
  if (!text) return false;

  if (/^\d{8}[A-Z]$/.test(text)) {
    const numeros = text.slice(0, 8);
    const letra = text.slice(8).toUpperCase();
    const validos = 'TRWAGMYFPDXBNJZSQVHLCKET';
    const control = validos.charAt(numeros % 23);
    return letra === control;
  }

  if (/^[A-Z]\d{7}$/.test(text)) {
    const ultima = text.slice(-1);
    const numeros = text.slice(0, 7);
    const letra = text.slice(0, 1).toUpperCase();
    const validos = 'TRWAGMYFPDXBNJZSQVHLCKET';
    const control = validos.charAt((numeros + letra).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 23);
    return ultima === control;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)) {
    return true;
  }

  if (/^[A-Z]\d{1,2}[A-Z]$/.test(text)) {
    const letra1 = text[0];
    const numeros = text.slice(1, 3);
    const control = text[3];
    const validos = 'TRWAGMYFPDXBNJZSQVHLCKET';
    const controlChar = validos.charAt((letra1 + numeros).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 23);
    if (controlChar !== control) return false;
  }

  if (/^[XYZ]\d{7}[A-Z]$/.test(text)) {
    const letra = text[0];
    const numeros = text.slice(1, 8);
    const control = text[8];
    const validos = 'TRWAGMYFPDXBNJZSQVHLCKET';
    const controlChar = validos.charAt((letra + numeros).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 23);
    if (controlChar !== control) return false;
    if (letra === 'X') return control === 'K' || control === 'L' || control === 'T';
    if (letra === 'Y') return control === 'A' || control === 'I' || control === 'E';
    if (letra === 'Z') return control === 'B' || control === 'C' || control === 'D';
  }

  return false;
};

window.openConfigEmpresa=async function(){
  if(!window.isAdmin?.()) return showToast('Solo un administrador puede modificar los datos de empresa','error');
  const settings=await window.getCompanySettings();
  openModal('Datos de empresa',`
    <p style="margin-bottom:12px;color:var(--text-muted)">Estos datos aparecerán en la tarjeta de empresa de los PDF de presupuestos.</p>
    <form id="companySettingsForm" class="form-grid">
      <div class="form-group"><label for="company_trade_name">Nombre comercial</label><input id="company_trade_name" maxlength="100" value="${escapeHtml(settings.trade_name)}" placeholder="Valgom"></div>
      <div class="form-group"><label for="company_legal_name">Razón social</label><input id="company_legal_name" maxlength="150" value="${escapeHtml(settings.legal_name)}"></div>
      <div class="form-group"><label for="company_tax_id">CIF / NIF</label><input id="company_tax_id" maxlength="24" value="${escapeHtml(settings.tax_id)}"></div>
      <div class="form-group"><label for="company_phone">Teléfono</label><input id="company_phone" type="tel" maxlength="40" value="${escapeHtml(settings.phone)}"></div>
      <div class="form-group"><label for="company_email">Email</label><input id="company_email" type="email" maxlength="150" value="${escapeHtml(settings.email)}"></div>
      <div class="form-group"><label for="company_website">Web</label><input id="company_website" type="url" maxlength="180" value="${escapeHtml(settings.website)}" placeholder="https://"></div>
      <div class="form-group full"><label for="company_address">Dirección</label><input id="company_address" maxlength="220" value="${escapeHtml(settings.address)}"></div>
    </form>`,
    `<div class="company-footer-btns"><button type="button" class="btn btn-primary" onclick="closeModal()">Cancelar</button>
    <button type="button" class="btn btn-primary" id="saveCompanySettings"><i class="fas fa-save"></i> Guardar datos</button>
    <button type="button" class="btn btn-primary" id="btn-clearCompanySettings"><i class="fas fa-trash"></i>     Borrar datos</button></div>`);
  document.getElementById('btn-clearCompanySettings').addEventListener('click',()=>{
    const form=document.getElementById('companySettingsForm');
    form.querySelectorAll('input').forEach(input=>{input.value='';});
    form.querySelector('#company_trade_name').focus();
  });
  document.getElementById('saveCompanySettings').addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    const form=document.getElementById('companySettingsForm');
    const next={
      trade_name:form.querySelector('#company_trade_name').value.trim()||'Valgom',
      legal_name:form.querySelector('#company_legal_name').value.trim(),
      tax_id:form.querySelector('#company_tax_id').value.trim(),
      address:form.querySelector('#company_address').value.trim(),
      phone:form.querySelector('#company_phone').value.trim(),
      email:form.querySelector('#company_email').value.trim(),
      website:form.querySelector('#company_website').value.trim()
    };
    const errors=[];

    if (!next.tax_id) errors.push('El CIF / NIF es obligatorio.');
    else if (!window.isValidCifCif(next.tax_id)) errors.push('El CIF / NIF no es válido.');

    if (!next.trade_name) errors.push('El nombre comercial es obligatorio.');
    if (!next.legal_name) errors.push('La razón social es obligatoria.');
    if (!next.address) errors.push('La dirección es obligatoria.');
    if (!next.phone) errors.push('El teléfono es obligatorio.');
    if (!next.email) errors.push('El correo electrónico es obligatorio.');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) errors.push('Introduce un correo electrónico válido.');
    if (!next.website) errors.push('El sitio web es obligatorio.');
    else if (!/^https?:\/\/.+\..+$/.test(next.website)) errors.push('Introduce una URL válida, por ejemplo https://www.miempresa.com.');

    if (errors.length) {
      const message=errors.join(' ');
      showToast(message, 'error');
      button.disabled=false;
      return;
    }

    try{
      const now=new Date().toISOString();
      const payload={
        trade_name: next.trade_name,
        legal_name: next.legal_name,
        tax_id: next.tax_id,
        address: next.address,
        phone: next.phone,
        email: next.email,
        website: next.website,
        updated_at: now,
        updated_by: window.authState.user?.id || null,
        created_by: window.authState?.user?.id || window.authState?.employee?.id || null
      };

      if (payload.created_by == null) {
        payload.created_by = payload.updated_by;
      }

      if (payload.updated_by == null) {
        payload.updated_by = payload.created_by;
      }
      let existingId=null;

      const { data: existing, error: selectError } = await window.supabaseDB.from('company_settings')
        .select('id')
        .maybeSingle();

      if (selectError?.message?.includes('Could not find the table')) {
        console.warn('[Configuración] company_settings no existe aún.');
      } else if (selectError) {
        console.warn('[Configuración] No se pudo buscar la configuración existente:', selectError.message);
      } else if (existing && existing.id) {
        existingId = existing.id;
      }

      if (!existingId) {
        let generateId = null;

        try {
          const { data: newIdData, error: newIdError } = await window.supabaseDB.from('company_settings')
            .select('id')
            .maybeSingle();

          if (!newIdError && newIdData && newIdData.id) {
            existingId = newIdData.id;
          }
        } catch (error) {
          console.warn('[Configuración] No se pudo obtener un id existente:', error.message);
        }

        if (!existingId) {
          try {
            if (window.crypto && window.crypto.randomUUID) {
              existingId = window.crypto.randomUUID();
            } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
              existingId = crypto.randomUUID();
            } else {
              existingId = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
            }
          } catch (error) {
            console.warn('[Configuración] No se pudo generar un id:', error.message);
          }
        }
      }

      const { error: upsertError } = await window.supabaseDB.from('company_settings').upsert({
        id: existingId,
        trade_name: payload.trade_name,
        legal_name: payload.legal_name,
        tax_id: payload.tax_id,
        address: payload.address,
        phone: payload.phone,
        email: payload.email,
        website: payload.website,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        created_by: payload.created_by,
        updated_by: payload.updated_by
      });

      if (upsertError) throw upsertError;

      localStorage.setItem(COMPANY_SETTINGS_KEY,JSON.stringify(payload));
      closeModal();
      showToast('Datos de empresa guardados');
    }catch(error){
      console.error('[Configuración] No se pudieron guardar los datos de empresa:',error);
      showToast('No se pudieron guardar. Comprueba que ejecutaste SUPABASE_DATOS_EMPRESA.sql: '+error.message,'error');
      button.disabled=false;
    }
  });
};

// ---- Configuración: Puntos de recogida (proveedores) ----
window.openProveedores = async function(){
  const lista = await dbGetAll('proveedores').catch(() => []);
  const rows = lista.length ? lista.map(v =>
    '<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface-alt)">' +
      '<div style="flex:1;min-width:0"><strong>' + escapeHtml(v.nombre) + '</strong>' +
        (v.direccion ? '<br><small style="color:var(--text-muted)">' + escapeHtml(v.direccion) + '</small>' : '') +
        (v.lat ? '<br><small style="color:#16a34a">📍 Con coordenadas — kms automáticos</small>' : '<br><small style="color:#f59e0b">⚠️ Sin coordenadas — kms manuales</small>') +
      '</div>' +
      '<button class="btn btn-outline btn-sm btn-icon" title="Editar" onclick="editProveedor(\'' + escapeHtml(v.id) + '\')"><i class="fas fa-pen"></i></button>' +
      '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="confirmDelete(\'Punto ' + escapeHtml(v.nombre) + '\', ()=>deleteProveedor(\'' + escapeHtml(v.id) + '\'))"><i class="fas fa-trash"></i></button>' +
    '</div>').join('')
    : '<p style="color:var(--text-muted)">Aún no hay puntos de recogida. Añade proveedores, talleres o delegaciones donde recojas material.</p>';

  openModal('Puntos de recogida (proveedores)',
    rows + '<button class="btn btn-primary" style="margin-top:10px" onclick="editProveedor()"><i class="fas fa-plus"></i> Añadir punto</button>',
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

window.editProveedor = async function(id){
  const v = id ? await dbGet('proveedores', id) : {};
  const form = '<div class="form-grid">' +
    '<div class="form-group full"><label>Nombre *</label><input id="pv_nom" value="' + escapeHtml(v.nombre || '') + '" placeholder="Ej: Suministros López (material puertas)"></div>' +
    '<div class="form-group full"><label>Dirección completa</label>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<input id="pv_dir" style="flex:1" value="' + escapeHtml(v.direccion || '') + '" placeholder="Calle, número, ciudad">' +
        '<button type="button" class="btn btn-outline btn-sm" id="pv_geo" title="Buscar coordenadas de la dirección"><i class="fas fa-location-crosshairs"></i> Geolocalizar</button>' +
      '</div>' +
      '<small id="pv_geo_hint" style="color:var(--text-muted);display:block;margin-top:4px">Pulsa «Geolocalizar» para rellenar las coordenadas automáticamente desde la dirección.</small>' +
    '</div>' +
    '<div class="form-group"><label>Latitud</label><input id="pv_lat" class="only-num-dec" value="' + (v.lat ?? '') + '" placeholder="Auto"></div>' +
    '<div class="form-group"><label>Longitud</label><input id="pv_lng" class="only-num-dec" value="' + (v.lng ?? '') + '" placeholder="Auto"></div>' +
    '<div class="form-group full"><label>Notas</label><input id="pv_notas" value="' + escapeHtml(v.notas || '') + '" placeholder="Horario, contacto, acceso..."></div>' +
  '</div>';

  openModal(id ? 'Editar punto de recogida' : 'Nuevo punto de recogida', form,
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" id="pv_save"><i class="fas fa-save"></i> Guardar</button>');

  // Geolocalizar: usa la función robusta geocodificar() de utils.js (degradación progresiva)
  document.getElementById('pv_geo').addEventListener('click', async () => {
    const dir = document.getElementById('pv_dir').value.trim();
    const hint = document.getElementById('pv_geo_hint');
    if (!dir) { showToast('Escribe primero la dirección', 'error'); return; }
    const btn = document.getElementById('pv_geo');
    btn.disabled = true;
    hint.textContent = '⏳ Buscando la dirección…';
    hint.style.color = '';
    try {
      const geo = await geocodificar(dir);
      if (!geo) {
        hint.textContent = '⚠️ No se encontró la dirección. Prueba con menos datos (ej: "Calle Mayor, Molina de Segura") o rellena las coordenadas a mano.';
        hint.style.color = 'var(--warning,#eab308)';
        return;
      }
      document.getElementById('pv_lat').value = geo.lat.toFixed(6);
      document.getElementById('pv_lng').value = geo.lng.toFixed(6);
      if (geo.precision === 'municipio') {
        hint.textContent = '🟡 Aproximado (centro de ' + geo.nombreCompleto.split(',').slice(-3, -2).join('') + '): mueve las coordenadas si el punto exacto importa, o añade más detalle a la dirección y vuelve a geolocalizar.';
      } else {
        hint.textContent = '✅ Encontrada: ' + geo.nombreCompleto;
      }
    } catch (e) {
      hint.textContent = '⚠️ No se pudo buscar (¿sin conexión?). Rellena las coordenadas a mano si las tienes.';
      hint.style.color = 'var(--warning,#eab308)';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('pv_save').addEventListener('click', async () => {
    const nombre = document.getElementById('pv_nom').value.trim();
    if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
    const latRaw = document.getElementById('pv_lat').value.trim();
    const lngRaw = document.getElementById('pv_lng').value.trim();
    try {
      const data = {
        id: v.id || ('PRV-' + Date.now()),
        nombre,
        direccion: document.getElementById('pv_dir').value.trim(),
        lat: latRaw ? parseFloat(latRaw) : null,
        lng: lngRaw ? parseFloat(lngRaw) : null,
        notas: document.getElementById('pv_notas').value.trim()
      };
      await dbPut('proveedores', data);
      closeModal();
      showToast('Punto de recogida guardado');
      window.openProveedores();
    } catch (e) {
      console.error('[proveedores] guardar:', e);
      showToast('No se pudo guardar: ' + (e.message || e), 'error');
    }
  });
};

window.deleteProveedor = async function(id){
  await dbDelete('proveedores', id);
  showToast('Punto de recogida eliminado');
  window.openProveedores();
};

// ---- Configuración: Apariencia (color de la app y de los botones) ----
window.openConfigApariencia = function(){
  const settings = (window.getBrandSettings && window.getBrandSettings()) || {};
  const state = {
    primary: settings.primary || 'verde',
    btnText: typeof settings.btnText === 'string' ? settings.btnText : ''
  };
  const initial = { ...state };

  const palette = [
    {name:'Verde',   v:'verde',   css:'#16a34a'},
    {name:'Naranja', v:'naranja', css:'#f97316'},
    {name:'Naranja oscuro', v:'naranja-oscuro', css:'#c2410c'},
    {name:'Azul',    v:'azul',    css:'#2563eb'},
    {name:'Rojo',    v:'rojo',    css:'#dc2626'},
    {name:'Violeta', v:'violeta', css:'#8b5cf6'},
    {name:'Teal',    v:'teal',    css:'#14b8a6'},
    {name:'Gris',    v:'#64748b', css:'#64748b'},
    {name:'Rosa',    v:'#ec4899', css:'#ec4899'},
    {name:'Índigo',  v:'#6366f1', css:'#6366f1'},
    {name:'Cian',    v:'#06b6d4', css:'#06b6d4'},
    {name:'Lima',    v:'#84cc16', css:'#84cc16'},
    {name:'Ámbar',   v:'#f59e0b', css:'#f59e0b'},
    {name:'Fucsia',  v:'#d946ef', css:'#d946ef'},
    {name:'Marrón',  v:'#92400e', css:'#92400e'},
    {name:'Azul oscuro', v:'#1e3a8a', css:'#1e3a8a'}
  ];
  const textPalette = [
    {name:'Por defecto', v:''},
    {name:'Blanco', v:'#ffffff', css:'#ffffff'},
    {name:'Negro',  v:'#111111', css:'#111111'},
    {name:'Gris',   v:'#94a3b8', css:'#94a3b8'},
    {name:'Naranja',v:'#f97316', css:'#f97316'},
    {name:'Naranja oscuro', v:'#c2410c', css:'#c2410c'},
    {name:'Amarillo', v:'#facc15', css:'#facc15'},
    {name:'Verde',  v:'#22c55e', css:'#22c55e'},
    {name:'Azul',   v:'#3b82f6', css:'#3b82f6'},
    {name:'Rojo',   v:'#ef4444', css:'#ef4444'},
    {name:'Violeta',v:'#a78bfa', css:'#a78bfa'},
    {name:'Cian',   v:'#22d3ee', css:'#22d3ee'}
  ];

  const swatchBtn = (p, sel, attr) => {
    const bg = p.css || 'linear-gradient(135deg,#fff 55%,#e2e8f0 55%)';
    return '<button type="button" class="ap-swatch" data-' + attr + '="' + p.v + '" title="' + p.name + '"' +
      ' style="width:36px;height:36px;border-radius:50%;cursor:pointer;background:' + bg + ';' +
      'border:3px solid ' + (sel ? 'var(--primary-light)' : 'transparent') + ';' +
      'box-shadow:0 0 0 1px rgba(148,163,184,.45);position:relative;overflow:hidden;flex-shrink:0">' +
      (sel ? '<i class="fas fa-check" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;text-shadow:0 0 4px rgba(0,0,0,.8);pointer-events:none"></i>' : '') +
      '</button>';
  };

  const previewHTML = () =>
    '<div class="ap-preview" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface-alt);padding:12px;border-radius:10px;border:1px solid var(--border)">' +
      '<span style="font-size:13px;color:var(--text-muted)">Vista previa:</span>' +
      '<button class="btn btn-primary" type="button">Guardar</button>' +
      '<button class="btn btn-outline" type="button">Cancelar</button>' +
      '<button class="btn btn-danger" type="button">Eliminar</button>' +
    '</div>';

  openModal('Apariencia', `
    <h3 style="margin-bottom:8px;font-size:1rem">Color principal de la aplicación</h3>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Afecta a fondos de botones, menús y acentos.</p>
    <div class="ap-palette" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px"></div>

    <h3 style="margin-bottom:8px;font-size:1rem">Color del texto de los botones</h3>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">"Por defecto" usa el color del tema (blanco en oscuro, oscuro en claro).</p>
    <div class="ap-textpalette" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px"></div>

    <div class="ap-preview-wrap">${previewHTML()}</div>

    <h3 style="margin:18px 0 8px;font-size:1rem">Icono de la aplicación</h3>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Sube una foto o logo: se redimensiona automáticamente a los tamaños necesarios (192/512 px, cuadrado) y sustituye al actual.</p>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <img id="apIconPreview" src="" alt="" style="display:none;width:72px;height:72px;border-radius:16px;object-fit:cover;border:1px solid var(--border);background:#fff">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-outline btn-sm" id="apIconUploadBtn"><i class="fas fa-image"></i> Subir icono</button>
        <button type="button" class="btn btn-outline btn-sm" id="apIconResetBtn" style="display:none"><i class="fas fa-rotate-left"></i> Restaurar original</button>
      </div>
      <small id="apIconEstado" style="color:var(--text-muted)"></small>
    </div>
    <input type="file" id="apIconInput" accept="image/*" style="display:none">
  `,
  '<button class="btn btn-outline ap-close">Cerrar</button>');

  const body = document.getElementById('modalBody');

  const renderSwatches = () => {
    body.querySelector('.ap-palette').innerHTML = palette.map(p => swatchBtn(p, p.v === state.primary, 'brand')).join('');
    body.querySelector('.ap-textpalette').innerHTML = textPalette.map(p => swatchBtn(p, p.v === state.btnText, 'btntext')).join('');
  };
  renderSwatches();

  const applyPreview = () => {
    // Aplica colores a la app en vivo SIN guardar todavía
    const c = (window.__brandColorsMap && window.__brandColorsMap[state.primary]) || null;
    const root = document.documentElement;
    if (c) {
      root.style.setProperty('--primary', c.primary);
      root.style.setProperty('--primary-dark', c.dark);
      root.style.setProperty('--primary-light', c.light);
    } else {
      root.style.setProperty('--primary', state.primary);
      root.style.setProperty('--primary-dark', shadeHex(state.primary, -18));
      root.style.setProperty('--primary-light', shadeHex(state.primary, 18));
    }
    // Color de letra de botones en vivo
    let st = document.getElementById('brand-btn-text-style');
    if (!st) { st = document.createElement('style'); st.id = 'brand-btn-text-style'; document.head.appendChild(st); }
    st.textContent = state.btnText
      ? ('.btn,.btn-primary,.btn-secondary,.btn-success,.btn-outline,.btn-danger,.btn-sm,.btn-icon,.icon-btn{color:' + state.btnText + '!important}' +
         '.btn i,.btn svg,.icon-btn i,.icon-btn svg{color:' + state.btnText + '!important}')
      : '';
    // Vista previa: refrescar botones del modal footer y preview
    const footer = document.getElementById('modalFooter');
    if (footer) footer.querySelectorAll('.btn').forEach(b => { /* el CSS !important se encarga */ });
  };

  body.addEventListener('click', e => {
    const brand = e.target.closest('[data-brand]');
    const txt = e.target.closest('[data-btntext]');
    if (brand) { state.primary = brand.dataset.brand; renderSwatches(); applyPreview(); }
    else if (txt) { state.btnText = txt.dataset.btntext; renderSwatches(); applyPreview(); }
  });

  // Cerrar confirmado: guardar y limpiar el revert para que closeModal no restaure
  document.querySelector('.ap-close')?.addEventListener('click', () => {
    window.setBrandColor(state.primary);
    window.setButtonTextColor(state.btnText);
    window.__apRevert = null;
    closeModal();
    showToast('Apariencia guardada', 'success');
  });

  // Al cerrar por la X, por clic fuera o por Escape → descartar cambios y restaurar
  window.__apRevert = () => {
    applyPreview.restore(initial);
  };
  applyPreview.restore = (s) => {
    const c = (window.__brandColorsMap && window.__brandColorsMap[s.primary]) || null;
    const root = document.documentElement;
    if (c) {
      root.style.setProperty('--primary', c.primary);
      root.style.setProperty('--primary-dark', c.dark);
      root.style.setProperty('--primary-light', c.light);
    } else {
      root.style.setProperty('--primary', s.primary);
      root.style.setProperty('--primary-dark', shadeHex(s.primary, -18));
      root.style.setProperty('--primary-light', shadeHex(s.primary, 18));
    }
    let st = document.getElementById('brand-btn-text-style');
    if (st) st.textContent = s.btnText
      ? ('.btn{color:' + s.btnText + '!important}.btn i,.btn svg{color:' + s.btnText + '!important}')
      : '';
  };

  // Aplicar el estado guardado al abrir
  applyPreview();

  // ── Icono de la aplicación ──
  (function initIconUpload(){
    const ICON_KEY = 'ap_custom_icon';
    const ICON_ORIG = 'icons/icon-512.png';
    const preview = document.getElementById('apIconPreview');
    const resetBtn = document.getElementById('apIconResetBtn');
    const estado = document.getElementById('apIconEstado');
    const input = document.getElementById('apIconInput');
    const custom = localStorage.getItem(ICON_KEY);
    const activo = custom || ICON_ORIG + '?v=' + Date.now();
    if (preview) {
      preview.src = custom || ICON_ORIG;
      preview.style.display = '';
    }
    if (resetBtn) resetBtn.style.display = custom ? '' : 'none';

    function dibujarCentrado(img, lado){
      const c = document.createElement('canvas');
      c.width = lado; c.height = lado;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,lado,lado);
      const esc = Math.max(lado/img.width, lado/img.height);
      const w = img.width*esc, h = img.height*esc;
      ctx.drawImage(img, (lado-w)/2, (lado-h)/2, w, h);
      return c.toDataURL('image/png');
    }

    async function aplicarIcono(dataUrl){
      estado.textContent = 'Procesando…';
      const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=dataUrl; });
      const d512 = dibujarCentrado(img, 512);
      const d192 = dibujarCentrado(img, 192);
      localStorage.setItem(ICON_KEY, d512);
      localStorage.setItem(ICON_KEY+'_192', d192);
      // Aplicar en vivo a todos los <img> de icono y favicons
      document.querySelectorAll('.logo img').forEach(el=>{ el.src = d512; });
      let link = document.querySelector('link[rel="icon"]');
      if(!link){ link=document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
      link.href = d192;
      const apple = document.querySelector('link[rel="apple-touch-icon"]');
      if(apple) apple.href = d192;
      if (preview){ preview.src = d512; }
      if (resetBtn) resetBtn.style.display = '';
      estado.textContent = '✅ Icono actualizado. En Android/instalada, reinstala o espera a que la PWA refresque para verlo en el launcher.';
      showToast('Icono actualizado','success');
    }

    document.getElementById('apIconUploadBtn')?.addEventListener('click', ()=> input.click());
    input?.addEventListener('change', async ()=>{
      const f = input.files?.[0]; input.value='';
      if(!f) return;
      try{
        const dataUrl = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
        await aplicarIcono(dataUrl);
      }catch(e){
        console.error('[Icono]', e);
        estado.textContent = 'No se pudo procesar la imagen';
        showToast('Error al procesar el icono','error');
      }
    });
    resetBtn?.addEventListener('click', ()=>{
      localStorage.removeItem(ICON_KEY);
      localStorage.removeItem(ICON_KEY+'_192');
      document.querySelectorAll('.logo img').forEach(el=>{ el.src = ICON_ORIG; });
      let link = document.querySelector('link[rel="icon"]');
      if(link) link.href = ICON_ORIG;
      const apple = document.querySelector('link[rel="apple-touch-icon"]');
      if(apple) apple.href = 'icons/apple-touch-icon.png';
      if (preview){ preview.src = ICON_ORIG; }
      resetBtn.style.display = 'none';
      estado.textContent = 'Icono original restaurado';
      showToast('Icono restaurado','success');
    });
  })();
};

window.openConfigCorreo = function(){
  openModal('Configuración de Correo', `
    <p style="margin-bottom:12px;color:var(--text-muted)">Configura los datos del servidor SMTP para enviar correos electrónicos desde la aplicación.</p>
    <div class="form-grid">
      <div class="form-group"><label for="smtp_host">Servidor SMTP (Host)</label><input type="text" id="smtp_host" placeholder="smtp.gmail.com"></div>
      <div class="form-group"><label for="smtp_port">Puerto</label><input type="number" id="smtp_port" placeholder="587"></div>
      <div class="form-group"><label for="smtp_user">Usuario / Email</label><input type="email" id="smtp_user" placeholder="tucorreo@gmail.com"></div>
      <div class="form-group"><label for="smtp_password">Contraseña</label><input type="password" id="smtp_password" placeholder="Tu contraseña o app password"></div>
      <div class="form-group full"><label for="smtp_secure"><input type="checkbox" id="smtp_secure"> Usar SSL/TLS</label></div>
    </div>
    <div style="display:flex;gap:12px;margin-top:16px">
      <button class="btn btn-primary" onclick="guardarConfigCorreo()"><i class="fas fa-save"></i> Guardar configuración</button>
      <button class="btn btn-outline" onclick="probarConexionCorreo()"><i class="fas fa-paper-plane"></i> Probar conexión</button>
    </div>
    <div id="correo-status" style="margin-top:12px;font-size:13px;"></div>`,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
  cargarConfigCorreo();
};

// ---- Configuración: Factor carretera configurable ----
window.openConfigFactorCarretera = function(){
  const actual = (window.getFactorCarretera && window.getFactorCarretera()) || 1.3;
  openModal('Factor carretera', `
    <p style="margin-bottom:12px;color:var(--text-muted)">Multiplicador que se aplica a la distancia en línea recta cuando no hay conexión o falla la geolocalización, para estimar los kilómetros reales por carretera en los partes de trabajo.</p>
    <div class="form-group">
      <label>Factor carretera</label>
      <input id="fc_valor" type="number" class="only-num-dec" step="0.05" min="0.5" max="5" value="${actual}">
      <small style="color:var(--text-muted);display:block;margin-top:4px">Ejemplo: 1.3 significa que a 10 km en línea recta se le cuentan 13 km reales. Por defecto: 1.3</small>
    </div>`,
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="guardarFactorCarretera()"><i class="fas fa-save"></i> Guardar</button>');
};

window.guardarFactorCarretera = function(){
  const v = parseFloat(document.getElementById('fc_valor').value);
  if(!v || v < 0.5 || v > 5){ showToast('Introduce un factor válido entre 0.5 y 5', 'error'); return; }
  localStorage.setItem('autopuerta_factor_carretera', String(v));
  showToast('Factor carretera guardado: ' + v);
  closeModal();
};

window.openConfigSync = function(){
  openModal('Sincronización de Datos', `
    <p style="margin-bottom:12px;color:var(--text-muted)">Los datos se sincronizan online con Supabase y se mantienen en caché local para consulta. La exportación e importación JSON están disponibles como respaldo adicional.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="exportAllData()"><i class="fas fa-download"></i> Exportar datos (JSON)</button>
      <button class="btn btn-outline" onclick="document.getElementById('importFile').click()"><i class="fas fa-upload"></i> Importar datos</button>
      <input type="file" id="importFile" accept=".json" style="display:none" onchange="importAllData(event)">
      <button class="btn btn-danger" onclick="confirmDelete('Todos los datos de la aplicación', ()=>clearAllData())"><i class="fas fa-trash"></i> Borrar todos los datos</button>
    </div>`,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

window.openConfigAndroid = function(){
  openModal('Instalación en Android', `
    <p style="color:var(--text-muted);font-size:14px">Abre esta app en <strong>Chrome para Android</strong> y pulsa el menú <strong>< → "Instalar aplicación"</strong>. Quedará como una app nativa en tu escritorio y funcionará sin conexión.</p>`,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

window.openAndroidNavigationHelp = function(){
  openModal('Botones de navegación Android', `
    <p style="line-height:1.5">Para mostrar <strong>Atrás, Inicio y Recientes</strong>, cambia la navegación desde los ajustes del teléfono. La aplicación no puede modificar ese ajuste del sistema.</p>
    <ol style="padding-left:22px;margin-top:14px;line-height:1.8">
      <li>Abre <strong>Ajustes</strong> en el teléfono.</li>
      <li>Busca <strong>Navegación del sistema</strong> o <strong>Barra de navegación</strong>.</li>
      <li>Selecciona <strong>Navegación con 3 botones</strong>.</li>
    </ol>
    <p style="margin-top:12px;color:var(--text-muted);font-size:13px">El nombre y la ubicación de esta opción pueden variar según el fabricante.</p>`,
    '<button class="btn btn-primary" onclick="closeModal()">Entendido</button>');
};

window.openConfigInfo = function(){
  openModal('Información', `
    <p><strong>Valgom</strong> v1.0</p>
    <p style="color:var(--text-muted);margin-top:4px">PWA · IndexedDB · Funciona offline · Exporta PDF</p>`,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

// ═══ Plantillas de medidas/presupuesto (Configuración → submenu) ═══
// Usa las MISMAS plantillas que la pantalla de Presupuestos (icono marcador)
window.openConfigPlantillasMedidas = async function(){
  let listaHtml = '';
  let total = 0;
  try {
    const list = window.getPlantillasPresupuestoPublic ? window.getPlantillasPresupuestoPublic() : [];
    total = list.length;
    listaHtml = list.map(t=>
      '<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px;border:1px solid var(--border);border-radius:8px">'+
        '<div><strong>'+escapeHtml(t.nombre)+'</strong>'+
        '<div style="font-size:12px;color:var(--text-muted)">'+((t.lineItems||[]).length)+' conceptos</div></div>'+
        '<div style="display:flex;gap:6px">'+
          '<button class="btn btn-primary btn-sm" onclick="usarPlantillaMedida(\''+escapeHtml(String(t.id))+'\')"><i class="fas fa-ruler"></i> Usar</button>'+
          '<button class="btn btn-outline btn-sm btn-icon" title="Eliminar" onclick="borrarPlantillaDesdeConfig(\''+escapeHtml(String(t.id))+'\')"><i class="fas fa-trash"></i></button>'+
        '</div>'+
      '</div>'
    ).join('') || '<p style="color:var(--text-muted)">No hay plantillas todavía. Crea una desde Presupuestos con el icono de marcador, o pulsa "Nueva plantilla".</p>';
  } catch(e){
    console.error('[Plantillas] listado:', e);
    listaHtml = '<p style="color:var(--text-muted)">No se pudieron cargar las plantillas: '+escapeHtml(e.message||'')+'</p>';
  }
  openModal('📏 Plantillas ('+total+')',
    '<div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow:auto">'+listaHtml+'</div>'+
    '<p style="margin-top:10px;font-size:12px;color:var(--text-muted)">Son las mismas plantillas de la pantalla de Presupuestos: sirven para crear un presupuesto rápido o para tomar mediciones.</p>',
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>'+
    '<button class="btn btn-primary" onclick="showPresupuestoForm()"><i class="fas fa-plus"></i> Nueva plantilla</button>'+
    '<button class="btn btn-primary" onclick="usarPlantillaMedida()"><i class="fas fa-ruler"></i> Tomar medidas</button>'+
    '<button class="btn btn-primary" onclick="MEDICIONES.registro()"><i class="fas fa-clipboard-list"></i> Mediciones</button>');
};

window.borrarPlantillaDesdeConfig = function(tid){
  if(window.setPlantillasPresupuestoPublic){
    window.setPlantillasPresupuestoPublic((window.getPlantillasPresupuestoPublic?window.getPlantillasPresupuestoPublic():[]).filter(x=>x.id!==tid));
    openConfigPlantillasMedidas();
  }
};

window.usarPlantillaMedida = async function(idPlantilla){
  closeModal();
  try{
    if(idPlantilla){
      const t = (window.getPlantillasPresupuestoPublic?window.getPlantillasPresupuestoPublic():[]).find(x=>String(x.id)===String(idPlantilla));
      if(t){ showPresupuestoForm(null, t); return; }
    }
    // Tomar medidas: SIEMPRE el sistema unificado MEDICIONES (v3), igual que la hoja de presupuestos
    if(window.MEDICIONES && typeof window.MEDICIONES.abrir === 'function'){
      const clientes = await dbGetAll('clientes');
      await window.MEDICIONES.abrir({ clientes });
    } else {
      showToast('El sistema de mediciones no está disponible','error');
    }
  }catch(e){
    console.error('[Plantillas] usar:', e);
    showToast('No disponible: '+ (e.message||e), 'error');
  }
};

// Página «Tomar medidas»: la usan los técnicos (no tienen acceso a Configuración)
window.render_medidas = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2><i class="fas fa-ruler-combined"></i> Tomar medidas</h2>'+
    '<p>Elige el tipo de puerta, rellena la hoja sobre el esquema y se envía a administración.</p></div></div>'+
    '<div class="card"><div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap">'+
      '<button class="btn btn-primary" style="flex:1;min-width:220px;padding:18px 16px;font-size:16px" onclick="usarPlantillaMedida()"><i class="fas fa-ruler"></i> Nueva medición</button>'+
      '<button class="btn btn-outline" style="flex:1;min-width:220px;padding:18px 16px;font-size:16px" onclick="MEDICIONES.registro()"><i class="fas fa-clipboard-list"></i> Ver mediciones</button>'+
    '</div></div>';
};

// Funciones para configuración de correo
window.cargarConfigCorreo = async function(){
  try {
    const configStr = localStorage.getItem('smtp_config');
    if (configStr) {
      const config = JSON.parse(configStr);
      document.getElementById('smtp_host').value = config.host || '';
      document.getElementById('smtp_port').value = config.port || '';
      document.getElementById('smtp_user').value = config.user || '';
      document.getElementById('smtp_password').value = config.password || '';
      document.getElementById('smtp_secure').checked = config.secure || false;
      mostrarEstadoCorreo('Configuración cargada correctamente', 'success');
    }
  } catch (e) {
    console.warn('No hay configuración de correo guardada');
  }
};

window.guardarConfigCorreo = async function(){
  const config = {
    host: document.getElementById('smtp_host').value.trim(),
    port: parseInt(document.getElementById('smtp_port').value) || 587,
    user: document.getElementById('smtp_user').value.trim(),
    password: document.getElementById('smtp_password').value,
    secure: document.getElementById('smtp_secure').checked
  };

  if (!config.host || !config.user || !config.password) {
    mostrarEstadoCorreo('Por favor completa todos los campos obligatorios', 'error');
    return;
  }

  try {
    localStorage.setItem('smtp_config', JSON.stringify(config));
    mostrarEstadoCorreo('Configuración guardada correctamente', 'success');
    showToast('Configuración de correo guardada');
  } catch (e) {
    mostrarEstadoCorreo('Error al guardar: ' + e.message, 'error');
  }
};

window.probarConexionCorreo = async function(){
  const config = {
    host: document.getElementById('smtp_host').value.trim(),
    port: parseInt(document.getElementById('smtp_port').value) || 587,
    user: document.getElementById('smtp_user').value.trim(),
    password: document.getElementById('smtp_password').value,
    secure: document.getElementById('smtp_secure').checked
  };

  if (!config.host || !config.user || !config.password) {
    mostrarEstadoCorreo('Por favor completa todos los campos antes de probar', 'error');
    return;
  }

  mostrarEstadoCorreo('Probando conexión...', 'info');

  try {
    // Guardar temporalmente la configuración
    localStorage.setItem('smtp_config', JSON.stringify(config));

    // Llamar al servidor local para probar la conexión
    const response = await fetch('/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'test',
        config: config
      })
    });

    const result = await response.json();

    if (result.success) {
      mostrarEstadoCorreo('Conexión exitosa al servidor SMTP', 'success');
      showToast('Prueba de conexión exitosa');
    } else {
      mostrarEstadoCorreo('Error: ' + (result.error || 'Fallo en la conexión'), 'error');
    }
  } catch (e) {
    mostrarEstadoCorreo('Error al probar conexión: ' + e.message, 'error');
  }
};

function mostrarEstadoCorreo(mensaje, tipo) {
  const statusDiv = document.getElementById('correo-status');
  if (!statusDiv) return;

  const colores = {
    success: '#16a34a',
    error: '#dc2626',
    info: '#2563eb'
  };

  statusDiv.style.color = colores[tipo] || '#6b7280';
  statusDiv.textContent = mensaje;
}

// Función helper para enviar correos desde cualquier parte de la app
window.enviarCorreo = async function(toEmail, subject, body) {
  try {
    const configStr = localStorage.getItem('smtp_config');
    if (!configStr) {
      throw new Error('No hay configuración de correo. Configúrala en Configuración.');
    }

    const config = JSON.parse(configStr);

    const response = await fetch('/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'send',
        config: config,
        to: toEmail,
        subject: subject,
        body: body
      })
    });

    const result = await response.json();

    if (result.success) {
      showToast('Email enviado correctamente', 'success');
      return true;
    } else {
      throw new Error(result.error || 'Error al enviar email');
    }
  } catch (e) {
    showToast('Error al enviar email: ' + e.message, 'error');
    return false;
  }
};

window.exportAllData = async function(){
  const data = {};
  for(const store of Object.keys(TABLA)){
    if(store === 'syncQueue' || store === 'config') continue;
    data[store] = await dbGetAll(store);
  }
  downloadJSON(data,'autopuerta_backup_'+getToday()+'.json');
  showToast('Datos exportados correctamente');
};

window.importAllData = async function(e){
  const file = e.target.files[0];
  if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    let count = 0;
    for(const [store,items] of Object.entries(data)){
      if(!Array.isArray(items)) continue;
      for(const item of items){
        if(item.id){
          await dbPut(store,{...item,updatedAt:new Date().toISOString()});
          count++;
        }
      }
    }
    showToast(count+' registros importados');
    navigateTo(currentPage);
  }catch(err){
    showToast('Error al importar: '+err.message,'error');
  }
};

window.clearAllData = function(){
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = ()=>{
    dbInstance = null;
    showToast('Datos borrados. La app se recargará.');
    setTimeout(()=>location.reload(),1500);
  };
};

window.__fotosParte = {};

const MAX_FOTOS_PARTE = 4;

window.addFotosParte = async function(input){
  const files = Array.from(input.files || []);
  input.value = '';
  const list = window.__fotosParte.form;
  for(const file of files){
    if(list.length >= MAX_FOTOS_PARTE){ showToast('Máximo ' + MAX_FOTOS_PARTE + ' fotos','error'); break; }
    try{ list.push(await compressDoticsPhoto(file)); }
    catch(e){ showToast('No se pudo procesar una foto','error'); }
  }
  actualizarMiniaturas();
};

function actualizarMiniaturas(){
  const thumbs = document.getElementById('pt_fotos_thumbs');
  if(!thumbs) return;
  thumbs.innerHTML = (window.__fotosParte.form||[]).map((f,i)=>
    '<div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)">'+
      '<img class="inc-foto" src="'+f+'" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in">'+
      '<button type="button" onclick="eliminarFotoParte('+i+')" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:12px;">-</button>'+
    '</div>'
  ).join('');
}

window.eliminarFotoParte = function(idx){
  window.__fotosParte.form.splice(idx, 1);
  actualizarMiniaturas();
};

// ── Fotos del albarán (solo desplazamientos internos) ──
window.addFotosAlbaran = async function(input){
  const files = Array.from(input.files || []);
  input.value = '';
  if(!window.__fotosAlbaran) window.__fotosAlbaran = [];
  for(const file of files){
    if(window.__fotosAlbaran.length >= MAX_FOTOS_PARTE){ showToast('Máximo ' + MAX_FOTOS_PARTE + ' fotos de albarán','error'); break; }
    try{ window.__fotosAlbaran.push(await compressDoticsPhoto(file)); }
    catch(e){ showToast('No se pudo procesar la foto del albarán','error'); }
  }
  actualizarMiniaturasAlbaran();
};

function actualizarMiniaturasAlbaran(){
  const thumbs = document.getElementById('pt_albaran_thumbs');
  if(!thumbs) return;
  thumbs.innerHTML = (window.__fotosAlbaran || []).map((f,i)=>
    '<div style="position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--primary)">'+
      '<img class="inc-foto" src="'+f+'" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in">'+
      '<button type="button" onclick="eliminarFotoAlbaran('+i+')" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:12px;">×</button>'+
    '</div>'
  ).join('');
}

window.eliminarFotoAlbaran = function(idx){
  if(!window.__fotosAlbaran) return;
  window.__fotosAlbaran.splice(idx, 1);
  actualizarMiniaturasAlbaran();
};

// Sube una foto (data URL) a Storage y devuelve su URL pública; null si no se pudo
window.uploadParteFoto = async function(dataUrl){
  const userId = window.authState?.user?.id;
  if(!userId || !navigator.onLine || !window.supabaseDB) return null;
  try{
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const rand = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()).replace(/-/g,'');
    const path = userId + '/' + rand + '.' + ext;
    const { error } = await window.supabaseDB.storage.from('parte-fotos')
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if(error) throw error;
    return window.supabaseDB.storage.from('parte-fotos').getPublicUrl(path).data.publicUrl;
  }catch(e){
    console.warn('[Fotos] No se pudo subir la foto:', e.message || e);
    return null;
  }
};

window.uploadRevisionFoto = async function(dataUrl){
  const userId = window.authState?.user?.id;
  if(!userId || !navigator.onLine || !window.supabaseDB) return null;
  try{
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const rand = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()).replace(/-/g,'');
    const path = userId + '/' + rand + '.' + ext;
    const { error } = await window.supabaseDB.storage.from('revision-fotos')
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if(error) throw error;
    return window.supabaseDB.storage.from('revision-fotos').getPublicUrl(path).data.publicUrl;
  }catch(e){
    console.warn('[Fotos Revisión] No se pudo subir la foto:', e.message || e);
    return null;
  }
};

// Convierte a URL las fotos en base64; si alguna no se puede subir se conserva en base64
window.guardarFotosParte = async function(){
  const out = [];
  for(const f of (window.__fotosParte.form || [])){
    if(typeof f === 'string' && f.startsWith('data:image/')) out.push(await window.uploadParteFoto(f) || f);
    else out.push(f);
  }
  return out;
};

// Convierte a URL las fotos de revisión en base64; si alguna no se puede subir se conserva en base64
window.guardarFotosRevision = async function(){
  const draft = window.__hiperberReviewDraft;
  if(!draft || !draft.stores) return;

  for(const store of draft.stores){
    if(!store.puertas) continue;
    for(const door of store.puertas){
      if(!door.hallazgoFotos) continue;
      const processedFotos = [];
      for(const foto of door.hallazgoFotos){
        if(typeof foto === 'string' && foto.startsWith('data:image/')){
          processedFotos.push(await window.uploadRevisionFoto(foto) || foto);
        }else{
          processedFotos.push(foto);
        }
      }
      door.hallazgoFotos = processedFotos;
    }
  }
};

//  EMPLEADOS
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

window.render_estadisticas = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2>Estadísticas</h2><p>Análisis de actividad y rendimiento</p></div></div>'+
    '<div class="stats-grid">'+
      '<div class="stat-card"><div class="stat-value" id="stat-total">0</div><div class="stat-label">Total Partes</div></div>'+
      '<div class="stat-card"><div class="stat-value" id="stat-horas">0</div><div class="stat-label">Horas Totales</div></div>'+
    '</div>'+
    '<div class="card" style="margin-top:20px"><h3 style="margin-bottom:15px">Partes por Mes</h3><canvas id="chartMeses"></canvas></div>'+
    '<div class="card" style="margin-top:20px"><h3 style="margin-bottom:15px">Partes por Técnico</h3><canvas id="chartTecnicos"></canvas></div>'+
    '<div class="card" style="margin-top:20px"><h3 style="margin-bottom:15px">Partes por Tipo de Puerta</h3><canvas id="chartTipos"></canvas></div>';

  await pintarEstadisticas();
};

window.pintarEstadisticas = async function(){
  const partes = await dbGetAll('partesTrabajo');

  // Contadores generales
  const total = partes.length;
  const horasTotal = partes.reduce((sum,p)=> sum + (parseFloat(p.horas)||0), 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-horas').textContent = horasTotal.toFixed(1);

  // Destruir gráficos anteriores si existen
  await window.ensureChart();
  const charts = ['chartMeses','chartTecnicos','chartTipos'];
  charts.forEach(id=>{
    const existing = Chart.getChart(id);
    if(existing) existing.destroy();
  });

  // Partes por Mes
  const meses = {};
  partes.forEach(p=>{
    const mes = p.fecha ? p.fecha.substring(0,7) : 'Sin fecha';
    meses[mes] = (meses[mes]||0) + 1;
  });
  const mesesOrdenados = Object.keys(meses).sort();
  const chartCv=document.getElementById('chartMeses');
  const primaryC=getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#16a34a';
  const g8=chartCv.getContext('2d').createLinearGradient(0,0,0,chartCv.clientHeight||220);
  g8.addColorStop(0,primaryC+'55');g8.addColorStop(1,primaryC+'00');
  new Chart(chartCv, {
    type: 'line',
    data: {
      labels: mesesOrdenados,
      datasets: [{
        label: 'Partes',
        data: mesesOrdenados.map(m=>meses[m]),
        borderColor: primaryC,
        backgroundColor: g8,
        fill: true,
        tension: 0.3
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Partes por Técnico
  const tecnicos = {};
  partes.forEach(p=>{
    const nombre = p.empleadoNombre || 'Sin asignar';
    tecnicos[nombre] = (tecnicos[nombre]||0) + 1;
  });
  const tecnicosOrdenados = Object.keys(tecnicos).sort((a,b)=>tecnicos[b]-tecnicos[a]);
  new Chart(document.getElementById('chartTecnicos'), {
    type: 'bar',
    data: {
      labels: tecnicosOrdenados,
      datasets: [{
        label: 'Partes',
        data: tecnicosOrdenados.map(t=>tecnicos[t]),
        backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899']
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Partes por Tipo de Puerta
  const tipos = {};
  partes.forEach(p=>{
    const tipo = p.tipoPuerta || 'Sin especificar';
    tipos[tipo] = (tipos[tipo]||0) + 1;
  });
  const tiposOrdenados = Object.keys(tipos).sort((a,b)=>tipos[b]-tipos[a]);
  new Chart(document.getElementById('chartTipos'), {
    type: 'doughnut',
    data: {
      labels: tiposOrdenados,
      datasets: [{
        data: tiposOrdenados.map(t=>tipos[t]),
        backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']
      }]
    },
    options: { responsive: true }
  });
};
//  UTILIDADES KMS POR JORNADA   ? van ANTES, a nivel global
// BASE_CEUTI y FACTOR_CARETERA ya están definidas en utils.js — no duplicar
const OFICINA = BASE_CEUTI;   // alias para no tocar el resto del código de pages.js

function kmEntreCoordenadas(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function calcularKmJornada(partesDelDia){
  if (!partesDelDia.length) return null; // null = "no puedo calcular" -> activará fallback

  // Los partes internos (recogidas, taller...) no tienen cliente: sus KMs se suman aparte.
  const normales = partesDelDia.filter(p => !p.interno);
  const kmsInternos = partesDelDia.filter(p => p.interno).reduce((acc, p) => acc + (Number(p.kms) || 0), 0);
  if (!normales.length) return kmsInternos || null; // solo internos ese día: suma directa

  // Recoger coordenadas sNICAS de cliente del día
  const coordsMap = {};
  for (const p of normales) {
    if (coordsMap[p.clienteId]) continue;
    const cli = await dbGet('clientes', p.clienteId);
    if (!cli?.lat || !cli?.lng) return null;      // falta coord -> señal de fallback
    coordsMap[p.clienteId] = { lat: cli.lat, lng: cli.lng };
  }

  const puntos = Object.values(coordsMap);

  // Distancia de ruta real entre dos puntos (OSRM) con fallback haversine × FACTOR_CARETERA
  const kmRuta = async (a, b) => {
    const real = await kmRutaReal(a.lat, a.lng, b.lat, b.lng).catch(() => null);
    if (real != null) return real;
    return kmEntreCoordenadas(a.lat, a.lng, b.lat, b.lng) * getFactorCarretera();
  };

  // Un solo destino: oficina -> cliente -> oficina (ida y vuelta)
  if (puntos.length === 1) {
    const c = puntos[0];
    const ida = await kmRuta(OFICINA, c);
    return Math.round(ida * 2) + kmsInternos; // ida + vuelta por el mismo camino
  }

  // Varios destinos: vecino más cercano desde la oficina y vuelta
  const pendientes = [...puntos];
  let actual = OFICINA, total = 0;
  while (pendientes.length) {
    let mejorIdx = 0, mejorDist = Infinity;
    const dists = await Promise.all(pendientes.map(c => kmRuta(actual, c)));
    dists.forEach((d, i) => { if (d < mejorDist) { mejorDist = d; mejorIdx = i; } });
    total += mejorDist;
    actual = pendientes.splice(mejorIdx, 1)[0];
  }
  total += await kmRuta(actual, OFICINA);
  return Math.round(total) + kmsInternos;
}

//  RECALCULO DE KMS DE VEHÍCULOS
window.normMatricula = m => String(m || '').replace(/\s/g, '').toUpperCase();

/** Partes con la matrícula resuelta a la del vehículo (también los antiguos, que la guardaban vacía). */
window.cargarPartesConMatricula = async function(vehiculos) {
  vehiculos = vehiculos || await dbGetAll('vehiculos');
  const partes = await dbGetAll('partesTrabajo');
  return partes.map(p => {
    const ref = p.matricula || p.vehiculoId;
    const veh = vehiculos.find(v => String(v.id) === String(ref) || normMatricula(v.matricula) === normMatricula(ref));
    return veh ? { ...p, matricula: veh.matricula } : p;
  });
};

/** Recalcular KMs de un vehículo por matrícula. */
window.recalcVehicleKms = async function(matricula, silent) {
  if (!matricula) return null;
  try {
    const vehiculos = await dbGetAll('vehiculos');
    const vehiculo = vehiculos.find(v => normMatricula(v.matricula) === normMatricula(matricula));
    if (!vehiculo) {
      console.warn('[recalcVehicleKms] Vehículo no encontrado:', matricula);
      return null;
    }
    const partes = (await cargarPartesConMatricula(vehiculos))
      .filter(p => p.matricula === vehiculo.matricula);

    // Base fija en km_inicial (si no existe, se toma el km actual una sola vez)
    let kmIncial = vehiculo.kmInicial ?? vehiculo.km_inicial;
    if (kmIncial == null) {
      kmIncial = Number(vehiculo.km) || 0;
      vehiculo.kmInicial = kmIncial;
    }
    kmIncial = Number(kmIncial);

    // Agrupar partes por fecha (jornadas)
    const jornadas = {};
    partes.filter(p => Number(p.kms) > 0).forEach(p => {
      (jornadas[p.fecha] = jornadas[p.fecha] || []).push(p);
    });

    // Calcular desplazamientos por jornada
    let sumaDesplazamientos = 0;
    let diasSinCoord = 0;
    for (const lista of Object.values(jornadas)) {
      const kmDia = await calcularKmJornada(lista);
      if (kmDia === null) {
        // Fallback: suma directa de partes, redondeada a múltiplo de 10
        const sumaBruta = lista.reduce((acc, p) => acc + Number(p.kms || 0), 0);
        sumaDesplazamientos += Math.ceil(sumaBruta / 10) * 10;
        diasSinCoord++;
      } else {
        sumaDesplazamientos += kmDia;
      }
    }

    // Resultado final
    const nuevoKm = kmIncial + sumaDesplazamientos;

    const cambioBase = (vehiculo.kmInicial ?? vehiculo.km_inicial) !== kmIncial || Number(vehiculo.km) !== nuevoKm;
    if (cambioBase && window.isAdmin?.() !== false) {
      vehiculo.km = nuevoKm;
      vehiculo.kmInicial = kmIncial;
      delete vehiculo.km_inicial;
      await dbPut('vehiculos', vehiculo);
    }

    if (diasSinCoord > 0 && !silent) {
      // Solo informativo en depuración (con conexión se auto-corrige al relocalizar); no satura la consola en producción
      console.log(`[recalcVehicleKms] ${matricula}: ${diasSinCoord} jornada(s) sin coordenadas -> suma directa redondeada.`);
    }

    return vehiculo;
  } catch (err) {
    console.error('[recalcVehicleKms]', err);
    if (!silent) showToast('Error al recalcular KMs: ' + err.message, 'error');
    return null;
  }
};

/** Recalcula TODA la flota (llamada puntual). */
window.recalcAllFleetKms = async function(silent) {
  const vehiculos = await dbGetAll('vehiculos');
  for (const v of vehiculos) {
    if (v.matricula) await recalcVehicleKms(v.matricula, silent);
  }
  if (!silent) showToast('KMs de flota recalculados');
};
// ============================================================
// INFORME DIARIO DE FLOTA
// ============================================================

/**
 * Genera un informe de todos los vehículos y sus partes del día.
 * Devuelve objeto con resumen + detalle por vehículo.
 */
/** Hora (HH:MM) de entrada/salida de un parte: usa el dato guardado o, si no existe, las marcas de creación/cierre. */
function horaParte(p, tipo) {
  const guardada = tipo === 'entrada' ? (p.horaEntrada ?? p.hora_entrada) : (p.horaSalida ?? p.hora_salida);
  if (guardada) return String(guardada).slice(0, 5);
  const marca = tipo === 'entrada' ? (p.createdAt ?? p.createdat) : (p.updatedAt ?? p.updatedat);
  if (!marca) return '';
  const d = new Date(marca);
  return isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

const fechaLocalHoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

window.generateDailyReport = async function(dateStr = fechaLocalHoy()) {
  try {
    // 1. Obtener TODOS los partes del día (una sola query por índice compuesto)
    const partesHoy = (await cargarPartesConMatricula()).filter(p => String(p.fecha || '').slice(0, 10) === dateStr);

    // 2. Obtener todos los vehículos
    const vehiculos = await dbGetAll('vehiculos');

    // 3. Agrupar partes por matrícula
    const porMatricula = {};
    partesHoy.forEach(p => {
      if (!porMatricula[p.matricula]) porMatricula[p.matricula] = [];
      porMatricula[p.matricula].push(p);
    });

    // 4. Construir detalle por vehículo
    const detalle = await Promise.all(vehiculos.map(async v => {
      const partes = (porMatricula[v.matricula] || [])
        .sort((a, b) => (horaParte(a, 'entrada') || '99:99').localeCompare(horaParte(b, 'entrada') || '99:99'));

      const entradas = partes.map(p => horaParte(p, 'entrada')).filter(Boolean).sort();
      const salidas = partes.map(p => horaParte(p, 'salida')).filter(Boolean).sort();
      const primeraEntrada = entradas[0] || '—';
      const ultimaSalida = salidas[salidas.length - 1] || '—';

      // Mismo criterio que el recálculo de km del vehículo: ruta real por jornada, o suma redondeada
      const conKms = partes.filter(p => Number(p.kms) > 0);
      let kmsRecorridos = 0;
      if (conKms.length) {
        const kmRuta = await calcularKmJornada(conKms).catch(() => null);
        kmsRecorridos = kmRuta ?? Math.ceil(conKms.reduce((acc, p) => acc + Number(p.kms || 0), 0) / 10) * 10;
      }

      return {
        matricula: v.matricula,
        modelo: `${v.marca || ''} ${v.modelo || ''}`.trim() || '—',
        cliente: partes[0]?.clienteNombre || '—',
        num_partes: partes.length,
        primera_entrada: primeraEntrada,
        ultima_salida: ultimaSalida,
        kms_recorridos: kmsRecorridos,
        km_total: Number(v.km) || 0,
        tecnico: partes.map(p => p.empleadoNombre).filter(Boolean)[0] || '—',
        estado: partes.length ? 'o. Activo' : 's Inactivo'
      };
    }));

    // 5. Construir informe completo
    const informe = {
      fecha: dateStr,
      generado: new Date().toLocaleString('es-ES'),
      resumen: {
        total_partes: partesHoy.length,
        vehiculos_activos: Object.keys(porMatricula).length,
        vehiculos_flota: vehiculos.length,
        vehiculos_inactivos: vehiculos.length - Object.keys(porMatricula).length
      },
      detalle: detalle
    };

    // 6. Persistir informe (store 'informes')
    const idInforme = `inf_${dateStr}`;
    await dbPut('informes', { id: idInforme, ...informe });

    return informe;
  } catch(err) {
    console.error('[generateDailyReport]', err);
    showToast('Error al generar informe diario', 'error');
    return null;
  }
};

/**
 * Renderiza el informe diario en el dashboard.
 */
window.render_daily_report = async function(containerId = 'dailyReportContainer') {
  const informe = await generateDailyReport();
  if (!informe) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  // Destruir gráfico previo (evita "Canvas is already in use")
  await window.ensureChart();
  const existingChart = Chart.getChart('chartKmsDia');
  if (existingChart) existingChart.destroy();

  // Filtrar solo vehículos con KMs para el gráfico
  const datosGrafico = informe.detalle.filter(d => d.kms_recorridos > 0);

  container.innerHTML = `
    <div class="card" style="grid-column: 1/-1;">
      <div class="card-header">
        <h3>Informe Diario — ${informe.fecha}</h3>
        <small style="color:var(--text-muted);">Generado: ${informe.generado}</small>
      </div>
      <div style="padding:16px 20px;">
      <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;">
          <div style="font-size:0.8em;color:#0369a1;">Partes hoy</div>
          <div style="font-size:1.5em;font-weight:bold;color:#0c4a6e;">${informe.resumen.total_partes}</div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;">
          <div style="font-size:0.8em;color:#15803d;">Activos</div>
          <div style="font-size:1.5em;font-weight:bold;color:#166534;">${informe.resumen.vehiculos_activos}/${informe.resumen.vehiculos_flota}</div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;">
          <div style="font-size:0.8em;color:#b91c1c;">Inactivos</div>
          <div style="font-size:1.5em;font-weight:bold;color:#991b1b;">${informe.resumen.vehiculos_inactivos}</div>
        </div>
      </div>

      <div style="height:220px;"><canvas id="chartKmsDia"></canvas></div>

      <div class="table-wrapper" style="margin-top:1rem;">
      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Modelo</th>
            <th>Técnico</th>
            <th>Partes</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>KMs hoy</th>
            <th>KMs totales</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${informe.detalle.map(d => `
            <tr>
              <td style="font-weight:bold;color:#2563eb;letter-spacing:0.5px;">${escapeHtml(d.matricula)}</td>
              <td>${escapeHtml(d.modelo)}</td>
              <td>${escapeHtml(d.tecnico)}</td>
              <td style="text-align:center;">${d.num_partes}</td>
              <td>${escapeHtml(d.primera_entrada)}</td>
              <td>${escapeHtml(d.ultima_salida)}</td>
              <td>${d.kms_recorridos ? '<strong>' + d.kms_recorridos + '</strong>' : '—'}</td>
              <td><strong>${d.km_total.toLocaleString('es-ES')}</strong></td>
              <td>${escapeHtml(d.estado)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>

      <div style="margin-top:1rem;display:flex;gap:0.5rem;">
        <button onclick="exportReportCSV()" class="btn btn-secondary btn-sm">Exportar CSV</button>
        <button onclick="window.print()" class="btn btn-primary btn-sm">Imprimir</button>
      </div>
      </div>
    </div>
  `;

  // Gráfico de barras: KMs recorridos por vehículo (Chart.js directo)
  if (datosGrafico.length > 0) {
    setTimeout(() => {
      try {
        const ctx = document.getElementById('chartKmsDia');
        if (ctx) {
          new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
              labels: datosGrafico.map(d => d.matricula),
              datasets: [{
                label: 'KMs recorridos',
                data: datosGrafico.map(d => d.kms_recorridos),
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true, position: 'top' },
                title: { display: true, text: 'KMs por vehículo — ' + informe.fecha }
              },
              scales: {
                y: { beginAtZero: true, title: { display: true, text: 'KMs' } }
              }
            }
          });
        }
      } catch(e) {
        console.warn('[Chart]', e.message);
      }
    }, 100);
  }
};

/**
 * Exporta el informe diario a CSV.
 */
window.exportReportCSV = async function(dateStr = fechaLocalHoy()) {
  const informe = await generateDailyReport(dateStr);
  if (!informe) return;

  const headers = ['Matrícula','Modelo','Técnico','Partes','Entrada','Salida','KMs hoy','KMs totales','Estado'];
  const rows = informe.detalle.map(d =>
    [d.matricula, d.modelo, d.tecnico, d.num_partes, d.primera_entrada, d.ultima_salida, d.kms_recorridos, d.km_total, d.estado]
  );

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe_flot_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Informe exportado como CSV');
};
/* ========================================
   Cadenas y Rutas (PASO B)
   ======================================== */

// ==================== CADENAS: Lista ====================
async function renderCadenasList() {
  const list = document.getElementById('cadenas-list');
  if (!list) return;

  const cadenas = await getAllCadenas();

  if (cadenas.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-link"></i><p>No hay cadenas creadas.</p></div>';
    return;
  }

  // o. Usar la clase .card para que coincida con el resto de la app
  list.innerHTML = cadenas.map(c => `
    <div class="card chain-row" data-cadena-id="${c.id}">
      <div class="card-header">
        <strong>${escapeHtml(c.nombre)}</strong>
        <div class="chain-row-actions">
          <span class="badge badge-blue" id="ruta-count-${c.id}">0 rutas</span>
          <button type="button" class="btn btn-sm btn-outline" onclick="event.stopPropagation();render_rutas('${c.id}')"><i class="fas fa-route"></i> Rutas</button>
          <button type="button" class="btn btn-sm btn-danger" aria-label="Eliminar cadena ${escapeHtml(c.nombre)}" onclick="event.stopPropagation();deleteCadena('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `).join('');

  // Conteo de rutas por cadena
  for (const c of cadenas) {
    try {
      const rutas = await getRutasByCadena(c.id);
      const badge = document.getElementById('ruta-count-' + c.id);
      if (badge) badge.textContent = rutas.length + (rutas.length === 1 ? ' ruta' : ' rutas');
    } catch (e) {
      console.warn('Error contando rutas para', c.id, e);
    }
  }

  // Click en la tarjeta → ver rutas (SIEMPRE pasar string id)
  document.querySelectorAll('#cadenas-list .card').forEach(el => {
    el.addEventListener('click', async () => {
      el.style.boxShadow = 'var(--shadow-lg)';
      const id = String(el.dataset.cadenaId || '');   // ? dataset siempre devuelve string
      if (!id) return;
      await render_rutas(id);                          // ? directo, sin showRutasForCadena
    });
  });
}


//  CADENAS — BORRADO EN CASCADA

/**
 * deleteCadenaWithDependencies(id)
 * Cascada: borra rutas y clientes de la cadena.
 */
async function deleteCadenaWithDependencies(id){
  const [clientes,rutas]=await Promise.all([dbGetAll('clientes'),dbGetAll('rutas')]);
  for(const cliente of clientes.filter(item=>String(item.cadenaId??item.cadenaid)===String(id))){
    await dbDelete('clientes',cliente.id);
  }
  for(const ruta of rutas.filter(item=>String(item.cadenaId??item.cadenaid)===String(id))){
    await dbDelete('rutas',ruta.id);
  }
  await dbDelete('cadenas',id);
}

async function deleteRuta(id, cadenaId) {
  const ruta = await getRutaById(id);
  if (!ruta) return;

  window.confirmDelete(ruta.nombre, async () => {
    await deleteRutaDb(id, true);
  });
}

// ==================== RUTAS: Formulario Modal ====================

/**
 * showRutaForm(editId, defaultCadenaId) → Promise<void>
 * Muestra modal con campos: nombre, cadenaid, frecuenciameses, orden, ultimorevision.
 */
async function showRutaForm(editId = null, defaultCadenaId = null) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  let ruta = {};
  let cadenas = [];

  if (editId) {
    ruta = await getRutaById(editId);
    if (!ruta) return;
  }
  
  try {
    cadenas = await getAllCadenas();
  } catch (e) {
    console.error('Error cargando cadenas en showRutaForm:', e);
    cadenas = [];
  }

  const selectedCadenaId = defaultCadenaId ?? window.getCurrentCadenId() ?? localStorage.getItem('cadenaId') ?? (ruta.cadenaId ?? ruta.cadenaid ?? null);
  const selectedCadenaValue = selectedCadenaId ? String(selectedCadenaId) : '';
  if (selectedCadenaValue) window.setCurrentCadenId(selectedCadenaValue);

  const cadenasOptions = cadenas.map(c => {
    const cadenaId = ruta.cadenaId ?? ruta.cadenaid ?? selectedCadenaValue;
    const selected = String(cadenaId) === String(c.id) ? 'selected' : '';
    return `<option value="${c.id}" ${selected}>${escapeHtml(c.nombre)} (${c.id})</option>`;
  }).join('');

  // Normalizar valores para el formulario (versión vieja vs nueva)
  const rutaNombre = ruta.nombre || '';
  const rutaFrecuencia = ruta.frecuenciameses ?? ruta.frecuenciaMeses ?? 6;
  const rutaOrden = ruta.orden ?? 0;
  const rutaUltimaRevision = ruta.ultimorevision ?? ruta.ultimaRevision ?? null;
  const rutaUltimaDate = rutaUltimaRevision ? rutaUltimaRevision.slice(0, 10) : '';

  title.textContent = editId ? 'Editar ruta' : 'Nueva ruta';
  
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <input id="form-ruta-id" type="hidden" value="${editId || ''}">
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Nombre *</label>
        <input id="form-ruta-nombre" type="text" class="input" value="${escapeHtml(rutaNombre)}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Cadena *</label>
        <select id="form-ruta-cadena" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
          <option value="">— Seleccionar</option>
          ${cadenasOptions}
        </select>
      </div>
      <div style="display:flex;gap:16px;">
        <div style="flex:1;">
          <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Frecuencia (meses)</label>
          <input id="form-ruta-frecuencia" type="number" class="input only-num" min="1" value="${rutaFrecuencia}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Orden</label>
          <input id="form-ruta-orden" type="number" class="input only-num" min="0" value="${rutaOrden}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
        </div>
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">ultima revisión</label>
        <input id="form-ruta-ultima" type="date" value="${rutaUltimaDate}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
    </div>`;
  
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-ruta">${editId ? 'Actualizar' : 'Crear'}</button>`;

  overlay.classList.add('open');

  document.getElementById('btn-save-ruta').onclick = async () => {
  const selectCadena = document.getElementById('form-ruta-cadena');
  if (selectCadena && selectCadena.value) {
    window.setCurrentCadenId(selectCadena.value);
    localStorage.setItem('cadenaId', String(selectCadena.value));
  }

  const exito = await window.saveRuta();
  if (exito) {
    closeModal();
    // Recargar vista si estamos en la pantalla de rutas de una cadena
    if (typeof render_rutas === 'function' && selectCadena && selectCadena.value) {
      render_rutas(selectCadena.value);
    }
  }
};
}


//  REVISIONES — el panel de "Revisiones Programadas" fue eliminado.
//  Toda la funcionalidad vive en la página única "Revisiones"
//  (js/informe-revisiones-cliente.js): pestañas Próximas/Historial,
//  botón Nueva revisión y buscador. Esta redirección mantiene
//  compatibles los accesos antiguos a 'revisionesProgramadas'.

window.render_revisionesProgramadas = async function(main) {
  return window.render_revisionesCliente(main);
};

//  REVISIONES PROGRAMADAS - VISTA DE RUTAS (NIVEL 2)
window.render_revisiones_rutas = async function(cadenaId, cadenaNombre) {
  const main = document.getElementById('mainContent');
  if (!main) return;

  try {
    const rutas = await getRutasByCadena(cadenaId);
    
    main.innerHTML = `
      <div class="page-revisiones">
        <div class="page-header">
          <div>
            <button class="btn btn-outline btn-sm" onclick="navigateTo('revisionesProgramadas')"><i class="fas fa-arrow-left"></i> Volver</button>
          </div>
          <div>
            <h2 class="page-revisiones-title"><i class="fas fa-route"></i> Rutas · ${escapeHtml(cadenaNombre)}</h2>
            <p class="page-revisiones-subtitle">Selecciona una ruta para ver sus tiendas</p>
          </div>
        </div>
        <div id="rutas-container" class="stats-grid"></div>
      </div>`;

    const container = document.getElementById('rutas-container');
    
    if (rutas.length === 0) {
      container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--gray);grid-column:1/-1;">No hay rutas para esta cadena.</p>';
      return;
    }

    // Usar estilos de stat-card para las rutas
    for (const ruta of rutas) {
      let puertas = [];
      try {
        puertas = await window.getPuertasDeRuta(ruta.id, cadenaId);
      } catch(e) {
        console.error('Error cargando puertas de ruta:', e);
        puertas = [];
      }
      
      // Calcular días hasta próxima revisión
      let diasHastaRevision = null;
      let bordeColor = '#22c55e'; // verde por defecto
      
      if (ruta.proximaRevision || ruta.proximarevision) {
        try {
          const proximaStr = ruta.proximaRevision || ruta.proximarevision;
          const proxima = new Date(proximaStr);
          const hoy = new Date();
          const diffTime = proxima - hoy;
          diasHastaRevision = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          // Rojo si faltan 30 días o menos (coherente con getEstadoPuerta), verde si más
          if (diasHastaRevision <= 30) {
            bordeColor = '#ef4444'; // rojo
          }
        } catch(e) {
          console.error('Error calculando días hasta revisión:', e);
        }
      }
      
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.style.cursor = 'pointer';
      card.style.border = `2px solid ${bordeColor}`;
      card.innerHTML = `
        <div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-route"></i></div>
        <div class="stat-info">
          <h3>${escapeHtml(ruta.nombre)}</h3>
          <p>${puertas.length} puerta${puertas.length>1?'s':''}</p>
          ${diasHastaRevision !== null ? `<small style="color:${bordeColor}">Próxima revisión: ${diasHastaRevision} día${diasHastaRevision!==1?'s':''}</small>` : ''}
          ${ruta.frecuenciaMeses ? `<small>cada ${ruta.frecuenciaMeses} mes${ruta.frecuenciaMeses>1?'es':''}</small>` : ''}
        </div>
      `;
      card.addEventListener('click', () => window.render_revisiones_tiendas(ruta.id, ruta.nombre, cadenaId, cadenaNombre));
      container.appendChild(card);
    }
  } catch(e) {
    console.error('Error en render_revisiones_rutas:', e);
    main.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>Error al cargar rutas</h3><p>'+escapeHtml(e.message)+'</p></div>';
  }
};

//  REVISIONES PROGRAMADAS - VISTA DE TIENDAS (NIVEL 3)
const ordenarTiendasRuta = lista => [...lista].sort((a, b) => {
  const oa = a.ordenRuta ?? Infinity, ob = b.ordenRuta ?? Infinity;
  return oa !== ob ? oa - ob : String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
});

/** Mejor orden de visita saliendo y volviendo a Ceutí. pts: [{lat,lng}] → {orden:[índices], km} */
function calcularOrdenOptimo(pts) {
  const n = pts.length;
  const nodos = [OFICINA, ...pts];
  const d = nodos.map(a => nodos.map(b => kmEntreCoordenadas(a.lat, a.lng, b.lat, b.lng) * getFactorCarretera()));
  const largo = t => {
    let s = d[0][t[0]];
    for (let i = 1; i < t.length; i++) s += d[t[i - 1]][t[i]];
    return s + d[t[t.length - 1]][0];
  };
  let mejor = null, mejorLen = Infinity;
  const probar = t => { const l = largo(t); if (l < mejorLen - 1e-9) { mejor = t.slice(); mejorLen = l; } };

  if (n <= 8) {
    const permutar = (t, k) => {
      if (k === t.length) return probar(t);
      for (let i = k; i < t.length; i++) {
        [t[k], t[i]] = [t[i], t[k]];
        permutar(t, k + 1);
        [t[k], t[i]] = [t[i], t[k]];
      }
    };
    permutar(Array.from({ length: n }, (_, i) => i + 1), 0);
  } else {
    // Vecino más cercano desde cada punto de partida + mejora 2-opt
    for (let inicio = 1; inicio <= n; inicio++) {
      const t = [inicio], libres = new Set(Array.from({ length: n }, (_, i) => i + 1));
      libres.delete(inicio);
      while (libres.size) {
        let sig = null, dm = Infinity;
        for (const c of libres) if (d[t[t.length - 1]][c] < dm) { dm = d[t[t.length - 1]][c]; sig = c; }
        t.push(sig); libres.delete(sig);
      }
      let mejora = true;
      while (mejora) {
        mejora = false;
        for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
          const nuevo = [...t.slice(0, i), ...t.slice(i, j + 1).reverse(), ...t.slice(j + 1)];
          if (largo(nuevo) < largo(t) - 1e-9) { t.splice(0, n, ...nuevo); mejora = true; }
        }
      }
      probar(t);
    }
  }
  return { orden: mejor.map(i => i - 1), km: Math.round(mejorLen) };
}

/** Ordena las tiendas de una ruta para hacer los mínimos km posibles (Ceutí → tiendas → Ceutí) y guarda el orden. */
window.optimizarRutaTiendas = async function(rutaId, cadenaId, rutaNombre, cadenaNombre) {
  try {
    const todos = await dbGetAll('clientes');
    const tiendas = ordenarTiendasRuta(todos.filter(c => String(c.rutaId ?? c.rutaid ?? '') === String(rutaId)));
    if (tiendas.length < 2) return showToast('La ruta necesita al menos 2 tiendas para optimizarla', 'warning');
    showToast('Calculando el recorrido más corto?');

    const sinCoord = [];
    for (const t of tiendas) {
      if (Number(t.lat) && Number(t.lng)) continue;
      const g = t.direccion ? await geocodificar(t.direccion) : null;
      if (g) {
        t.lat = g.lat; t.lng = g.lng;
        await dbPut('clientes', t);
      } else sinCoord.push(t);
      if (t.direccion) await new Promise(r => setTimeout(r, 1100)); // límite de Nominatim
    }

    const conCoord = tiendas.filter(t => !sinCoord.includes(t));
    if (conCoord.length < 2) return showToast('Faltan coordenadas: revisa las direcciones de las tiendas', 'error');

    const puntos = conCoord.map(t => ({ lat: Number(t.lat), lng: Number(t.lng) }));
    const kmAntes = Math.round(kmCircuitoOrden(puntos));
    const { orden, km } = calcularOrdenOptimo(puntos);
    const nuevoOrden = [...orden.map(i => conCoord[i]), ...sinCoord];

    for (let i = 0; i < nuevoOrden.length; i++) {
      if (nuevoOrden[i].ordenRuta !== i + 1) await dbPut('clientes', { ...nuevoOrden[i], ordenRuta: i + 1 });
    }

    showToast(`Ruta optimizada: ${km} km (antes ${kmAntes} km)` + (sinCoord.length ? ` · ${sinCoord.length} sin ubicar al final` : ''), sinCoord.length ? 'warning' : 'success');

    if (document.getElementById('tiendas-container')) await window.render_revisiones_tiendas(rutaId, rutaNombre, cadenaId, cadenaNombre);
    else if (document.getElementById('clientes-ruta-lista')) await render_clientes_ruta(rutaId);
  } catch (e) {
    console.error('optimizarRutaTiendas falló:', e);
    showToast('No se pudo guardar el orden. ¿Has ejecutado SUPABASE_ORDEN_RUTA.sql? ' + (e.message || ''), 'error');
  }
};

function kmCircuitoOrden(pts) {
  const nodos = [OFICINA, ...pts, OFICINA];
  let s = 0;
  for (let i = 1; i < nodos.length; i++) s += kmEntreCoordenadas(nodos[i - 1].lat, nodos[i - 1].lng, nodos[i].lat, nodos[i].lng) * getFactorCarretera();
  return s;
}

window.render_revisiones_tiendas = async function(rutaId, rutaNombre, cadenaId, cadenaNombre) {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const tiendas = await window.getTiendasDeRuta(rutaId, cadenaId);
  
  main.innerHTML = `
    <div class="page-revisiones">
      <div class="page-header">
        <div>
          <button class="btn btn-back btn-sm" onclick="window.render_revisiones_rutas('${escapeAttr(cadenaId)}', '${escapeAttr(cadenaNombre)}')"><i class="fas fa-arrow-left"></i> Volver a rutas</button>
        </div>
        <div>
          <h2 class="page-revisiones-title"><i class="fas fa-store"></i> Tiendas · ${escapeHtml(rutaNombre)}</h2>
          <p class="page-revisiones-subtitle">${tiendas.length} tienda${tiendas.length>1?'s':''} en esta ruta</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="window.optimizarRutaTiendas('${escapeAttr(rutaId)}', '${escapeAttr(cadenaId)}', '${escapeAttr(rutaNombre)}', '${escapeAttr(cadenaNombre)}')"><i class="fas fa-route"></i> Optimizar ruta</button>
          <button class="btn btn-success btn-sm" onclick="window.abrirFormularioRevisionRuta('${escapeAttr(rutaId)}', '${escapeAttr(rutaNombre)}', '${escapeAttr(cadenaId)}', '${escapeAttr(cadenaNombre)}')"><i class="fas fa-clipboard-check"></i> Formulario de revisión</button>
        </div>
      </div>
      <div id="tiendas-container" class="stats-grid"></div>
    </div>`;

  const container = document.getElementById('tiendas-container');

  if (tiendas.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--gray);grid-column:1/-1;">No hay tiendas asignadas a esta ruta.</p>';
    return;
  }

  // Usar estilos de stat-card para las tiendas
  tiendas.forEach((tienda, index) => {
    const esUltimaTienda = index === tiendas.length - 1;
    const card = document.createElement('div');
    card.className = 'stat-card tienda-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-store"></i></div>
      <div class="stat-info">
        <h3>${index + 1}. ${escapeHtml(tienda.nombre)}</h3>
        <p>${escapeHtml(tienda.direccion || 'Sin dirección')}</p>
        ${esUltimaTienda ? '<small style="color:var(--warning)">ultima tienda de la ruta</small>' : ''}
      </div>
      <div class="stat-actions">
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); abrirGoogleMaps('${escapeAttr(tienda.direccion)}')"><i class="fas fa-map-marker-alt"></i> Maps</button>
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); abrirInformeRevisionRuta('${escapeAttr(rutaId)}', '${escapeAttr(rutaNombre)}', '${escapeAttr(cadenaId)}', '${escapeAttr(cadenaNombre)}', '${escapeAttr(tienda.id)}', '${escapeAttr(tienda.nombre)}', ${esUltimaTienda})"><i class="fas fa-clipboard-check"></i> Informe</button>
      </div>
    `;
    card.addEventListener('click', () => abrirInformeRevisionRuta(rutaId, rutaNombre, cadenaId, cadenaNombre, tienda.id, tienda.nombre, esUltimaTienda));
    container.appendChild(card);
  });
};

// Abre el formulario de revisión de TODA la ruta, con el checklist por puerta
// (Hallazgo / Correctivo / Resultado + fotos). Reutiliza el formulario HIPERBER
// con todas las tiendas de la ruta, sin duplicar lógica ni botones.
window.abrirFormularioRevisionRuta = async function(rutaId, rutaNombre, cadenaId, cadenaNombre) {
  try {
    const tiendas = await window.getTiendasDeRuta(rutaId, cadenaId);
    if (!tiendas.length) return showToast('Esta ruta no tiene tiendas asignadas', 'warning');

    const stores = [];
    for (const tienda of tiendas) {
      const doors = await dbGetByIndex('puertas', 'clienteId', tienda.id);
      stores.push({
        clienteId: tienda.id,
        nombre: tienda.nombre,
        direccion: tienda.direccion || '',
        rutaId: String(rutaId),
        rutaNombre: rutaNombre,
        puertas: doors.length ? doors.map(door => ({
          id: door.id,
          nombre: door.nombre || door.tipoPuerta || door.tipo || 'Puerta',
          tipo: door.tipoPuerta || door.tipo || '',
          hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
          correctivo: null, correctivoTexto: '', resultado: null
        })) : [{
          id: null, nombre: '', tipo: '',
          hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
          correctivo: null, correctivoTexto: '', resultado: null, nueva: true
        }]
      });
    }

    window.__hiperberReviewDraft = {
      id: window.db.nextId('REV'),
      chainId: String(rutaId),
      chainName: cadenaNombre ? cadenaNombre + ' · ' + rutaNombre : rutaNombre,
      stores
    };

    const form = '<div class="hiperber-form">' +
      '<div class="form-group hiperber-date"><label for="hiperber-review-date">Fecha de revisión</label><input id="hiperber-review-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div id="hiperber-stores" class="hiperber-stores"></div>' +
      '</div>';
    const footer = '<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>' +
      '<button type="button" class="btn btn-primary" onclick="saveHiperberReviewForm()"><i class="fas fa-save"></i> Guardar revisión</button>';

    openModal('Formulario de revisión · ' + rutaNombre, form, footer);
    renderHiperberStores();
  } catch (e) {
    console.error('abrirFormularioRevisionRuta falló:', e);
    showToast('No se pudo abrir el formulario: ' + e.message, 'error');
  }
};

// Función para abrir Google Maps con la dirección
window.abrirGoogleMaps = function(direccion) {
  if (!direccion) {
    showToast('La tienda no tiene dirección', 'warning');
    return;
  }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
  window.open(url, '_blank');
};

// Función para generar PDF consolidado de toda la ruta
window.generarPDFRutaCompleta = async function(rutaId, rutaNombre, cadenaId, cadenaNombre) {
  showToast('Generando PDF de la ruta...', 'info');
  
  try {
    // Buscar todas las revisiones de esta ruta
    const todasRevisiones = await dbGetAll('revisiones');
    const revisionesRuta = todasRevisiones.filter(rev => {
      try {
        const notas = JSON.parse(rev.notas || '{}');
        // El formulario HIPERBER guarda el id de la ruta en cadenaId
        return [notas.rutaId, notas.cadenaId].some(value => value && String(value) === String(rutaId));
      } catch(e) {
        return false;
      }
    });
    
    if (revisionesRuta.length === 0) {
      showToast('No hay revisiones guardadas para esta ruta', 'warning');
      return;
    }
    
    await window.generatePDF_ruta(revisionesRuta, { rutaNombre, cadenaNombre });
    
  } catch(error) {
    console.error('Error generando PDF de ruta:', error);
    showToast('Error al generar PDF de ruta: ' + error.message, 'error');
  }
};

// Función para abrir el informe de revisión de la ruta (usando formulario HIPERBER)
window.abrirInformeRevisionRuta = async function(rutaId, rutaNombre, cadenaId, cadenaNombre, tiendaId, tiendaNombre, esUltimaTienda = false) {
  // Buscar la tienda real para tener su dirección correcta
  let tiendaReal = null;
  try { tiendaReal = await dbGet('clientes', tiendaId); } catch (e) { console.warn('No se pudo cargar la tienda:', e); }

  // Crear un draft temporal para HIPERBER con solo esta tienda
  const tienda = {
    clienteId: tiendaId,
    nombre: tiendaNombre,
    direccion: tiendaReal?.direccion || '',
    rutaId: rutaId,
    rutaNombre: rutaNombre,
    puertas: [] // Se cargarán las puertas de esta tienda
  };

  // Buscar las puertas de esta tienda
  dbGetByIndex('puertas', 'clienteId', tiendaId).then(puertas => {
    tienda.puertas = puertas.map(door => ({
      id: door.id,
      nombre: door.nombre || door.tipoPuerta || door.tipo || 'Puerta',
      tipo: door.tipoPuerta || door.tipo || '',
      hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
      correctivo: null, correctivoTexto: '', resultado: null
    }));

    window.__hiperberReviewDraft = {
      id: window.db.nextId('REV'),
      chainId: rutaId,
      chainName: rutaNombre,
      stores: [tienda],
      esUltimaTienda: esUltimaTienda
    };

    const form = '<div class="hiperber-form">' +
      '<div class="form-group hiperber-date"><label for="hiperber-review-date">Fecha de revisión</label><input id="hiperber-review-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div id="hiperber-stores" class="hiperber-stores"></div>' +
      '</div>';
    
    const footer = '<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>' +
      '<button type="button" class="btn btn-primary" onclick="saveHiperberReviewForm()"><i class="fas fa-save"></i> Guardar revisión</button>';

    openModal('Revisión · ' + tiendaNombre, form, footer);
    renderHiperberStores();
  });
};

function revisionHistoryMetadata(revision){
  let notes={};
  try{notes=JSON.parse(revision.notas||'{}');}catch(e){notes={texto:revision.notas||''};}
  const stores=Array.isArray(notes.supermercados)?notes.supermercados:[];
  const chainId=String(notes.cadenaId||revision.cadenaId||revision.cadenaid||'');
  const clientIds=[revision.clienteId,...stores.map(store=>store.id),...(revision.items||[]).map(item=>item.clienteId)].filter(Boolean).map(String);
  const clientNames=[...stores.map(store=>store.nombre),notes.clienteNombre,notes.cliente].filter(Boolean);
  const lineNames=(revision.items||[]).map(item=>item.clienteNombre).filter(Boolean);
  return{
    chainId,chainName:notes.cadena||'',clientIds,clientNames:[...new Set([...clientNames,...lineNames])],
    technician:notes.tecnicos||revision.tecnicoNombre||revision.tecnicoId||'—',
    contract:notes.contrato||'',intervention:notes.intervencion||'',notes,rawNotes:revision.notas||''
  };
}

window.buscarHistorialRevisiones=async function(){
  const body=document.getElementById('hist-rev-resultados');
  if(!body) return;
  const [revisiones,cadenas,clientes]=await Promise.all([dbGetAll('revisiones'),dbGetAll('cadenas'),dbGetAll('clientes')]);
  const chainNames=new Map(cadenas.map(chain=>[String(chain.id),chain.nombre]));
  const clientNames=new Map(clientes.map(client=>[String(client.id),client.nombre]));
  const desde=document.getElementById('hist-rev-desde').value;
  const hasta=document.getElementById('hist-rev-hasta').value;
  const cadenaFilter=document.getElementById('hist-rev-cadena').value;
  const clienteFilter=document.getElementById('hist-rev-cliente').value;
  const textFilter=document.getElementById('hist-rev-buscar').value.trim().toLocaleLowerCase();
  const filtered=revisiones.map(revision=>({revision,meta:revisionHistoryMetadata(revision)})).filter(({revision,meta})=>{
    const revisionDate=String(revision.fecha||'').slice(0,10);
    const chainName=meta.chainName||chainNames.get(meta.chainId)||'';
    const matchesDate=(!desde||revisionDate>=desde)&&(!hasta||revisionDate<=hasta);
    const matchesChain=!cadenaFilter||meta.chainId===cadenaFilter;
    const matchesClient=!clienteFilter||meta.clientIds.includes(clienteFilter)||String(revision.clienteId||'')===clienteFilter;
    const searchable=[revision.id,chainName,meta.clientNames.join(' '),meta.technician,meta.contract,meta.intervention,meta.rawNotes,...(revision.items||[]).map(item=>[item.concepto,item.hallazgoTexto,item.correctivoTexto].join(' '))].join(' ').toLocaleLowerCase();
    return matchesDate&&matchesChain&&matchesClient&&(!textFilter||searchable.includes(textFilter));
  }).sort((a,b)=>String(b.revision.fecha||'').localeCompare(String(a.revision.fecha||'')));
  if(!filtered.length){
    body.innerHTML='<tr><td colspan="7" class="revision-history-empty">No hay revisiones que coincidan con los filtros.</td></tr>';
    return;
  }
  body.innerHTML=filtered.map(({revision,meta})=>{
    const chainName=meta.chainName||chainNames.get(meta.chainId)||'—';
    const names=meta.clientNames.length?meta.clientNames.join(', '):(revision.clienteId?clientNames.get(String(revision.clienteId)):'—');
    const rawResult=revision.estadoTrasRevision||((revision.items||[]).some(item=>item.resultadoEstado==='x')?'Fuera de servicio':'Operativa');
    const result=String(rawResult).replace(/_/g,' ');
    const resultLabel=result.charAt(0).toLocaleUpperCase()+result.slice(1);
    return '<tr><td data-label="Fecha">'+escapeHtml(formatDate(revision.fecha))+'</td><td data-label="Cadena">'+escapeHtml(chainName)+'</td><td data-label="Cliente / supermercado">'+escapeHtml(names||'—')+'</td><td data-label="Técnico">'+escapeHtml(meta.technician)+'</td><td data-label="Equipos">'+(revision.items||[]).length+'</td><td data-label="Resultado">'+escapeHtml(resultLabel)+'</td><td data-label="PDF"><button type="button" class="btn btn-primary btn-sm btn-hist-rev-pdf" data-revision-id="'+escapeHtml(revision.id)+'" aria-label="Descargar PDF de revisión"><i class="fas fa-file-pdf"></i> PDF</button></td></tr>';
  }).join('');
  body.querySelectorAll('.btn-hist-rev-pdf').forEach(button=>button.addEventListener('click',()=>window.generatePDF_revision(button.dataset.revisionId)));
};

//  HELPERS PARA REVISIONES PROGRAMADAS

async function getPuertasPorRuta(rutaId) {
  // Delegado en el helper único (utils.js) para que panel, vistas y formulario
  // usen exactamente el mismo criterio de tiendas/puertas.
  return window.getPuertasDeRuta ? window.getPuertasDeRuta(rutaId) : [];
}

function getEstadoPuerta(puerta) {
  if (!puerta.proximaRevision) {
    return { texto: 'Sin programar', clase: 'badge-yellow' };
  }

  const proxima = new Date(puerta.proximaRevision);
  const hoy = new Date();
  const diffDias = Math.ceil((proxima - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { texto: `Vencida ${Math.abs(diffDias)}d`, clase: 'badge-red' };
  } else if (diffDias === 0) {
    return { texto: 'Vence hoy', clase: 'badge-red' };
  } else if (diffDias <= 30) {
    return { texto: `En ${diffDias}d`, clase: 'badge-yellow' };
  } else {
    return { texto: 'OK', clase: 'badge-green' };
  }
}

async function openHiperberReviewForm(chainId, fechaPreseleccionada, opciones={}) {
  const chain = await getCadenaById(chainId);
  if (!chain) return showToast('No se encontró la cadena HIPERBER', 'error');

  const [clients, routes] = await Promise.all([
    dbGetAll('clientes'),
    getRutasByCadena(chain.id)
  ]);

  // Si el usuario pidió revisar una ruta concreta, SOLO sus tiendas (por rutaId)
  const rutaFiltro=opciones&&opciones.rutaId?String(opciones.rutaId):null;
  const rutasVisibles=rutaFiltro?routes.filter(r=>String(r.id)===rutaFiltro):routes;
  const routeIds = new Set(rutasVisibles.map(r => String(r.id)));
  // Clientes: si hay filtro de ruta, exclusivamente los vinculados a esa ruta;
  // si no, los de toda la cadena (cadenaId/padreId o pertenecientes a sus rutas).
  const supermarkets = rutaFiltro
    ? ordenarTiendasRuta(clients.filter(c=>String(c.rutaId??c.rutaid??'')===rutaFiltro))
    : ordenarTiendasRuta(clients.filter(client =>
      String(client.cadenaId ?? client.cadenaid ?? '') === String(chain.id) ||
      String(client.padreId ?? client.padreid ?? '') === String(chain.id) ||
      routeIds.has(String(client.rutaId ?? client.rutaid ?? ''))
    ));

  // Mapa rutaId → nombre de ruta
  const routeNameById = {};
  rutasVisibles.forEach(r => { routeNameById[String(r.id)] = r.nombre; });

  const stores = [];
  for (const client of supermarkets) {
    const doors = await dbGetByIndex('puertas', 'clienteId', client.id);
    const rid = String(client.rutaId ?? client.rutaid ?? '');
    stores.push({
      clienteId: client.id,
      nombre: client.nombre,
      direccion: client.direccion || '',
      rutaId: rid,
      rutaNombre: routeNameById[rid] || '📍 Sin ruta asignada',
      puertas: doors.length ? doors.map(door => ({
        id: door.id,
        nombre: door.nombre || door.tipoPuerta || door.tipo || 'Puerta',
        tipo: door.tipoPuerta || door.tipo || '',
        hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
        correctivo: null, correctivoTexto: '', resultado: null
      })) : [{
        id: null, nombre: '', tipo: '',
        hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
        correctivo: null, correctivoTexto: '', resultado: null, nueva: true
      }]
    });
  }

  window.__hiperberReviewDraft = {
    id: window.db.nextId('REV'),
    chainId: String(chain.id),
    chainName: chain.nombre,
    rutaId: rutaFiltro,
    stores
  };

  const form = '<div class="hiperber-form">' +
    '<div class="form-group hiperber-date"><label for="hiperber-review-date">Fecha de revisión</label><input id="hiperber-review-date" type="date" value="' + (fechaPreseleccionada || new Date().toISOString().slice(0, 10)) + '"></div>' +
    '<div id="hiperber-stores" class="hiperber-stores"></div>' +
    '</div>';
  const footer = '<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>' +
    '<button type="button" class="btn btn-primary" onclick="saveHiperberReviewForm()"><i class="fas fa-save"></i> Guardar revisión</button>';

  openModal('Revisión · ' + chain.nombre + (rutaFiltro?' · '+(routeNameById[rutaFiltro]||'Ruta'):''), form, footer);
  renderHiperberStores();
}
window.openHiperberReviewForm = openHiperberReviewForm;
// snico punto de cierre: lo usan el botón Cerrar, la o. de la cabecera y Escape.
window.cerrarFormularioRevision = function() {
  window.__hiperberReviewDraft = null;
  window.__doticsVisitDraft = null;
  // Cierra el modal estándar y, por si acaso, cualquier overlay de revisión que quede abierto
  closeModal();
  document.getElementById('overlayRevision')?.remove();
  document.getElementById('modal-revision-overlay')?.remove();
  if (typeof revisionPuertaActual !== 'undefined') revisionPuertaActual = null;
};

// Formulario de revisión para un CLIENTE sNICO """"""
// Reutiliza el motor del formulario Hiperber (checklist por puerta:
// Hallazgo / Correctivo / Resultado + fotos) con las puertas del cliente.
window.abrirFormularioRevisionCliente = async function(clienteId, fechaPreseleccionada) {
  try {
    const cliente = await dbGet('clientes', clienteId);
    if (!cliente) return showToast('No se encontró el cliente', 'error');
    const puertas = await dbGetByIndex('puertas', 'clienteId', clienteId);
    if (!puertas.length) return showToast('Este cliente no tiene puertas registradas', 'warning');

    const store = {
      clienteId: String(clienteId),
      nombre: cliente.nombre,
      direccion: cliente.direccion || '',
      rutaId: null,
      rutaNombre: '',
      puertas: puertas.map(door => ({
        id: door.id,
        nombre: door.nombre || door.tipoPuerta || door.tipo || 'Puerta',
        tipo: door.tipoPuerta || door.tipo || '',
        hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
        correctivo: null, correctivoTexto: '', resultado: null
      }))
    };

    window.__hiperberReviewDraft = {
      id: window.db.nextId('REV'),
      chainId: String(clienteId),
      chainName: cliente.nombre,
      esClienteUnico: true,
      stores: [store]
    };

    const form = '<div class="hiperber-form">' +
      '<div class="form-group hiperber-date"><label for="hiperber-review-date">Fecha de revisión</label><input id="hiperber-review-date" type="date" value="' + (fechaPreseleccionada || new Date().toISOString().slice(0, 10)) + '"></div>' +
      '<div id="hiperber-stores" class="hiperber-stores"></div>' +
      '</div>';
    const footer = '<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>' +
      '<button type="button" class="btn btn-primary" onclick="saveHiperberReviewForm()"><i class="fas fa-save"></i> Guardar revisión</button>';

    openModal('Revisión · ' + cliente.nombre, form, footer);
    renderHiperberStores();
  } catch (e) {
    console.error('abrirFormularioRevisionCliente falló:', e);
    showToast('No se pudo abrir el formulario: ' + e.message, 'error');
  }
};
function renderHiperberStores() {
  const draft = window.__hiperberReviewDraft;
  const container = document.getElementById('hiperber-stores');
  if (!draft || !container) return;
  if (!draft.stores.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay supermercados asignados a HIPERBER. Asigna clientes a la cadena para completar el formulario.</p></div>';
    return;
  }

  // Agrupar visualmente por ruta, conservando el índice real en draft.stores
  const groups = [];
  const byName = {};
  draft.stores.forEach((store, i) => {
    const name = store.rutaNombre || 'Sin ruta';
    if (!byName[name]) {
      byName[name] = { name, items: [] };
      groups.push(byName[name]);
    }
    byName[name].items.push({ store, index: i });
  });

  const storeHtml = (store, storeIndex) =>
    '<section class="hiperber-store" style="margin-left:18px;">' +
      '<div class="hiperber-store-head"><h4>' + escapeHtml(store.nombre) + '</h4>' +
      (store.direccion ? '<span class="hiperber-store-addr"><i class="fas fa-location-dot"></i> ' + escapeHtml(store.direccion) + '</span>' : '') + '</div>' +
      '<div class="table-wrapper hiperber-table-wrapper"><table class="hiperber-checklist"><thead><tr><th>Puerta</th><th>HALLAZGO</th><th>CORRECTIVO</th><th>RESULTADO</th></tr></thead><tbody>' +
        store.puertas.map((door, doorIndex) =>
          '<tr><td data-label="Puerta"><input class="hiperber-door-name" type="text" readonly' + (door.nombre ? '' : ' data-empty="1"') + ' aria-label="Puerta de ' + escapeHtml(store.nombre) + '" value="' + escapeHtml(door.nombre) + '" placeholder="Sin nombre"' + '>' + '<small>' + escapeHtml(door.tipo || '') + '</small></td>' +
            hiperberDecisionCell(storeIndex, doorIndex, door, 'hallazgo', [['ok','OK'],['x','X']]) +
            hiperberDecisionCell(storeIndex, doorIndex, door, 'correctivo', [['ok','OK'],['hecho','✔'],['x','X']]) +
            hiperberDecisionCell(storeIndex, doorIndex, door, 'resultado', [['ok','OK'],['x','X']]) + '</tr>'
        ).join('') +
      '</tbody></table></div>' +
      '' +
    '</section>';

  container.innerHTML = groups.map(g =>
    '<div class="hiperber-route-group" style="margin-bottom:26px;border-left:4px solid var(--primary);padding-left:14px;">' +
      '<h3 style="color:var(--primary);margin:0 0 12px;">' + escapeHtml(g.name) +
        ' <span class="badge badge-info">' + g.items.length + '</span></h3>' +
      g.items.map(it => storeHtml(it.store, it.index)).join('') +
    '</div>'
  ).join('');
}

function hiperberDecisionCell(storeIndex,doorIndex,door,field,options){
  const state=door[field]||'';
  let detail='';
  if(field==='hallazgo'){
    const photos=(door.hallazgoFotos||[]).map((photo,index)=>'<span class="hiperber-photo-name">Foto '+(index+1)+' <button type="button" aria-label="Quitar foto" onclick="removeHiperberFindingPhoto('+storeIndex+','+doorIndex+','+index+')">-</button></span>').join('');
    detail='<div class="hiperber-decision-detail" data-detail-for="hallazgo" '+(state==='x'?'':'hidden')+'><textarea rows="2" aria-label="Describir hallazgo" placeholder="Describe el desperfecto" oninput="updateHiperberDoor('+storeIndex+','+doorIndex+',\'hallazgoTexto\',this.value)">'+escapeHtml(door.hallazgoTexto)+'</textarea><button type="button" class="btn btn-primary btn-sm" onclick="openHiperberFindingCamera('+storeIndex+','+doorIndex+')"><i class="fas fa-camera"></i> Hacer foto</button><div class="hiperber-photo-list">'+photos+'</div></div>';
  }else if(field==='correctivo'){
    const detailLabel=state==='hecho'?'Trabajo realizado':'Acción pendiente';
    detail='<div class="hiperber-decision-detail" data-detail-for="correctivo" '+(['hecho','x'].includes(state)?'':'hidden')+'><textarea rows="2" aria-label="'+detailLabel+'" placeholder="'+detailLabel+'" oninput="updateHiperberDoor('+storeIndex+','+doorIndex+',\'correctivoTexto\',this.value)">'+escapeHtml(door.correctivoTexto)+'</textarea></div>';
  }
  return '<td data-label="'+field.toUpperCase()+'"><div class="hiperber-choice-group" role="radiogroup" aria-label="'+field.toUpperCase()+' · '+escapeHtml(door.nombre||'puerta nueva')+'">'+
    options.map(([value,label])=>'<label class="hiperber-choice '+(value==='ok'||value==='hecho'?'hiperber-choice-yes':'hiperber-choice-no')+'"><input type="radio" name="hiperber-'+storeIndex+'-'+doorIndex+'-'+field+'" value="'+value+'" '+(state===value?'checked':'')+' onchange="updateHiperberDoorDecision('+storeIndex+','+doorIndex+',\''+field+'\',this.value,this)"><span>'+label+'</span></label>').join('')+
    '</div>'+detail+'</td>';
}

window.updateHiperberDoor=function(storeIndex,doorIndex,field,value){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  if(door) door[field]=value;
};

window.updateHiperberDoorDecision=function(storeIndex,doorIndex,field,value,input){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  if(!door) return;
  const row=input.closest('tr');
  door[field]=value;
  if(field==='hallazgo'){
    if(value==='ok'){
      door.hallazgoTexto='';door.hallazgoFotos=[];door.correctivo='ok';door.correctivoTexto='';door.resultado='ok';
    }else{
      // X en hallazgo arrastra X a correctivo y resultado automáticamente
      door.correctivo='x';door.correctivoTexto='';door.resultado='x';
    }
  }else if(field==='correctivo'){
    if(value==='hecho') door.resultado='ok';
    else if(value==='x') door.resultado='x';
  }
  row.querySelectorAll('.hiperber-choice-group').forEach(group=>{
    const groupField=group.querySelector('input')?.name.split('-').pop();
    const selected=door[groupField];
    group.querySelectorAll('input[type="radio"]').forEach(radio=>radio.checked=radio.value===selected);
    const detail=row.querySelector('[data-detail-for="'+groupField+'"]');
    if(detail) detail.hidden=groupField==='hallazgo'?selected!=='x':groupField==='correctivo'?!['hecho','x'].includes(selected):true;
    if(groupField==='correctivo'){
      const textarea=detail?.querySelector('textarea');
      if(textarea){
        const detailLabel=selected==='hecho'?'Trabajo realizado':'Acción pendiente';
        textarea.setAttribute('aria-label',detailLabel);
        textarea.placeholder=selected==='hecho'?'Describe la reparación realizada':'Describe el correctivo pendiente';
      }
    }
  });
};

window.openHiperberFindingCamera=function(storeIndex,doorIndex){
  const input=document.createElement('input');
  input.className='hiperber-camera-input';
  input.type='file';
  input.accept='image/*';
  input.capture='environment';
  input.addEventListener('change',async()=>{
    await window.addHiperberFindingPhoto(storeIndex,doorIndex,input.files?.[0]);
    input.remove();
  },{once:true});
  input.addEventListener('cancel',()=>input.remove(),{once:true});
  document.body.appendChild(input);
  input.click();
};

window.addHiperberFindingPhoto=async function(storeIndex,doorIndex,file){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  if(!file||!door) return;
  try{
    door.hallazgoFotos=door.hallazgoFotos||[];
    door.hallazgoFotos.push(await compressDoticsPhoto(file));
    renderHiperberStores();
  }catch(error){showToast(error.message||'No se pudo procesar la foto','error');}
};

window.removeHiperberFindingPhoto=function(storeIndex,doorIndex,photoIndex){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  door?.hallazgoFotos?.splice(photoIndex,1);
  renderHiperberStores();
};

window.addHiperberDoor=function(storeIndex){
  const store=window.__hiperberReviewDraft?.stores[storeIndex];
  if(!store) return;
  store.puertas.push({id:null,nombre:'',tipo:'',hallazgo:null,correctivo:null,resultado:null,nueva:true});
  renderHiperberStores();
};

async function downloadRevisionPDFAfterSave(revisionId){
  let pdf;
  try{
    pdf=await window.generatePDF_revision(revisionId,{download:true});
  }catch(error){
    console.error('No se pudo generar el PDF de la revisión guardada:',error);
    showToast('Revisión guardada, pero no se pudo generar el PDF','error');
    return;
  }
  if(!window.authState?.user) return;
  try{
    const revisionKey=String(revisionId).replace(/[^a-zA-Z0-9_-]/g,'_');
    const path=window.authState.user.id+'/'+revisionKey+'-'+Date.now()+'.pdf';
    const {error:uploadError}=await window.supabaseDB.storage.from('revision-pdfs').upload(path,pdf.blob,{
      contentType:'application/pdf',upsert:false
    });
    if(uploadError) throw uploadError;
    const {data,error}=await window.supabaseDB.functions.invoke('share-revision',{
      body:{path,filename:pdf.filename}
    });
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    if(data.emailSent){
      showToast('PDF descargado y enlace enviado a administración');
      return;
    }
    try{
      await navigator.clipboard.writeText(data.url);
      showToast(data.emailError?'No se pudo enviar el correo. Enlace copiado':'PDF guardado. Enlace copiado; falta configurar el correo automático','warning');
    }catch{
      window.prompt('Enlace de descarga del PDF (válido durante 7 días):',data.url);
      showToast(data.emailError?'No se pudo enviar el correo. Copia el enlace mostrado':'PDF guardado. Configura el correo automático para enviarlo a administración','warning');
    }
  }catch(error){
    console.error('No se pudo compartir el PDF de la revisión:',error);
    showToast('Revisión guardada y PDF descargado, pero no se pudo compartir: '+error.message,'warning');
  }
}

/**
 * Reprograma las puertas y rutas que cubre una revisión HIPERBER guardada.
 * Para cada puerta revisada: ultimaRevision = fecha, proximaRevision = fecha + frecuencia de su ruta.
 * Para cada ruta con todas sus tiendas revisadas: ultimaRevision/proximaRevision de la ruta.
 */
// Reprogramación de puertas para revisión de CLIENTE sNICO (sin cadena/ruta):
// actualiza últimaRevision y calcula la próxima según la frecuencia de cada puerta.
async function reprogramarPuertasClientes(stores, fecha){
  for(const store of stores){
    for(const door of store.puertas){
      try{
        const puerta=await dbGet('puertas',door.id);
        if(!puerta) continue;
        const frecuencia=puerta.frecuenciaMeses||puerta.frecuencia||12;
        const proxima=new Date(fecha);
        proxima.setMonth(proxima.getMonth()+Number(frecuencia)||12);
        await dbPut('puertas',{
          ...puerta,
          ultimaRevision:fecha,
          fechaRevision:fecha,
          proximaRevision:proxima.toISOString().slice(0,10)
        });
      }catch(e){ console.warn('No se pudo reprogramar puerta',door.id,e); }
    }
  }
}

async function reprogramarTrasRevisionHIPERBER(draft, fecha){
  try{
    const fechaBase=String(fecha||'').slice(0,10);
    if(!fechaBase) return;
    const clientes=await dbGetAll('clientes');
    const rutas=await dbGetAll('rutas');
    const clienteById=new Map(clientes.map(c=>[String(c.id),c]));
    const rutaById=new Map(rutas.map(r=>[String(r.id),r]));
    const rutaIds=new Set();
    // 1) Puertas: marcar la última revisión y calcular la próxima según la frecuencia de la ruta
    for(const store of draft.stores||[]){
      const cliente=clienteById.get(String(store.clienteId));
      const rutaId=String(cliente?.rutaId??cliente?.rutaid??'');
      const ruta=rutaId?rutaById.get(rutaId):null;
      const frecuencia=Number(ruta?.frecuenciaMeses??ruta?.frecuenciameses)||6;
      const puertas=await dbGetByIndex('puertas','clienteId',store.clienteId);
      for(const puerta of puertas){
        await dbPut('puertas',{...puerta,ultimaRevision:fechaBase,proximaRevision:calcularProximaRevision(fechaBase,frecuencia)});
      }
      if(rutaId) rutaIds.add(rutaId);
    }
    // 2) Rutas: si todas las tiendas de la ruta fueron revisadas, avanzar la programación de la ruta
    for(const rutaId of rutaIds){
      const ruta=rutaById.get(rutaId);
      if(!ruta) continue;
      const tiendasRuta=clientes.filter(c=>String(c.rutaId??c.rutaid??'')===String(rutaId));
      const revisadas=new Set((draft.stores||[]).map(store=>String(store.clienteId)));
      const todasRevisadas=tiendasRuta.every(t=>revisadas.has(String(t.id)));
      if(!todasRevisadas) continue;
      const frecuencia=Number(ruta.frecuenciaMeses??ruta.frecuenciameses)||6;
      await dbPut('rutas',{...ruta,ultimaRevision:fechaBase,proximaRevision:calcularProximaRevision(fechaBase,frecuencia)});
    }
  }catch(error){
    console.error('reprogramarTrasRevisionHIPERBER falló:',error);
    showToast('Revisión guardada, pero no se pudo reprogramar puertas/rutas: '+error.message,'warning');
  }
}

window.saveHiperberReviewForm=async function(){
  const draft=window.__hiperberReviewDraft;
  if(!draft) return;
  const fecha=document.getElementById('hiperber-review-date').value;
  if(!fecha) return showToast('Selecciona la fecha de revisión','error');
  // El nombre de la puerta es de solo lectura: solo se consideran puertas existentes en BD
  const stores=draft.stores.map(store=>({...store,puertas:store.puertas.filter(door=>door.id)}));
  const doors=stores.flatMap(store=>store.puertas.map(door=>({...door,clienteId:store.clienteId,clienteNombre:store.nombre})));
  if(!doors.length){
    showToast('No hay puertas registradas en estas tiendas todavía','error');
    return;
  }
  if(doors.some(door=>!door.hallazgo||!door.correctivo||!door.resultado)){
    showToast('Completa Hallazgo, Correctivo y Resultado en cada puerta','error');
    return;
  }
  if(doors.some(door=>door.hallazgo==='x'&&!door.hallazgoTexto.trim())){
    showToast('Describe el hallazgo marcado con X','error');
    return;
  }
  if(doors.some(door=>door.correctivo==='hecho'&&!door.correctivoTexto.trim())){
    showToast('Describe el correctivo realizado','error');
    return;
  }
  // Subir fotos a storage antes de guardar
  await guardarFotosRevision();
  const items=doors.map(door=>({
    concepto:door.clienteNombre+' · '+door.nombre,clienteId:door.clienteId,clienteNombre:door.clienteNombre,puertaId:door.id,tipoPuerta:door.tipo,
    hallazgo:door.hallazgo==='ok'?'OK':'X',hallazgoEstado:door.hallazgo,hallazgoTexto:door.hallazgoTexto,hallazgoFotos:door.hallazgoFotos||[],
    correctivo:door.correctivo==='hecho'?door.correctivoTexto:door.correctivo==='x'?'X':'OK',correctivoEstado:door.correctivo,correctivoTexto:door.correctivoTexto,
    resultado:door.resultado==='ok'?'OK':'X',resultadoEstado:door.resultado
  }));
  const notas=JSON.stringify({form:'HIPERBER_REVISION_V1',cadenaId:draft.chainId,cadena:draft.chainName,supermercados:stores.map(store=>({id:store.clienteId,nombre:store.nombre,rutaId:store.rutaId||null})),rutaId:draft.chainId,rutaNombre:draft.chainName,tecnicos:window.authState?.employee?.nombre||''});
  try{
    await dbAdd('revisiones',{
      id:draft.id,puertaId:null,clienteId:null,fecha,tecnicoId:window.authState?.employee?.id||null,tecnicoNombre:window.authState?.employee?.nombre||null,items,
      hallazgos:doors.filter(door=>door.hallazgo==='x').map(door=>door.clienteNombre+' · '+door.nombre+': '+door.hallazgoTexto).join(' | '),
      correctivo:doors.filter(door=>door.correctivo==='hecho').map(door=>door.clienteNombre+' · '+door.nombre+': '+door.correctivoTexto).join(' | '),
      estadoTrasRevision:doors.some(door=>door.resultado==='x')?'fuera_servicio':'operativa',notas,createdAt:new Date().toISOString()
    });
    window.__hiperberReviewDraft=null;
    closeModal();
    showToast('Revisión guardada');
    if(window.__revRefrescar){
      try{ await window.__revRefrescar(); }catch(e){}
    }
  // Si es una revisión de cliente único (sin cadena), se reprograma solo la puerta del cliente.
  if(draft.esClienteUnico){
    try{
      await reprogramarPuertasClientes(draft.stores, fecha);
    }catch(e){ console.warn('Reprogramación cliente único falló:', e); }
  }
  // Reprogramar puertas y rutas afectadas por la revisión completada
  else await reprogramarTrasRevisionHIPERBER(draft, fecha);
  await downloadRevisionPDFAfterSave(draft.id);

    // Si es la última tienda, generar PDF consolidado de la ruta
    if(draft.esUltimaTienda && draft.chainId) {
      try {
        await window.generarPDFRutaCompleta(draft.chainId, draft.chainName, draft.chainId, draft.chainName);
      } catch(e) {
        console.error('Error generando PDF de ruta:', e);
        showToast('Revisión guardada, pero no se pudo generar el PDF de ruta', 'warning');
      }
    }
  }catch(error){
    showToast('No se pudo guardar la revisión: '+error.message,'error');
  }
};

window.openDoticsMaintenanceForm = async function(chainId, doorId=null, fechaPreseleccionada=null){
  let chain=await getCadenaById(chainId);
  if(!chain){
    const client=await dbGet('clientes',chainId);
    if(client?.nombre?.trim().toLocaleUpperCase()==='DOTICS') chain={id:client.id,nombre:client.nombre};
  }
  if(!chain) return showToast('No se encontró la cadena DOTICS','error');
  const door=doorId ? await dbGet('puertas',doorId) : null;
  const client=door?.clienteId ? await dbGet('clientes',door.clienteId) : null;
  const employees=window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const id=window.db.nextId('REV');
  await window.TiposPuerta.cargar().catch(()=>{});
  const productTypes=window.TiposPuerta.lista().map(t=>t.codigo);   // mismos tipos que en plantillas y puertas
  const doorType=window.TiposPuerta.resolver(door?.tipoPuerta||door?.tipo)?.codigo||'';
  window.__doticsVisitDraft={
    id,chainId:String(chain.id),chainName:chain.nombre,doorId:door?.id||null,productTypes,
    lines:[{
      tipoProducto:productTypes.includes(doorType)?doorType:'',
      denominacionCliente:door?.nombre||client?.nombre||'',
      numeroSerie:door?.numeroSerie||door?.serie||door?.serial||'',
      estado:'',observaciones:'',fotos:[]
    }]
  };
  const today=new Date().toISOString().slice(0,10);
  const form='<div class="dotics-form revision-form">'+
    '<div class="form-header"><div class="form-header-icon"><i class="fas fa-clipboard-check"></i></div><div class="form-header-text"><strong>'+escapeHtml(chain.nombre)+'</strong><span>Informe visita de mantenimiento</span></div></div>'+
    '<div class="form-grid">'+
      '<div class="form-group"><label for="dotics-contract">N.º contrato mantenimiento</label><input id="dotics-contract" type="text" class="input" autocomplete="off" placeholder="Opcional"></div>'+
      '<div class="form-group"><label for="dotics-intervention">N.º intervención</label><input id="dotics-intervention" type="text" class="input" autocomplete="off" placeholder="Escribe el número de intervención"></div>'+
      '<div class="form-group"><label for="dotics-technicians">Técnico/s</label><input id="dotics-technicians" type="text" class="input" list="dotics-employees" placeholder="Nombre/s del técnico" '+(window.isTechnician?.()?'value="'+escapeHtml(window.authState.employee?.nombre||'')+'" readonly':'')+'><datalist id="dotics-employees">'+employees.map(e=>'<option value="'+escapeHtml(e.nombre)+'">').join('')+'</datalist></div>'+
      '<div class="form-group"><label for="dotics-date">Fecha</label><input id="dotics-date" type="date" class="input" value="'+(fechaPreseleccionada||today)+'"></div>'+
    '</div>'+
    '<div class="section-header"><div><h3>Equipos revisados</h3><p>Indica un estado por equipo; añade foto si está operativo o no se debe usar.</p></div><button type="button" class="btn btn-outline btn-sm" onclick="addDoticsVisitLine()"><i class="fas fa-plus"></i> Añadir equipo</button></div>'+
    '<div id="dotics-visit-lines" class="dotics-line-list"></div>'+
    '<div class="form-group"><label for="dotics-notes">Observaciones generales</label><textarea id="dotics-notes" rows="3" class="input" placeholder="Observaciones de la visita"></textarea></div>'+
  '</div>';
  const footer='<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>'+
    '<button type="button" class="btn btn-primary" onclick="saveDoticsMaintenanceForm()"><i class="fas fa-save"></i> Guardar informe</button>';
  openModal('Informe visita de mantenimiento',form,footer);
  renderDoticsVisitLines();
};

function renderDoticsVisitLines(){
  const draft=window.__doticsVisitDraft;
  const container=document.getElementById('dotics-visit-lines');
  if(!draft||!container) return;
  container.innerHTML=draft.lines.map((line,index)=>{
    const photos=(line.fotos||[]).map((photo,photoIndex)=>
      '<div class="dotics-photo-preview"><img src="'+photo+'" alt="Foto del equipo '+(index+1)+'"><button type="button" class="btn btn-danger btn-icon" aria-label="Quitar foto" onclick="removeDoticsVisitPhoto('+index+','+photoIndex+')"><i class="fas fa-trash"></i></button></div>'
    ).join('');
    const photoField=line.estado==='operativo'||line.estado==='no_usar'
      ? '<div class="dotics-photo-field"><label>Fotos del equipo</label><div class="dotics-photo-actions">'+
          '<button type="button" class="btn btn-primary btn-sm" onclick="openDoticsCamera('+index+')"><i class="fas fa-camera"></i> Hacer foto</button>'+
          '<button type="button" class="btn btn-primary btn-sm" onclick="selectDoticsPhotoFile('+index+')"><i class="fas fa-image"></i> Seleccionar archivo</button>'+
          '<input id="dotics-camera-'+index+'" class="dotics-file-input" type="file" accept="image/*" capture="environment" onchange="addDoticsVisitPhoto('+index+',this)">'+
          '<input id="dotics-file-'+index+'" class="dotics-file-input" type="file" accept="image/*" onchange="addDoticsVisitPhoto('+index+',this)">'+
        '</div><div class="dotics-photo-previews">'+photos+'</div></div>'
      : '';
    return '<section class="dotics-line-card"><div class="dotics-line-title"><h4>Equipo '+(index+1)+'</h4>'+(draft.lines.length>1?'<button type="button" class="btn btn-outline btn-icon" aria-label="Eliminar equipo '+(index+1)+'" onclick="removeDoticsVisitLine('+index+')"><i class="fas fa-trash"></i></button>':'')+'</div>'+
      '<div class="dotics-line-fields">'+
        '<div class="form-group"><label for="dotics-type-'+index+'">Tipo producto</label><select id="dotics-type-'+index+'" onchange="updateDoticsVisitLine('+index+',\'tipoProducto\',this.value)"><option value="">— Seleccionar</option>'+draft.productTypes.map(type=>'<option value="'+type+'" '+(line.tipoProducto===type?'selected':'')+'>'+type+'</option>').join('')+'</select></div>'+
        '<div class="form-group"><label for="dotics-name-'+index+'">Denominación cliente</label><input id="dotics-name-'+index+'" type="text" value="'+escapeHtml(line.denominacionCliente)+'" oninput="updateDoticsVisitLine('+index+',\'denominacionCliente\',this.value)"></div>'+
        '<div class="form-group"><label for="dotics-serial-'+index+'">N.º de serie</label><input id="dotics-serial-'+index+'" type="text" value="'+escapeHtml(line.numeroSerie)+'" oninput="updateDoticsVisitLine('+index+',\'numeroSerie\',this.value)"></div>'+
        '<fieldset class="dotics-state-field"><legend>Estado del equipo</legend><div class="dotics-state-options">'+
          [['bueno','Bueno','Bueno'],['operativo','Operativo','Oper.'],['no_usar','No usar','No usar']].map(([value,label,compact])=>'<label class="dotics-state-option dotics-state-'+value+'"><input type="radio" name="dotics-state-'+index+'" value="'+value+'" aria-label="'+label+'" '+(line.estado===value?'checked':'')+' onchange="updateDoticsVisitState('+index+',this.value)"><span class="dotics-state-label-full">'+label+'</span><span class="dotics-state-label-compact" aria-hidden="true">'+compact+'</span></label>').join('')+
        '</div></fieldset>'+
        '<div class="form-group dotics-observations"><label for="dotics-observation-'+index+'">Observaciones</label><textarea id="dotics-observation-'+index+'" rows="2" oninput="updateDoticsVisitLine('+index+',\'observaciones\',this.value)">'+escapeHtml(line.observaciones)+'</textarea></div>'+photoField+
      '</div></section>';
  }).join('');
}

window.updateDoticsVisitLine=function(index,field,value){
  const line=window.__doticsVisitDraft?.lines[index];
  if(!line) return;
  line[field]=value;
  if(field==='estado') renderDoticsVisitLines();
};

window.updateDoticsVisitState=function(index,value){
  window.updateDoticsVisitLine(index,'estado',value);
  if(value==='no_usar') window.openDoticsCamera(index);
};

window.openDoticsCamera=function(index){
  document.getElementById('dotics-camera-'+index)?.click();
};

window.selectDoticsPhotoFile=function(index){
  document.getElementById('dotics-file-'+index)?.click();
};

window.addDoticsVisitLine=function(){
  window.__doticsVisitDraft?.lines.push({tipoProducto:'',denominacionCliente:'',numeroSerie:'',estado:'',observaciones:'',fotos:[]});
  renderDoticsVisitLines();
};

window.removeDoticsVisitLine=function(index){
  window.__doticsVisitDraft?.lines.splice(index,1);
  renderDoticsVisitLines();
};

async function compressDoticsPhoto(file){
  const source=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image=await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=source;
  });
  let scale=Math.min(1,1280/Math.max(image.width,image.height));
  let quality=.68;
  let result='';
  for(let attempt=0;attempt<8;attempt++){
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    result=canvas.toDataURL('image/jpeg',quality);
    if(result.length*.75<=160*1024) return result;
    if(quality>.48) quality-=.08;
    else scale*=.82;
  }
  throw new Error('La foto supera el tamaño admitido; prueba con otra imagen.');
}

window.addDoticsVisitPhoto=async function(index,input){
  const file=input.files?.[0];
  const line=window.__doticsVisitDraft?.lines[index];
  if(!file||!line) return;
  try{
    line.fotos=line.fotos||[];
    if(line.fotos.length>=10){
      showToast('Máximo 10 fotos por equipo','error');
      return;
    }
    line.fotos.push(await compressDoticsPhoto(file));
    renderDoticsVisitLines();
  }catch(error){
    showToast(error.message||'No se pudo procesar la foto','error');
    input.value='';
  }
};

window.removeDoticsVisitPhoto=function(index,photoIndex){
  const line=window.__doticsVisitDraft?.lines[index];
  if(!line) return;
  line.fotos.splice(photoIndex,1);
  renderDoticsVisitLines();
};

window.saveDoticsMaintenanceForm=async function(){
  const draft=window.__doticsVisitDraft;
  if(!draft) return;
  const date=document.getElementById('dotics-date').value;
  const contract=document.getElementById('dotics-contract').value.trim();
  const intervention=document.getElementById('dotics-intervention').value.trim();
  const technicians=document.getElementById('dotics-technicians').value.trim();
  const generalNotes=document.getElementById('dotics-notes').value.trim();
  if(!date||!intervention||!technicians){
    showToast('Completa la fecha, el número de intervención y el técnico.','error');
    return;
  }
  const lines=draft.lines.filter(line=>line.tipoProducto||line.denominacionCliente||line.numeroSerie);
  if(!lines.length||lines.some(line=>!line.estado)){
    showToast('Añade al menos un equipo e indica su estado.','error');
    return;
  }
  const employees=window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const lead=employees.find(employee=>technicians.toLocaleLowerCase().includes(employee.nombre.toLocaleLowerCase()));
  const items=lines.map(line=>({
    concepto:[line.tipoProducto,line.denominacionCliente,line.numeroSerie].filter(Boolean).join(' · '),
    tipoProducto:line.tipoProducto,denominacionCliente:line.denominacionCliente,numeroSerie:line.numeroSerie,
    estado:line.estado==='bueno'?'ok':line.estado==='operativo'?'desgaste':'correctivo',
    estadoEquipo:line.estado,hallazgo:line.observaciones,observaciones:line.observaciones,fotos:line.fotos
  }));
  const notes=JSON.stringify({form:'DOTICS_VISITA_V1',cadenaId:draft.chainId,cliente:draft.chainName,contrato:contract,intervencion:intervention,tecnicos:technicians,observaciones:generalNotes});
  try{
    await dbAdd('revisiones',{
      id:draft.id,puertaId:draft.doorId,clienteId:null,fecha:date,tecnicoId:lead?.id||null,items,
      hallazgos:items.filter(item=>item.estadoEquipo!=='bueno'&&item.hallazgo).map(item=>item.concepto+': '+item.hallazgo).join(' | '),
      correctivo:'',estadoTrasRevision:items.some(item=>item.estadoEquipo==='no_usar')?'fuera_servicio':'operativa',notas:notes,createdAt:new Date().toISOString()
    });
    if(draft.doorId && window.isTechnician?.()){
      const door=await dbGet('puertas',draft.doorId);
      const { error } = await window.supabaseDB.rpc('update_door_revision_schedule', {
        p_id: String(draft.doorId), p_last_revision: date,
        p_state: null
      });
      if(error) throw error;
    }else if(draft.doorId){
      const door=await dbGet('puertas',draft.doorId);
      if(door){
        const client=door.clienteId ? await dbGet('clientes',door.clienteId) : null;
        const routeId=client?.rutaId??client?.rutaid;
        const route=routeId ? await dbGet('rutas',routeId) : null;
        const frequency=Number(route?.frecuenciaMeses??route?.frecuenciameses)||6;
        await dbPut('puertas',{...door,ultimaRevision:date,proximaRevision:calcularProximaRevision(date,frequency)});
      }
    }
    window.__doticsVisitDraft=null;
    closeModal();
    showToast('Informe DOTICS guardado');
    await downloadRevisionPDFAfterSave(draft.id);
  }catch(error){
    showToast('No se pudo guardar el informe: '+error.message,'error');
  }
};
// Bloque final de pages.js
// IMPORTANTE: Object.assign para fusionar (no sobreescribir) lo que db.js ya expuso
// (render_informesKms, verMensual, verDetalleVehiculo, generarPDF expuestos desde pages_informesKms.js)

// ============================================
// CADENAS - CRUD completo
// ============================================

// ==================== CADENAS: Formulario y Guardado ====================

/**
 * showCadenaForm(editId) → Promise<void>
 * Muestra modal para crear/editar cadena con campos: nombre, descripcion.
 */
async function showCadenaForm(editId = null) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  let cadena = {};
  if (editId) {
    cadena = await getCadenaById(editId);
    if (!cadena) return;
  }

  title.textContent = editId ? 'Editar cadena' : 'Nueva cadena';
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <input id="form-cadena-id" type="hidden" value="${editId || ''}">
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Nombre *</label>
        <input id="form-cadena-nombre" type="text" class="input" value="${escapeHtml(cadena.nombre || '')}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">
      </div>
      <div>
        <label style="display:block;font-size:13px;color:var(--gray);margin-bottom:4px;">Descripción</label>
        <textarea id="form-cadena-descripcion" class="input" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:15px;">${escapeHtml(cadena.descripcion || cadena.nota || '')}</textarea>
      </div>
    </div>`;

  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="btn-save-cadena">${editId ? 'Actualizar' : 'Crear'}</button>`;

  overlay.classList.add('open');

  document.getElementById('btn-save-cadena').onclick = async () => {
    const idExistente = document.getElementById('form-cadena-id')?.value || null;
    const nombre = document.getElementById('form-cadena-nombre')?.value.trim();
    const descripcion = document.getElementById('form-cadena-descripcion')?.value.trim();

    if (!nombre) {
      mostrarToast('El nombre es obligatorio', 'error');
      return;
    }

    const ahora = new Date().toISOString();
    const cadenaData = {
      id: idExistente || window.db.nextId('CAD'),
      nombre,
      descripcion,
      updatedat: ahora
    };

    if (!idExistente) cadenaData.createdat = ahora;
    try {
      await dbPut('cadenas', { ...cadenaData });
    } catch (e) {
      console.error('showCadenaForm falló:', e);
      mostrarToast('Error guardando la cadena', 'error');
      return;
    }

    closeModal();
    mostrarToast(idExistente ? 'Cadena actualizada' : 'Cadena creada', 'success');
    render_cadenas();
  };
}

/**
 * getCadenaById(id) → Promise<Cadena | null>
 */
async function getCadenaById(id) {
  try {
    const data=await dbGet('cadenas',id);
    return data ? normalizarCadena(data) : null;
  } catch (e) {
    console.warn('getCadenaById falló:', e.message);
    return null;
  }
}

/**
 * normalizarCadena(c) → Cadena
 */
function normalizarCadena(c) {
  if (!c) return null;
  return {
    id: c.id,
    nombre: c.nombre || '',
    descripcion: c.descripcion || c.nota || '',
    createdat: c.createdat || c.created_at || new Date().toISOString(),
    updatedat: c.updatedat || new Date().toISOString()
  };
}

// ==================== RUTAS: Acceso a datos ====================

/**
 * getAllRutas(cadenaid) → Promise<Array<Ruta>>
 * Si cadenaid se pasa, filtra por cadena.
 */
async function getAllRutas(cadenaid) {
  const all=await dbGetAll('rutas');
  return all
    .filter(r=>!cadenaid||String(r.cadenaid??r.cadenaId)===String(cadenaid))
    .map(normalizarRuta)
    .sort((a,b)=>(a.orden||0)-(b.orden||0));
}

/**
 * getRutaById(id) → Promise<Ruta | null>
 */
async function getRutaById(id) {
  try {
    const data=await dbGet('rutas',id);
    return data ? normalizarRuta(data) : null;
  } catch (e) {
    console.warn('getRutaById falló:', e.message);
    return null;
  }
}

/**
 * normalizarRuta(r) → Ruta
 * Asegura campos consistentes independientemente del origen.
 */
function normalizarRuta(r) {
  if (!r) return null;
  const ultimaRevision = r.ultimaRevision ?? r.ultimorevision ?? null;
  const frecuencia = r.frecuenciaMeses ?? r.frecuenciameses ?? 6;
  const proxima = r.proximaRevision ?? r.proximarevision ?? calcularProximaRevision(ultimaRevision, frecuencia);
  return {
    id: r.id,
    nombre: r.nombre || '',
    cadenaid: r.cadenaid ?? r.cadenaId ?? null,
    cadenaId: r.cadenaId ?? r.cadenaid ?? null,
    frecuenciaMeses: frecuencia,
    frecuenciameses: frecuencia,
    orden: r.orden ?? 0,
    ultimaRevision,
    ultimorevision: ultimaRevision,
    proximaRevision: proxima,
    proximarevision: proxima,
    createdat: r.createdat || r.created_at || new Date().toISOString(),
    updatedat: r.updatedat || r.updated_at || new Date().toISOString()
  };
}

// ==================== RUTAS: Borrar ====================

/**
 * deleteRutaDb(id) → Promise<boolean>
 * Borra ruta en Supabase + IndexedDB. Cascada: limpia rutaid en clientes.
 */
window.deleteRutaDb = async function (id, confirmed=false) {
  if (!id) return false;

  if(!confirmed){
    if(window.confirmDelete){
      return new Promise(resolve=>window.confirmDelete('la ruta seleccionada',async()=>resolve(await window.deleteRutaDb(id,true))));
    }
    if(!window.confirm('¿Borrar esta ruta? Los clientes asociados perderán la referencia a la ruta.')) return false;
  }

  try {
    const ruta=await dbGet('rutas',id);
    const clientes=await dbGetAll('clientes');
    for(const cliente of clientes.filter(item=>String(item.rutaid??item.rutaId)===String(id))){
      await dbPut('clientes',{...cliente,rutaid:null,rutaId:null});
    }
    await dbDelete('rutas',id);
    mostrarToast('Ruta borrada', 'success');
    const currentChain=localStorage.getItem('cadenaId')||ruta?.cadenaid||ruta?.cadenaId;
    if(currentChain&&typeof render_rutas==='function') render_rutas(currentChain);
  } catch (e) {
    console.error('deleteRutaDb falló:', e);
    mostrarToast('No se pudo borrar la ruta', 'error');
    return false;
  }

  return true;
};

// ==================== RUTAS: Render de Página ====================

/**
 * render_rutas(cadenaid) → Promise<void>
 * Renderiza lista de rutas de una cadena en .main-content.
 */
async function render_rutas(mainOrChainId, requestedChainId) {
  const main=mainOrChainId?.nodeType===1 ? mainOrChainId : document.getElementById('mainContent');
  let cadenaId=requestedChainId || (mainOrChainId?.nodeType===1 ? localStorage.getItem('cadenaId') : mainOrChainId);
  if(cadenaId && typeof cadenaId==='object') cadenaId=cadenaId.target?.value??cadenaId.value??null;
  if (cadenaId) {
    cadenaId = String(cadenaId);
    window.setCurrentCadenId(cadenaId);
    localStorage.setItem('cadenaId', cadenaId);
  } else {
    cadenaId = window.getCurrentCadenId() || localStorage.getItem('cadenaId') || null;
  }

  if (!cadenaId) {
    main.innerHTML = '<p style="text-align:center;color:var(--gray);margin-top:40px;">Selecciona una cadena primero.</p>';
    return;
  }
  // Leer nombre de la cadena para el título
  let cadenaNombre = '';
  try {
    const cadena=await getCadenaById(cadenaId);
    if(cadena) cadenaNombre=cadena.nombre;
  } catch (e) {
    console.warn('No se pudo leer nombre cadena', cadenaId);
  }

  const esDotics=cadenaNombre.trim().toLocaleUpperCase()==='DOTICS';
  const esHiperber=cadenaNombre.trim().toLocaleUpperCase()==='HIPERBER';
  main.innerHTML = `
    <div class="page-header">
      <div class="route-page-heading">
        <nav class="breadcrumbs" aria-label="Ruta de navegación">
          <button type="button" class="breadcrumb-link" onclick="navigateTo('revisionesProgramadas')">Revisiones Programadas</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" class="breadcrumb-link" onclick="volverARevisionesCadena('${escapeHtml(cadenaId)}')">${escapeHtml(cadenaNombre)}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span aria-current="page">Rutas</span>
        </nav>
        <h2>🚗 Rutas</h2>
      </div>
      <div class="header-actions">
        ${esDotics?'<button class="btn btn-primary" id="btn-dotics-visit"><i class="fas fa-clipboard-check"></i> Formulario de revisión</button>':''}
        ${esHiperber?'<button class="btn btn-primary" id="btn-hiperber-review"><i class="fas fa-clipboard-check"></i> Formulario de revisión</button>':''}
        <button class="btn btn-primary" id="btn-nueva-ruta">+ Nueva Ruta</button>
      </div>
    </div>
    <div id="rutas-lista">
      <div class="spinner" style="margin:40px auto;text-align:center;">Cargando rutas...</div>
    </div>`;

  document.getElementById('btn-dotics-visit')?.addEventListener('click',()=>window.openDoticsMaintenanceForm(cadenaId));
  document.getElementById('btn-hiperber-review')?.addEventListener('click',()=>window.openHiperberReviewForm(cadenaId));

  let rutas = [];
  try {
    rutas = await getAllRutas(cadenaId);
  } catch (e) {
    console.error('render_rutas getAllRutas falló:', e);
  }

  if (!rutas.length) {
    document.getElementById('rutas-lista').innerHTML = `
      <div class="empty-state">
        <i class="fas fa-route"></i>
        <p>No hay rutas para esta cadena.</p>
        <button class="btn btn-outline" id="btn-primera-ruta" style="margin-top:16px;">+ Crear primera ruta</button>
      </div>`;
    document.getElementById('btn-primera-ruta').onclick = () => showRutaForm(null, cadenaId);
    return;
  }

  const html = rutas.map(ruta => {
    const rutaNormalizada = {
      ...ruta,
      proximaRevision: ruta.proximaRevision ?? ruta.proximarevision ?? null,
      ultimaRevision: ruta.ultimaRevision ?? ruta.ultimorevision ?? null,
      cadenaId: ruta.cadenaId ?? ruta.cadenaid ?? null,
      frecuenciaMeses: ruta.frecuenciaMeses ?? ruta.frecuenciameses ?? 6
    };
    const proxima = rutaNormalizada.proximaRevision ? new Date(rutaNormalizada.proximaRevision).toLocaleDateString('es-ES') : '—';
    const ultima = rutaNormalizada.ultimaRevision ? new Date(rutaNormalizada.ultimaRevision).toLocaleDateString('es-ES') : '—';

    let dias = '—';
    let badgeClass = '';
    if (rutaNormalizada.proximaRevision) {
      const diff = new Date(rutaNormalizada.proximaRevision).getTime() - Date.now();
      dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (dias < 0) badgeClass = 'badge-red';
      else if (dias <= 30) badgeClass = 'badge-yellow';
      else badgeClass = 'badge-green';
    }

    return `
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <strong>${escapeHtml(ruta.nombre)}</strong>
            <span class="badge ${badgeClass}" style="font-size:11px;">${dias !== '—' ? dias + ' días' : dias}</span>
          </div>
          <span style="color:var(--text-muted);font-size:13px;">Orden: ${ruta.orden}</span>
        </div>
        <div class="card-body" style="padding:12px 20px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;font-size:13px;color:var(--text-muted);">
            <div><strong>ultima revisión:</strong> ${ultima}</div>
            <div><strong>Próxima:</strong> ${proxima}</div>
            <div><strong>Frecuencia:</strong> ${rutaNormalizada.frecuenciaMeses} meses</div>
          </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;">
          <button type="button" class="btn btn-sm btn-outline" onclick="showRutaForm('${escapeHtml(ruta.id)}')">✏️ Editar</button>
          <button class="btn btn-sm btn-outline" onclick="render_clientes_ruta('${escapeHtml(ruta.id)}')">Clientes</button>
          <button type="button" class="btn btn-sm btn-primary" onclick="optimizarRutaTiendas('${escapeHtml(ruta.id)}','${escapeHtml(cadenaId)}','${escapeAttr(ruta.nombre)}','')"><i class="fas fa-route"></i> Optimizar</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteRuta('${escapeHtml(ruta.id)}','${escapeHtml(cadenaId)}')"><i class="fas fa-trash"></i> Borrar</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('rutas-lista').innerHTML = html;

  // o. Botón Nueva Ruta
  document.getElementById('btn-nueva-ruta').onclick = () => showRutaForm(null, cadenaId);
}


/**
 * render_clientes_ruta(rutaid) → carga y muestra clientes de esta ruta
 */
async function render_clientes_ruta(rutaid) {
  if (rutaid && typeof rutaid === 'object') {
    rutaid = rutaid.target?.value ?? rutaid.value ?? null;
  }

  let clientes = [];
  let ruta = null;
  try {
    ruta = await getRutaById(rutaid);
    const todos = await dbGetAll('clientes');
    clientes = ordenarTiendasRuta(todos.filter(c => String(c.rutaId ?? c.rutaid) === String(rutaid)));
  } catch (e) {
    console.error('render_clientes_ruta falló:', e);
  }

  const cadenaId = String(ruta?.cadenaId ?? ruta?.cadenaid ?? localStorage.getItem('cadenaId') ?? '');
  if (cadenaId) localStorage.setItem('cadenaId', cadenaId);
  const cadena = cadenaId ? await getCadenaById(cadenaId) : null;
  const main = document.querySelector('.main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="route-page-heading">
        <nav class="breadcrumbs" aria-label="Ruta de navegación">
          <button type="button" class="breadcrumb-link" onclick="navigateTo('revisionesProgramadas')">Revisiones Programadas</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" class="breadcrumb-link" onclick="volverARevisionesCadena('${escapeHtml(cadenaId)}')">${escapeHtml(cadena?.nombre || 'Cadena')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" class="breadcrumb-link" onclick="render_rutas('${escapeHtml(cadenaId)}')">Rutas</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span aria-current="page">Clientes</span>
        </nav>
        <h2>Clientes de ${escapeHtml(ruta?.nombre || 'esta ruta')}</h2>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="optimizarRutaTiendas('${escapeHtml(String(rutaid))}','${escapeHtml(cadenaId)}','${escapeAttr(ruta?.nombre || '')}','${escapeAttr(cadena?.nombre || '')}')"><i class="fas fa-route"></i> Optimizar ruta</button>
      </div>
    </div>
    <div id="clientes-ruta-lista">
      ${clientes.length ? clientes.map((c, idx) => `
        <div class="card" style="margin-bottom:10px;cursor:pointer;" onclick="showClienteForm('${escapeHtml(String(c.id))}')">
          <div class="card-body" style="padding:14px 18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <strong>${idx + 1}. ${escapeHtml(c.nombre)}</strong>
              <button type="button" class="btn btn-outline btn-sm" title="Editar cliente"
                onclick="event.stopPropagation(); showClienteForm('${escapeHtml(String(c.id))}')">
                <i class="fas fa-pen"></i> Editar
              </button>
            </div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;line-height:1.5;">
              ${c.direccion ? '<div>📸 ' + escapeHtml(c.direccion) + '</div>' : ''}
              <div>
                ${escapeHtml(c.telefono || 'Sin teléfono')}
                &nbsp;·&nbsp; ✉️ ${escapeHtml(c.email || 'Sin email')}
                ${c.dni ? '&nbsp;·&nbsp; CIF ' + escapeHtml(c.dni) : ''}
              </div>
            </div>
          </div>
        </div>
      `).join('') : '<p style="text-align:center;color:var(--gray);margin-top:40px;">No hay clientes en esta ruta.</p>'}
    </div>`;
}

window.volverARevisionesCadena=async function(chainId){
  await navigateTo('revisionesProgramadas');
  const group=document.querySelector('.revision-grupo[data-cadena-id="'+CSS.escape(String(chainId))+'"]');
  if(!group) return;
  const content=group.querySelector('.revision-content');
  if(content) content.style.display='block';
  group.scrollIntoView({behavior:'smooth',block:'start'});
};

window.showRutasForCadena = function(cadenaId) {
  // Normalizar por si llega elemento/evento desde el router
  if (cadenaId && typeof cadenaId === 'object') {
    cadenaId = cadenaId.target?.value ?? cadenaId.value ?? null;
  }
  if (!cadenaId) { console.warn('showRutasForCadena: sin id'); return; }
  const normalizedId = String(cadenaId);
  window.setCurrentCadenId(normalizedId);
  localStorage.setItem('cadenaId', normalizedId);
  navigateTo('rutas', normalizedId);
};
window.deleteCadena = async function(cadenaId) {
  if (!confirm('¿Eliminar esta cadena? Se borrarán también todas sus rutas.')) return;
  try {
    await deleteCadenaWithDependencies(cadenaId);
    toast('Cadena eliminada');
    navigateTo('cadenas');
  } catch (err) {
    console.error('Error al eliminar cadena:', err);
    alert('Error al eliminar: ' + err.message);
  }
};
// o. Puente con el router: navigateTo('cadenas') → render_cadenas

/**
 * render_cadenas() → Promise<void>
 * Renderiza lista de cadenas en .main-content.
 * Actualizado: usa descripcion (no nota), abre render_rutas al hacer clic.
 */
async function render_cadenas(main) {
  if (!main) main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="chains-page">
      <div class="page-header">
        <h2><i class="fas fa-link" style="color:var(--primary);"></i> Cadenas</h2>
        <button class="btn btn-primary" id="btn-new-cadena">+ Nueva cadena</button>
      </div>
      <div id="cadenas-list" class="chains-list"></div>
    </div>`;
  document.getElementById('btn-new-cadena').addEventListener('click', () => showCadenaForm());
  await renderCadenasList();
}
// Importador de folio OCR """""""""""""""""
let _importData = null;
let _importLoaded = false;

window.showImportFolioModal = async function() {
  const main = document.querySelector('main.main-content');
  if (!main) return;

  if (!_importLoaded) {
    main.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">⚙️ Cargando motor OCR... (~2 MB, solo la primera vez)</div>';
    try {
      await window.ensureTesseract();
      await Tesseract.createWorker('spa', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            main.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">Reconociendo texto... ${Math.round(m.progress * 100)}%</div>`;
          }
        }
      });
      _importLoaded = true;
    } catch (e) {
      main.innerHTML = `<div style="padding:24px;text-align:center;color:red;">O Error cargando OCR: ${e.message}</div>`;
      return;
    }
  }

  // Cargar cadenas para el selector
  const cadenas = await window.db.dbGetAll('cadenas');
  const cadenasOptions = cadenas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

  main.innerHTML = `
    <div id="import-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;">
      <div style="background:var(--surface);color:var(--text);border:1px solid var(--border);box-shadow:0 20px 50px rgba(0,0,0,.45);border-radius:14px;padding:24px;max-width:700px;width:90%;max-height:90vh;overflow-y:auto;">
        <h2 style="margin:0 0 16px;color:var(--text);">Y"" Importar folio de clientes</h2>
        <p style="color:var(--text-muted);margin:0 0 16px;">Haz una foto o elige un folio con rutas y tiendas. Tesseract leerá el texto y te mostrará una vista previa editable antes de guardar.</p>
        
        <div style="margin-bottom:16px;">
          <label style="font-weight:600;display:block;margin-bottom:6px;">Selecciona la cadena (padre):</label>
          <select id="import-cadena-select" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-alt);color:var(--text);">
            ${cadenasOptions}
          </select>
        </div>

        <div id="import-upload-area" style="border:2px dashed var(--border);border-radius:10px;padding:32px;text-align:center;cursor:pointer;margin-bottom:16px;background:var(--surface-alt);color:var(--text);">
          <input type="file" id="import-file" accept="image/*" capture="environment" style="display:none;">
          <div id="import-preview-container" style="margin-bottom:16px;"></div>
          <p id="import-upload-hint">Clic o arrastra una imagen aquí</p>
        </div>

        <div id="import-status" style="margin-bottom:16px;display:none;"></div>

        <div id="import-results" style="display:none;"></div>

        <div id="import-actions" style="display:none;margin-top:16px;text-align:right;">
          <button id="import-cancel" class="btn btn-outline" style="margin-right:8px;">Cancelar</button>
          <button id="import-import-btn" class="btn btn-primary">Importar todo</button>
        </div>
      </div>
    </div>
  `;

  const modal = document.getElementById('import-modal');
  const fileInput = document.getElementById('import-file');
  const uploadArea = document.getElementById('import-upload-area');
  const previewContainer = document.getElementById('import-preview-container');
  const hint = document.getElementById('import-upload-hint');
  const status = document.getElementById('import-status');
  const results = document.getElementById('import-results');
  const cancelBtn = document.getElementById('import-cancel');
  const importBtn = document.getElementById('import-import-btn');

  //  CERRAR MODAL CON CLIC FUERA 
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      cancelBtn.click();
    }
  });

  //  CERRAR CON ESCAPE 
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      cancelBtn.click();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'var(--border)'; });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    const img = document.createElement('img');
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';
    img.onload = () => {
      previewContainer.innerHTML = '';
      previewContainer.appendChild(img);
      hint.style.display = 'none';
    };
    img.src = URL.createObjectURL(file);
    status.style.display = 'block';
    status.innerHTML = '⚙️ Procesando imagen...';
    status.style.color = 'var(--text-muted)';

    Tesseract.recognize(img.src, 'spa', {
      logger: m => {
        if (m.status === 'recognizing text') {
          status.innerHTML = `Reconociendo texto... ${Math.round(m.progress * 100)}%`;
        }
      }
    }).then(({ data: { text } }) => {
      status.style.display = 'none';
      _importData = parseFolioTexto(text);
      renderImportResults();
    }).catch(e => {
      status.style.color = 'red';
      status.innerHTML = `O Error: ${e.message}`;
    });
  }

  function renderImportResults() {
    if (!_importData || !_importData.rutas.length) {
      results.style.display = 'block';
      results.innerHTML = '<p style="color:#e67e22;">📍 No se detectaron rutas. Revisa la imagen y prueba de nuevo.</p>';
      document.getElementById('import-actions').style.display = 'block';
      return;
    }

    let html = '<h3 style="margin:0 0 12px;color:var(--text);">Vista previa — revisa y corrige antes de importar:</h3>';

    _importData.rutas.forEach((ruta, ri) => {
      html += `<details open style="margin-bottom:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--surface-alt);">
        <summary style="font-weight:600;cursor:pointer;">🚗 RUTA
          <input type="number" data-ruta-num="${ri}" value="${ruta.numero}" min="1"
            style="width:60px;margin:0 6px;padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);">
          (${ruta.clientes.length} tiendas)
        </summary>
        <div style="margin-top:8px;">`;

      ruta.clientes.forEach((cli, ci) => {
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--border);flex-wrap:wrap;">
          <input type="checkbox" checked data-inc="${ri}-${ci}" style="width:16px;height:16px;flex-shrink:0;">
          <input type="text" data-nombre="${ri}-${ci}" value="${escAttr(cli.nombre)}" placeholder="Nombre tienda"
            style="flex:1 1 160px;min-width:140px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);">
          <input type="text" data-direccion="${ri}-${ci}" value="${escAttr(cli.direccion)}" placeholder="Dirección completa"
            style="flex:2 1 240px;min-width:200px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);">
        </div>`;
      });

      html += `</div></details>`;
    });

    results.style.display = 'block';
    results.innerHTML = html;
    document.getElementById('import-actions').style.display = 'block';
  }

  function escAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  cancelBtn.addEventListener('click', () => {
    const el = document.getElementById('import-modal');
    if (el) el.remove();
    _importData = null;
  });

  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    importBtn.textContent = '⚙️ Guardando...';
    status.style.display = 'block';
    status.style.color = '#2563eb';
    status.innerHTML = '⚙️ Guardando clientes y rutas en Supabase...';

    try {
      // Obtener cadena seleccionada
      const cadenaSelect = document.getElementById('import-cadena-select');
      const cadenaId = cadenaSelect ? cadenaSelect.value : null;
      if (!cadenaId) {
        throw new Error('No se ha seleccionado ninguna cadena. Selecciona una cadena antes de importar.');
      }

      const cadenas = await window.db.dbGetAll('cadenas');
      const cadenaSeleccionada = cadenas.find(c => String(c.id) === String(cadenaId));
      if (!cadenaSeleccionada) {
        throw new Error('No se encontró la cadena seleccionada.');
      }

      let totalRutasCreadas = 0;
      let totalCreados = 0;
      let totalExistente = 0;
      const rutasCreadasNombres = [];

      for (let ri = 0; ri < _importData.rutas.length; ri++) {
        const ruta = _importData.rutas[ri];

        const numInput = document.querySelector(`input[data-ruta-num="${ri}"]`);
        const numeroRuta = numInput ? numInput.value.trim() : ruta.numero;

        const rutasAll = await window.db.dbGetAll('rutas');
        let rutaExistente = rutasAll.find(r =>
          String(r.cadenaId ?? r.cadenaid) === cadenaSeleccionada.id &&
          String(r.nombre).toLowerCase().includes(String(numeroRuta).trim())
        );

        if (!rutaExistente) {
          const nuevaRuta = {
            id: window.db.nextId('RUT'),
            nombre: `RUTA ${numeroRuta}`,
            cadenaId: cadenaSeleccionada.id,
            cadenaid: cadenaSeleccionada.id,
            frecuenciameses: 6,
            orden: parseInt(numeroRuta) || 0,
            proximarevision: null,
            ultimorevision: null
          };
          await window.db.dbPut('rutas', nuevaRuta);
          rutaExistente = nuevaRuta;
          totalRutasCreadas++;
          rutasCreadasNombres.push(`RUTA ${numeroRuta}`);
        }

        for (let ci = 0; ci < ruta.clientes.length; ci++) {
          const cb = document.querySelector(`input[data-inc="${ri}-${ci}"]`);
          if (cb && !cb.checked) continue;

          const nombreInput = document.querySelector(`input[data-nombre="${ri}-${ci}"]`);
          const dirInput = document.querySelector(`input[data-direccion="${ri}-${ci}"]`);
          const nombre = (nombreInput?.value || '').trim();
          const direccion = (dirInput?.value || '').trim();
          if (!nombre) continue;

          const clientesAll = await window.db.dbGetAll('clientes');
          const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const yaExiste = clientesAll.find(c => norm(c.nombre) === norm(nombre));

          if (yaExiste) {
            yaExiste.rutaId = rutaExistente.id;
            yaExiste.rutaid = rutaExistente.id;
            yaExiste.cadenaId = cadenaSeleccionada.id;
            yaExiste.cadenaid = cadenaSeleccionada.id;
            yaExiste.padreId = cadenaSeleccionada.id;
            yaExiste.padreid = cadenaSeleccionada.id;
            await window.db.dbPut('clientes', yaExiste);
            totalExistente++;
          } else {
            await window.db.dbPut('clientes', {
              id: window.db.nextId('CLI'),
              nombre,
              direccion,
              cadenaId: cadenaSeleccionada.id,
              cadenaid: cadenaSeleccionada.id,
              padreId: cadenaSeleccionada.id,
              padreid: cadenaSeleccionada.id,
              rutaId: rutaExistente.id,
              rutaid: rutaExistente.id,
              esCadena: false,
              escadena: false,
              tipo: 'empresa'
            });
            totalCreados++;
          }
        }
      }

      status.style.color = '#16a34a';
      let mensaje = `o. ¡Importación completada!<br>`;
      mensaje += `${totalRutasCreadas} ruta${totalRutasCreadas !== 1 ? 's creadas' : ' creada'}: ${rutasCreadasNombres.join(', ') || 'ninguna (ya existían)'}<br>`;
      mensaje += `${totalCreados} cliente${totalCreados !== 1 ? 's creados' : ' creado'} · ${totalExistente} actualizados`;
      status.innerHTML = mensaje;
      results.style.display = 'none';
      uploadArea.style.display = 'none';

      // Re-enable cancel to close
      cancelBtn.textContent = 'Cerrar';
      cancelBtn.onclick = () => {
        const el = document.getElementById('import-modal');
        if (el) el.remove();
        _importData = null;
      };

      if (window.currentPage === 'clientes' && typeof renderClientesList === 'function') {
        renderClientesList();
      }

    } catch (e) {
      status.style.color = 'red';
      status.innerHTML = `O Error: ${e.message}`;
      importBtn.disabled = false;
      importBtn.textContent = 'Importar todo';
    }
  });
};
window.render_importFolio = function(main) {
  showImportFolioModal();
};

//  MANUALES
window.getTiposManuales = async function(){
  return window.TiposPuerta.filasDB();   // catálogo único: ya incluye Corredera Cristal y el resto
};

window.render_manuales = async function(el){
  const manuales = await dbGetAll('manuales');
  const tipos = await getTiposManuales();
  
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  el.innerHTML =
    '<div class="page-header"><div><h2>Manuales</h2><p>Manuales técnicos por tipo de puerta y avería</p></div>'+
    '<div class="header-actions"><button class="btn btn-primary" onclick="showSubirManualModal()"><i class="fas fa-upload"></i> Subir Manual</button><button class="btn btn-secondary" onclick="navigateTo(\'configuracion\')"><i class="fas fa-xmark"></i> Cerrar</button></div></div>'+
    '<div class="search-bar">'+
      '<input type="text" placeholder="Buscar manual..." id="searchManual" oninput="renderManualesList()">'+
      '<select id="filterTipoManual" onchange="renderManualesList()"><option value="">Todos los tipos</option>'+
      tiposOptions+'</select></div>'+
    '<div class="card"><div class="table-wrapper"><table><thead>'+
      '<tr><th>Título</th><th>Tipo de puerta</th><th>Tipo de avería</th><th>Fecha</th><th>Acciones</th></tr>'+
    '</thead><tbody id="manualesBody"></tbody></table></div></div>';
  renderManualesList();
};

window.renderManualesList = async function(){
  const manuales = await dbGetAll('manuales');
  const q = (document.getElementById('searchManual')?.value||'').toLowerCase();
  const tipo = document.getElementById('filterTipoManual')?.value||'';
  const tipos = await getTiposManuales();
  const tiposMap = new Map(tipos.map(t => [t.id, t.nombre]));
  
  const filtered = manuales.filter(m=>{
    if(q && !JSON.stringify(m).toLowerCase().includes(q)) return false;
    if(tipo && m.tipoPuerta!==tipo) return false;
    return true;
  });
  
  document.getElementById('manualesBody').innerHTML = filtered.map(m=>{
    const tipoNombre = m.tipoPuerta ? tiposMap.get(m.tipoPuerta) || '—' : '—';
    return '<tr>'+
      '<td><strong>'+escapeHtml(m.titulo)+'</strong></td>'+
      '<td><span class="badge badge-blue">'+escapeHtml(tipoNombre)+'</span></td>'+
      '<td><span class="badge badge-purple">'+escapeHtml(m.tipoAveria||'—')+'</span></td>'+
      '<td>'+new Date(m.createdAt).toLocaleDateString('es-ES')+'</td>'+
      '<td class="actions-cell">'+
        '<button class="btn btn-outline btn-sm" onclick="verManual(\''+m.id+'\')"><i class="fas fa-eye"></i> Ver</button>'+
        '<button class="btn btn-outline btn-sm btn-icon" onclick="eliminarManual(\''+m.id+'\')"><i class="fas fa-trash"></i></button>'+
      '</td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">Sin manuales</td></tr>';
};

window.showSubirManualModal = async function(){
  const tipos = await getTiposManuales();
  const tiposOptions = tipos.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  
  const form = '<div class="form-grid">'+
    '<div class="form-group full"><label>Título *</label><input id="man_titulo" placeholder="Ej: Motor averiado - Corredera"></div>'+
    '<div class="form-group"><label>Tipo de puerta</label><select id="man_tipo">'+tiposOptions+'</select></div>'+
    '<div class="form-group"><label>Tipo de avería</label><input id="man_averia" placeholder="Ej: motor, sensor, muelle..."></div>'+
    '<div class="form-group full"><label>Archivo PDF *</label><input type="file" id="man_archivo" accept=".pdf" required></div>'+
  '</div>';
  
  const footer = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="subirManual()"><i class="fas fa-upload"></i> Subir</button>';
  openModal('Subir Manual', form, footer);
};

window.subirManual = async function(){
  const titulo = document.getElementById('man_titulo').value.trim();
  const tipoPuerta = document.getElementById('man_tipo').value;
  const tipoAveria = document.getElementById('man_averia').value.trim();
  const archivoInput = document.getElementById('man_archivo');
  
  if(!titulo){ showToast('El título es obligatorio','error'); return; }
  if(!archivoInput.files[0]){ showToast('Debes seleccionar un archivo PDF','error'); return; }
  
  const archivo = archivoInput.files[0];
  if(archivo.type!=='application/pdf'){ showToast('El archivo debe ser un PDF','error'); return; }
  
  try{
    // Leer el archivo como base64 para guardarlo
    const reader = new FileReader();
    reader.onload = async function(e){
      const base64 = e.target.result;
      const data = {
        id: 'MAN-'+Date.now(),
        titulo,
        tipoPuerta,
        tipoAveria,
        pdfData: base64,
        createdAt: new Date().toISOString()
      };
      
      await dbPut('manuales', data);
      closeModal();
      showToast('Manual subido correctamente');
      renderManualesList();
    };
    reader.readAsDataURL(archivo);
  }catch(err){
    console.error('Error al subir manual:', err);
    showToast('Error al subir manual: '+err.message,'error');
  }
};

window.verManual = async function(id){
  const manual = await dbGet('manuales', id);
  if(!manual || !manual.pdfData){ showToast('Manual no encontrado','error'); return; }
  
  // Abrir PDF en nueva pestaña
  const blob = await fetch(manual.pdfData).then(r => r.blob());
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
};

window.eliminarManual = async function(id){
  if(!confirm('¿Eliminar este manual?')) return;
  await dbDelete('manuales', id);
  showToast('Manual eliminado');
  renderManualesList();
};

/* ========================================
   IMPORTACIÓN DE CLIENTES DESDE EXCEL / CSV
   ======================================== */
window.__importClientesFilas = null;

// Cabeceras admitidas (norm: minúsculas, sin acentos). "oblig" = obligatoria.
const IMPORT_CLIENTES_CAMPOS = [
  { norm: 'nombre',                 alias: ['nombre','razon social','razonsocial','nombre cliente','nombrecomercial','nombre comercial','empresa'], oblig: true,  campo: 'nombre' },
  { norm: 'contacto',               alias: ['contacto','persona contacto','persona de contacto','personacontacto'],                                 oblig: false, campo: 'contacto' },
  { norm: 'telefono',               alias: ['telefono','teléfono','tel','telefono1','telefono contacto'],                                            oblig: false, campo: 'telefono' },
  { norm: 'email',                  alias: ['email','correo','correo electronico','correo electrónico','e-mail'],                                    oblig: false, campo: 'email' },
  { norm: 'direccion',              alias: ['direccion','dirección','dir','direccion completa'],                                                     oblig: false, campo: 'direccion' },
  { norm: 'tipo',                   alias: ['tipo','tipocliente','tipo cliente'],                                                                    oblig: false, campo: 'tipo' },
  { norm: 'dni',                    alias: ['dni','nif','cif','dni/cif','dninif'],                                                                   oblig: false, campo: 'dni' },
  { norm: 'nota',                   alias: ['nota','notas','observaciones','comentarios'],                                                           oblig: false, campo: 'nota' },
  // Cabeceras del INFORME.xlsx (Sage) — se guardan en campos dedicados
  { norm: 'codigo',                 alias: ['codigo','código','codigo cliente','código cliente'],                                                    oblig: false, campo: 'codigo' },
  { norm: 'cpostal',                alias: ['c postal','cpostal','código postal','código postal','codigo postal','cp','c postal'],                  oblig: false, campo: 'cpostal' },
  { norm: 'poblacion',              alias: ['poblacion','población','ciudad','municipio'],                                                           oblig: false, campo: 'poblacion' },
  { norm: 'provincia',              alias: ['provincia'],                                                                                            oblig: false, campo: 'provincia' }
];

function importNormHeader(s){
  return String(s||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[_\-.]+/g,' ').replace(/\s+/g,' ');
}

window.showImportClientesModal = function(){
  window.__importClientesFilas = null;
  openModal('Importar clientes (Excel / CSV)',
    '<p style="color:var(--text-muted);margin-bottom:12px">Sube un archivo <strong>.xlsx/.xls</strong> o <strong>.csv</strong>. La primera fila deben ser los nombres de los campos: <strong>Nombre</strong> (obligatorio) y, opcionales, Contacto, Teléfono, Email, Dirección, C.Postal, Población, Provincia, NIF/CIF, Código y Notas.</p>'+
    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13.5px"><input type="checkbox" id="ic_geo" checked> <i class="fas fa-map-marker-alt" style="color:#16a34a"></i> Geolocalizar direcciones automáticamente durante la importación (≈1 dirección/segundo)</label>'+
    '<div id="ic_drop" style="border:2px dashed var(--border);border-radius:10px;padding:26px;text-align:center;cursor:pointer;background:var(--surface-alt)">'+
      '<input type="file" id="ic_file" accept=".xlsx,.xls,.csv" style="display:none">'+
      '<i class="fas fa-file-excel" style="font-size:28px;color:#16a34a"></i>'+
      '<p style="margin:8px 0 0">Clic o arrastra aquí el archivo</p>'+
    '</div>'+
    '<div id="ic_status" style="margin-top:12px;font-size:13px"></div>'+
    '<div id="ic_preview" style="margin-top:12px"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" id="ic_import" disabled><i class="fas fa-download"></i> Importar a clientes</button>');

  const drop = document.getElementById('ic_drop');
  const fileInput = document.getElementById('ic_file');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.style.borderColor = 'var(--border)';
    if(e.dataTransfer.files.length) window.__procesarArchivoClientes(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if(fileInput.files.length) window.__procesarArchivoClientes(fileInput.files[0]);
  });

  document.getElementById('ic_import').addEventListener('click', window.__guardarClientesImportados);
};

window.__procesarArchivoClientes = async function(file){
  const status = document.getElementById('ic_status');
  const preview = document.getElementById('ic_preview');
  const btnImport = document.getElementById('ic_import');
  status.innerHTML = '⚙️ Leyendo archivo...';
  preview.innerHTML = '';

  try{
    const lower = file.name.toLowerCase();
    let rows;
    if(lower.endsWith('.csv')){
      rows = await window.__leerCSVClientes(file);
    } else if(lower.endsWith('.xlsx') || lower.endsWith('.xls')){
      rows = await window.__leerExcelClientes(file);
    } else {
      throw new Error('Formato no admitido. Usa .xlsx, .xls o .csv');
    }
    if(!rows || !rows.length) throw new Error('El archivo está vacío.');

    // ── Validación de cabeceras ──
    const headers = rows[0].map(importNormHeader);
    const mapeados = IMPORT_CLIENTES_CAMPOS.map(cfg => {
      const idx = headers.findIndex(h => cfg.alias.includes(h));
      return { ...cfg, idx };
    });
    const faltanObligatorias = mapeados.filter(m => m.oblig && m.idx < 0).map(m => m.alias[0]);
    if(faltanObligatorias.length){
      throw new Error('Faltan columnas obligatorias: ' + faltanObligatorias.join(', ') +
        '. Cabeceras encontradas: ' + (rows[0].join(', ') || '(ninguna)'));
    }
    const desconocidas = headers.filter((h,i) => h && !mapeados.some(m => m.idx === i));
    if(desconocidas.length){
      showToast('Columnas ignoradas (no reconocidas): ' + desconocidas.join(', '), 'warning');
    }

    // ── Parsear filas ──
    const filas = [];
    const errores = [];
    rows.slice(1).forEach((r, i) => {
      const numFila = i + 2;
      const fila = {};
      mapeados.forEach(m => {
        if(m.idx >= 0) fila[m.campo] = String(r[m.idx] ?? '').trim();
      });
      if(!fila.nombre && !Object.values(fila).some(Boolean)) return; // fila vacía
      if(!fila.nombre){ errores.push('Fila ' + numFila + ': sin nombre'); return; }
      const tipo = importNormHeader(fila.tipo);
      fila.tipo = tipo === 'particular' ? 'particular' : 'empresa';
      filas.push(fila);
    });

    if(!filas.length) throw new Error('No se encontró ninguna fila con datos válidos (¿falta la columna Nombre?).');

    // ── Componer dirección completa (dirección + CP + población + provincia) y dedup por código ──
    const compDir = f => {
      const partes = [f.direccion, [f.cpostal, f.poblacion].filter(Boolean).join(' '), f.provincia].filter(Boolean).map(p => String(p).trim());
      const vistos = new Set();
      const unicos = [];
      for(const p of partes){ const k = p.toLowerCase(); if(!vistos.has(k)){ vistos.add(k); unicos.push(p); } }
      return unicos.join(', ');
    };
    filas.forEach(f => {
      if(f.cpostal || f.poblacion || f.provincia) f.direccion = compDir(f);
      delete f.cpostal; delete f.poblacion; delete f.provincia;
    });
    // Dedup por código (Sage): misma ficha que aparece dos veces con datos distintos
    const porCodigo = new Map();
    const sinCodigo = [];
    for(const f of filas){
      if(f.codigo){
        const prev = porCodigo.get(f.codigo);
        if(prev){ for(const k of Object.keys(f)){ if(f[k] && !prev[k]) prev[k] = f[k]; } }
        else porCodigo.set(f.codigo, f);
      } else sinCodigo.push(f);
    }
    const filasFinal = [...porCodigo.values(), ...sinCodigo];
    filasFinal.forEach(f => { f.sageCodigo = f.codigo || null; delete f.codigo; });

    window.__importClientesFilas = filasFinal;

    status.innerHTML = '<span style="color:#16a34a">✅ ' + filasFinal.length + ' fila(s) válidas' +
      (filasFinal.length !== filas.length ? ' (de ' + filas.length + ' leídas — duplicadas por código fusionadas)' : '') + ' · ' +
      (errores.length ? ' · ' + errores.length + ' ignorada(s)' : '') + '</span>';
    if(errores.length){
      status.innerHTML += '<br><small style="color:#f59e0b">' + escapeHtml(errores.slice(0,5).join(' · ')) +
        (errores.length>5 ? ' y ' + (errores.length-5) + ' más' : '') + '</small>';
    }

    // Vista previa
    const vista = filas.slice(0, 10);
    preview.innerHTML =
      '<div class="table-wrapper"><table><thead><tr><th>#</th><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Tipo</th></tr></thead><tbody>' +
      vista.map((f,i) => '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(f.nombre)+'</td><td>'+escapeHtml(f.contacto||'—')+'</td><td>'+escapeHtml(f.telefono||'—')+'</td><td>'+escapeHtml(f.email||'—')+'</td><td>'+escapeHtml(f.direccion||'—')+'</td><td>'+escapeHtml(f.tipo)+'</td></tr>').join('') +
      '</tbody></table></div>' +
      (filas.length > 10 ? '<small style="color:var(--text-muted)">y ' + (filas.length-10) + ' más...</small>' : '');

    btnImport.disabled = false;
  }catch(err){
    status.innerHTML = '<span style="color:#dc2626">❌ ' + escapeHtml(err.message) + '</span>';
    btnImport.disabled = true;
  }
};

/** Lee un CSV (separador , o ;) devolviendo array de arrays de strings */
window.__leerCSVClientes = function(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      try{
        let text = String(reader.result || '');
        if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
        const delim = (text.split('\n')[0].match(/;/g)||[]).length > (text.split('\n')[0].match(/,/g)||[]).length ? ';' : ',';
        const rows = [];
        let row = [], cell = '', inQuotes = false;
        for(let i = 0; i < text.length; i++){
          const ch = text[i];
          if(inQuotes){
            if(ch === '"'){
              if(text[i+1] === '"'){ cell += '"'; i++; }
              else inQuotes = false;
            } else cell += ch;
          } else if(ch === '"'){ inQuotes = true; }
          else if(ch === delim){ row.push(cell); cell = ''; }
          else if(ch === '\n' || ch === '\r'){
            if(ch === '\r' && text[i+1] === '\n') i++;
            row.push(cell); cell = '';
            if(row.some(c => c !== '')) rows.push(row);
            row = [];
          } else cell += ch;
        }
        if(cell !== '' || row.length){ row.push(cell); if(row.some(c => c !== '')) rows.push(row); }
        resolve(rows);
      }catch(err){ reject(err); }
    };
    reader.readAsText(file, 'utf-8');
  });
};

/** Lee un Excel con SheetJS (cargado desde CDN bajo demanda) */
window.__ensureSheetJS = async function(){
  if(window.XLSX) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel (¿sin conexión?)'));
    document.head.appendChild(s);
  });
};

window.__leerExcelClientes = async function(file){
  await window.__ensureSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
};

window.__guardarClientesImportados = async function(){
  const filas = window.__importClientesFilas;
  if(!filas || !filas.length){ showToast('No hay datos para importar','error'); return; }
  const btn = document.getElementById('ic_import');
  const geolocalizar = document.getElementById('ic_geo')?.checked !== false;
  btn.disabled = true;

  try{
    const existentes = await dbGetAll('clientes');
    const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    let creados = 0, actualizados = 0, saltados = 0, geolocalizados = 0, sinGeo = 0;
    const errores = [];

    for(let fi=0; fi<filas.length; fi++){
      const fila = filas[fi];
      try{
        // Validación de email si viene
        if(fila.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fila.email)){
          errores.push('Email no válido para ' + fila.nombre + ' (se importa sin email)');
          delete fila.email;
        }
        const dup = existentes.find(c => norm(c.nombre) === norm(fila.nombre));
        let coords = null;
        if(geolocalizar && fila.direccion){
          // Marcador de progreso en el botón
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Geolocalizando ' + (fi+1) + '/' + filas.length + '…';
          try{ coords = await geocodificar(fila.direccion); }catch(_){ }
          if(coords){ geolocalizados++; }
          else sinGeo++;
          // Nominatim: cortesía de ~1.1 s entre peticiones para no saturar el servicio
          await new Promise(r => setTimeout(r, 1100));
        }
        if(dup){
          // Actualizar datos de la ficha existente sin perder los que ya tenía
          await dbPut('clientes', {
            ...dup,
            contacto: fila.contacto || dup.contacto,
            telefono: fila.telefono || dup.telefono,
            email: fila.email || dup.email,
            direccion: fila.direccion || dup.direccion,
            tipo: fila.tipo || dup.tipo,
            nota: fila.nota || dup.nota,
            dni: fila.dni || dup.dni,
            sageCodigo: fila.sageCodigo || dup.sageCodigo || null,
            lat: (coords ? coords.lat : (dup.lat || null)),
            lng: (coords ? coords.lng : (dup.lng || null)),
            updatedAt: new Date().toISOString()
          });
          actualizados++;
        } else {
          await dbCreate('clientes', {
            id: window.db.nextId('CLI'),
            nombre: fila.nombre,
            contacto: fila.contacto || '',
            telefono: fila.telefono || '',
            email: fila.email || '',
            direccion: fila.direccion || '',
            tipo: fila.tipo,
            nota: fila.nota || '',
            dni: fila.dni || '',
            sageCodigo: fila.sageCodigo || null,
            lat: coords ? coords.lat : null,
            lng: coords ? coords.lng : null,
            esCadena: false,
            updatedAt: new Date().toISOString()
          });
          creados++;
        }
      }catch(err){
        saltados++;
        errores.push(fila.nombre + ': ' + err.message);
      }
    }

    window.__importClientesFilas = null;
    closeModal();
    showToast('Importación completada: ' + creados + ' creados · ' + actualizados + ' actualizados' +
      (geolocalizar ? ' · 📍 ' + geolocalizados + ' geolocalizados' + (sinGeo ? ' (' + sinGeo + ' sin coordenadas, revisa su ficha)' : '') : '') +
      (saltados ? ' · ' + saltados + ' con error' : ''), saltados ? 'warning' : 'success');
    if(window.currentPage === 'clientes') renderClientes();
  }catch(err){
    console.error('[import clientes]', err);
    showToast('Error al importar: ' + err.message, 'error');
    btn.disabled = false;
  }
};
