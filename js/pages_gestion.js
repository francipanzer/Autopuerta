// ⛳ MÓDULO DIFERIDO: Estadísticas + Revisiones (formulario de revisión por ubicaciones)
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
// ═══════════════════════════════════════════════════════════
//  REVISIONES — formularios (cliente → ubicaciones → puertas)
//  El listado y las rutas están en informe-revisiones-cliente.js
//  y central.js; aquí solo el formulario de revisión y su guardado.
// ═══════════════════════════════════════════════════════════

// Función para abrir Google Maps con la dirección
window.abrirGoogleMaps = function(direccion) {
  if (!direccion) { showToast('La ubicación no tiene dirección', 'warning'); return; }
  window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(direccion), '_blank');
};

function revisionHistoryMetadata(revision){
  let notes={};
  try{notes=JSON.parse(revision.notas||'{}');}catch(e){notes={texto:revision.notas||''};}
  const stores=Array.isArray(notes.ubicaciones)?notes.ubicaciones:(Array.isArray(notes.supermercados)?notes.supermercados:[]);
  const clientName=notes.cliente||notes.clienteNombre||'';
  const clientId=String(notes.clienteId||revision.clienteId||'');
  const clientNames=[...stores.map(store=>store.nombre),notes.clienteNombre,notes.cliente].filter(Boolean);
  const lineNames=(revision.items||[]).map(item=>item.ubicacionNombre||item.clienteNombre).filter(Boolean);
  return{
    clientId,clientName,chainId:String(notes.cadenaId||''),chainName:notes.cadena||'',
    clientIds:[revision.clienteId,notes.clienteId,...(revision.items||[]).map(item=>item.clienteId)].filter(Boolean).map(String),
    clientNames:[...new Set([...clientNames,...lineNames])],rutaNombre:notes.rutaNombre||'',
    technician:notes.tecnicos||revision.tecnicoNombre||revision.tecnicoId||'—',
    contract:notes.contrato||'',intervention:notes.intervencion||'',notes,rawNotes:revision.notas||''
  };
}
window.revisionHistoryMetadata=revisionHistoryMetadata;

// Único punto de cierre: lo usan el botón Cerrar, la X de la cabecera y Escape.
window.cerrarFormularioRevision = function() {
  if (window.__hiperberReviewDraft?.esRuta) { try { window.guardarBorradorRevision(true); } catch (e) { /* sin borrador */ } }
  window.__hiperberReviewDraft = null;
  if (window.__doticsRoute?.esRuta) { try { window.drGuardarBorrador(true); } catch (e) { /* sin borrador */ } }
  window.__doticsVisitDraft = null;
  window.__doticsRoute = null;
  closeModal();
  document.getElementById('overlayRevision')?.remove();
  document.getElementById('modal-revision-overlay')?.remove();
  if (typeof revisionPuertaActual !== 'undefined') revisionPuertaActual = null;
};

const puertaParaFormulario = door => ({
  id: door.id,
  nombre: door.nombre || door.tipoPuerta || door.tipo || 'Puerta',
  tipo: door.tipoPuerta || door.tipo || '',
  hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
  correctivo: null, correctivoTexto: '', resultado: null
});

