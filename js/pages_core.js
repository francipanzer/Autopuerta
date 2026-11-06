//  DASHBOARD — ACTUALIZADO (CON BANNER PENDIENTES)
let dashboardItvCountdownTimer=null;

// Helpers compartidos con módulos diferidos (ver más abajo su definición completa)
// kmEntreCoordenadasCore se define tras kmEntreCoordenadas y queda en window.

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


// ═══════════════════════════════════════════════════════════
// HELPERS COMPARTIDOS (los usan varios módulos diferidos)
// ═══════════════════════════════════════════════════════════
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
window.kmEntreCoordenadasCore = kmEntreCoordenadas;   // accesible desde módulos diferidos

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

// Página «Tomar medidas»: la usan los técnicos (no tienen acceso a Configuración).
// Quedó solo en el pages.js monolítico al trocear el código — sin esto, el menú daba «Página no encontrada».
window.render_medidas = async function(el){
  el.innerHTML =
    '<div class="page-header"><div><h2><i class="fas fa-ruler-combined"></i> Tomar medidas</h2>'+
    '<p>Elige el tipo de puerta, rellena la hoja sobre el esquema y se envía a administración.</p></div></div>'+
    '<div class="card"><div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap">'+
      '<button class="btn btn-primary" style="flex:1;min-width:220px;padding:18px 16px;font-size:16px" onclick="usarPlantillaMedida()"><i class="fas fa-ruler"></i> Nueva medición</button>'+
      '<button class="btn btn-outline" style="flex:1;min-width:220px;padding:18px 16px;font-size:16px" onclick="MEDICIONES.registro()"><i class="fas fa-clipboard-list"></i> Ver mediciones</button>'+
    '</div></div>';
};
// ============================================================
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
window.MAX_FOTOS_PARTE = MAX_FOTOS_PARTE;   // accesible desde páginas diferidas

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
window.tiposMapCache = window.tiposMapCache || new Map();
