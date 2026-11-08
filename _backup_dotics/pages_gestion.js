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
  window.__doticsVisitDraft = null;
  window.__doticsQueue = null;
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
    if (String(cliente.nombre || '').trim().toLocaleUpperCase() === 'DOTICS') {
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
          '<tr><td data-label="Puerta"><input class="hiperber-door-name" type="text" readonly' + (door.nombre ? '' : ' data-empty="1"') + ' aria-label="Puerta de ' + escapeHtml(store.nombre) + '" value="' + escapeHtml(door.nombre) + '" placeholder="Sin nombre"' + '>' + '<small>' + escapeHtml(door.tipo || '') + '</small></td>' +
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
  if(!ctx?.queue) window.__doticsQueue=null;          // un informe suelto nunca hereda una ruta anterior
  const queue=ctx?.queue?window.__doticsQueue:null;
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
    (queue?'<button type="button" class="btn btn-outline" onclick="doticsSaltarUbicacion()"><i class="fas fa-forward"></i> Saltar</button>':'')+
    '<button type="button" class="btn btn-primary" onclick="saveDoticsMaintenanceForm()"><i class="fas fa-'+(queue&&esUltima?'flag-checkered':'save')+'"></i> '+(queue?(esUltima?'Guardar y finalizar ruta':'Guardar y siguiente'):'Guardar informe')+'</button>';
  openModal('Informe visita de mantenimiento'+(ctx?.ubicacion?' · '+ctx.ubicacion.denominacion:''),form,footer);
  renderDoticsVisitLines();
};

// ═══════════════════════════════════════════════════════════
//  DOTICS · un informe por ubicación, varios por ruta
//  Cada ubicación abre el formulario de informe de visita ya rellenado con sus puertas
//  (tipo, nombre y nº de serie): el técnico solo marca el estado y, si no está bien,
//  escribe observaciones. Cada informe se guarda al terminarlo, así el avance por
//  ubicación queda guardado y al reabrir la ruta se continúa por la primera pendiente.
// ═══════════════════════════════════════════════════════════
window.abrirRevisionDotics = async function(opts){
  opts=opts||{};
  const cliente=await dbGet('clientes',opts.clienteId);
  if(!cliente) return showToast('No se encontró el cliente','error');
  const fecha=opts.fecha||new Date().toISOString().slice(0,10);
  const [ubics,rutas,puertas]=await Promise.all([window.Central.ubicacionesDe(cliente.id),window.Central.rutasDe(cliente.id),window.Central.puertasDe(cliente.id)]);
  let lista=ubics.filter(u=>u.activa!==false);
  if(opts.ubicacionIds) lista=lista.filter(u=>opts.ubicacionIds.map(String).includes(String(u.id)));
  else if(opts.rutaId) lista=lista.filter(u=>String(u.rutaId)===String(opts.rutaId));
  if(!lista.length){
    // Sin ubicaciones: un único informe con todas las puertas del cliente
    window.__doticsQueue=null;
    return window.openDoticsMaintenanceForm(cliente.id,null,fecha,{puertas});
  }
  const rutaPorId=new Map(rutas.map(r=>[String(r.id),r]));
  lista.sort((a,b)=>{
    const ra=rutaPorId.get(String(a.rutaId))?.orden??Infinity, rb=rutaPorId.get(String(b.rutaId))?.orden??Infinity;
    return ra-rb||window.Central.porOrden(a,b);
  });
  // Ubicaciones que ya tienen informe DOTICS de esa fecha (avance guardado)
  const hechas=new Set();
  (await dbGetAll('revisiones')).forEach(r=>{
    let n={}; try{n=JSON.parse(r.notas||'{}');}catch(e){}
    if(n.form==='DOTICS_VISITA_V1'&&n.ubicacionId&&String(r.fecha||'').slice(0,10)===fecha&&String(r.clienteId)===String(cliente.id)) hechas.add(String(n.ubicacionId));
  });
  const items=lista.map(u=>({
    id:String(u.id),nombre:u.denominacion,hecha:hechas.has(String(u.id)),
    rutaNombre:rutaPorId.get(String(u.rutaId))?.nombre||'',
    puertas:puertas.filter(p=>String(p.ubicacionId)===String(u.id)),ubicacion:u
  }));
  const pos=items.findIndex(i=>!i.hecha);
  window.__doticsQueue={clienteId:String(cliente.id),nombre:cliente.nombre,fecha,items,pos:Math.max(pos,0),comun:{contrato:'',tecnicos:''},informes:[]};
  if(pos===-1){ showToast('Todas las ubicaciones ya tienen su informe de esta fecha','info'); return doticsResumenRuta(); }
  if(hechas.size) showToast(hechas.size+' ubicación(es) ya hechas; continúas por «'+items[pos].nombre+'»');
  return abrirInformeDoticsActual();
};

