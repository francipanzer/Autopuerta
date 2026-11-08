(function () {
  const TABLE = 'albaranes';
  const BRAND = { ink: [15, 23, 42], muted: [100, 116, 139], green: [22, 163, 74], line: [203, 213, 225] };

  function esc(value) {
    return window.escapeHtml(value ?? '');
  }

  function requireAdmin() {
    if (!window.isAdmin?.()) {
      window.showToast('Solo administración puede crear, modificar o eliminar albaranes.', 'error');
      return false;
    }
    return true;
  }

  function runAction(label, action) {
    Promise.resolve().then(action).catch(error => {
      console.error('[Albaranes] ' + label + ':', error);
      window.showToast('No se pudo ' + label + ': ' + error.message, 'error');
    });
  }

  function formatNumber(record) {
    const year = String(record.fecha || new Date().toISOString()).slice(0, 4);
    return 'ALB-' + year + '-' + String(record.numero || '').padStart(4, '0');
  }

  function fromRow(row) {
    return {
      ...row,
      createdAt: row.createdat,
      createdBy: row.createdby,
      clienteId: row.clienteid,
      clienteNombre: row.clientenombre,
      clienteDireccion: row.clientedireccion,
      clienteDocumento: row.clientedocumento,
      clienteTelefono: row.clientetelefono,
      tecnicoIds: row.tecnicoids || [],
      firmaCliente: row.firmacliente,
      firmadoAt: row.firmadoat,
      presupuestoId: row.presupuestoid
    };
  }

  async function getAlbaranes() {
    const { data, error } = await window.supabaseDB
      .from(TABLE)
      .select('*')
      .order('fecha', { ascending: false })
      .order('numero', { ascending: false });
    if (error) throw error;
    return (data || []).map(fromRow);
  }

  async function getAlbaran(id) {
    const { data, error } = await window.supabaseDB.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }

  function empleadosNombreMap(empleados) {
    return Object.fromEntries(empleados.map(employee => [String(employee.id), employee.nombre]));
  }

  window.render_albaranes = async function (container) {
    const admin = window.isAdmin?.();
    const technician = window.isTechnician?.();
    if (!admin && !technician) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h3>No tienes permiso para acceder a los albaranes.</h3></div>';
      return;
    }

    const [records, employees, budgets] = await Promise.all([
      getAlbaranes(),
      admin ? window.db.dbGetAll('empleados') : Promise.resolve([]),
      admin ? window.db.dbGetAll('presupuestos') : Promise.resolve([])
    ]);
    const names = empleadosNombreMap(employees);
    const withAlbaran = new Set(records.map(record => String(record.presupuestoId || '')).filter(Boolean));
    const pendingBudgets = budgets.filter(budget =>
      String(budget.estado || '').toLowerCase() === 'aprobado' && !withAlbaran.has(String(budget.id)));
    const pendingHtml = admin && pendingBudgets.length ? `
      <div class="card" style="margin-bottom:16px"><div class="card-header"><h3>Presupuestos aprobados sin albarán (${pendingBudgets.length})</h3></div>
      <div class="table-wrapper"><table>
        <thead><tr><th>Presupuesto</th><th>Cliente</th><th>Acciones</th></tr></thead>
        <tbody>${pendingBudgets.map(budget => `<tr>
          <td><strong>${esc(budget.id)}</strong></td>
          <td>${esc(budget.clienteNombre || '—')}</td>
          <td><button class="btn btn-primary btn-sm" data-from-budget="${esc(budget.id)}"><i class="fas fa-file-signature"></i> Crear y asignar albarán</button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>` : '';
    container.innerHTML = `
      <div class="page-header">
        <div><h2><i class="fas fa-file-signature"></i> Albaranes</h2>
        <p>${admin ? 'Crea albaranes sin importes y asígnalos a los técnicos responsables.' : 'Albaranes asignados para mostrar al cliente al terminar la obra.'}</p></div>
        ${admin ? '<button class="btn btn-primary" id="newAlbaran"><i class="fas fa-plus"></i> Nuevo albarán</button>' : ''}
      </div>
      ${pendingHtml}
      <div class="card"><div class="table-wrapper"><table>
        <thead><tr><th>Nº albarán</th><th data-titulo>Cliente</th><th>Fecha</th><th>Presupuesto</th><th>${admin ? 'Técnico(s)' : 'Estado'}</th></tr></thead>
        <tbody>${records.map(record => {
          const assignedNames = (record.tecnicoIds || []).map(id => names[String(id)]).filter(Boolean).join(', ');
          return `<tr data-albaran-row="${esc(record.id)}" style="cursor:pointer">
            <td><strong>${esc(formatNumber(record))}</strong></td>
            <td>${esc(record.clienteNombre)}</td>
            <td>${esc(window.formatDate(record.fecha))}</td>
            <td>${record.presupuestoId ? esc(record.presupuestoId) : '—'}</td>
            <td>${admin ? esc(assignedNames || 'Sin asignar') : (record.firmaCliente ? '<span class="badge badge-green">Firmado</span>' : '<span class="badge badge-orange">Pendiente de firma</span>')}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">${admin ? 'Todavía no hay albaranes.' : 'No tienes albaranes asignados.'}</td></tr>`}</tbody>
      </table></div></div>`;

    container.querySelector('#newAlbaran')?.addEventListener('click', () => runAction('abrir el formulario', () => window.showAlbaranForm()));
    container.querySelectorAll('[data-from-budget]').forEach(button => button.addEventListener('click', () => {
      const budget = pendingBudgets.find(item => String(item.id) === button.dataset.fromBudget);
      runAction('abrir el formulario', () => window.showAlbaranForm(null, budget));
    }));
    container.querySelectorAll('[data-albaran-row]').forEach(row => row.addEventListener('click', () =>
      runAction('abrir el albarán', () => window.previewAlbaran(row.dataset.albaranRow))));
  };

  function lineasHtml(lineas) {
    const rows = Array.isArray(lineas) && lineas.length ? lineas : [{ descripcion: '', cantidad: 1, unidad: 'ud' }];
    return rows.map((line, index) => `<div class="form-grid albaran-line" data-line="${index}" style="grid-template-columns:minmax(0,3fr) minmax(90px,1fr) minmax(80px,1fr) auto;align-items:end;margin:0 0 8px">
      <input type="hidden" data-line-code value="${esc(line.codigo || '')}">
      <div class="form-group"><label>Trabajo / material</label><input data-line-description maxlength="240" value="${esc(line.descripcion)}" required></div>
      <div class="form-group"><label>Cantidad</label><input data-line-quantity type="number" min="0.01" step="0.01" value="${esc(line.cantidad ?? 1)}" required></div>
      <div class="form-group"><label>Unidad</label><input data-line-unit maxlength="20" value="${esc(line.unidad || 'ud')}"></div>
      <button type="button" class="btn btn-danger btn-sm" data-remove-line="${index}" aria-label="Quitar línea"><i class="fas fa-trash"></i></button>
    </div>`).join('');
  }

  window.showAlbaranForm = async function (id, sourceBudget) {
    if (!requireAdmin()) return;
    const [record, clients, employees] = await Promise.all([
      id ? getAlbaran(id) : Promise.resolve(null),
      window.db.dbGetAll('clientes'),
      window.db.dbGetAll('empleados')
    ]);
    if (id && !record) {
      window.showToast('No se encontró el albarán.', 'error');
      return;
    }
    if (!id && sourceBudget) {
      if (sourceBudget.estado !== 'aprobado') {
        window.showToast('Solo se puede crear un albarán desde un presupuesto aprobado.', 'error');
        return;
      }
      const { data: existing, error } = await window.supabaseDB.from(TABLE)
        .select('id,numero').eq('presupuestoid', String(sourceBudget.id)).maybeSingle();
      if (error) throw error;
      if (existing) {
        window.showToast('Este presupuesto ya tiene un albarán asociado.');
        window.navigateTo('albaranes');
        return;
      }
    }
    const prefillClient = sourceBudget
      ? clients.find(client => String(client.id) === String(sourceBudget.clienteId))
      : null;
    const initialLines = sourceBudget
      ? (sourceBudget.lineItems || []).map(item => ({
          codigo: item.codigo || item.referencia || item.tipoId || '',
          descripcion: item.descripcion || '',
          cantidad: item.cantidad,
          unidad: item.unidad || 'ud'
        }))
      : null;
    const selectedClientId = record?.clienteId || sourceBudget?.clienteId || '';
    const clientOptions = clients.slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')).map(client =>
      `<option value="${esc(client.id)}" data-name="${esc(client.nombre)}" data-address="${esc(client.direccion || client.direccionFiscal || '')}" data-document="${esc(client.dni || client.cif || '')}" data-phone="${esc(client.telefono || '')}" ${String(selectedClientId) === String(client.id) ? 'selected' : ''}>${esc(client.nombre)}</option>`
    ).join('');
    const assigned = new Set((record?.tecnicoIds || []).map(String));
    const techOptions = employees.map(employee => `<label style="display:flex;gap:8px;align-items:center;margin:4px 0">
      <input type="checkbox" name="albaran-technician" value="${esc(employee.id)}" ${assigned.has(String(employee.id)) ? 'checked' : ''}>
      <span>${esc(employee.nombre)}</span></label>`).join('') || '<small>No hay empleados disponibles.</small>';
    openModal(record ? `Editar ${formatNumber(record)}` : 'Nuevo albarán', `
      <form id="albaranForm" class="form-grid">
        ${record?.firmaCliente ? '<div class="form-group full"><div class="help-notice">Al guardar cambios se eliminará la firma anterior y habrá que volver a firmar el documento.</div></div>' : ''}
        <div class="form-group"><label for="alb-date">Fecha</label><input id="alb-date" type="date" value="${esc(record?.fecha || new Date().toISOString().slice(0, 10))}" required></div>
        ${sourceBudget ? `<div class="form-group full"><div class="help-notice">Origen: presupuesto ${esc(sourceBudget.id)} · Se copiarán cliente y conceptos sin precios.</div></div>` : ''}
        <div class="form-group"><label for="alb-client">Cliente</label><select id="alb-client"><option value="">Cliente manual</option>${clientOptions}</select></div>
        <div class="form-group"><label for="alb-name">Nombre del cliente *</label><input id="alb-name" maxlength="160" value="${esc(record?.clienteNombre || sourceBudget?.clienteNombre)}" required></div>
        <div class="form-group"><label for="alb-document">NIF / CIF</label><input id="alb-document" maxlength="32" value="${esc(record?.clienteDocumento || prefillClient?.dni || prefillClient?.cif)}"></div>
        <div class="form-group"><label for="alb-phone">Teléfono</label><input id="alb-phone" type="tel" maxlength="40" value="${esc(record?.clienteTelefono || prefillClient?.telefono)}"></div>
        <div class="form-group full"><label for="alb-address">Dirección de la obra</label><input id="alb-address" maxlength="240" value="${esc(record?.clienteDireccion || prefillClient?.direccion || prefillClient?.direccionFiscal)}"></div>
        <div class="form-group full"><label for="alb-description">Descripción de la obra</label><textarea id="alb-description" rows="2" maxlength="1000">${esc(record?.descripcion || (sourceBudget ? 'Trabajos según presupuesto ' + sourceBudget.id : ''))}</textarea></div>
        <div class="form-group full"><label>Trabajos y materiales (sin precios)</label><div id="albaranLines">${lineasHtml(record?.lineas || initialLines)}</div>
          <button type="button" id="addAlbaranLine" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Añadir línea</button></div>
        <div class="form-group full"><label>Técnicos asignados</label><div id="albaranTechnicians">${techOptions}</div>
          <small style="color:var(--text-muted)">Solo estos técnicos y administración podrán consultar el albarán.</small></div>
      </form>`,
      `<button class="btn btn-primary" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="saveAlbaran"><i class="fas fa-save"></i> Guardar y asignar</button>`);

    const form = document.getElementById('albaranForm');
    const clientSelect = form.querySelector('#alb-client');
    clientSelect.addEventListener('change', () => {
      const option = clientSelect.selectedOptions[0];
      if (!clientSelect.value) return;
      form.querySelector('#alb-name').value = option.dataset.name || '';
      form.querySelector('#alb-address').value = option.dataset.address || '';
      form.querySelector('#alb-document').value = option.dataset.document || '';
      form.querySelector('#alb-phone').value = option.dataset.phone || '';
    });
    const lines = form.querySelector('#albaranLines');
    form.querySelector('#addAlbaranLine').addEventListener('click', () => {
      const current = [...lines.querySelectorAll('.albaran-line')].map(line => ({
        codigo: line.querySelector('[data-line-code]').value,
        descripcion: line.querySelector('[data-line-description]').value,
        cantidad: line.querySelector('[data-line-quantity]').value,
        unidad: line.querySelector('[data-line-unit]').value
      }));
      current.push({ descripcion: '', cantidad: 1, unidad: 'ud' });
      lines.innerHTML = lineasHtml(current);
    });
    lines.addEventListener('click', event => {
      const remove = event.target.closest('[data-remove-line]');
      if (!remove) return;
      const rows = [...lines.querySelectorAll('.albaran-line')];
      if (rows.length === 1) {
        rows[0].querySelector('[data-line-description]').value = '';
        rows[0].querySelector('[data-line-quantity]').value = '1';
        rows[0].querySelector('[data-line-unit]').value = 'ud';
      } else {
        rows.splice(Number(remove.dataset.removeLine), 1);
        lines.innerHTML = lineasHtml(rows.map(row => ({
          codigo: row.querySelector('[data-line-code]').value,
          descripcion: row.querySelector('[data-line-description]').value,
          cantidad: row.querySelector('[data-line-quantity]').value,
          unidad: row.querySelector('[data-line-unit]').value
        })));
      }
    });
    document.getElementById('saveAlbaran').addEventListener('click', () => window.saveAlbaran(record?.id, sourceBudget?.id));
  };

  window.saveAlbaran = async function (id, sourceBudgetId) {
    if (!requireAdmin()) return;
    const form = document.getElementById('albaranForm');
    if (!form.reportValidity()) return;
    const lineas = [...form.querySelectorAll('.albaran-line')].map(line => ({
      codigo: line.querySelector('[data-line-code]').value.trim(),
      descripcion: line.querySelector('[data-line-description]').value.trim(),
      cantidad: Number(line.querySelector('[data-line-quantity]').value),
      unidad: line.querySelector('[data-line-unit]').value.trim() || 'ud'
    })).filter(line => line.descripcion);
    if (!lineas.length || lineas.some(line => !Number.isFinite(line.cantidad) || line.cantidad <= 0)) {
      window.showToast('Añade al menos una línea con una cantidad válida.', 'error');
      return;
    }
    const clientId = form.querySelector('#alb-client').value || null;
    const tecnicoids = [...form.querySelectorAll('input[name="albaran-technician"]:checked')].map(input => input.value);
    if (!tecnicoids.length) {
      window.showToast('Asigna el albarán al menos a un técnico.', 'error');
      return;
    }
    const button = document.getElementById('saveAlbaran');
    button.disabled = true;
    const payload = {
      fecha: form.querySelector('#alb-date').value,
      clienteid: clientId,
      clientenombre: form.querySelector('#alb-name').value.trim(),
      clientedireccion: form.querySelector('#alb-address').value.trim(),
      clientedocumento: form.querySelector('#alb-document').value.trim(),
      clientetelefono: form.querySelector('#alb-phone').value.trim(),
      descripcion: form.querySelector('#alb-description').value.trim(),
      lineas,
      tecnicoids,
      presupuestoid: sourceBudgetId ? String(sourceBudgetId) : null,
      estado: 'pendiente',
      firmacliente: null,
      firmadoat: null,
      updatedat: new Date().toISOString()
    };

    try {
      const query = id
        ? window.supabaseDB.from(TABLE).update(payload).eq('id', id)
        : window.supabaseDB.from(TABLE).insert({ ...payload, createdby: window.authState.user.id });
      const { error } = await query.select('id').single();
      if (error) throw error;
    } catch (error) {
      console.error('[Albaranes] No se pudo guardar:', error);
      window.showToast('No se pudo guardar el albarán: ' + error.message, 'error');
      return;
    } finally {
      button.disabled = false;
    }
    window.closeModal();
    window.showToast(id ? 'Albarán actualizado y reasignado.' : 'Albarán creado y asignado.');
    try {
      await window.render_albaranes(document.getElementById('mainContent'));
    } catch (error) {
      console.error('[Albaranes] Guardado, pero no se pudo actualizar el listado:', error);
      window.showToast('Albarán guardado, pero no se pudo actualizar el listado: ' + error.message, 'error');
    }
  };

  window.createAlbaranFromPresupuesto = async function (presupuestoId) {
    if (!requireAdmin()) return;
    try {
      const presupuesto = await window.db.dbGet('presupuestos', presupuestoId);
      if (!presupuesto) throw new Error('No se encontró el presupuesto.');
      if (presupuesto.estado !== 'aprobado') {
        window.showToast('Solo se puede crear un albarán desde un presupuesto aprobado.', 'error');
        return;
      }
      await window.showAlbaranForm(null, presupuesto);
    } catch (error) {
      console.error('[Albaranes] No se pudo preparar el albarán desde el presupuesto:', error);
      window.showToast('No se pudo preparar el albarán: ' + error.message, 'error');
    }
  };

  window.deleteAlbaran = async function (id) {
    if (!requireAdmin()) return;
    if (!window.confirm('¿Eliminar este albarán?')) return;
    const { error } = await window.supabaseDB.from(TABLE).delete().eq('id', id);
    if (error) {
      window.showToast('No se pudo eliminar: ' + error.message, 'error');
      return;
    }
    window.showToast('Albarán eliminado.');
    await window.render_albaranes(document.getElementById('mainContent'));
  };

  async function createAlbaranFile(record) {
    await window.loadScriptOnce(window.LAZY_SCRIPTS.pdf);
    await window.ensurePdfLibs();
    const doc = await window.createBrandedPDF('ALBARÁN', '', null, null, true, true);
    const company = await window.getCompanySettings();
    const logo = await window.getCompanyLogoDataUrl();
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const left = 14, right = width - 14;
    const lines = record.lineas || [];
    const companyName = String(company.legal_name || company.trade_name || 'VALGOM').slice(0, 58);
    const clientBox = { x: 139, y: 12, w: 57, h: 40 };
    const metadataY = 58;
    const drawMetadata = pageNumber => {
      const widths = [26, 31, 44, 27, 38, 16];
      const labels = ['FECHA', 'ALBARÁN', 'CLIENTE', 'N.I.F.', 'TELÉFONO', 'PÁG.'];
      const values = [
        window.formatDate(record.fecha),
        formatNumber(record),
        String(record.clienteNombre || '—'),
        String(record.clienteDocumento || '—'),
        String(record.clienteTelefono || '—'),
        String(pageNumber)
      ];
      let x = left;
      doc.setFontSize(7);
      labels.forEach((label, index) => {
        const w = widths[index];
        doc.setFillColor(239, 241, 238);
        doc.setDrawColor(96, 108, 100);
        doc.rect(x, metadataY, w, 7, 'FD');
        doc.rect(x, metadataY + 7, w, 9, 'S');
        doc.setTextColor(...BRAND.ink);
        doc.setFont(undefined, 'bold');
        doc.text(label, x + w / 2, metadataY + 4.7, { align: 'center', maxWidth: w - 2 });
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7.5);
        doc.text(values[index], x + w / 2, metadataY + 12.5, { align: 'center', maxWidth: w - 2 });
        doc.setFontSize(7);
        x += w;
      });
    };

    doc.setDrawColor(96, 108, 100);
    doc.setLineWidth(0.45);
    doc.rect(left, 12, right - left, 40);
    if (logo) {
      try { doc.addImage(logo, 'PNG', left + 3, 17, 25, 25); }
      catch (error) { console.warn('[Albaranes] No se pudo insertar el logo:', error); }
    }
    const companyX = left + (logo ? 32 : 4);
    doc.setTextColor(...BRAND.ink);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(companyName, companyX, 20, { maxWidth: clientBox.x - companyX - 4 });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    const companyDetails = [
      company.address,
      company.phone ? 'Tel.: ' + company.phone : '',
      company.tax_id ? 'CIF: ' + company.tax_id : '',
      company.email,
      company.website
    ].filter(Boolean);
    companyDetails.slice(0, 5).forEach((value, index) => {
      doc.text(String(value).slice(0, 68), companyX, 25 + index * 4.2, {
        maxWidth: clientBox.x - companyX - 4
      });
    });

    doc.setDrawColor(96, 108, 100);
    doc.roundedRect(clientBox.x, clientBox.y, clientBox.w, clientBox.h, 3, 3, 'S');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.green);
    doc.text('ALBARÁN', clientBox.x + 4, clientBox.y + 6);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.ink);
    const clientNameLines = doc.splitTextToSize(String(record.clienteNombre || '—'), clientBox.w - 8).slice(0, 2);
    doc.text(clientNameLines, clientBox.x + 4, clientBox.y + 13);
    const clientAddressLines = doc.splitTextToSize(String(record.clienteDireccion || ''), clientBox.w - 8).slice(0, 2);
    if (clientAddressLines.length) {
      doc.setFontSize(7);
      doc.text(clientAddressLines, clientBox.x + 4, clientBox.y + 22);
    }
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(String(record.presupuestoId ? 'Presupuesto ' + record.presupuestoId : ''), clientBox.x + 4, clientBox.y + 35, {
      maxWidth: clientBox.w - 8
    });

    drawMetadata(1);
    let y = metadataY + 22;
    if (record.descripcion) {
      doc.setTextColor(...BRAND.ink);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text('TRABAJO REALIZADO', left + 1, y + 3);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      const descriptionLines = doc.splitTextToSize(String(record.descripcion), right - left - 2);
      doc.text(descriptionLines, left + 1, y + 8);
      y += 11 + descriptionLines.length * 4;
    }
    doc.autoTable({
      startY: y,
      margin: { left, right: 14, top: 82, bottom: 56 },
      head: [['CÓDIGO', 'DESCRIPCIÓN', 'UNID.']],
      body: lines.map(line => [
        String(line.codigo || line.referencia || line.tipoId || ''),
        String(line.descripcion || ''),
        `${line.cantidad ?? ''} ${line.unidad || 'ud'}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [239, 241, 238], textColor: BRAND.ink, lineColor: [96, 108, 100], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: BRAND.ink, lineColor: [160, 168, 161], lineWidth: 0.15, fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 'auto' }, 2: { halign: 'center', cellWidth: 31 } }
    });
    // El cuadro de firma queda anclado al pie de la última página (la tabla reserva 56 mm abajo).
    doc.setPage(doc.internal.getNumberOfPages());
    y = height - 52;
    doc.setDrawColor(96, 108, 100);
    doc.roundedRect(left, y, 92, 34, 3, 3, 'S');
    doc.setTextColor(...BRAND.ink);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8);
    doc.text('CONFORMIDAD DEL CLIENTE', left + 4, y + 6);
    if (record.firmaCliente) {
      try { doc.addImage(record.firmaCliente, 'PNG', left + 4, y + 8, 84, 20); }
      catch (error) { console.warn('[Albaranes] No se pudo insertar la firma:', error); }
    } else {
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.muted);
      doc.text('Firma del cliente', left + 4, y + 29);
    }
    if (record.firmadoAt) {
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.muted);
      doc.text('Firmado el ' + window.formatDate(record.firmadoAt), left + 4, y + 32);
    }

    for (let page = 1; page <= doc.internal.getNumberOfPages(); page++) {
      doc.setPage(page);
      if (page > 1) {
        doc.setDrawColor(96, 108, 100);
        doc.setLineWidth(0.45);
        doc.rect(left, 12, right - left, 40);
        if (logo) {
          try { doc.addImage(logo, 'PNG', left + 3, 17, 25, 25); } catch (error) {
            console.warn('[Albaranes] No se pudo insertar el logo en página adicional:', error);
          }
        }
        doc.setTextColor(...BRAND.ink);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(11);
        doc.text(companyName, left + (logo ? 32 : 4), 20);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...BRAND.muted);
        doc.text('Copia · ' + formatNumber(record), left + (logo ? 32 : 4), 27);
        doc.setDrawColor(96, 108, 100);
        doc.roundedRect(clientBox.x, clientBox.y, clientBox.w, clientBox.h, 3, 3, 'S');
        doc.setFont(undefined, 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.green);
        doc.text('ALBARÁN', clientBox.x + 4, clientBox.y + 6);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.ink);
        doc.text(clientNameLines, clientBox.x + 4, clientBox.y + 13);
        if (clientAddressLines.length) {
          doc.setFontSize(7);
          doc.text(clientAddressLines, clientBox.x + 4, clientBox.y + 22);
        }
        doc.setFontSize(7);
        doc.setTextColor(...BRAND.muted);
        doc.text(String(record.presupuestoId ? 'Presupuesto ' + record.presupuestoId : ''), clientBox.x + 4, clientBox.y + 35, {
          maxWidth: clientBox.w - 8
        });
        drawMetadata(page);
      }
    }
    const filename = formatNumber(record).toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.pdf';
    return new File([doc.output('blob')], filename, { type: 'application/pdf' });
  }

  async function renderPdfPages(file) {
    if (!window.pdfjsLib) {
      await window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const images = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.92));
    }
    return images;
  }

  function openLargeViewer(images, title) {
    const viewer = document.createElement('div');
    viewer.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.92);display:flex;flex-direction:column';
    viewer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;color:#fff;gap:8px">
        <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</strong>
        <button class="btn btn-primary btn-sm" data-close-viewer><i class="fas fa-times"></i> Cerrar</button>
      </div>
      <div style="flex:1;overflow:auto;touch-action:pan-x pan-y pinch-zoom;-webkit-overflow-scrolling:touch;padding:0 8px 16px">
        ${images.map(src => `<img src="${src}" alt="${esc(title)}" style="display:block;width:100%;max-width:900px;margin:0 auto 12px;background:#fff">`).join('')}
      </div>`;
    viewer.querySelector('[data-close-viewer]').addEventListener('click', () => viewer.remove());
    document.body.appendChild(viewer);
  }

  window.previewAlbaran = async function (id) {
    const record = await getAlbaran(id);
    if (!record) throw new Error('No tienes acceso a este albarán o ya no existe.');
    const admin = window.isAdmin?.();
    await window.loadFeatures?.();
    const file = await createAlbaranFile(record);
    let images = [];
    try { images = await renderPdfPages(file); }
    catch (error) { console.warn('[Albaranes] No se pudo generar la vista previa:', error); }
    const title = formatNumber(record);
    const iconButton = (action, icon, label, cls = 'btn-primary') =>
      `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px">
        <button type="button" class="btn ${cls} btn-icon" data-albaran-action="${action}" title="${label}" aria-label="${label}" style="width:48px;height:48px;min-height:48px"><i class="fas ${icon}"></i></button>
        <small style="color:var(--text-muted);font-size:11px">${label}</small></div>`;
    const icons = [
      iconButton('view', 'fa-magnifying-glass-plus', 'Ver grande'),
      iconButton('share', 'fa-share-nodes', 'Compartir')
    ];
    if (window.isTechnician?.() && !record.firmaCliente) icons.push(iconButton('sign', 'fa-signature', 'Firmar', 'btn-success'));
    if (admin) {
      if (window.isFeatureEnabled?.('aprobacion_online')) icons.push(iconButton('material', 'fa-boxes-stacked', 'Material'));
      icons.push(iconButton('edit', 'fa-pen', 'Editar'));
      icons.push(iconButton('delete', 'fa-trash', 'Eliminar', 'btn-danger'));
    }
    window.openModal(title, `
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:10px;font-size:13px">
        <span><strong>${esc(record.clienteNombre)}</strong></span>
        <span style="color:var(--text-muted)">${esc(window.formatDate(record.fecha))}</span>
        ${record.firmaCliente ? '<span class="badge badge-green">Firmado</span>' : '<span class="badge badge-orange">Pendiente de firma</span>'}
      </div>
      ${images.length ? `<div id="albaranThumbs" style="display:flex;gap:10px;overflow-x:auto;padding:4px 0;cursor:zoom-in">
        ${images.map((src, index) => `<img src="${src}" alt="Página ${index + 1} del albarán" style="height:300px;width:auto;border:1px solid var(--border);border-radius:6px;background:#fff;flex:0 0 auto">`).join('')}
      </div>
      <p style="margin:8px 0;color:var(--text-muted);font-size:12px"><i class="fas fa-search-plus"></i> Toca el documento para verlo en grande.</p>`
      : '<div class="help-notice">No se pudo mostrar la vista previa en pantalla. Usa «Compartir» para abrir el PDF.</div>'}
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:12px">${icons.join('')}</div>`,
      '<button class="btn btn-primary" id="closeAlbaranPreview">Cerrar</button>');
    document.getElementById('albaranThumbs')?.addEventListener('click', () => openLargeViewer(images, title));
    document.getElementById('closeAlbaranPreview').addEventListener('click', () => window.closeModal());
    document.querySelectorAll('[data-albaran-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.albaranAction;
      if (action === 'view') {
        if (images.length) openLargeViewer(images, title);
        else window.showToast('No hay vista previa disponible.', 'error');
      } else if (action === 'share') runAction('compartir el PDF', () => window.shareAlbaran(id));
      else if (action === 'sign') { window.closeModal(); runAction('guardar la firma', () => window.signAlbaran(id)); }
      else if (action === 'material') { window.closeModal(); runAction('abrir el material', () => window.abrirMaterialAlbaran(record)); }
      else if (action === 'edit') { window.closeModal(); runAction('abrir el albarán', () => window.showAlbaranForm(id)); }
      else if (action === 'delete') { window.closeModal(); runAction('eliminar el albarán', () => window.deleteAlbaran(id)); }
    }));
  };

  window.shareAlbaran = async function (id) {
    try {
      const record = await getAlbaran(id);
      if (!record) throw new Error('No tienes acceso a este albarán o ya no existe.');
      const file = await createAlbaranFile(record);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: formatNumber(record), text: 'Albarán de ' + record.clienteNombre });
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      window.showToast('PDF descargado. Ya puedes compartirlo por WhatsApp o correo.');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[Albaranes] No se pudo generar/compartir el PDF:', error);
      window.showToast('No se pudo generar o compartir el albarán: ' + error.message, 'error');
    }
  };

  window.signAlbaran = async function (id) {
    if (!window.isTechnician?.()) return;
    const result = await window.abrirPadFirma('Firma del cliente');
    if (!result) return;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 240;
    window.firmaVolcarEnLienzo(canvas, result.strokes, result.width);
    const signature = canvas.toDataURL('image/png');
    const { error } = await window.supabaseDB.rpc('sign_albaran', { p_id: id, p_signature: signature });
    if (error) {
      window.showToast('No se pudo guardar la firma: ' + error.message, 'error');
      return;
    }
    window.showToast('Firma guardada. Puedes generar y compartir el PDF.');
    await window.render_albaranes(document.getElementById('mainContent'));
  };
})();
