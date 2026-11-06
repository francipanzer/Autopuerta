// Aprobación online de presupuestos + panel de material y pedidos.
// Todo queda oculto mientras el interruptor de Configuración esté apagado.
(function () {
  const FEATURE = 'aprobacion_online';
  const TTL_MS = 60000;
  const DEFAULT_CONFIG = { expiry_days: 30, reminder_days: 0, max_reminders: 3, firma_obligatoria: true };
  let features = {};
  let configs = {};
  let loadedAt = 0;

  const esc = value => window.escapeHtml(value ?? '');
  const norm = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const clampInt = (value, min, max, fallback) => {
    const number = parseInt(value, 10);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };

  window.loadFeatures = async function (force) {
    if (!force && Date.now() - loadedAt < TTL_MS) return features;
    try {
      const { data, error } = await window.supabaseDB.from('app_features').select('key,enabled,config');
      if (error) throw error;
      features = Object.fromEntries((data || []).map(row => [row.key, !!row.enabled]));
      configs = Object.fromEntries((data || []).map(row => [row.key, { ...DEFAULT_CONFIG, ...(row.config || {}) }]));
    } catch (error) {
      console.warn('[Funciones] No se pudo leer app_features:', error.message);
      features = {};
      configs = {};
    }
    loadedAt = Date.now();
    return features;
  };

  window.isFeatureEnabled = key => !!features[key];
  const getConfig = () => configs[FEATURE] || { ...DEFAULT_CONFIG };

  window.openConfigAprobacionOnline = async function () {
    if (!window.isAdmin?.()) return window.showToast('Solo administración puede cambiar esta opción.', 'error');
    await window.loadFeatures(true);
    const enabled = window.isFeatureEnabled(FEATURE);
    const config = getConfig();
    const remindersOn = Number(config.reminder_days) > 0;
    window.openModal('Aprobación online de presupuestos', `
      <p style="margin-bottom:12px;color:var(--text-muted)">Permite enviar al cliente un enlace para que acepte o rechace el presupuesto desde su móvil u ordenador.
      Al aceptar, el programa genera el albarán, te avisa y muestra el material necesario con la opción de pedirlo.</p>
      <label style="display:flex;gap:10px;align-items:center;font-weight:700;margin-bottom:14px">
        <input type="checkbox" id="featureAprobacion" ${enabled ? 'checked' : ''} style="width:22px;height:22px">
        Activar aprobación online
      </label>
      <div class="form-grid">
        <div class="form-group"><label for="cfgExpiry">El enlace caduca a los (días)</label>
          <input id="cfgExpiry" type="number" min="1" max="365" value="${esc(config.expiry_days)}"></div>
        <div class="form-group"><label style="display:flex;gap:8px;align-items:center;margin-top:24px">
          <input type="checkbox" id="cfgFirma" ${config.firma_obligatoria !== false ? 'checked' : ''} style="width:20px;height:20px">
          Firma obligatoria para aceptar</label></div>
        <div class="form-group full"><label style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="cfgRemind" ${remindersOn ? 'checked' : ''} style="width:20px;height:20px">
          Enviar recordatorios automáticos si el cliente no responde</label></div>
        <div class="form-group"><label for="cfgRemindDays">Cada (días)</label>
          <input id="cfgRemindDays" type="number" min="1" max="60" value="${esc(remindersOn ? config.reminder_days : 3)}" ${remindersOn ? '' : 'disabled'}></div>
        <div class="form-group"><label for="cfgRemindMax">Máximo de recordatorios</label>
          <input id="cfgRemindMax" type="number" min="1" max="10" value="${esc(config.max_reminders)}" ${remindersOn ? '' : 'disabled'}></div>
      </div>
      <p style="margin-top:10px;color:var(--text-muted);font-size:12px">Los recordatorios se envían por email al cliente si hay correo guardado en el envío y Resend está configurado.
      Si el cliente solo tiene WhatsApp, recibirás un aviso para reenviar el enlace tú mismo. Se pueden desactivar por envío.</p>
      <p style="margin-top:6px;color:var(--text-muted);font-size:12px">Con la opción desactivada el programa funciona igual que antes y los enlaces ya enviados dejan de funcionar.</p>`,
      `<button class="btn btn-primary" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="saveFeatureAprobacion"><i class="fas fa-save"></i> Guardar</button>`);
    const remind = document.getElementById('cfgRemind');
    remind.addEventListener('change', () => {
      document.getElementById('cfgRemindDays').disabled = !remind.checked;
      document.getElementById('cfgRemindMax').disabled = !remind.checked;
    });
    document.getElementById('saveFeatureAprobacion').addEventListener('click', async () => {
      const value = document.getElementById('featureAprobacion').checked;
      const nextConfig = {
        expiry_days: clampInt(document.getElementById('cfgExpiry').value, 1, 365, 30),
        reminder_days: remind.checked ? clampInt(document.getElementById('cfgRemindDays').value, 1, 60, 3) : 0,
        max_reminders: clampInt(document.getElementById('cfgRemindMax').value, 1, 10, 3),
        firma_obligatoria: document.getElementById('cfgFirma').checked
      };
      const { error } = await window.supabaseDB.from('app_features').upsert({
        key: FEATURE,
        enabled: value,
        config: nextConfig,
        updated_at: new Date().toISOString(),
        updated_by: window.authState?.user?.id || null
      });
      if (error) {
        window.showToast('No se pudo guardar. ¿Has ejecutado SUPABASE_APROBACION_ONLINE.sql? ' + error.message, 'error');
        return;
      }
      await window.loadFeatures(true);
      window.closeModal();
      window.showToast(value ? 'Configuración guardada. Aprobación online activada.' : 'Configuración guardada. Aprobación online desactivada.');
    });
  };

  window.aprobacionOnlineBoton = function (presupuesto) {
    if (!window.isAdmin?.() || !window.isFeatureEnabled(FEATURE)) return '';
    if (!['borrador', 'enviado'].includes(presupuesto.estado)) return '';
    return '<button class="btn btn-success btn-sm" onclick="enviarAprobacionOnline(\'' + esc(presupuesto.id) + '\')"><i class="fas fa-link"></i> Aprobación online</button>';
  };

  function whatsappPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '').replace(/^00/, '');
    if (digits.length === 9) digits = '34' + digits;
    return digits.length >= 10 && digits.length <= 15 ? digits : '';
  }

  // Paso 1: elegir canal(es), teléfono/email y recordatorios. Paso 2: enviar con un toque por canal.
  window.enviarAprobacionOnline = async function (id) {
    try {
      await window.loadFeatures(true);
      if (!window.isFeatureEnabled(FEATURE)) return window.showToast('La aprobación online está desactivada.', 'error');
      const presupuesto = await window.db.dbGet('presupuestos', id);
      if (!presupuesto) return window.showToast('Presupuesto no encontrado.', 'error');
      const cliente = presupuesto.clienteId ? await window.db.dbGet('clientes', presupuesto.clienteId) : null;
      const config = getConfig();
      const remindersAvailable = Number(config.reminder_days) > 0;
      window.openModal('Aprobación online · ' + presupuesto.id, `
        <p style="margin-bottom:10px;color:var(--text-muted)">Se generará un enlace personal para ${esc(presupuesto.clienteNombre || 'el cliente')} (caduca en ${esc(config.expiry_days)} días).</p>
        <div class="form-grid">
          <div class="form-group full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="aprobChWa" checked style="width:20px;height:20px"> Enviar por WhatsApp</label></div>
          <div class="form-group full"><label for="aprobTel">Teléfono WhatsApp</label>
            <input id="aprobTel" type="tel" inputmode="tel" maxlength="40" value="${esc(cliente?.telefono || '')}" placeholder="Ej. 600123456 (si no es el de la ficha, cámbialo)"></div>
          <div class="form-group full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="aprobChMail" ${cliente?.email ? 'checked' : ''} style="width:20px;height:20px"> Enviar por email</label></div>
          <div class="form-group full"><label for="aprobMail">Email</label>
            <input id="aprobMail" type="email" maxlength="160" value="${esc(cliente?.email || '')}" placeholder="cliente@correo.com"></div>
          <div class="form-group full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="aprobRemind" ${remindersAvailable ? 'checked' : ''} ${remindersAvailable ? '' : 'disabled'} style="width:20px;height:20px">
            Recordatorios automáticos${remindersAvailable ? ' cada ' + esc(config.reminder_days) + ' días (máx. ' + esc(config.max_reminders) + ')' : ' (desactivados en Configuración)'}</label></div>
        </div>
        <div class="error" id="aprobError" style="color:var(--danger);font-size:13px" hidden></div>`,
        `<button class="btn btn-primary" id="aprobCancelar">Cancelar</button>
         <button class="btn btn-success" id="aprobGenerar"><i class="fas fa-link"></i> Generar enlace</button>`);
      document.getElementById('aprobCancelar').addEventListener('click', () => window.closeModal());
      document.getElementById('aprobGenerar').addEventListener('click', async event => {
        const button = event.currentTarget;
        const errorBox = document.getElementById('aprobError');
        const useWa = document.getElementById('aprobChWa').checked;
        const useMail = document.getElementById('aprobChMail').checked;
        const phone = whatsappPhone(document.getElementById('aprobTel').value);
        const email = document.getElementById('aprobMail').value.trim();
        const fail = text => { errorBox.textContent = text; errorBox.hidden = false; };
        if (!useWa && !useMail) return fail('Elige al menos un canal: WhatsApp o email.');
        if (useWa && !phone) return fail('Introduce un teléfono válido para WhatsApp.');
        if (useMail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Introduce un email válido.');
        button.disabled = true;
        try {
          const baseUrl = new URL('aprobar.html', location.href).href.split('#')[0];
          const { data: token, error } = await window.supabaseDB.rpc('crear_enlace_aprobacion', {
            p_presupuesto: String(id),
            p_base_url: baseUrl,
            p_email: useMail ? email : null,
            p_telefono: useWa ? phone : null,
            p_canal: [useWa ? 'whatsapp' : '', useMail ? 'email' : ''].filter(Boolean).join('+'),
            p_recordatorios: remindersAvailable && document.getElementById('aprobRemind').checked
          });
          if (error) throw error;
          mostrarEnvio(presupuesto, baseUrl + '#' + token, { useWa, useMail, phone, email });
          if (typeof window.renderPresupuestos === 'function') window.renderPresupuestos();
        } catch (error) {
          console.error('[Aprobación online]', error);
          button.disabled = false;
          fail('No se pudo generar el enlace: ' + error.message);
        }
      });
    } catch (error) {
      console.error('[Aprobación online]', error);
      window.showToast('No se pudo preparar el envío: ' + error.message, 'error');
    }
  };

  function mostrarEnvio(presupuesto, url, channels) {
    const message = 'Hola' + (presupuesto.clienteNombre ? ' ' + presupuesto.clienteNombre : '') +
      ', te enviamos el presupuesto ' + presupuesto.id + ' por un total de ' + window.formatCurrency(presupuesto.total) +
      '. Puedes revisarlo y aprobarlo (con tu firma) desde aquí: ' + url;
    const buttons = [];
    if (channels.useWa) buttons.push('<button class="btn btn-success" id="aprobWhatsapp"><i class="fab fa-whatsapp"></i> Enviar por WhatsApp</button>');
    if (channels.useMail) buttons.push('<button class="btn btn-success" id="aprobEmail"><i class="fas fa-envelope"></i> Enviar por email</button>');
    window.openModal('Enlace listo · ' + presupuesto.id, `
      <p style="margin-bottom:10px;color:var(--text-muted)">Pulsa cada canal para enviar el mensaje. El enlace ya está activo.</p>
      <textarea id="aprobacionMensaje" rows="5" style="width:100%" readonly>${esc(message)}</textarea>`,
      `<button class="btn btn-primary" id="aprobCerrar">Cerrar</button>
       <button class="btn btn-primary" id="aprobCopiar"><i class="fas fa-copy"></i> Copiar</button>
       ${buttons.join('')}`);
    document.getElementById('aprobCerrar').addEventListener('click', () => window.closeModal());
    document.getElementById('aprobCopiar').addEventListener('click', async () => {
      await navigator.clipboard?.writeText(message);
      window.showToast('Mensaje copiado.');
    });
    document.getElementById('aprobWhatsapp')?.addEventListener('click', () => {
      window.open('https://wa.me/' + channels.phone + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
    });
    document.getElementById('aprobEmail')?.addEventListener('click', () => {
      location.href = 'mailto:' + encodeURIComponent(channels.email) + '?subject=' + encodeURIComponent('Presupuesto ' + presupuesto.id) + '&body=' + encodeURIComponent(message);
    });
  }

  // ── Material necesario de un albarán y pedido ──
  function matchStock(line, stockItems) {
    const code = norm(line.codigo);
    const description = norm(line.descripcion);
    return stockItems.find(item => code && (norm(item.id) === code || norm(item.referencia) === code))
      || stockItems.find(item => description && norm(item.nombre) === description)
      || null;
  }

  async function shareText(text, title) {
    if (navigator.share) {
      try { await navigator.share({ title, text }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    await navigator.clipboard?.writeText(text);
    window.showToast('Texto copiado al portapapeles.');
  }

  window.abrirMaterialAlbaran = async function (record) {
    const stockItems = await window.db.dbGetAll('almacen').catch(() => []);
    const rows = (record.lineas || []).filter(line => line.descripcion).map(line => {
      const item = matchStock(line, stockItems);
      const needed = Number(line.cantidad) || 0;
      const stock = item ? Number(item.stock) || 0 : 0;
      return { line, item, needed, stock, missing: Math.max(0, needed - stock) };
    });
    const missing = rows.filter(row => row.missing > 0);
    const table = rows.map(row => `<tr${row.missing > 0 ? ' style="background:rgba(239,68,68,.08)"' : ''}>
      <td>${esc(row.line.descripcion)}${row.item ? '' : '<br><small style="color:var(--text-muted)">No está en el almacén</small>'}</td>
      <td style="text-align:right">${row.needed} ${esc(row.line.unidad || '')}</td>
      <td style="text-align:right">${row.item ? row.stock : '—'}</td>
      <td style="text-align:right"><strong style="color:${row.missing > 0 ? 'var(--danger)' : 'var(--success)'}">${row.missing > 0 ? row.missing : 'OK'}</strong></td></tr>`).join('');
    window.openModal('Material · ' + (record.clienteNombre || ''), `
      <div class="table-wrapper"><table>
        <thead><tr><th>Material</th><th style="text-align:right">Necesario</th><th style="text-align:right">Almacén</th><th style="text-align:right">Falta</th></tr></thead>
        <tbody>${table || '<tr><td colspan="4" style="text-align:center">Sin material.</td></tr>'}</tbody>
      </table></div>
      <p style="margin-top:10px;color:var(--text-muted);font-size:13px">${missing.length ? missing.length + ' concepto(s) con material pendiente de pedir.' : 'Hay stock suficiente para todo el albarán.'}</p>`,
      `<button class="btn btn-primary" id="materialCerrar">Cerrar</button>
       ${missing.length ? '<button class="btn btn-success" id="materialPedir"><i class="fas fa-cart-shopping"></i> Pedir material</button>' : ''}`);
    document.getElementById('materialCerrar').addEventListener('click', () => window.closeModal());
    document.getElementById('materialPedir')?.addEventListener('click', () => abrirPedido(record, missing));
  };

  function abrirPedido(record, missing) {
    const groups = {};
    missing.forEach(row => {
      const provider = (row.item?.proveedor || '').trim() || 'Sin proveedor';
      (groups[provider] = groups[provider] || []).push(row);
    });
    const blocks = Object.entries(groups).map(([provider, items], index) => {
      const text = 'Hola, necesitamos el siguiente material (ref. ' + (record.presupuestoId || record.clienteNombre) + '):\n' +
        items.map(row => '- ' + row.missing + ' ' + (row.line.unidad || 'ud') + ' · ' + row.line.descripcion + (row.line.codigo ? ' (' + row.line.codigo + ')' : '')).join('\n') +
        '\n\nGracias.';
      return `<div class="card" style="padding:12px;margin-bottom:10px">
        <strong>${esc(provider)}</strong>
        <textarea id="pedido-${index}" rows="${Math.min(10, items.length + 4)}" style="width:100%;margin-top:6px">${esc(text)}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-pedido-copy="${index}"><i class="fas fa-copy"></i> Copiar</button>
          <button class="btn btn-success btn-sm" data-pedido-send="${index}"><i class="fas fa-paper-plane"></i> Enviar pedido</button>
        </div></div>`;
    });
    window.openModal('Pedir material', blocks.join(''), '<button class="btn btn-primary" id="pedidoCerrar">Cerrar</button>');
    document.getElementById('pedidoCerrar').addEventListener('click', () => window.closeModal());
    document.querySelectorAll('[data-pedido-copy]').forEach(button => button.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(document.getElementById('pedido-' + button.dataset.pedidoCopy).value);
      window.showToast('Pedido copiado.');
    }));
    document.querySelectorAll('[data-pedido-send]').forEach(button => button.addEventListener('click', () =>
      shareText(document.getElementById('pedido-' + button.dataset.pedidoSend).value, 'Pedido de material')));
  }
})();
