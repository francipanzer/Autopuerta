/* =========================================================
 * exportar-contabilidad.js — Exportación CSV para contabilidad (Sage 50)
 *
 *   exportarPresupuestosSage()  presupuestos APROBADOS (una fila por línea)
 *   exportarPartesSage()        partes de trabajo de clientes (mano de obra, desplazamiento y material)
 *
 * Formato genérico: UTF-8 con BOM, separador «;», decimales con coma y fechas dd/mm/aaaa
 * (lo que abre bien Excel y lo que suelen pedir las plantillas de importación en español).
 * IVA fijo al 21 %. Solo administración. Respeta los filtros visibles en pantalla
 * (cliente, técnico y fechas); no aplica el buscador de texto.
 * ========================================================= */
(function () {
  'use strict';

  const IVA = 21;

  const soloAdmin = () => {
    if (window.isAdmin && window.isAdmin()) return true;
    window.showToast('Solo administración puede exportar a contabilidad', 'error');
    return false;
  };

  const redondeo = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
  const importe = x => (x === '' || x == null || !isFinite(Number(x))) ? '' : redondeo(x).toFixed(2).replace('.', ',');
  const cantidad = x => (x === '' || x == null || !isFinite(Number(x))) ? '' : String(Number(x)).replace('.', ',');
  const fecha = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };

  // Texto de celda: comillas si hace falta y sin fórmulas ejecutables en Excel (=, +, -, @)
  function texto(v) {
    let s = String(v == null ? '' : v).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function descargar(nombre, cabecera, filas) {
    const csv = '\uFEFF' + [cabecera].concat(filas).map(f => f.join(';')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const valorFiltro = id => (document.getElementById(id) || {}).value || '';

  async function datosBase() {
    const [clientes, almacen] = await Promise.all([window.dbGetAll('clientes'), window.dbGetAll('almacen').catch(() => [])]);
    return {
      cli: Object.fromEntries(clientes.map(c => [String(c.id), c])),
      art: Object.fromEntries(almacen.map(a => [String(a.id), a]))
    };
  }

  // Líneas con IVA: base = cantidad × precio; cuota y total a partir del 21 %
  function lineaImportes(cant, precio) {
    if (precio === '' || precio == null || !isFinite(Number(precio)) || !isFinite(Number(cant))) return ['', IVA, '', ''];
    const base = redondeo(Number(cant) * Number(precio));
    const cuota = redondeo(base * IVA / 100);
    return [importe(base), IVA, importe(cuota), importe(base + cuota)];
  }

  async function exportarPresupuestosSage() {
    if (!soloAdmin()) return;
    try {
      const cliId = valorFiltro('filterCliPres'), desde = valorFiltro('presDesde'), hasta = valorFiltro('presHasta');
      const [presupuestos, base] = await Promise.all([window.dbGetAll('presupuestos'), datosBase()]);
      const elegidos = presupuestos.filter(p => p.estado === 'aprobado' &&
        (!cliId || String(p.clienteId || '') === cliId) &&
        (!desde || String(p.fecha || '') >= desde) && (!hasta || String(p.fecha || '') <= hasta))
        .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
      const filas = [];
      elegidos.forEach(p => {
        const c = base.cli[String(p.clienteId)] || {};
        (p.lineItems || []).forEach((l, i) => {
          const art = base.art[String(l.articuloId || '')] || {};
          filas.push([
            'Presupuesto', texto(p.id), fecha(p.fecha), texto(c.sageCodigo), texto(c.dni), texto(p.clienteNombre || c.nombre),
            i + 1, texto(art.referencia), texto(l.descripcion), cantidad(l.cantidad), importe(l.precio)
          ].concat(lineaImportes(l.cantidad, l.precio), [texto(p.parteId), texto(p.notas)]));
        });
      });
      if (!filas.length) { window.showToast('No hay presupuestos aprobados con esos filtros', 'info'); return; }
      descargar('sage_presupuestos',
        ['Tipo documento', 'Nº documento', 'Fecha', 'Código cliente Sage', 'NIF/CIF', 'Cliente', 'Línea', 'Referencia', 'Descripción',
          'Cantidad', 'Precio unitario', 'Base imponible', '% IVA', 'Cuota IVA', 'Total línea', 'Nº parte asociado', 'Notas'], filas);
      window.showToast('Exportados ' + elegidos.length + ' presupuesto(s) aprobado(s) (' + filas.length + ' líneas)', 'success');
    } catch (e) { window.showToast('No se pudo exportar: ' + (e.message || e), 'error'); }
  }

  async function exportarPartesSage() {
    if (!soloAdmin()) return;
    try {
      const cliId = valorFiltro('filterClienteParte'), tecId = valorFiltro('filterTecnicoParte');
      const desde = valorFiltro('filterFechaDesde'), hasta = valorFiltro('filterFechaHasta');
      const [partes, base] = await Promise.all([window.dbGetAll('partesTrabajo'), datosBase()]);
      const elegidos = partes.filter(p => !p.interno &&
        (!cliId || String(p.clienteId || '') === cliId) && (!tecId || String(p.empleadoId || '') === tecId) &&
        (!desde || String(p.fecha || '') >= desde) && (!hasta || String(p.fecha || '') <= hasta))
        .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
      const filas = [];
      elegidos.forEach(p => {
        const c = base.cli[String(p.clienteId)] || {};
        let n = 0;
        const fila = (tipo, ref, desc, cant, unidad, precio) => filas.push([
          texto(p.id), fecha(p.fecha), texto(c.sageCodigo), texto(c.dni), texto(p.clienteNombre || c.nombre), texto(p.ubicacionNombre),
          texto(p.empleadoNombre), ++n, tipo, texto(ref), texto(desc), cantidad(cant), unidad, importe(precio)
        ].concat(lineaImportes(cant, precio)));
        const trabajo = p.descripcion ? ' – ' + p.descripcion : '';
        if (Number(p.horas) > 0) fila('Mano de obra', '', 'Mano de obra' + trabajo, p.horas, 'h', '');
        if (Number(p.kms) > 0) fila('Desplazamiento', '', 'Desplazamiento', p.kms, 'km', '');
        (Array.isArray(p.materiales) ? p.materiales : []).forEach(m => {
          const art = base.art[String(m.articuloId || '')] || {};
          fila('Material', art.referencia, m.descripcion || art.nombre, m.cantidad, m.unidad || 'ud', art.precioVenta);
        });
      });
      if (!filas.length) { window.showToast('No hay partes con esos filtros', 'info'); return; }
      descargar('sage_partes',
        ['Nº parte', 'Fecha', 'Código cliente Sage', 'NIF/CIF', 'Cliente', 'Ubicación', 'Técnico', 'Línea', 'Tipo línea', 'Referencia', 'Descripción',
          'Cantidad', 'Unidad', 'Precio unitario', 'Base imponible', '% IVA', 'Cuota IVA', 'Total línea'], filas);
      window.showToast('Exportados ' + elegidos.length + ' parte(s) (' + filas.length + ' líneas). El precio solo se rellena en el material con precio en almacén', 'success');
    } catch (e) { window.showToast('No se pudo exportar: ' + (e.message || e), 'error'); }
  }

  window.exportarPresupuestosSage = exportarPresupuestosSage;
  window.exportarPartesSage = exportarPartesSage;
})();