async function abrirInformeDoticsActual(){
  const q=window.__doticsQueue; if(!q) return;
  const it=q.items[q.pos];
  return window.openDoticsMaintenanceForm(q.clienteId,null,q.fecha,{ubicacion:it.ubicacion,puertas:it.puertas,rutaNombre:it.rutaNombre,queue:true});
}

// Informe guardado: se marca la ubicación como hecha y se pasa a la siguiente pendiente
async function doticsInformeGuardado(revisionId,comun){
  const q=window.__doticsQueue; if(!q) return;
  q.items[q.pos].hecha=true;
  q.informes.push({id:revisionId,ubicacion:q.items[q.pos].nombre});
  q.comun=comun;                                    // contrato y técnico se arrastran al siguiente
  showToast('Informe de «'+q.items[q.pos].nombre+'» guardado ('+q.items.filter(i=>i.hecha).length+'/'+q.items.length+')');
  const sig=q.items.findIndex((i,k)=>!i.hecha&&k>q.pos);
  const alguna=sig!==-1?sig:q.items.findIndex(i=>!i.hecha);
  if(alguna===-1) return doticsResumenRuta();
  q.pos=alguna;
  return abrirInformeDoticsActual();
}

window.doticsSaltarUbicacion=async function(){
  const q=window.__doticsQueue; if(!q) return;
  const pendientes=q.items.map((i,k)=>({i,k})).filter(x=>!x.i.hecha&&x.k!==q.pos);
  if(!pendientes.length){ showToast('Es la última ubicación pendiente: guárdala o cierra','warning'); return; }
  const sig=pendientes.find(x=>x.k>q.pos)||pendientes[0];
  q.comun={contrato:document.getElementById('dotics-contract')?.value.trim()||'',tecnicos:document.getElementById('dotics-technicians')?.value.trim()||''};
  q.pos=sig.k;
  return abrirInformeDoticsActual();
};

// Check final de la ruta: resumen de informes y acceso a sus PDF
function doticsResumenRuta(){
  const q=window.__doticsQueue; if(!q) return;
  const hechas=q.items.filter(i=>i.hecha).length;
  const body='<div style="text-align:center;margin-bottom:14px"><div style="font-size:42px;color:#16a34a"><i class="fas fa-flag-checkered"></i></div>'+
    '<h3 style="margin:6px 0">Ruta completada</h3><p style="color:var(--text-muted)">'+hechas+' de '+q.items.length+' ubicaciones con informe de visita.</p></div>'+
    '<div>'+q.items.map(i=>{
      const inf=q.informes.find(x=>x.ubicacion===i.nombre);
      return '<div class="ubic-item"><div><strong>'+(i.hecha?'✔ ':'○ ')+escapeHtml(i.nombre)+'</strong></div>'+(inf?'<button class="btn btn-outline btn-sm" onclick="generatePDF_revision(\''+escapeHtml(inf.id)+'\')"><i class="fas fa-file-pdf"></i> PDF</button>':'<small style="color:var(--text-muted)">'+(i.hecha?'ya guardado antes':'pendiente')+'</small>')+'</div>';
    }).join('')+'</div>';
  window.__doticsQueue=null;
  openModal('DOTICS · '+q.nombre,body,'<button class="btn btn-primary" onclick="cerrarFormularioRevision();if(window.__revRefrescar)window.__revRefrescar()">Cerrar</button>');
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
    if(draft.enCola&&window.__doticsQueue){          // ruta: se guarda este informe y se pasa al siguiente
      await doticsInformeGuardado(draft.id,{contrato:contract,tecnicos:technicians});
      return;
    }
    closeModal();
    showToast('Informe DOTICS guardado');
    await downloadRevisionPDFAfterSave(draft.id);
  }catch(error){
    showToast('No se pudo guardar el informe: '+error.message,'error');
  }
};
