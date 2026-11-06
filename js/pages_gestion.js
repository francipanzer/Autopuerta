// ⛳ MÓDULO DIFERIDO: Estadísticas + Revisiones (fusionados por dependencia mutua: rutas/cadenas)
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
  const nodos = [BASE_CEUTI, ...pts];
  const d = nodos.map(a => nodos.map(b => kmEntreCoordenadasCore(a.lat, a.lng, b.lat, b.lng) * getFactorCarretera()));
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
    else if (document.getElementById('rev-lista-tiendas')) await window.verTiendasDeRuta(cadenaId, rutaId);
    else if (document.getElementById('clientes-ruta-lista')) await render_clientes_ruta(rutaId);
  } catch (e) {
    console.error('optimizarRutaTiendas falló:', e);
    showToast('No se pudo guardar el orden. ¿Has ejecutado SUPABASE_ORDEN_RUTA.sql? ' + (e.message || ''), 'error');
  }
};

function kmCircuitoOrden(pts) {
  const nodos = [BASE_CEUTI, ...pts, BASE_CEUTI];
  let s = 0;
  for (let i = 1; i < nodos.length; i++) s += kmEntreCoordenadasCore(nodos[i - 1].lat, nodos[i - 1].lng, nodos[i].lat, nodos[i].lng) * getFactorCarretera();
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
      <div id="clientes-ruta-lista" hidden></div>
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
    // DOTICS usa su propio formulario (checkboxes de estado con colores:
    // Bueno / Operativo / No usar por equipo). El resto de cadenas y clientes
    // usan el formulario genérico de checklist por puerta.
    const esDotics=String(cadenaNombre||'').trim().toLocaleUpperCase()==='DOTICS';
    if(esDotics) return window.openDoticsMaintenanceForm(cadenaId,null,new Date().toISOString().slice(0,10));

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
  if (!chain) return showToast('No se encontró la cadena', 'error');

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
    container.innerHTML = '<div class="empty-state"><p>No hay clientes asignados a esta revisión. Asigna clientes a la cadena para completar el formulario.</p></div>';
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

  // Cabecera IDÉNTICA para todas las cadenas: aquí solo se gestiona estructura
  // (crear/editar rutas y asignar clientes). Las revisiones se registran desde
  // la pantalla "Revisiones", nunca desde Cadenas y Rutas.
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
        <button class="btn btn-primary" id="btn-nueva-ruta">+ Nueva Ruta</button>
      </div>
    </div>
    <div id="rutas-lista">
      <div class="spinner" style="margin:40px auto;text-align:center;">Cargando rutas...</div>
    </div>`;

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
  // Misma disposición que la vista de tiendas de Revisiones: cabecera con botones
  // arriba (header-actions) y rejilla de tarjetas stat-card debajo.
  main.innerHTML = `
    <div class="page-revisiones">
      <div class="page-header">
        <div>
          <button class="btn btn-back btn-sm" onclick="render_rutas('${escapeHtml(cadenaId)}')"><i class="fas fa-arrow-left"></i> Volver a rutas</button>
        </div>
        <div>
          <h2 class="page-revisiones-title"><i class="fas fa-store"></i> Tiendas · ${escapeHtml(ruta?.nombre || '')}</h2>
          <p class="page-revisiones-subtitle">${clientes.length} tienda${clientes.length===1?'':'s'} en esta ruta</p>
        </div>
        <div class="header-actions">
        </div>
      </div>
      <div id="clientes-ruta-lista" class="stats-grid">
        ${clientes.length ? clientes.map((c, idx) => `
          <div class="stat-card tienda-card" style="cursor:pointer;" onclick="showClienteForm('${escapeHtml(String(c.id))}')">
            <div class="stat-icon" style="background:#dbeafe;color:#2563eb"><i class="fas fa-store"></i></div>
            <div class="stat-info">
              <h3>${idx + 1}. ${escapeHtml(c.nombre)}</h3>
              <p>${escapeHtml(c.direccion || 'Sin dirección')}</p>
            </div>
            <div class="stat-actions">
              <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); abrirGoogleMaps('${escapeAttr(c.direccion)}')"><i class="fas fa-map-marker-alt"></i> Maps</button>
              <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); showClienteForm('${escapeHtml(String(c.id))}')"><i class="fas fa-pen"></i> Editar</button>
            </div>
          </div>
        `).join('') : '<p style="text-align:center;color:var(--gray);grid-column:1/-1;">No hay clientes en esta ruta.</p>'}
      </div>
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

// ═══ Exposición en window de funciones internas que otros módulos/onclick llaman ═══
window.render_rutas = render_rutas;
window.showRutaForm = showRutaForm;
window.deleteRuta = deleteRuta;
window.renderCadenasList = renderCadenasList;
window.deleteCadenaWithDependencies = deleteCadenaWithDependencies;
window.calcularKmJornada = calcularKmJornada;
