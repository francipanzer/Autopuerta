(function () {
  const app = document.getElementById('app');
  const token = decodeURIComponent((location.hash || '').replace(/^#/, '') || new URLSearchParams(location.search).get('t') || '').trim();
  const client = window.supabase.createClient(window.SUPABASE_PUBLIC.url, window.SUPABASE_PUBLIC.anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

  function message(icon, title, text) {
    app.innerHTML = `<div class="card msg"><div class="icon">${icon}</div><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p></div>`;
  }

  function setupSignature(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    const state = { drawing: false, dirty: false, length: 0, last: { x: 0, y: 0 } };
    const point = event => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    canvas.addEventListener('pointerdown', event => {
      state.drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.1, p.y + 0.1);
      ctx.stroke();
      state.last = p;
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      if (!state.drawing) return;
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      state.length += Math.hypot(p.x - state.last.x, p.y - state.last.y);
      state.last = p;
      if (state.length >= 40) state.dirty = true;
    });
    const stop = () => { state.drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    return {
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); state.dirty = false; state.length = 0; },
      dataUrl() { return state.dirty ? canvas.toDataURL('image/png') : null; }
    };
  }

  function render(data) {
    const empresa = data.empresa || {};
    const signatureRequired = data.firma_obligatoria !== false;
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches;
    const rows = (data.lineas || []).map(line => {
      const quantity = Number(line.cantidad) || 0;
      const price = Number(line.precio) || 0;
      return `<tr><td>${esc(line.descripcion)}</td><td class="n">${quantity}</td><td class="n">${money(price)}</td><td class="n"><strong>${money(quantity * price)}</strong></td></tr>`;
    }).join('');
    app.innerHTML = `
      <div class="card">
        <h1>${esc(empresa.nombre || 'Valgom')}</h1>
        <div class="muted">Presupuesto ${esc(data.id)} · ${esc(data.fecha || '')}${data.validohasta ? ' · válido hasta ' + esc(data.validohasta) : ''}</div>
        <p style="margin:10px 0 0">Cliente: <strong>${esc(data.cliente || '')}</strong></p>
      </div>
      <div class="card">
        <h2>Conceptos</h2>
        <div style="overflow-x:auto"><table>
          <thead><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Subtotal</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">Sin conceptos</td></tr>'}</tbody>
        </table></div>
        <div class="totals">
          <div class="muted">Subtotal ${money(data.subtotal)}</div>
          <div class="muted">IVA ${money(data.iva)}</div>
          <div><strong>TOTAL ${money(data.total)}</strong></div>
        </div>
        ${data.notas ? `<p class="muted" style="margin-top:12px;white-space:pre-wrap">${esc(data.notas)}</p>` : ''}
      </div>
      <div class="card">
        <h2>Tu respuesta</h2>
        <label for="nombre">Nombre y apellidos *</label>
        <input id="nombre" type="text" maxlength="120" autocomplete="name">
        <label>${touch ? 'Firma con el dedo en el recuadro' : 'Firma con el ratón en el recuadro'}${signatureRequired ? ' *' : ' (opcional)'}</label>
        <canvas id="firma" aria-label="Recuadro de firma" style="height:${touch ? 200 : 150}px"></canvas>
        <div class="muted" style="margin-top:4px">${signatureRequired ? 'La firma es necesaria para aceptar el presupuesto.' : ''}</div>
        <button class="btn small" type="button" id="limpiar" style="margin-top:8px">Borrar firma</button>
        <label for="comentario">Comentario (opcional)</label>
        <textarea id="comentario" rows="2" maxlength="1000"></textarea>
        <div class="error" id="error" hidden></div>
        <div class="actions">
          <button class="btn" type="button" id="aceptar">Aceptar presupuesto</button>
          <button class="btn danger" type="button" id="rechazar">Rechazar</button>
        </div>
        ${empresa.telefono || empresa.email ? `<p class="muted" style="margin-top:14px">¿Dudas? ${esc(empresa.telefono || '')} ${esc(empresa.email || '')}</p>` : ''}
      </div>`;
    const signature = setupSignature(document.getElementById('firma'));
    document.getElementById('limpiar').addEventListener('click', () => signature.clear());
    const errorBox = document.getElementById('error');
    const buttons = [document.getElementById('aceptar'), document.getElementById('rechazar')];

    async function answer(decision) {
      const nombre = document.getElementById('nombre').value.trim();
      if (nombre.length < 2) {
        errorBox.textContent = 'Escribe tu nombre para continuar.';
        errorBox.hidden = false;
        return;
      }
      if (decision === 'aprobado' && signatureRequired && !signature.dataUrl()) {
        errorBox.textContent = 'Necesitamos tu firma para aceptar el presupuesto. Fírmala en el recuadro.';
        errorBox.hidden = false;
        return;
      }
      if (decision === 'rechazado' && !window.confirm('¿Seguro que quieres rechazar este presupuesto?')) return;
      errorBox.hidden = true;
      buttons.forEach(button => { button.disabled = true; });
      const { data: result, error } = await client.rpc('responder_presupuesto', {
        p_token: token,
        p_decision: decision,
        p_nombre: nombre,
        p_firma: signature.dataUrl(),
        p_comentario: document.getElementById('comentario').value.trim() || null
      });
      if (error || !result?.ok) {
        console.error('[Aprobación] Error:', error || result);
        errorBox.textContent = result?.error === 'firma_requerida'
          ? 'Necesitamos tu firma para aceptar el presupuesto.'
          : 'No se pudo registrar tu respuesta. Inténtalo de nuevo o contacta con nosotros.';
        errorBox.hidden = false;
        buttons.forEach(button => { button.disabled = false; });
        return;
      }
      if (decision === 'aprobado') message('✅', 'Presupuesto aceptado', 'Gracias. Nos pondremos en contacto contigo para planificar los trabajos.');
      else message('📝', 'Presupuesto rechazado', 'Hemos registrado tu respuesta. Gracias por avisarnos.');
    }
    document.getElementById('aceptar').addEventListener('click', () => answer('aprobado'));
    document.getElementById('rechazar').addEventListener('click', () => answer('rechazado'));
  }

  async function init() {
    if (!token) return message('⚠️', 'Enlace no válido', 'Falta el código del presupuesto en el enlace.');
    const { data, error } = await client.rpc('get_presupuesto_aprobacion', { p_token: token });
    if (error || !data) {
      console.error('[Aprobación] Error:', error);
      return message('⚠️', 'No se pudo cargar', 'Inténtalo de nuevo en unos minutos.');
    }
    if (data.status === 'pendiente') return render(data);
    if (data.status === 'respondido') {
      return message(data.decision === 'aprobado' ? '✅' : '📝', 'Este presupuesto ya fue respondido',
        data.decision === 'aprobado' ? 'Ya consta como aceptado. ¡Gracias!' : 'Ya consta como rechazado.');
    }
    if (data.status === 'caducado') return message('⌛', 'Enlace caducado', 'Solicita un nuevo enlace a la empresa.');
    if (data.status === 'desactivado') return message('⚠️', 'Servicio no disponible', 'Contacta con la empresa para aprobar el presupuesto.');
    return message('⚠️', 'Enlace no válido', 'Este enlace no existe o fue sustituido por otro más reciente.');
  }

  init();
})();