// ── Borrador: el progreso se guarda al marcar cada tienda (y poco después de cada cambio) ──
let __borradorTimer = null;
function resumenBorrador(draft){
  return { hechas: draft.stores.filter(s => s.completada).length, total: draft.stores.length };
}
window.guardarBorradorRevision = function(inmediato){
  const draft = window.__hiperberReviewDraft;
  if (!draft || !draft.esRuta || !draft.borradorKey) return Promise.resolve();
  clearTimeout(__borradorTimer);
  const escribir = async () => {
    const d = window.__hiperberReviewDraft;
    if (!d || !d.esRuta) return;
    try {
      const fecha = document.getElementById('hiperber-review-date')?.value || null;
      await window.Central.Borradores.guardar(d.borradorKey, d.opts, { draft: d, fecha }, resumenBorrador(d));
      d.guardadoEn = Date.now();
      const el = document.getElementById('hs-guardado');
      if (el) el.textContent = '💾 Progreso guardado en este dispositivo · ' + new Date(d.guardadoEn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      console.warn('No se pudo guardar el borrador:', e);
      const el = document.getElementById('hs-guardado');
      if (el) el.textContent = '⚠️ No se pudo guardar el progreso en este dispositivo';
    }
  };
  if (inmediato) return escribir();
  return new Promise(res => { __borradorTimer = setTimeout(() => escribir().then(res), 700); });
};

// Mezcla lo guardado con las ubicaciones/puertas actuales (por id): si se añadió una puerta, esa tienda vuelve a pendiente
function fusionarBorradorRevision(draft, guardado){
  const prev = guardado && guardado.draft;
  if (!prev) return null;
  draft.id = prev.id || draft.id;
  const prevStores = new Map((prev.stores || []).map(s => [String(s.ubicacionId), s]));
  draft.stores.forEach(store => {
    const p = prevStores.get(String(store.ubicacionId));
    if (!p) return;
    const prevDoors = new Map((p.puertas || []).filter(d => d.id).map(d => [String(d.id), d]));
    store.puertas.forEach(door => {
      const pd = door.id && prevDoors.get(String(door.id));
      if (pd) Object.assign(door, { hallazgo: pd.hallazgo, hallazgoTexto: pd.hallazgoTexto || '', hallazgoFotos: pd.hallazgoFotos || [], correctivo: pd.correctivo, correctivoTexto: pd.correctivoTexto || '', resultado: pd.resultado });
    });
    store.completada = !!p.completada && !store.puertas.some(hiperberPuertaIncompleta);
  });
  Object.keys(prev.rutasCompletas || {}).forEach(k => { draft.rutasCompletas[k] = !!prev.rutasCompletas[k]; });
  draft.guardadoEn = prev.guardadoEn || null;
  return guardado.fecha || null;
}

window.descartarBorradorRevision = async function(){
  const draft = window.__hiperberReviewDraft;
  if (!draft) return;
  if (!confirm('¿Empezar la ruta de cero? Se borrará el progreso guardado y las fotos hechas hasta ahora.')) return;
  clearTimeout(__borradorTimer);
  try { await window.Central.Borradores.borrar(draft.borradorKey); } catch (e) { /* nada que borrar */ }
  const opts = { ...draft.opts, fecha: document.getElementById('hiperber-review-date')?.value || null };
  window.__hiperberReviewDraft = null;
  await window.abrirFormularioRevision(opts);
};

/**
 * Abre el formulario de revisión.
 *   opts.clienteId     cliente (individual o central)
 *   opts.rutaId        solo las ubicaciones de esa ruta   (central)
 *   opts.ubicacionIds  solo esas ubicaciones              (central)
 *   opts.fecha         fecha preseleccionada
 * Individual → sus puertas. Central → ubicaciones (ordenadas por ruta) con sus puertas.
 */
window.abrirFormularioRevision = async function(opts) {
  opts = opts || {};
  try {
    const cliente = await dbGet('clientes', opts.clienteId);
    if (!cliente) return showToast('No se encontró el cliente', 'error');
    if (String(cliente.nombre || '').toLocaleUpperCase().includes('DOTICS')) {
      return window.abrirRevisionDotics(opts);
    }
    const [ubics, rutas, puertas] = await Promise.all([
      window.Central.ubicacionesDe(cliente.id), window.Central.rutasDe(cliente.id), window.Central.puertasDe(cliente.id)
    ]);
    const central = cliente.central === true || ubics.length > 0;
    const rutaPorId = new Map(rutas.map(r => [String(r.id), r]));
    let stores = [], titulo = cliente.nombre;

    if (!central) {
      if (!puertas.length) return showToast('Este cliente no tiene puertas registradas', 'warning');
      stores = [{
        clienteId: String(cliente.id), ubicacionId: null, nombre: cliente.nombre, direccion: cliente.direccion || '',
        rutaId: null, rutaNombre: cliente.nombre, puertas: puertas.map(puertaParaFormulario)
      }];
    } else {
      let lista = ubics.filter(u => u.activa !== false);
      if (opts.ubicacionIds) lista = lista.filter(u => opts.ubicacionIds.map(String).includes(String(u.id)));
      else if (opts.rutaId) lista = lista.filter(u => String(u.rutaId) === String(opts.rutaId));
      if (opts.rutaId && rutaPorId.get(String(opts.rutaId))) titulo += ' · ' + rutaPorId.get(String(opts.rutaId)).nombre;
      else if (opts.ubicacionIds && opts.ubicacionIds.length === 1 && lista[0]) titulo += ' · ' + lista[0].denominacion;
      // Orden: por ruta (orden de la ruta) y dentro de ella por orden de visita
      lista.sort((a, b) => {
        const ra = rutaPorId.get(String(a.rutaId))?.orden ?? Infinity, rb = rutaPorId.get(String(b.rutaId))?.orden ?? Infinity;
        return ra - rb || window.Central.porOrden(a, b);
      });
      if (!lista.length) return showToast('No hay ubicaciones que revisar en esta selección', 'warning');
      stores = lista.map(u => {
        const ps = puertas.filter(p => String(p.ubicacionId) === String(u.id));
        const ruta = rutaPorId.get(String(u.rutaId));
        return {
          clienteId: String(cliente.id), ubicacionId: String(u.id), nombre: u.denominacion, direccion: u.direccion || '',
          rutaId: ruta ? String(ruta.id) : null, rutaNombre: ruta ? ruta.nombre : '📍 Sin ruta asignada',
          puertas: ps.length ? ps.map(puertaParaFormulario) : [{
            id: null, nombre: '', tipo: '', hallazgo: null, hallazgoTexto: '', hallazgoFotos: [],
            correctivo: null, correctivoTexto: '', resultado: null, nueva: true
          }]
        };
      });
    }

    const draftNuevo = {
      id: window.db.nextId('REV'),
      clienteId: String(cliente.id), clienteNombre: cliente.nombre, central,
      rutaId: opts.rutaId ? String(opts.rutaId) : null,
      rutaNombre: opts.rutaId ? (rutaPorId.get(String(opts.rutaId))?.nombre || '') : '',
      esRuta: central && stores.length > 1,      // varias tiendas: check por tienda + check final de ruta
      rutasCompletas: {},
      stores,
      opts: { clienteId: String(cliente.id), rutaId: opts.rutaId || null, ubicacionIds: opts.ubicacionIds || null }
    };
    let fechaForm = opts.fecha || new Date().toISOString().slice(0, 10);
    draftNuevo.borradorKey = window.Central.Borradores.clave(draftNuevo.opts);
    // ¿Hay una revisión de esta ruta a medias en este dispositivo? → retomarla
    if (draftNuevo.esRuta) {
      try {
        const guardado = await window.Central.Borradores.obtener(draftNuevo.borradorKey);
        if (guardado) {
          const r = guardado.resumen || {};
          const cuando = new Date(guardado.savedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          if (confirm('Hay una revisión de esta ruta en curso: ' + (r.hechas ?? '?') + ' de ' + (r.total ?? '?') + ' tiendas revisadas (guardada el ' + cuando + ').\n\nAceptar = continuar donde la dejaste\nCancelar = empezar de nuevo (se descarta lo guardado)')) {
            fechaForm = fusionarBorradorRevision(draftNuevo, guardado.datos) || fechaForm;
            showToast('Revisión retomada: ' + draftNuevo.stores.filter(s => s.completada).length + ' de ' + draftNuevo.stores.length + ' tiendas ya revisadas');
          } else {
            await window.Central.Borradores.borrar(draftNuevo.borradorKey);
          }
        }
      } catch (e) { console.warn('No se pudo leer el borrador de la revisión:', e); }
    }
    window.__hiperberReviewDraft = draftNuevo;
    const form = '<div class="hiperber-form">' +
      '<div class="form-group hiperber-date"><label for="hiperber-review-date">Fecha de revisión</label><input id="hiperber-review-date" type="date" value="' + fechaForm + '" onchange="guardarBorradorRevision()"></div>' +
      '<div id="hiperber-stores" class="hiperber-stores"></div></div>';
    const footer = '<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">' + (draftNuevo.esRuta ? 'Cerrar (se guarda el progreso)' : 'Cerrar') + '</button>' +
      (draftNuevo.esRuta ? '<button type="button" class="btn btn-danger" onclick="descartarBorradorRevision()" title="Borra lo guardado y empieza la ruta de cero"><i class="fas fa-rotate-left"></i> Empezar de nuevo</button>' : '') +
      '<button type="button" class="btn btn-primary" onclick="saveHiperberReviewForm()"><i class="fas fa-save"></i> Guardar revisión</button>';
    openModal('Revisión · ' + titulo, form, footer);
    renderHiperberStores();
  } catch (e) {
    console.error('abrirFormularioRevision falló:', e);
    showToast('No se pudo abrir el formulario: ' + e.message, 'error');
  }
};

function renderHiperberStores() {
  const draft = window.__hiperberReviewDraft;
  const container = document.getElementById('hiperber-stores');
  if (!draft || !container) return;
  if (!draft.stores.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay ubicaciones ni puertas en esta revisión. Añade las ubicaciones del cliente (y sus puertas) para completar el formulario.</p></div>';
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
    '<section class="hiperber-store' + (store.completada ? ' hiperber-store-done' : '') + '" id="hs-store-' + storeIndex + '" style="margin-left:18px;' + (store.completada ? 'border-left:4px solid #16a34a;padding-left:10px;' : '') + '">' +
      '<div class="hiperber-store-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><div><h4>' + (draft.esRuta ? (storeIndex + 1) + '. ' : '') + escapeHtml(store.nombre) + '</h4>' +
      (store.direccion ? '<span class="hiperber-store-addr"><i class="fas fa-location-dot"></i> ' + escapeHtml(store.direccion) + '</span>' : '') + '</div>' +
      (draft.esRuta ? '<label class="hiperber-store-check" style="display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;padding:6px 12px;border-radius:10px;border:1px solid ' + (store.completada ? '#16a34a' : 'var(--border)') + ';background:' + (store.completada ? 'rgba(22,163,74,.12)' : 'var(--surface-alt)') + ';">' +
        '<input type="checkbox" id="hs-chk-' + storeIndex + '" ' + (store.completada ? 'checked' : '') + ' style="width:20px;height:20px;" onchange="toggleStoreCompletada(' + storeIndex + ',this.checked)"> ' +
        '<span id="hs-chk-txt-' + storeIndex + '">' + (store.completada ? 'Revisada ✔' : 'Marcar como revisada') + '</span></label>' : '') + '</div>' +
      '<div class="table-wrapper hiperber-table-wrapper"><table class="hiperber-checklist"><thead><tr><th>Puerta</th><th>HALLAZGO</th><th>CORRECTIVO</th><th>RESULTADO</th></tr></thead><tbody>' +
        store.puertas.map((door, doorIndex) =>
          '<tr><td data-label="Puerta"><input class="hiperber-door-name" type="text" readonly data-sin-voz' + (door.nombre ? '' : ' data-empty="1"') + ' aria-label="Puerta de ' + escapeHtml(store.nombre) + '" value="' + escapeHtml(door.nombre) + '" placeholder="Sin nombre"' + '>' + '<small>' + escapeHtml(door.tipo || '') + '</small></td>' +
            hiperberDecisionCell(storeIndex, doorIndex, door, 'hallazgo', [['ok','OK'],['x','X']]) +
            hiperberDecisionCell(storeIndex, doorIndex, door, 'correctivo', [['ok','OK'],['hecho','✔'],['x','X']]) +
            hiperberDecisionCell(storeIndex, doorIndex, door, 'resultado', [['ok','OK'],['x','X']]) + '</tr>'
        ).join('') +
      '</tbody></table></div>' +
      '' +
    '</section>';

  const finalHtml = g => {
    const key = g.items[0].store.rutaId || 'sin';
    const ok = !!(draft.rutasCompletas && draft.rutasCompletas[key]);
    return '<label id="hs-final-' + key + '" class="hiperber-route-final" style="display:flex;align-items:center;gap:10px;margin:14px 0 0 18px;padding:12px 14px;border-radius:12px;font-weight:700;cursor:pointer;border:2px solid ' + (ok ? '#16a34a' : 'var(--border)') + ';background:' + (ok ? 'rgba(22,163,74,.12)' : 'var(--surface-alt)') + ';">' +
      '<input type="checkbox" id="hs-final-chk-' + key + '" ' + (ok ? 'checked' : '') + ' style="width:22px;height:22px;" onchange="toggleRutaCompletada(\'' + key + '\',this.checked)"> ' +
      '<span><i class="fas fa-flag-checkered"></i> ' + escapeHtml(g.name) + ' completada <small style="font-weight:400;color:var(--text-muted)">(marca esto en la última tienda para cerrar la ruta)</small></span></label>';
  };

  container.innerHTML =
    (draft.esRuta ? '<div id="hs-progreso" style="position:sticky;top:0;z-index:5;background:var(--surface);padding:10px 0 12px;margin-bottom:12px;border-bottom:1px solid var(--border);"></div>' : '') +
    groups.map(g =>
    '<div class="hiperber-route-group" style="margin-bottom:26px;border-left:4px solid var(--primary);padding-left:14px;">' +
      '<h3 style="color:var(--primary);margin:0 0 12px;">' + escapeHtml(g.name) +
        ' <span class="badge badge-info">' + g.items.length + '</span></h3>' +
      g.items.map(it => storeHtml(it.store, it.index)).join('') +
      (draft.esRuta && g.items[0].store.rutaId ? finalHtml(g) : '') +
    '</div>'
  ).join('');
  actualizarProgresoRevision();
}

// ── Progreso de la ruta: check por tienda + check final ──
function hiperberPuertaIncompleta(door){
  if(!door.id) return false;                         // las filas vacías «nueva» no cuentan
  if(!door.hallazgo||!door.correctivo||!door.resultado) return true;
  if(door.hallazgo==='x'&&!String(door.hallazgoTexto||'').trim()) return true;
  if(door.correctivo==='hecho'&&!String(door.correctivoTexto||'').trim()) return true;
  return false;
}
const hiperberClaveRuta = store => store.rutaId || 'sin';

function actualizarProgresoRevision(){
  const draft=window.__hiperberReviewDraft;
  if(!draft||!draft.esRuta) return;
  const total=draft.stores.length, hechas=draft.stores.filter(s=>s.completada).length;
  const pct=Math.round(hechas/total*100);
  const box=document.getElementById('hs-progreso');
  if(box) box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;font-weight:700;">'+
    '<span><i class="fas fa-route"></i> '+hechas+' de '+total+' tiendas revisadas</span>'+
    '<span style="color:'+(hechas===total?'#16a34a':'var(--text-muted)')+';">'+(hechas===total?'¡Todas revisadas!':pct+'%')+'</span></div>'+
    '<div id="hs-guardado" style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">'+(draft.guardadoEn?'💾 Progreso guardado en este dispositivo · '+new Date(draft.guardadoEn).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'💾 Se guarda solo en este dispositivo al marcar cada tienda')+'</div>'+
    '<div style="height:8px;border-radius:99px;background:var(--border);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:#16a34a;transition:width .25s;"></div></div>';
  draft.stores.forEach((s,i)=>{
    const sec=document.getElementById('hs-store-'+i);
    if(sec){ sec.classList.toggle('hiperber-store-done',!!s.completada); sec.style.borderLeft=s.completada?'4px solid #16a34a':''; sec.style.paddingLeft=s.completada?'10px':'18px'; }
    const chk=document.getElementById('hs-chk-'+i); if(chk) chk.checked=!!s.completada;
    const txt=document.getElementById('hs-chk-txt-'+i); if(txt) txt.textContent=s.completada?'Revisada ✔':'Marcar como revisada';
    const lab=chk?.closest('label'); if(lab){ lab.style.borderColor=s.completada?'#16a34a':'var(--border)'; lab.style.background=s.completada?'rgba(22,163,74,.12)':'var(--surface-alt)'; }
  });
  // El check final de cada ruta solo se puede marcar con todas sus tiendas revisadas
  const claves=[...new Set(draft.stores.map(hiperberClaveRuta))];
  claves.forEach(k=>{
    const chk=document.getElementById('hs-final-chk-'+k); if(!chk) return;
    const todas=draft.stores.filter(s=>hiperberClaveRuta(s)===k).every(s=>s.completada);
    if(!todas&&draft.rutasCompletas[k]) draft.rutasCompletas[k]=false;
    chk.checked=!!draft.rutasCompletas[k];
    chk.disabled=!todas;
    const lab=document.getElementById('hs-final-'+k);
    if(lab){ lab.style.opacity=todas?'1':'.55'; lab.style.borderColor=draft.rutasCompletas[k]?'#16a34a':'var(--border)'; lab.style.background=draft.rutasCompletas[k]?'rgba(22,163,74,.12)':'var(--surface-alt)'; }
  });
}

window.toggleStoreCompletada=function(storeIndex,checked){
  const draft=window.__hiperberReviewDraft; const store=draft?.stores[storeIndex];
  if(!store) return;
  if(checked){
    const pendientes=store.puertas.filter(hiperberPuertaIncompleta);
    if(pendientes.length){
      store.completada=false; actualizarProgresoRevision();
      showToast('Completa Hallazgo, Correctivo y Resultado en '+pendientes.length+' puerta'+(pendientes.length===1?'':'s')+' de «'+store.nombre+'» (y describe los X)','error');
      return;
    }
  }
  store.completada=!!checked;
  actualizarProgresoRevision();
  guardarBorradorRevision(true);                    // tienda a tienda: se guarda al momento
  if(checked){ const sig=document.getElementById('hs-store-'+(storeIndex+1)); if(sig) sig.scrollIntoView({behavior:'smooth',block:'start'}); }
};

window.toggleRutaCompletada=function(clave,checked){
  const draft=window.__hiperberReviewDraft; if(!draft) return;
  const todas=draft.stores.filter(s=>hiperberClaveRuta(s)===clave).every(s=>s.completada);
  if(checked&&!todas){ showToast('Primero marca como revisadas todas las tiendas de la ruta','error'); }
  draft.rutasCompletas[clave]=!!checked&&todas;
  actualizarProgresoRevision();
  guardarBorradorRevision(true);
};

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
  if(door){ door[field]=value; guardarBorradorRevision(); }
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
  guardarBorradorRevision();
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
    guardarBorradorRevision(true);
  }catch(error){showToast(error.message||'No se pudo procesar la foto','error');}
};

window.removeHiperberFindingPhoto=function(storeIndex,doorIndex,photoIndex){
  const door=window.__hiperberReviewDraft?.stores[storeIndex]?.puertas[doorIndex];
  door?.hallazgoFotos?.splice(photoIndex,1);
  renderHiperberStores();
  guardarBorradorRevision(true);
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
 * Tras guardar una revisión: cada puerta revisada queda con su última revisión y
 * la próxima según SU periodicidad (tabla por uso/criterio), no la de una ruta.
 */
async function reprogramarTrasRevision(stores, fecha, estadoPorPuerta){
  const fechaBase=String(fecha||'').slice(0,10);
  let fallos=0;
  for(const store of stores){
    for(const door of store.puertas){
      try{
        const puerta=await dbGet('puertas',door.id);
        if(!puerta) continue;
        await window.Central.reprogramarPuerta(puerta,fechaBase,estadoPorPuerta[door.id]||null);
      }catch(e){ fallos++; console.warn('No se pudo reprogramar la puerta',door.id,e); }
    }
  }
  if(fallos) showToast('Revisión guardada, pero '+fallos+' puerta(s) no se pudieron reprogramar','warning');
}

window.saveHiperberReviewForm=async function(){
  const draft=window.__hiperberReviewDraft;
  if(!draft) return;
  const fecha=document.getElementById('hiperber-review-date').value;
  if(!fecha) return showToast('Selecciona la fecha de revisión','error');
  // El nombre de la puerta es de solo lectura: solo se consideran puertas existentes en BD
  const stores=draft.stores.map(store=>({...store,puertas:store.puertas.filter(door=>door.id)}));
  const doors=stores.flatMap(store=>store.puertas.map(door=>({...door,clienteId:store.clienteId,ubicacionId:store.ubicacionId,ubicacionNombre:store.ubicacionId?store.nombre:'',clienteNombre:store.nombre})));
  if(!doors.length){
    showToast('No hay puertas registradas en esta revisión todavía','error');
    return;
  }
  if(draft.esRuta){
    const sinMarcar=draft.stores.filter(s=>!s.completada);
    if(sinMarcar.length){
      showToast('Faltan por marcar como revisadas: '+sinMarcar.slice(0,3).map(s=>s.nombre).join(', ')+(sinMarcar.length>3?' y '+(sinMarcar.length-3)+' más':''),'error');
      document.getElementById('hs-store-'+draft.stores.indexOf(sinMarcar[0]))?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const rutasSinCerrar=[...new Set(draft.stores.filter(s=>s.rutaId).map(s=>s.rutaId))].filter(k=>!draft.rutasCompletas[k]);
    if(rutasSinCerrar.length){
      showToast('Marca el check final «ruta completada» en la última tienda','error');
      document.getElementById('hs-final-'+rutasSinCerrar[0])?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
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
    concepto:door.clienteNombre+' · '+door.nombre,clienteId:door.clienteId,clienteNombre:door.clienteNombre,
    ubicacionId:door.ubicacionId||null,ubicacionNombre:door.ubicacionNombre||'',
    puertaId:door.id,tipoPuerta:door.tipo,
    hallazgo:door.hallazgo==='ok'?'OK':'X',hallazgoEstado:door.hallazgo,hallazgoTexto:door.hallazgoTexto,hallazgoFotos:door.hallazgoFotos||[],
    correctivo:door.correctivo==='hecho'?door.correctivoTexto:door.correctivo==='x'?'X':'OK',correctivoEstado:door.correctivo,correctivoTexto:door.correctivoTexto,
    resultado:door.resultado==='ok'?'OK':'X',resultadoEstado:door.resultado
  }));
  const tecnicoNombre=window.authState?.employee?.nombre||'';
  const notas=JSON.stringify({
    form:'REVISION_CENTRAL_V2',
    clienteId:draft.clienteId,cliente:draft.clienteNombre,
    rutaId:draft.rutaId||null,rutaNombre:draft.rutaNombre||'',
    ubicaciones:stores.filter(s=>s.ubicacionId).map(s=>({id:s.ubicacionId,nombre:s.nombre,rutaId:s.rutaId||null})),
    // claves antiguas: las siguen leyendo el historial y los PDF
    cadenaId:draft.central?draft.clienteId:null,cadena:draft.central?draft.clienteNombre:'',
    tecnicos:tecnicoNombre
  });
  const estadoPorPuerta={};
  doors.forEach(door=>{ estadoPorPuerta[door.id]=door.resultado==='x'?'fuera_servicio':'operativa'; });
  try{
    await dbAdd('revisiones',{
      id:draft.id,puertaId:null,clienteId:draft.clienteId,fecha,tecnicoId:window.authState?.employee?.id||null,tecnicoNombre:window.authState?.employee?.nombre||null,items,
      hallazgos:doors.filter(door=>door.hallazgo==='x').map(door=>door.clienteNombre+' · '+door.nombre+': '+door.hallazgoTexto).join(' | '),
      correctivo:doors.filter(door=>door.correctivo==='hecho').map(door=>door.clienteNombre+' · '+door.nombre+': '+door.correctivoTexto).join(' | '),
      estadoTrasRevision:doors.some(door=>door.resultado==='x')?'fuera_servicio':'operativa',notas,createdAt:new Date().toISOString()
    });
    clearTimeout(__borradorTimer);
    if(draft.borradorKey){ try{ await window.Central.Borradores.borrar(draft.borradorKey); }catch(e){ console.warn('No se pudo borrar el borrador:',e); } }
    window.__hiperberReviewDraft=null;
    closeModal();
    showToast('Revisión guardada');
    await reprogramarTrasRevision(stores,fecha,estadoPorPuerta);
    window.actualizarBadgeRevisiones?.();
    if(window.__revRefrescar){ try{ await window.__revRefrescar(); }catch(e){} }
    await downloadRevisionPDFAfterSave(draft.id);
  }catch(error){
    showToast('No se pudo guardar la revisión: '+error.message,'error');
  }
};

window.openDoticsMaintenanceForm = async function(chainId, doorId=null, fechaPreseleccionada=null, ctx=null){
  const chain=await dbGet('clientes',chainId);   // el cliente (central) DOTICS
  if(!chain) return showToast('No se encontró el cliente DOTICS','error');
  const door=doorId ? await dbGet('puertas',doorId) : null;
  const client=door?.clienteId ? await dbGet('clientes',door.clienteId) : null;
  const employees=window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const id=window.db.nextId('REV');
  await window.TiposPuerta.cargar().catch(()=>{});
  const productTypes=window.TiposPuerta.lista().map(t=>t.codigo);   // mismos tipos que en plantillas y puertas
  const doorType=window.TiposPuerta.resolver(door?.tipoPuerta||door?.tipo)?.codigo||'';
  // Un informe por ubicación: sus puertas llegan ya escritas (tipo, nombre, nº de serie);
  // el técnico solo indica el estado y, si no está bien, las observaciones.
  const tipoCodigo=d=>{const code=window.TiposPuerta.resolver(d.tipoPuerta||d.tipo)?.codigo||'';return productTypes.includes(code)?code:'';};
  const lineas=ctx?.puertas?.length
    ? ctx.puertas.map(d=>({puertaId:d.id,tipoProducto:tipoCodigo(d),denominacionCliente:d.nombre||'',numeroSerie:d.numeroSerie||d.serie||d.serial||'',estado:'',observaciones:'',fotos:[]}))
    : [{
      puertaId:door?.id||null,
      tipoProducto:productTypes.includes(doorType)?doorType:'',
      denominacionCliente:door?.nombre||client?.nombre||'',
      numeroSerie:door?.numeroSerie||door?.serie||door?.serial||'',
      estado:'',observaciones:'',fotos:[]
    }];
  const queue=null;                                    // el informe suelto no pertenece a ninguna ruta
  window.__doticsVisitDraft={
    id,chainId:String(chain.id),chainName:chain.nombre,doorId:door?.id||null,productTypes,
    ubicacionId:ctx?.ubicacion?String(ctx.ubicacion.id):null,ubicacionNombre:ctx?.ubicacion?.denominacion||'',rutaNombre:ctx?.rutaNombre||'',
    enCola:!!queue,
    lines:lineas
  };
  const today=new Date().toISOString().slice(0,10);
  const form='<div class="dotics-form revision-form">'+
    '<div class="form-header"><div class="form-header-icon"><i class="fas fa-clipboard-check"></i></div><div class="form-header-text"><strong>'+escapeHtml(chain.nombre)+(ctx?.ubicacion?' · '+escapeHtml(ctx.ubicacion.denominacion):'')+'</strong><span>Informe visita de mantenimiento'+(queue?' · Ubicación '+(queue.pos+1)+' de '+queue.items.length+' ('+queue.items.filter(i=>i.hecha).length+' hechas)':'')+(ctx?.ubicacion?.direccion?' · '+escapeHtml(ctx.ubicacion.direccion):'')+'</span></div></div>'+
    '<div class="form-grid">'+
      '<div class="form-group"><label for="dotics-contract">N.º contrato mantenimiento</label><input id="dotics-contract" type="text" class="input" autocomplete="off" placeholder="Opcional" value="'+escapeHtml(queue?.comun?.contrato||'')+'"></div>'+
      '<div class="form-group"><label for="dotics-intervention">N.º intervención</label><input id="dotics-intervention" type="text" class="input" autocomplete="off" placeholder="Escribe el número de intervención"></div>'+
      '<div class="form-group"><label for="dotics-technicians">Técnico/s</label><input id="dotics-technicians" type="text" class="input" list="dotics-employees" placeholder="Nombre/s del técnico" '+(window.isTechnician?.()?'value="'+escapeHtml(window.authState.employee?.nombre||'')+'" readonly':'value="'+escapeHtml(queue?.comun?.tecnicos||'')+'"')+'><datalist id="dotics-employees">'+employees.map(e=>'<option value="'+escapeHtml(e.nombre)+'">').join('')+'</datalist></div>'+
      '<div class="form-group"><label for="dotics-date">Fecha</label><input id="dotics-date" type="date" class="input" value="'+(fechaPreseleccionada||today)+'"></div>'+
    '</div>'+
    '<div class="section-header"><div><h3>Equipos revisados</h3><p>Indica un estado por equipo; añade foto si está operativo o no se debe usar.</p></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-outline btn-sm" onclick="marcarDoticsTodoBueno()"><i class="fas fa-check-double"></i> Todo bueno</button><button type="button" class="btn btn-outline btn-sm" onclick="addDoticsVisitLine()"><i class="fas fa-plus"></i> Añadir equipo</button></div></div>'+
    '<div id="dotics-visit-lines" class="dotics-line-list"></div>'+
    '<div class="form-group"><label for="dotics-notes">Observaciones generales</label><textarea id="dotics-notes" rows="3" class="input" placeholder="Observaciones de la visita"></textarea></div>'+
  '</div>';
  const esUltima=queue&&queue.items.filter((i,k)=>!i.hecha&&k!==queue.pos).length===0;
  const footer='<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>'+
    '<button type="button" class="btn btn-primary" onclick="saveDoticsMaintenanceForm()"><i class="fas fa-'+(queue&&esUltima?'flag-checkered':'save')+'"></i> '+(queue?(esUltima?'Guardar y finalizar ruta':'Guardar y siguiente'):'Guardar informe')+'</button>';
  openModal('Informe visita de mantenimiento'+(ctx?.ubicacion?' · '+ctx.ubicacion.denominacion:''),form,footer);
  renderDoticsVisitLines();
};

// ═══════════════════════════════════════════════════════════
//  DOTICS · revisión de ruta (formato «Informe visita de mantenimiento»)
//  Una sola pantalla con todas las tiendas, igual que Hiperber. Cada tienda tiene su
//  informe: Cliente = la tienda, nº de intervención, equipos con tipo / denominación /
//  nº de serie ya escritos (el técnico solo marca Bueno, Operativo o No usar y escribe
//  observaciones) y una casilla «tienda finalizada». Al marcarla SE GUARDA ese informe
//  como su propio parte (revisión + PDF). Al final, casilla «ruta completada».
//  Lo escrito y sin finalizar se guarda como borrador en el dispositivo.
// ═══════════════════════════════════════════════════════════
const drEsc = s => escapeHtml(s);
const DR_ESTADOS = [['bueno', 'Bueno'], ['operativo', 'Operativo'], ['no_usar', 'No usar']];
const DR_ICONOS = { bueno: 'circle-check', operativo: 'triangle-exclamation', no_usar: 'circle-xmark' };
let __drTimer = null;
const drClave = store => store.rutaId || 'sin';

window.abrirRevisionDotics = async function(opts){
  opts = opts || {};
  const cliente = await dbGet('clientes', opts.clienteId);
  if (!cliente) return showToast('No se encontró el cliente', 'error');
  const fecha = String(opts.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const soloTecnico = !!window.isTechnician?.();
  const [ubics, rutas, puertas, empleados, revisiones] = await Promise.all([
    window.Central.ubicacionesDe(cliente.id), window.Central.rutasDe(cliente.id), window.Central.puertasDe(cliente.id),
    soloTecnico ? Promise.resolve(window.authState?.employee ? [window.authState.employee] : []) : dbGetAll('empleados'),
    dbGetAll('revisiones')
  ]);
  let lista = ubics.filter(u => u.activa !== false);
  if (opts.ubicacionIds) lista = lista.filter(u => opts.ubicacionIds.map(String).includes(String(u.id)));
  else if (opts.rutaId) lista = lista.filter(u => String(u.rutaId) === String(opts.rutaId));
  // Sin ubicaciones: el propio cliente hace de única «tienda» con todas sus puertas
  const sinUbicaciones = !lista.length;
  if (sinUbicaciones) lista = [{ id: '', denominacion: cliente.nombre, direccion: cliente.direccion || '', rutaId: null }];
  const soloPuerta = opts.puertaId ? String(opts.puertaId) : null;   // revisión de una única puerta
  await window.TiposPuerta.cargar().catch(() => {});
  const productTypes = window.TiposPuerta.lista().map(t => t.codigo);
  const tipoCodigo = d => { const c = window.TiposPuerta.resolver(d.tipoPuerta || d.tipo)?.codigo || ''; return productTypes.includes(c) ? c : ''; };
  const lineaDe = d => ({ puertaId: d.id, tipoProducto: tipoCodigo(d), denominacionCliente: d.nombre || '', numeroSerie: d.numeroSerie || d.serie || d.serial || '', estado: '', observaciones: '', fotos: [] });
  const lineaVacia = () => ({ puertaId: null, tipoProducto: '', denominacionCliente: '', numeroSerie: '', estado: '', observaciones: '', fotos: [] });

  const rutaPorId = new Map(rutas.map(r => [String(r.id), r]));
  lista.sort((a, b) => {
    const ra = rutaPorId.get(String(a.rutaId))?.orden ?? Infinity, rb = rutaPorId.get(String(b.rutaId))?.orden ?? Infinity;
    return ra - rb || window.Central.porOrden(a, b);
  });
  // Informes DOTICS ya guardados de esa fecha (uno por tienda)
  const guardadas = new Map();
  if (!soloPuerta) revisiones.forEach(r => {
    let n = {}; try { n = JSON.parse(r.notas || '{}'); } catch (e) { /* sin notas */ }
    if (n.form === 'DOTICS_VISITA_V1' && (n.ubicacionId || sinUbicaciones) && String(r.fecha || '').slice(0, 10) === fecha && String(r.clienteId) === String(cliente.id)) guardadas.set(String(n.ubicacionId || ''), { r, n });
  });
  const stores = lista.map(u => {
    let ps = sinUbicaciones ? puertas : puertas.filter(p => String(p.ubicacionId) === String(u.id));
    if (soloPuerta) ps = ps.filter(p => String(p.id) === soloPuerta);
    const ruta = rutaPorId.get(String(u.rutaId));
    const st = {
      ubicacionId: String(u.id), nombre: u.denominacion, direccion: u.direccion || '',
      rutaId: ruta ? String(ruta.id) : null, rutaNombre: ruta ? ruta.nombre : '📍 Sin ruta asignada',
      intervencion: '', observaciones: '', completada: false, revisionId: null, abierta: false,
      lines: ps.length ? ps.map(lineaDe) : [lineaVacia()]
    };
    const g = guardadas.get(String(u.id));
    if (g) {
      st.completada = true; st.revisionId = g.r.id; st.intervencion = g.n.intervencion || ''; st.observaciones = g.n.observaciones || '';
      st.lines = (g.r.items || []).map(it => ({ puertaId: it.puertaId || null, tipoProducto: it.tipoProducto || '', denominacionCliente: it.denominacionCliente || '', numeroSerie: it.numeroSerie || '', estado: it.estadoEquipo || '', observaciones: it.observaciones || '', fotos: it.fotos || [] }));
    }
    return st;
  });
  const g0 = [...guardadas.values()][0];
  const route = {
    clienteId: String(cliente.id), nombre: cliente.nombre,
    opts: { clienteId: String(cliente.id), rutaId: opts.rutaId || null, ubicacionIds: opts.ubicacionIds || null, puertaId: soloPuerta },
    esRuta: true,                       // siempre: casilla por tienda + casilla final, aunque haya una sola
    multi: stores.length > 1,           // varias tiendas: numeración, grupos por ruta y barra de progreso
    productTypes, empleados,
    comun: { fecha, contrato: g0 ? g0.n.contrato || '' : '', tecnicos: soloTecnico ? (window.authState?.employee?.nombre || '') : (g0 ? g0.n.tecnicos || '' : '') },
    rutasCompletas: {}, stores
  };
  if (!soloPuerta) {                                     // la revisión de una sola puerta no usa borrador
    route.borradorKey = window.Central.Borradores.clave(route.opts) + '|dotics';
    await drRecuperarBorrador(route);
  }
  const primera = stores.findIndex(s => !s.completada);
  if (primera !== -1) stores[primera].abierta = true;
  if (guardadas.size) showToast(guardadas.size + ' tienda(s) ya tienen su informe de esta fecha');
  window.__doticsRoute = route;
  drAbrirModal();
};

// ── Borrador (lo escrito y sin finalizar) ──
async function drRecuperarBorrador(route){
  try {
    const guardado = await window.Central.Borradores.obtener(route.borradorKey);
    if (!guardado) return;
    const d = guardado.datos || {};
    const pendientes = (d.stores || []).filter(s => !s.completada && (s.intervencion || s.lines?.some(l => l.estado))).length;
    if (!pendientes) { await window.Central.Borradores.borrar(route.borradorKey); return; }
    const cuando = new Date(guardado.savedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (!confirm('Hay datos de esta ruta escritos y sin finalizar (guardados el ' + cuando + ').\n\nAceptar = continuar donde lo dejaste\nCancelar = descartarlos')) {
      await window.Central.Borradores.borrar(route.borradorKey); return;
    }
    Object.assign(route.comun, { contrato: d.comun?.contrato ?? route.comun.contrato, tecnicos: route.comun.tecnicos || d.comun?.tecnicos || '' });
    const prev = new Map((d.stores || []).map(s => [String(s.ubicacionId), s]));
    route.stores.forEach(st => {
      const p = prev.get(String(st.ubicacionId));
      if (!p || st.completada) return;
      st.intervencion = p.intervencion || ''; st.observaciones = p.observaciones || '';
      if (Array.isArray(p.lines) && p.lines.length) st.lines = p.lines;
    });
  } catch (e) { console.warn('No se pudo leer el borrador de DOTICS:', e); }
}

function drGuardarBorrador(inmediato){
  const R = window.__doticsRoute;
  if (!R || !R.esRuta || !R.borradorKey) return Promise.resolve();
  clearTimeout(__drTimer);
  const escribir = async () => {
    const r = window.__doticsRoute; if (!r) return;
    try {
      await window.Central.Borradores.guardar(r.borradorKey, r.opts,
        { comun: r.comun, stores: r.stores.map(s => ({ ubicacionId: s.ubicacionId, completada: s.completada, intervencion: s.intervencion, observaciones: s.observaciones, lines: s.completada ? [] : s.lines })) },
        { hechas: r.stores.filter(s => s.completada).length, total: r.stores.length });
      const el = document.getElementById('dr-guardado');
      if (el) el.textContent = '💾 Guardado en este dispositivo · ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { console.warn('No se pudo guardar el borrador de DOTICS:', e); }
  };
  if (inmediato) return escribir();
  return new Promise(res => { __drTimer = setTimeout(() => escribir().then(res), 700); });
}
window.drGuardarBorrador = drGuardarBorrador;

// ── Pantalla ──
function drAbrirModal(){
  const R = window.__doticsRoute; if (!R) return;
  const emp = R.empleados.map(e => '<option value="' + drEsc(e.nombre) + '">').join('');
  const body = '<div class="dotics-form">' +
    '<div class="dotics-intro"><span>Informe visita de mantenimiento · ' + R.stores.length + ' tienda' + (R.stores.length === 1 ? '' : 's') + '</span></div>' +
    (R.multi ? '<div id="dr-progreso" class="dotics-progreso"></div>' : '') +
    '<div class="dotics-comun">' +
      '<div class="form-group"><label for="dr-fecha">Fecha</label><input id="dr-fecha" type="date" value="' + drEsc(R.comun.fecha) + '" oninput="drComun(\'fecha\',this.value)"></div>' +
      '<div class="form-group"><label for="dr-contrato">Nº contrato mantenimiento</label><input id="dr-contrato" type="text" autocomplete="off" placeholder="Opcional" value="' + drEsc(R.comun.contrato) + '" oninput="drComun(\'contrato\',this.value)"></div>' +
      '<div class="form-group"><label for="dr-tecnicos">Técnico/s</label><input id="dr-tecnicos" type="text" list="dr-empleados" placeholder="Nombre/s del técnico" value="' + drEsc(R.comun.tecnicos) + '"' + (window.isTechnician?.() ? ' readonly' : '') + ' oninput="drComun(\'tecnicos\',this.value)"><datalist id="dr-empleados">' + emp + '</datalist></div>' +
    '</div>' +
    '<div id="dr-container"></div></div>';
  const footer = '<button type="button" class="btn btn-outline" onclick="cerrarFormularioRevision()" title="Lo escrito se guarda en este dispositivo">Cerrar</button>' +
    (R.esRuta ? '<button type="button" class="btn btn-outline" onclick="drDescartarBorrador()" title="Borra lo escrito y sin finalizar; los informes ya guardados no se tocan"><i class="fas fa-rotate-left"></i> Descartar borrador</button>'
              : '<button type="button" class="btn btn-primary" onclick="drGuardarSolo()"><i class="fas fa-save"></i> Guardar informe</button>');
  openModal('Revisión · ' + R.nombre, body, footer);
  drPintar();
}

function drLineHtml(si, li, line, locked){
  const dis = locked ? ' disabled' : '';
  const fotos = (line.fotos || []).map((f, pi) => '<div class="dotics-photo-preview"><img src="' + f + '" alt="Foto del equipo ' + (li + 1) + '">' +
    (locked ? '' : '<button type="button" class="btn btn-danger btn-icon" aria-label="Quitar foto" onclick="drQuitarFoto(' + si + ',' + li + ',' + pi + ')"><i class="fas fa-trash"></i></button>') + '</div>').join('');
  const campoFoto = (line.estado === 'operativo' || line.estado === 'no_usar') && (!locked || fotos)
    ? '<div class="dotics-photo-field"><label>Fotos del equipo</label>' + (locked ? '' :
        '<div class="dotics-photo-actions"><button type="button" class="btn btn-primary btn-sm" onclick="drCamara(' + si + ',' + li + ')"><i class="fas fa-camera"></i> Hacer foto</button>' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="drArchivo(' + si + ',' + li + ')"><i class="fas fa-image"></i> Seleccionar archivo</button>' +
        '<input id="dr-cam-' + si + '-' + li + '" class="dotics-file-input" type="file" accept="image/*" capture="environment" onchange="drFoto(' + si + ',' + li + ',this)">' +
        '<input id="dr-file-' + si + '-' + li + '" class="dotics-file-input" type="file" accept="image/*" onchange="drFoto(' + si + ',' + li + ',this)"></div>') +
      '<div class="dotics-photo-previews">' + fotos + '</div></div>' : '';
  const R = window.__doticsRoute;
  const tipos = '<option value="">Tipo</option>' + R.productTypes.map(t => '<option value="' + drEsc(t) + '"' + (line.tipoProducto === t ? ' selected' : '') + '>' + drEsc(t) + '</option>').join('');
  const quitar = !locked && R.stores[si].lines.length > 1
    ? '<button type="button" class="btn btn-danger btn-icon dotics-eq-del" aria-label="Eliminar equipo ' + (li + 1) + '" onclick="drQuitarLinea(' + si + ',' + li + ')"><i class="fas fa-trash"></i></button>'
    : '<span></span>';
  const estados = DR_ESTADOS.map(([v, label]) => '<label class="dotics-state-option dotics-state-' + v + '" title="' + label + '">' +
    '<input type="radio" name="dr-est-' + si + '-' + li + '" value="' + v + '" aria-label="' + label + '"' + dis + (line.estado === v ? ' checked' : '') + ' onchange="drEstado(' + si + ',' + li + ',this.value)">' +
    '<i class="fas fa-' + DR_ICONOS[v] + '" aria-hidden="true"></i><span class="dotics-state-text">' + label + '</span></label>').join('');
  return '<section class="dotics-eq" data-estado="' + (line.estado || '') + '"><div class="dotics-eq-row">' +
      '<span class="dotics-eq-n">' + (li + 1) + '</span>' +
      '<select class="dotics-eq-tipo" aria-label="Tipo producto"' + dis + ' onchange="drLinea(' + si + ',' + li + ',\'tipoProducto\',this.value)">' + tipos + '</select>' +
      '<input class="dotics-eq-den" type="text" data-sin-voz aria-label="Denominación cliente" placeholder="Denominación cliente"' + dis + ' value="' + drEsc(line.denominacionCliente) + '" oninput="drLinea(' + si + ',' + li + ',\'denominacionCliente\',this.value)">' +
      '<input class="dotics-eq-serie" type="text" data-sin-voz aria-label="Nº de serie" placeholder="Nº de serie"' + dis + ' value="' + drEsc(line.numeroSerie) + '" oninput="drLinea(' + si + ',' + li + ',\'numeroSerie\',this.value)">' +
      '<div class="dotics-state-options dotics-eq-estado" role="radiogroup" aria-label="Estado del equipo ' + (li + 1) + '">' + estados + '</div>' +
      '<input class="dotics-eq-obs" type="text" aria-label="Observaciones" placeholder="Observaciones (si no está bien)"' + dis + ' value="' + drEsc(line.observaciones) + '" oninput="drLinea(' + si + ',' + li + ',\'observaciones\',this.value)">' +
      quitar +
    '</div>' + campoFoto + '</section>';
}

function drStoreHtml(st, si, R){
  const locked = st.completada && R.esRuta;
  const hechos = st.lines.filter(l => l.estado).length;
  const head = '<div class="dotics-store-head" onclick="drToggleStore(' + si + ')">' +
      '<div class="dotics-store-title"><h4>' + (R.multi ? (si + 1) + '. ' : '') + drEsc(st.nombre) + '</h4>' +
      (st.direccion ? '<small><i class="fas fa-location-dot"></i> ' + drEsc(st.direccion) + '</small>' : '') + '</div>' +
      '<div class="dotics-store-actions" onclick="event.stopPropagation()">' +
        '<label class="dotics-check' + (st.completada ? ' on' : '') + '"><input type="checkbox" id="dr-chk-' + si + '"' + (st.completada ? ' checked' : '') + ' onchange="drCheckTienda(' + si + ',this.checked)"> <span>' + (st.completada ? 'Finalizada ✔' : 'Marcar finalizada') + '</span></label>' +
        '<button type="button" class="dotics-chevron" aria-label="Abrir o cerrar" onclick="drToggleStore(' + si + ')"><i class="fas fa-chevron-' + (st.abierta ? 'up' : 'down') + '"></i></button>' +
      '</div></div>';
  const resumen = '<div class="dotics-store-sub">' + (st.completada ? 'Parte guardado' : hechos + ' de ' + st.lines.length + ' equipos con estado') + '</div>';
  const cuerpo = !st.abierta ? '' : '<div class="dotics-store-body">' +
    '<div class="dotics-paper-head">' +
      '<div class="form-group"><label>Cliente</label><input type="text" value="' + drEsc(st.nombre) + '" readonly></div>' +
      '<div class="form-group"><label>Nº de intervención *</label><input type="text" id="dr-int-' + si + '"' + (locked ? ' disabled' : '') + ' autocomplete="off" placeholder="Nº de intervención" value="' + drEsc(st.intervencion) + '" oninput="drSet(' + si + ',\'intervencion\',this.value)"></div>' +
    '</div>' +
    '<div class="dotics-lines-heading"><div><h3>Equipos revisados</h3><p>Marca el estado de cada equipo: <span class="dotics-ico-bueno"><i class="fas fa-circle-check"></i> Bueno</span> · <span class="dotics-ico-operativo"><i class="fas fa-triangle-exclamation"></i> Operativo</span> · <span class="dotics-ico-no_usar"><i class="fas fa-circle-xmark"></i> No usar</span>. Si no está bien, escribe la observación.</p></div>' +
      (locked ? '' : '<div class="dotics-lines-actions"><button type="button" class="btn btn-primary btn-sm" onclick="drTodoBueno(' + si + ')"><i class="fas fa-check-double"></i> Todo bueno</button><button type="button" class="btn btn-primary btn-sm" onclick="drAnadirLinea(' + si + ')"><i class="fas fa-plus"></i> Añadir equipo</button></div>') + '</div>' +
    '<div class="dotics-eq-cols" aria-hidden="true"><span></span><span>Tipo producto</span><span>Denominación cliente</span><span>Nº de serie</span><span>Estado</span><span>Observaciones</span><span></span></div>' +
    '<div class="dotics-line-list">' + st.lines.map((l, li) => drLineHtml(si, li, l, locked)).join('') + '</div>' +
    '<div class="form-group"><label>Observaciones generales</label><textarea rows="3"' + (locked ? ' disabled' : '') + ' placeholder="Observaciones de la visita a esta tienda" oninput="drSet(' + si + ',\'observaciones\',this.value)">' + drEsc(st.observaciones) + '</textarea></div>' +
    (st.completada && st.revisionId ? '<div><button type="button" class="btn btn-primary btn-sm" onclick="generatePDF_revision(\'' + drEsc(st.revisionId) + '\')"><i class="fas fa-file-pdf"></i> PDF del parte</button></div>' : '') +
  '</div>';
  return '<section class="dotics-store' + (st.completada ? ' done' : '') + '" id="dr-store-' + si + '">' + head + resumen + cuerpo + '</section>';
}

function drPintar(){
  const R = window.__doticsRoute, cont = document.getElementById('dr-container');
  if (!R || !cont) return;
  const mb = document.getElementById('modalBody'), y = mb ? mb.scrollTop : 0;
  const grupos = [];
  R.stores.forEach((st, i) => {
    let g = grupos.find(x => x.key === drClave(st));
    if (!g) { g = { key: drClave(st), nombre: st.rutaNombre, items: [] }; grupos.push(g); }
    g.items.push({ st, i });
  });
  const final = g => {
    const ok = !!R.rutasCompletas[g.key];
    const titulo = g.key === 'sin' ? (R.multi ? 'Tiendas sin ruta completadas' : 'Revisión completada') : drEsc(g.nombre) + ' completada';
    return '<label class="dotics-final' + (ok ? ' on' : '') + '" id="dr-final-' + g.key + '"><input type="checkbox" id="dr-final-chk-' + g.key + '"' + (ok ? ' checked' : '') + ' onchange="drCheckRuta(\'' + g.key + '\',this.checked)"> ' +
      '<span><i class="fas fa-flag-checkered"></i> ' + titulo + ' <small>(se activa al finalizar la última tienda)</small></span></label>';
  };
  cont.innerHTML = grupos.map(g =>
    '<div class="dotics-group">' + (R.multi ? '<h3 class="dotics-group-title">' + drEsc(g.nombre) + ' <span class="badge badge-info">' + g.items.length + '</span></h3>' : '') +
    g.items.map(x => drStoreHtml(x.st, x.i, R)).join('') +
    final(g) + '</div>').join('');
  if (mb) mb.scrollTop = y;
  drProgreso();
}

function drPintarTienda(si){
  const R = window.__doticsRoute, el = document.getElementById('dr-store-' + si);
  if (!R || !el) return;
  el.outerHTML = drStoreHtml(R.stores[si], si, R);
}

function drProgreso(){
  const R = window.__doticsRoute; if (!R) return;
  const total = R.stores.length, hechas = R.stores.filter(s => s.completada).length, pct = Math.round(hechas / total * 100);
  const box = document.getElementById('dr-progreso');
  if (box && R.multi) box.innerHTML = '<div class="dotics-progreso-top"><span><i class="fas fa-route"></i> ' + hechas + ' de ' + total + ' tiendas finalizadas</span><span>' + (hechas === total ? '¡Todas!' : pct + '%') + '</span></div>' +
    '<div class="dotics-barra"><div style="width:' + pct + '%"></div></div>' +
    '<div id="dr-guardado" class="dotics-guardado">💾 Cada tienda finalizada se guarda como su propio parte; lo que escribes se guarda solo en este dispositivo</div>';
  new Set(R.stores.map(drClave)).forEach(k => {
    const chk = document.getElementById('dr-final-chk-' + k); if (!chk) return;
    const todas = R.stores.filter(s => drClave(s) === k).every(s => s.completada);
    chk.disabled = !todas;
    const lab = document.getElementById('dr-final-' + k); if (lab) lab.style.opacity = todas ? '1' : '.55';
  });
}

// ── Cambios de datos (sin repintar todo) ──
window.drComun = function(campo, valor){ const R = window.__doticsRoute; if (R) { R.comun[campo] = valor; drGuardarBorrador(); } };
window.drSet = function(si, campo, valor){ const st = window.__doticsRoute?.stores[si]; if (st) { st[campo] = valor; drGuardarBorrador(); } };
window.drLinea = function(si, li, campo, valor){ const l = window.__doticsRoute?.stores[si]?.lines[li]; if (l) { l[campo] = valor; drGuardarBorrador(); } };
window.drEstado = function(si, li, valor){
  const l = window.__doticsRoute?.stores[si]?.lines[li]; if (!l) return;
  l.estado = valor; drPintarTienda(si); drProgreso(); drGuardarBorrador();
  if (valor === 'no_usar') window.drCamara(si, li);
};
window.drTodoBueno = function(si){
  const st = window.__doticsRoute?.stores[si]; if (!st) return;
  st.lines.forEach(l => { if (!l.estado) l.estado = 'bueno'; });
  drPintarTienda(si); drGuardarBorrador();
};
window.drAnadirLinea = function(si){
  const st = window.__doticsRoute?.stores[si]; if (!st) return;
  st.lines.push({ puertaId: null, tipoProducto: '', denominacionCliente: '', numeroSerie: '', estado: '', observaciones: '', fotos: [] });
  drPintarTienda(si);
};
window.drQuitarLinea = function(si, li){ const st = window.__doticsRoute?.stores[si]; if (st) { st.lines.splice(li, 1); drPintarTienda(si); drGuardarBorrador(); } };
window.drCamara = function(si, li){ document.getElementById('dr-cam-' + si + '-' + li)?.click(); };
window.drArchivo = function(si, li){ document.getElementById('dr-file-' + si + '-' + li)?.click(); };
window.drFoto = async function(si, li, input){
  const file = input.files?.[0], l = window.__doticsRoute?.stores[si]?.lines[li];
  if (!file || !l) return;
  try {
    l.fotos = l.fotos || [];
    if (l.fotos.length >= 10) { showToast('Máximo 10 fotos por equipo', 'error'); return; }
    l.fotos.push(await compressDoticsPhoto(file));
    drPintarTienda(si); drGuardarBorrador(true);
  } catch (e) { showToast(e.message || 'No se pudo procesar la foto', 'error'); input.value = ''; }
};
window.drQuitarFoto = function(si, li, pi){ const l = window.__doticsRoute?.stores[si]?.lines[li]; if (l) { l.fotos.splice(pi, 1); drPintarTienda(si); drGuardarBorrador(true); } };
window.drToggleStore = function(si){ const st = window.__doticsRoute?.stores[si]; if (st) { st.abierta = !st.abierta; drPintarTienda(si); } };

// ── Guardar el informe de UNA tienda como su propio parte ──
async function drGuardarUna(si){
  const R = window.__doticsRoute, st = R.stores[si], c = R.comun;
  if (!c.fecha || !String(c.tecnicos).trim()) throw new Error('Completa la fecha y el técnico en los datos de la visita.');
  if (!String(st.intervencion).trim()) throw new Error('Escribe el nº de intervención de «' + st.nombre + '».');
  const lines = st.lines.filter(l => l.tipoProducto || l.denominacionCliente || l.numeroSerie);
  if (!lines.length || lines.some(l => !l.estado)) throw new Error('Indica el estado de todos los equipos de «' + st.nombre + '».');
  const tecnicos = String(c.tecnicos).trim();
  const lead = R.empleados.find(e => tecnicos.toLocaleLowerCase().includes(String(e.nombre || '').toLocaleLowerCase()));
  const items = lines.map(l => ({
    concepto: [l.tipoProducto, l.denominacionCliente, l.numeroSerie].filter(Boolean).join(' · '),
    tipoProducto: l.tipoProducto, denominacionCliente: l.denominacionCliente, numeroSerie: l.numeroSerie,
    estado: l.estado === 'bueno' ? 'ok' : l.estado === 'operativo' ? 'desgaste' : 'correctivo',
    estadoEquipo: l.estado, hallazgo: l.observaciones, observaciones: l.observaciones, fotos: l.fotos || [],
    puertaId: l.puertaId || null, ubicacionId: st.ubicacionId || null, ubicacionNombre: st.nombre
  }));
  const notas = JSON.stringify({
    form: 'DOTICS_VISITA_V1', cadenaId: R.clienteId, clienteId: R.clienteId, cliente: R.nombre,
    ubicacionId: st.ubicacionId || null, ubicacion: st.nombre, rutaNombre: st.rutaId ? st.rutaNombre : '',
    contrato: String(c.contrato || '').trim(), intervencion: String(st.intervencion).trim(), tecnicos, observaciones: String(st.observaciones || '').trim()
  });
  const id = st.revisionId || window.db.nextId('REV');
  const rec = {
    id, puertaId: null, clienteId: R.clienteId, fecha: c.fecha, tecnicoId: lead?.id || null, items,
    hallazgos: items.filter(i => i.estadoEquipo !== 'bueno' && i.hallazgo).map(i => i.concepto + ': ' + i.hallazgo).join(' | '),
    correctivo: '', estadoTrasRevision: items.some(i => i.estadoEquipo === 'no_usar') ? 'fuera_servicio' : 'operativa', notas
  };
  if (st.revisionId) await dbPut('revisiones', rec);
  else await dbAdd('revisiones', { ...rec, createdAt: new Date().toISOString() });
  st.revisionId = id;
  for (const it of items) {                         // cada puerta revisada, reprogramada según SU periodicidad
    if (!it.puertaId) continue;
    try {
      const puerta = await dbGet('puertas', it.puertaId);
      if (puerta) await window.Central.reprogramarPuerta(puerta, c.fecha, it.estadoEquipo === 'no_usar' ? 'fuera_servicio' : 'operativa');
    } catch (e) { console.warn('No se pudo reprogramar la puerta', it.puertaId, e); }
  }
  return id;
}

window.drCheckTienda = async function(si, checked){
  const R = window.__doticsRoute, st = R?.stores[si]; if (!st) return;
  const chk = document.getElementById('dr-chk-' + si);
  if (checked) {
    try { await drGuardarUna(si); }
    catch (e) { if (chk) chk.checked = false; showToast(e.message || 'No se pudo guardar el informe', 'error'); return; }
    st.completada = true; st.abierta = false;
    const sig = R.stores.findIndex((s, k) => k > si && !s.completada);
    if (sig !== -1) R.stores[sig].abierta = true;
    drPintar();
    showToast('Parte de «' + st.nombre + '» guardado (' + R.stores.filter(s => s.completada).length + '/' + R.stores.length + ')');
    if (sig !== -1) document.getElementById('dr-store-' + sig)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.actualizarBadgeRevisiones?.();
    drGuardarBorrador(true);
  } else {
    if (!confirm('¿Reabrir el informe de «' + st.nombre + '»? Podrás corregirlo y, al volver a marcarlo, se actualizará su parte.')) { if (chk) chk.checked = true; return; }
    st.completada = false; st.abierta = true; R.rutasCompletas[drClave(st)] = false;
    drPintar(); drGuardarBorrador(true);
  }
};

window.drCheckRuta = async function(clave, checked){
  const R = window.__doticsRoute; if (!R) return;
  const todas = R.stores.filter(s => drClave(s) === clave).every(s => s.completada);
  if (checked && !todas) { showToast('Primero finaliza todas las tiendas de la ruta', 'error'); drPintar(); return; }
  R.rutasCompletas[clave] = !!checked;
  drPintar();
  const rutas = new Set(R.stores.map(drClave));
  if (checked && R.stores.every(s => s.completada) && [...rutas].every(k => R.rutasCompletas[k])) await drResumen();
};

// Informe único (una sola tienda): se guarda y se ofrece el PDF
window.drGuardarSolo = async function(){
  const R = window.__doticsRoute; if (!R) return;
  try {
    const id = await drGuardarUna(0);
    R.stores[0].completada = true;
    window.__doticsRoute = null;
    closeModal();
    showToast('Informe DOTICS guardado');
    window.actualizarBadgeRevisiones?.();
    await downloadRevisionPDFAfterSave(id);
  } catch (e) { showToast(e.message || 'No se pudo guardar el informe', 'error'); }
};

window.drDescartarBorrador = async function(){
  const R = window.__doticsRoute; if (!R) return;
  if (!confirm('¿Descartar lo escrito y sin finalizar? Los informes de tiendas ya finalizadas se conservan.')) return;
  clearTimeout(__drTimer);
  try { await window.Central.Borradores.borrar(R.borradorKey); } catch (e) { /* nada que borrar */ }
  const o = { ...R.opts, fecha: R.comun.fecha };
  window.__doticsRoute = null;
  await window.abrirRevisionDotics(o);
};

async function drResumen(){
  const R = window.__doticsRoute; if (!R) return;
  clearTimeout(__drTimer);
  try { await window.Central.Borradores.borrar(R.borradorKey); } catch (e) { /* sin borrador */ }
  const body = '<div class="dotics-resumen"><div class="dotics-resumen-icono"><i class="fas fa-flag-checkered"></i></div><h3>Ruta completada</h3>' +
    '<p>' + R.stores.filter(s => s.completada).length + ' de ' + R.stores.length + ' tiendas con su parte guardado.</p></div>' +
    R.stores.map(s => '<div class="ubic-item"><div><strong>' + (s.completada ? '✔ ' : '○ ') + drEsc(s.nombre) + '</strong><br><small>' + drEsc(s.intervencion ? 'Intervención ' + s.intervencion : '') + '</small></div>' +
      (s.revisionId ? '<button class="btn btn-primary btn-sm" onclick="generatePDF_revision(\'' + drEsc(s.revisionId) + '\')"><i class="fas fa-file-pdf"></i> PDF</button>' : '') + '</div>').join('');
  window.__doticsRoute = null;
  openModal('DOTICS · ' + R.nombre, body, '<button class="btn btn-primary" onclick="cerrarFormularioRevision();if(window.__revRefrescar)window.__revRefrescar()">Cerrar</button>');
  window.actualizarBadgeRevisiones?.();
}

window.marcarDoticsTodoBueno=function(){
  const d=window.__doticsVisitDraft; if(!d) return;
  d.lines.forEach(l=>{ if(!l.estado) l.estado='bueno'; });
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
    return '<section class="dotics-line-card"><div class="dotics-line-title"><h4>Equipo '+(index+1)+'</h4>'+(draft.lines.length>1?'<button type="button" class="btn btn-danger btn-icon" aria-label="Eliminar equipo '+(index+1)+'" onclick="removeDoticsVisitLine('+index+')"><i class="fas fa-trash"></i></button>':'')+'</div>'+
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
    estadoEquipo:line.estado,hallazgo:line.observaciones,observaciones:line.observaciones,fotos:line.fotos,
    puertaId:line.puertaId||null,ubicacionId:draft.ubicacionId||null,ubicacionNombre:draft.ubicacionNombre||''
  }));
  const notes=JSON.stringify({form:'DOTICS_VISITA_V1',cadenaId:draft.chainId,clienteId:draft.chainId,cliente:draft.chainName,ubicacionId:draft.ubicacionId||null,ubicacion:draft.ubicacionNombre||'',rutaNombre:draft.rutaNombre||'',contrato:contract,intervencion:intervention,tecnicos:technicians,observaciones:generalNotes});
  try{
    await dbAdd('revisiones',{
      id:draft.id,puertaId:draft.doorId,clienteId:draft.chainId,fecha:date,tecnicoId:lead?.id||null,items,
      hallazgos:items.filter(item=>item.estadoEquipo!=='bueno'&&item.hallazgo).map(item=>item.concepto+': '+item.hallazgo).join(' | '),
      correctivo:'',estadoTrasRevision:items.some(item=>item.estadoEquipo==='no_usar')?'fuera_servicio':'operativa',notas:notes,createdAt:new Date().toISOString()
    });
    // Cada puerta revisada queda reprogramada según SU periodicidad
    for(const item of items){
      if(!item.puertaId) continue;
      try{
        const door=await dbGet('puertas',item.puertaId);
        if(door) await window.Central.reprogramarPuerta(door,date,item.estadoEquipo==='no_usar'?'fuera_servicio':'operativa');
      }catch(e){ console.warn('No se pudo reprogramar la puerta',item.puertaId,e); }
    }
    window.__doticsVisitDraft=null;
    closeModal();
    showToast('Informe DOTICS guardado');
    await downloadRevisionPDFAfterSave(draft.id);
  }catch(error){
    showToast('No se pudo guardar el informe: '+error.message,'error');
  }
};
