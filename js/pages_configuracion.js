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
          '<p>Versión, novedades e historial de cambios</p>'+
        '</div>'+
        '<div class="config-menu-arrow"><i class="fas fa-chevron-right"></i></div>'+
      '</div>'+
      '<div class="config-menu-item" draggable="true" onclick="openConfigAyuda()">'+
        '<div class="config-menu-icon"><i class="fas fa-circle-question"></i></div>'+
        '<div class="config-menu-content">'+
          '<h3>Ayuda</h3>'+
          '<p>Guía de uso: botones, flujos y cómo se conecta todo</p>'+
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

window.APP_VERSION = 'v1.7';

window.openConfigInfo = function(){
  const versiones = [
    { v: 'v1.7', fecha: '2026-11-04', items: [
      'Icono de geolocalización en el formulario de parte: los clientes sin coordenadas muestran un aviso 📍 que abre su ficha para geolocalizarlos y vuelve al parte sin perder datos',
      'Al resolver una incidencia se ofrece crear el parte de trabajo vinculado (nota de cierre incluida); partes e incidencias quedan enlazados en ambas fichas',
      'Presupuestos: columna REF por línea (autocompletable desde almacén), plazo de entrega y observaciones visibles, reflejados también en el PDF',
      'Corregido: botón «Tomar medidas» daba página no encontrada; corregido error de módulo de fotos al guardar partes'
    ]},
    { v: 'v1.6', fecha: '2026-11-03', items: [
      'Código reorganizado en módulos por pantalla (carga más rápida y más fácil de mantener)',
      'Un único catálogo de tipos de puerta para toda la aplicación',
      'Hojas de medidas rediseñadas (móvil primero): esquema con zoom, casillas medidas sobre el dibujo y envío offline'
    ]},
    { v: 'v1.5', fecha: '2026-10-28', items: [
      'Exportación a Sage 50 (contabilidad) desde Presupuestos y Partes',
      'Aprobación online de presupuestos por el cliente con enlace personalizado'
    ]},
    { v: 'v1.4', fecha: '2026-10-15', items: [
      'Mapa de flota con posiciones de vehículos',
      'Notificaciones push para incidencias y partes asignados'
    ]},
    { v: 'v1.0–v1.3', fecha: '2026-09-30', items: [
      'Lanzamiento: clientes, ubicaciones y puertas, partes de trabajo, presupuestos con hoja de medidas, almacén, albaranes, revisiones programadas por cadenas/rutas, incidencias, vehículos e informes de KMs',
      'Instalable como app (PWA), funciona sin cobertura y exporta PDF'
    ]}
  ];
  openModal('ℹ️ Información de la aplicación', `
    <p><strong>Valgom · Autopuertas</strong> <span class="badge badge-blue">${window.APP_VERSION}</span></p>
    <p style="color:var(--text-muted);margin-top:4px">PWA · Supabase · IndexedDB · Funciona offline · Exporta PDF · Firmas y sello digital</p>
    <h4 style="margin:16px 0 8px">Historial de versiones</h4>
    <div style="display:flex;flex-direction:column;gap:10px;max-height:50vh;overflow:auto">${
      versiones.map(ver => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
          <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
            <strong>${ver.v}</strong><small style="color:var(--text-muted)">${ver.fecha}</small>
          </div>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.55">${ver.items.map(i=>'<li>'+i+'</li>').join('')}</ul>
        </div>`).join('')
    }</div>
    <p style="margin-top:10px;font-size:12px;color:var(--text-muted)">Cada vez que se actualice la aplicación, la nueva versión aparecerá aquí con lo incorporado.</p>`,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
};

// ── Ayuda: guía de uso con todos los botones y flujos por sección ──
window.openConfigAyuda = function(){
  const secciones = [
    {
      icon: 'fa-user-group', titulo: 'Clientes',
      intro: 'Punto de partida de casi todo: cada trabajo se hace a un cliente, y sus ubicaciones y puertas alimentan partes, revisiones y presupuestos.',
      botones: [
        ['Nuevo Cliente', 'Abre el formulario de alta: nombre, DNI/CIF, contacto, teléfono, email, dirección y nota. En «Dirección» tienes dos botones: el localizador (busca las coordenadas escribiendo la dirección) y el GPS (usa tu posición actual si estás en el sitio). Guardar las coordenadas permite que los partes calculen los kilómetros solos.'],
        ['Importar Excel/CSV', 'Carga masiva de clientes desde un fichero. Útil al empezar a usar la aplicación o para migrar de otro sistema.'],
        ['Importar datos', 'Importación de datos desde imagen (OCR).'],
        ['Duplicados', 'Busca clientes repetidos comparando DNI y nombre (ignora mayúsculas, tildes y sufijos S.L./S.A.) y permite fusionarlos en uno solo conservando todos los datos.'],
        ['Buscar / filtros', 'La barra de búsqueda filtra por cualquier texto; los desplegables por tipo (empresa/particular) y provincia.'],
        ['Editar ficha / Ubicaciones / Puertas / Histórico / PDF / Eliminar', 'Al pulsar un cliente se abre su ficha con todas sus acciones: editar datos, gestionar ubicaciones (tiendas del cliente, con su propia dirección y coordenadas), gestionar puertas instaladas (que luego aparecerán en partes y revisiones), ver el histórico de revisiones, generar un PDF de la ficha o eliminarlo (con confirmación).']
      ]
    },
    {
      icon: 'fa-bullhorn', titulo: 'Incidencias',
      intro: 'Avisos de clientes (averías, golpes, atascos…). El administrador los registra y los asigna a un técnico; el técnico los resuelve y puede generar el parte vinculado.',
      botones: [
        ['Nueva incidencia', 'Formulario con cliente (registrado o no), teléfono, dirección, descripción, fotos (hasta 5), prioridad (normal/urgente) y asignación a un técnico. Al guardar, el técnico recibe una notificación push.'],
        ['Ficha de la incidencia', 'Pulsando una fila: datos completos, fotos, nota del técnico y, si ya está resuelta con parte, un enlace directo al parte de trabajo.'],
        ['Aceptar / Voy de camino / Marcar como resuelta', 'Flujo del técnico por estados. Al pulsar «Marcar como resuelta» aparece un modal para escribir la nota de cierre (qué se hizo) y elegir: «Guardar y crear parte» (abre el formulario de parte precargado con cliente, descripción y nota, y queda vinculado a la incidencia) o «Solo cerrar» (queda resuelta sin parte).'],
        ['Crear parte', 'Botón manual en cada tarjeta: abre el parte precargado con los datos de la incidencia y lo vincula. Útil si quieres registrar el trabajo sin cerrar aún la incidencia.'],
        ['Editar / Eliminar', 'Solo administración. Al editar puedes cambiar el estado; si lo pones en «Resuelta» se ofrece el mismo modal de cierre con parte.']
      ]
    },
    {
      icon: 'fa-clipboard-list', titulo: 'Partes de trabajo',
      intro: 'El registro diario del trabajo: horas, kilómetros, material, firmas. Alimenta informes, contabilidad y el PDF que recibe el cliente.',
      botones: [
        ['Nuevo Parte', 'Formulario completo. Tipo de parte: normal (con cliente) o desplazamiento interno (taller, recogidas, formación — cuenta KMs del vehículo pero no se asigna a cliente). Campos: cliente (con icono 📍 de aviso si no tiene coordenadas, que abre su ficha para geolocalizarlo y vuelve sin perder datos), tipo de puerta, técnico, ubicación y puertas a revisar, descripción, vehículo y matrícula, KMs (automáticos si el cliente está geolocalizado), horas, material utilizado (del almacén), fotos, firmas del técnico y del cliente (con sello opcional). Al guardar se envía por email al cliente si tiene dirección.'],
        ['Ficha del parte', 'Pulsando una fila: todas las secciones organizadas (identificación, desplazamiento, trabajo, material, fotos, firmas). Si nació de una incidencia muestra su origen.'],
        ['Editar / Eliminar', 'Edición completa del parte o borrado con confirmación (recalcula los KMs del vehículo).'],
        ['Exportar a Sage (admin)', 'Genera un CSV con horas, KMs y material de los partes filtrados para importar en contabilidad.']
      ]
    },
    {
      icon: 'fa-file-invoice-dollar', titulo: 'Presupuestos',
      intro: 'Presupuestos con conceptos del almacén, hoja de medidas del técnico y envío al cliente, incluso para aceptación online.',
      botones: [
        ['Nuevo Presupuesto', 'Cliente, fecha, validez, plazo de entrega y estado. Vinculable a un parte del mismo día. Incluye hoja de medidas: eliges tipo de puerta y se abre la hoja sobre el esquema; queda adjunta al guardar. Conceptos: tipo, descripción (del almacén, con precio y referencia autocompletados), cantidad y precio; subtotal, IVA 21% y total automáticos. Notas/observaciones visibles que salen en el PDF.'],
        ['Plantillas (icono marcador)', 'Guarda un presupuesto como plantilla reutilizable o usa una existente.'],
        ['Importar foto (OCR)', 'Fotografía un presupuesto en papel y la app intenta leer cliente, fecha y líneas.'],
        ['Ficha del presupuesto', 'Resumen con conceptos (con REF), totales, hoja de medidas y acciones: editar, enviar, PDF, aprobación online, duplicar, guardar como plantilla, eliminar.'],
        ['Enviar', 'Prepara el envío al cliente (email/WhatsApp según configuración).'],
        ['Aprobación online', 'Genera un enlace personal para que el cliente acepte o rechace desde su móvil, con caducidad configurable y aviso al admin cuando decida.'],
        ['Exportar a Sage (admin)', 'CSV solo con presupuestos aprobados, línea a línea.']
      ]
    },
    {
      icon: 'fa-ruler-combined', titulo: 'Tomar medidas',
      intro: 'La hoja de medidas del técnico, pensada para el móvil: se rellena sobre el dibujo de la puerta y llega a administración al momento.',
      botones: [
        ['Nueva medición', 'Elige cliente y tipo de puerta. Se muestra el esquema con las casillas de cada medida: al tocar una medida se hace zoom a su casilla, escribes el valor y aparece en el dibujo en todas las posiciones donde se repite. Navegación con Anterior/Siguiente, la tira inferior o tocando la medida. Añade fotos si hace falta y guarda: queda registrada y puede adjuntarse a un presupuesto.'],
        ['Ver mediciones', 'Listado de mediciones registradas, con su fecha, cliente, tipo y técnico. Se pueden consultar o adjuntar a presupuestos.'],
        ['Funciona sin cobertura', 'Si guardas sin conexión, la medición queda en el móvil y se envía sola al recuperar señal.']
      ]
    },
    {
      icon: 'fa-boxes-stacked', titulo: 'Almacén',
      intro: 'Artículos con precio de compra y venta, stock y referencia. Alimenta presupuestos, partes y solicitudes de material.',
      botones: [
        ['Nuevo artículo', 'Nombre, referencia, tipo de puerta/servicio, precios y stock mínimo.'],
        ['Entrada/Salida de stock', 'Registra movimientos que ajustan el stock con historial.'],
        ['Solicitudes de material', 'El técnico pide material desde su móvil; el admin lo ve y lo convierte en entregado.'],
        ['Exportar a Sage (admin)', 'CSV de artículos con sus datos para contabilidad.']
      ]
    },
    {
      icon: 'fa-van-shuttle', titulo: 'Vehículos e informes KMs',
      intro: 'Flota y control de kilómetros derivados de los partes.',
      botones: [
        ['Nuevo vehículo', 'Matrícula, marca/modelo y kilómetros iniciales.'],
        ['Mapa de flota', 'Posición de los vehículos (si llevan geolocalización).'],
        ['Informes KMs', 'Informe por vehículo y periodo derivado de los partes; exporta CSV. Los KMs se recalculan solos al guardar cada parte.']
      ]
    },
    {
      icon: 'fa-calendar-check', titulo: 'Revisiones programadas',
      intro: 'Mantenimiento periódico de puertas por cadenas de clientes y rutas.',
      botones: [
        ['Cadenas y rutas', 'Estructura de clientes en cadena con rutas y orden de visita; cada puerta tiene su frecuencia de revisión (meses) según su tipo.'],
        ['Registrar revisión', 'Desde la ruta o el cliente: formulario con checklist por tipo de puerta, resultado, fotos y firmas. Genera el PDF de la revisión.'],
        ['Optimizar ruta', 'Reordena las tiendas de la ruta por proximidad.'],
        ['Informe de revisiones', 'PDF del mantenimiento realizado por ruta o cliente.']
      ]
    },
    {
      icon: 'fa-user-gear', titulo: 'Configuración',
      intro: 'Solo administración: datos de empresa, apariencia, correo, sincronización, importación/exportación e información.',
      botones: [
        ['Datos de empresa', 'Nombre fiscal, CIF, dirección, contacto y logo (aparece en todos los PDF).'],
        ['Apariencia', 'Color principal de la app y color de letra de los botones; modo claro/oscuro.'],
        ['Correo (SMTP)', 'Cuenta de correo para el envío automático de partes y presupuestos; botón de prueba de conexión.'],
        ['Factor carretera', 'Factor que convierte distancia recta en KMs reales de carretera para el cálculo de desplazamientos.'],
        ['Exportar/Importar/Clear', 'Copia de seguridad completa en JSON, restauración y borrado total (con doble confirmación).'],
        ['Plantillas de medidas', 'Las mismas plantillas de presupuestos, con acceso rápido a tomar medidas y ver mediciones.'],
        ['Información / Ayuda', 'Versión e historial de cambios, y esta guía de uso.']
      ]
    }
  ];
  openModal('❓ Ayuda · Guía de la aplicación', `
    <p style="color:var(--text-muted);margin-bottom:12px">Qué hace cada botón, cómo se relacionan las ventanas y el flujo recomendado para cada tarea.</p>
    <div style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow:auto">${
      secciones.map(s => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
          <h4 style="margin:0 0 4px"><i class="fas ${s.icon}" style="color:var(--primary)"></i> ${s.titulo}</h4>
          <p style="margin:4px 0 8px;font-size:13px;color:var(--text-muted)">${s.intro}</p>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.5">${
            s.botones.map(([b, d]) => `<div><strong style="color:var(--primary)">${b}:</strong> ${d}</div>`).join('')
          }</div>
        </div>`).join('')
    }</div>
    <p style="margin-top:10px;font-size:12px;color:var(--text-muted)">Consejo general: los datos fluyen Cliente → Parte → Informes/Contabilidad; el presupuesto y las mediciones salen de la hoja de medidas del técnico.</p>`,
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
