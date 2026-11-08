// ── App Shell ──────────────────────────────────────────────
let currentPage = 'dashboard';
let lastNavArg = null;
let skipHistoryOnce = false;
window.currentPage = 'dashboard';

// Suscribirse a cambios de cualquier store
window.__onStoreChanged = (store, payload) => {
  console.log('[App] Store cambiado:', store);
  if (store === 'partesTrabajo' || store === 'solicitudesMaterial') window.refreshAdminNotifications?.();
  if (store === 'partesTrabajo' && window.isAdmin?.()) {
    clearTimeout(window.__kmsTimer);
    window.__kmsTimer = setTimeout(() => window.recalcAllFleetKms?.(true), 1500);
  }
  const me = window.authState;
  if (store === 'partesTrabajo' && payload?.eventType === 'INSERT' && window.isTechnician?.() && me?.employee &&
      String(payload.new?.empleadoid) === String(me.employee.id) && String(payload.new?.createdby) !== String(me.user?.id)) {
    window.showToast?.('Tienes un nuevo parte de trabajo asignado');
  }
  if (store === 'albaranes' && window.isTechnician?.() && me?.employee &&
      (payload?.eventType === 'INSERT' || (payload?.eventType === 'UPDATE' && payload.new?.estado === 'pendiente')) &&
      (payload.new?.tecnicoids || []).map(String).includes(String(me.employee.id))) {
    window.showToast?.('Tienes un nuevo albarán asignado');
  }
  if (store === 'incidencias') window.refreshIncidenciasBadge?.();
  const page = document.querySelector('.nav-item.active')?.dataset.page || currentPage || 'dashboard';
  const storeToPage = {
    'empleados': 'empleados',
    'clientes': 'clientes',
    'partesTrabajo': 'partesTrabajo',
    'albaranes': 'albaranes',
    'tableros': 'tableros',
    'tarjetasTablero': 'tableros',
    'incidencias': 'incidencias',
    'vehiculos': 'vehiculos',
    'presupuestos': 'presupuestos',
    'almacen': 'almacen',
    'articulos': 'almacen',
    'ubicaciones': 'clientes',
    'puertas': 'clientes',
    'rutas': 'revisionesCliente',
    'ubicaciones': 'clientes',
    'revisiones': 'revisionesCliente',
    'tiposPuerta': 'configuracion',
    'informes': 'informesKms',
    'jornadas': 'informesKms'
  };
  const alsoRefresh = {
    clientes: ['revisionesCliente'],
    ubicaciones: ['revisionesCliente'],
    rutas: ['revisionesCliente'],
    puertas: ['revisionesCliente'],
    revisiones: ['clientes']
  };

  const targetPage = storeToPage[store];
  const shouldRefresh = targetPage === page || (alsoRefresh[store] || []).includes(page);
  if (!shouldRefresh || !targetPage || typeof window['render_' + page] !== 'function') return;

  const target = document.getElementById('mainContent');
  if (target) window['render_' + page](target);
};

let appBooted = false;
let appShellInitialized = false;

async function bootAuthenticatedApp() {
  if (appBooted || !window.authState?.user) return;
  appBooted = true;
  if (window.isAdmin()) await window.seedIfEmpty();
  if (!appShellInitialized) {
    setupNavigation();
    setupMobileMenu();
    setupMenuFab();
    updateSyncStatus();
    initTheme();
    setupBackNavigation();
    appShellInitialized = true;
  }
  navigateTo('dashboard');
  checkVehiculoAlerts();     // ← ahora sí se ejecuta
}

// ── Registro del SW al cargar la página (independiente de la sesión) ────
// Debe instalarse YA para que el shell quede precacheado aunque el usuario
// aún no haya iniciado sesión (offline en la pantalla de login, PWA instalable).
registerServiceWorker();   // único punto de registro del SW

window.addEventListener('valgom:authenticated', () => {
  Promise.resolve(appBooted ? navigateTo('dashboard') : bootAuthenticatedApp()).catch(error => {
    appBooted = false;
    console.error('[App] No se pudo iniciar la aplicación:', error);
    showToast(`No se pudo iniciar la aplicación: ${error.message}`, 'error');
  });
});

window.addEventListener('valgom:logged-out', () => {
  appBooted = false;
  document.getElementById('mainContent').innerHTML = '';
});

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await window.appAuthReady;
  if (window.authState?.user) await bootAuthenticatedApp();
});

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
}

// ===== COLOR PRINCIPAL =====
// Valores por defecto (el admin los puede cambiar desde Configuración > Apariencia).
// Color de acento: 'verde' | 'naranja' | 'naranja-oscuro' | 'azul' | 'rojo' | 'violeta' | 'teal' | hex libre
const BRAND_COLOR = 'verde';
// Color de la LETRA de los botones: '' (por defecto del tema) o cualquier hex/nombre CSS.
const BUTTON_TEXT_COLOR = '';

const BRAND_COLORS = {
  'verde':          { primary:'#16a34a', dark:'#15803d', light:'#22c55e' },
  'naranja':        { primary:'#f97316', dark:'#ea580c', light:'#fb923c' },
  'naranja-oscuro': { primary:'#c2410c', dark:'#9a3412', light:'#ea580c' },
  'azul':           { primary:'#2563eb', dark:'#1d4ed8', light:'#3b82f6' },
  'rojo':           { primary:'#dc2626', dark:'#b91c1c', light:'#ef4444' },
  'violeta':        { primary:'#8b5cf6', dark:'#7c3aed', light:'#a78bfa' },
  'teal':           { primary:'#14b8a6', dark:'#0d9488', light:'#2dd4bf' }
};

// Oscurecer/aclarar un hex en porcentaje (-100..100)
function shadeHex(hex, pct) {
  try {
    let h = hex.replace('#','');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    if (h.length !== 6) return hex;
    const num = parseInt(h, 16);
    let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    const t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  } catch (_) { return hex; }
}

// Aplica el color de marca + color de letra de botones (usa localStorage si el admin lo configuró)
function applyBrandColor() {
  let colorName = BRAND_COLOR, textColor = BUTTON_TEXT_COLOR;
  try {
    const saved = JSON.parse(localStorage.getItem('ap_brand') || '{}');
    if (saved.primary) colorName = saved.primary;
    if (typeof saved.btnText === 'string') textColor = saved.btnText;
  } catch (_) {}

  const c = BRAND_COLORS[colorName] || {
    primary: colorName,
    dark: shadeHex(colorName, -18),
    light: shadeHex(colorName, 18)
  };
  const root = document.documentElement;
  root.style.setProperty('--primary', c.primary);
  root.style.setProperty('--primary-dark', c.dark);
  root.style.setProperty('--primary-light', c.light);

  // Color de letra de los botones (siempre genera la regla, para poder cambiarlo en vivo)
  let st = document.getElementById('brand-btn-text-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'brand-btn-text-style';
    document.head.appendChild(st);
  }
  st.textContent = textColor
    ? ('.btn,.btn-primary,.btn-secondary,.btn-success,.btn-outline,.btn-danger,.btn-sm,.btn-icon,.icon-btn{color:' + textColor + '!important}' +
       '.btn i,.btn svg,.icon-btn i,.icon-btn svg{color:' + textColor + '!important}')
    : '';
}

// Helpers públicos para el selector de Configuración
window.setBrandColor = function(color) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('ap_brand') || '{}'); } catch (_) {}
  saved.primary = color;
  localStorage.setItem('ap_brand', JSON.stringify(saved));
  applyBrandColor();
};
window.setButtonTextColor = function(color) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('ap_brand') || '{}'); } catch (_) {}
  saved.btnText = color || '';
  localStorage.setItem('ap_brand', JSON.stringify(saved));
  applyBrandColor();
};
window.getBrandSettings = function() {
  try { return JSON.parse(localStorage.getItem('ap_brand') || '{}'); } catch (_) { return {}; }
};
// Mapa de paleta accesible para el selector de Apariencia
window.__brandColorsMap = BRAND_COLORS;

function applyTheme(mode) {
  document.body.classList.toggle('light', mode === 'light');
  document.documentElement.classList.toggle('light', mode === 'light');
  localStorage.setItem('theme', mode);
  const icon = document.querySelector('#themeToggle i');
  const label = document.getElementById('themeLabel');
  if (icon && label) {
    if (mode === 'light') {
      icon.className = 'fas fa-sun';
      label.textContent = 'Modo oscuro';
    } else {
      icon.className = 'fas fa-moon';
      label.textContent = 'Modo claro';
    }
  }
  const themeColor = mode === 'light' ? '#f1f5f9' : '#0f172a';
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach(meta => meta.content = themeColor);
  document.documentElement.style.backgroundColor = themeColor;
  document.body.style.backgroundColor = themeColor;
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyBrandColor();
  applyTheme(saved);
  const btn = document.getElementById('themeToggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const isLight = document.body.classList.contains('light');
      const next = isLight ? 'dark' : 'light';
      applyTheme(next);
    });
  }
}

function setupMobileMenu() {
  const toggle = document.createElement('button');
  toggle.className = 'menu-toggle';
  toggle.innerHTML = '<i class="fas fa-bars"></i>';
  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  toggle.onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
    backdrop.classList.toggle('show');
  };
  backdrop.onclick = () => {
    document.getElementById('sidebar').classList.remove('open');
    backdrop.classList.remove('show');
  };
  document.body.appendChild(toggle);
  document.body.appendChild(backdrop);
}

// Estado de sincronización inicial (los listeners online/offline se registran una sola vez más abajo)
window.addEventListener('load', () => {
  updateSyncStatus();
  // Icono personalizado guardado en Apariencia
  try {
    const icon = localStorage.getItem('ap_custom_icon');
    const icon192 = localStorage.getItem('ap_custom_icon_192') || icon;
    if (icon) {
      document.querySelectorAll('.logo img').forEach(el => { el.src = icon; });
      let link = document.querySelector('link[rel="icon"]');
      if (link) link.href = icon192;
      const apple = document.querySelector('link[rel="apple-touch-icon"]');
      if (apple) apple.href = icon192;
    }
  } catch (_) {}
});

let valgomNavStack = [{ page: 'dashboard', arg: null }];
let exitConfirmed = false;

function historyUrl() {
  return location.pathname + location.search;
}

let trapAhead = false;

// Chrome salta las entradas creadas sin gesto del usuario: tras volver se reutiliza la existente con forward
function rearmTrap() {
  try {
    if (history.state?.trap) return;
    if (trapAhead) history.forward();
    else history.pushState({ valgom: true, trap: true }, '', historyUrl());
  } catch (_) { /* ignore quota / security errors */ }
}

function closeTransientUi() {
  if (document.getElementById('exitPrompt')) {
    removeExitPrompt();
    return true;
  }
  const pad = document.getElementById('padFirmaOverlay');
  if (pad) {
    pad.querySelector('#padCancel')?.click();
    return true;
  }
  const lightbox = document.querySelector('.valgom-lightbox');
  if (lightbox) {
    lightbox.click();
    return true;
  }
  const revisionModal = document.getElementById('modal-revision-overlay');
  if (revisionModal) {
    revisionModal.remove();
    return true;
  }
  // Hoja de medidas (toma de medidas, vista de solo lectura o editor)
  if (window.MEDICIONES?.cerrarSuperior?.()) return true;
  if (document.getElementById('overlayRevision')) {
    window.cerrarRevision?.();
    return true;
  }
  if (document.getElementById('overlayRonda')) {
    document.getElementById('overlayRonda').remove();
    return true;
  }
  if (document.getElementById('overlayPuertas')) {
    window.cerrarModalPuertas?.();
    return true;
  }
  if (document.getElementById('overlayUbicaciones')) {
    window.cerrarModalUbicaciones?.();
    return true;
  }
  const modal = document.getElementById('modalOverlay');
  if (modal?.classList.contains('open')) {
    closeModal();
    return true;
  }
  const otherOverlay = document.querySelector('.modal-overlay.open:not(#modalOverlay)');
  if (otherOverlay) {
    otherOverlay.remove();
    return true;
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar?.classList.contains('bubbles-open') || sidebar?.classList.contains('open')) {
    sidebar.classList.remove('bubbles-open', 'open');
    document.querySelector('.sidebar-backdrop')?.classList.remove('show');
    setBubblesMenu?.();
    return true;
  }
  return false;
}

function onValgomPopState(event) {
  if (exitConfirmed) {
    exitConfirmed = false;
    history.back();
    return;
  }
  if (event.state?.trap) {
    trapAhead = false;
    return;
  }
  trapAhead = true;

  // 1. Cerrar cualquier diálogo, formulario o menú abierto en pantalla
  if (closeTransientUi()) {
    rearmTrap();
    return;
  }

  // 2. Si estamos dentro de una sección secundaria, retroceder a la anterior
  if (valgomNavStack.length > 1) {
    valgomNavStack.pop(); // quitamos la pantalla actual
    const prev = valgomNavStack[valgomNavStack.length - 1] || { page: 'dashboard', arg: null };
    skipHistoryOnce = true;
    navigateTo(prev.page, prev.arg);
    rearmTrap();
    return;
  } else if (currentPage && currentPage !== 'dashboard') {
    valgomNavStack = [{ page: 'dashboard', arg: null }];
    skipHistoryOnce = true;
    navigateTo('dashboard');
    rearmTrap();
    return;
  }

  // 3. Estando en el Panel de Control, pedir confirmación antes de salir
  showExitPrompt();
  rearmTrap();
}

function setupBackNavigation() {
  if (window.__valgomBackBound) return;
  window.__valgomBackBound = true;
  lastNavArg = null;
  currentPage = currentPage || 'dashboard';
  window.currentPage = currentPage;
  valgomNavStack = [{ page: currentPage, arg: null }];
  try {
    history.replaceState({ valgom: true, root: true }, '', historyUrl());
  } catch (_) {}
  window.addEventListener('popstate', onValgomPopState);

  const armOnGesture = () => {
    rearmTrap();
    ['pointerdown', 'keydown'].forEach(type => document.removeEventListener(type, armOnGesture, true));
  };
  ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, armOnGesture, true));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) rearmTrap();
  });
}

function navigateTo(page, arg) {
  // «Tomar medidas» solo para técnicos, aunque se llame por URL o teclado
  if (page === 'medidas' && !window.isTechnician?.()) page = 'dashboard';
  if (window.SUPABASE_AUTH_REQUIRED && !window.canAccessPage?.(page)) {
    if (window.isTechnician?.() && page !== 'dashboard') return navigateTo('dashboard');
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h3>No tienes permiso para acceder a esta pantalla.</h3></div>';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    return Promise.resolve();
  }
  const skipHistory = skipHistoryOnce;
  skipHistoryOnce = false;
  currentPage = page;
  window.currentPage = page;
  lastNavArg = arg ?? null;
  window.onValgomNavigate?.(page);

  if (!skipHistory) {
    if (page === 'dashboard') {
      valgomNavStack = [{ page: 'dashboard', arg: null }];
    } else {
      const top = valgomNavStack[valgomNavStack.length - 1];
      if (!top || top.page !== page || String(top.arg ?? '') !== String(arg ?? '')) {
        valgomNavStack.push({ page, arg: arg ?? null });
        if (valgomNavStack.length > 20) {
          valgomNavStack = [{ page: 'dashboard', arg: null }].concat(valgomNavStack.slice(-15));
        }
      }
    }
  }

  document.querySelectorAll('.nav-item').forEach(i =>
    i.classList.toggle('active', i.dataset.page === page));

  // cerrar menú móvil
  setBubblesMenu();
  document.getElementById('sidebar')?.classList.remove('open');
  const bd = document.querySelector('.sidebar-backdrop');
  if (bd) bd.classList.remove('show');

  const main = document.getElementById('mainContent');
  const renderer = window['render_' + page];
  let renderPromise=Promise.resolve();

  if (renderer) {
    try {
      renderPromise=Promise.resolve(renderer(main, arg)).catch(e => {
        console.error('[navigateTo] error en render_' + page + ':', e);
        main.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>Error al cargar la página</h3></div>';
      });
    } catch (e) {
      console.error('[navigateTo] error en render_' + page + ':', e);
      main.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>Error al cargar la página</h3></div>';
    }
  } else {
    main.innerHTML = '<div class="empty-state"><i class="fas fa-compass"></i><h3>Página no encontrada</h3></div>';
  }

  actualizarBadgeRevisiones();
  return renderPromise;
}

// ── Badge de pendientes en el nav (usa el motor único de revisiones) ──
async function actualizarBadgeRevisiones() {
  try {
    const items = window.getEstadoRevisiones ? await window.getEstadoRevisiones() : [];
    const vencidas = items.filter(i => i.proximaRevision && new Date(i.proximaRevision) < new Date()).length;
    window.setNavBadge('revisionesCliente', vencidas);
  } catch (e) {
    console.warn('[badge] getEstadoRevisiones falló:', e.message);
  }
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  // Pie del modal: envolver en contenedor flexible para que los botones se adapten (móvil incluido)
  document.getElementById('modalFooter').innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;width:100%">'+(footerHTML || '')+'</div>';
  document.getElementById('modalOverlay').classList.remove('confirm-mode');
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  // Si el modal de Apariencia estaba abierto con cambios sin confirmar, restaurar colores
  if (typeof window.__apRevert === 'function') {
    try { window.__apRevert(); } catch (_) {}
    window.__apRevert = null;
  }
  document.getElementById('modalOverlay')?.classList.remove('open', 'confirm-mode');
  // Al cerrar un formulario de revisión se descarta su borrador pendiente
  if (window.__hiperberReviewDraft) window.__hiperberReviewDraft = null;
  if (window.__doticsVisitDraft) window.__doticsVisitDraft = null;
  window.__doticsRoute = null;
}
window.closeModal = closeModal;
window.openModal = openModal;

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.getElementById('modalOverlay')?.addEventListener('click', e => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ── Toasts ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) { console.warn('toastContainer no encontrado en el DOM'); return; }

  const t = document.createElement('div');
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation'
  };

  t.className = 'toast ' + type;
  t.innerHTML = '<i class="fas ' + (icons[type] || 'fa-circle-info') + '"></i>';

  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);

  c.appendChild(t);

  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(40px)';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

function showExitPrompt() {
  removeExitPrompt();
  const prompt = document.createElement('div');
  prompt.id = 'exitPrompt';
  prompt.className = 'exit-prompt';
  prompt.innerHTML = `
    <section class="exit-prompt-content" role="dialog" aria-modal="true" aria-labelledby="exitPromptTitle">
      <span class="exit-prompt-icon"><i class="fas fa-arrow-right-from-bracket"></i></span>
      <h2 id="exitPromptTitle">¿Quieres salir de la aplicación?</h2>
      <p>Tu sesión seguirá activa cuando vuelvas.</p>
      <div class="exit-prompt-actions">
        <button type="button" class="btn btn-primary" data-exit-cancel>Seguir en la app</button>
        <button type="button" class="btn btn-outline" data-exit-confirm>Salir</button>
      </div>
    </section>
  `;
  document.body.appendChild(prompt);
  requestAnimationFrame(() => prompt.classList.add('show'));
  const cancel = prompt.querySelector('[data-exit-cancel]');
  cancel.addEventListener('click', () => {
    removeExitPrompt();
  });
  prompt.querySelector('[data-exit-confirm]').addEventListener('click', () => {
    exitConfirmed = true;
    removeExitPrompt();
    // Intentar cerrar la ventana
    try {
      window.close();
    } catch (_) {}
    // Si no se cierra, navegar a una página en blanco
    setTimeout(() => {
      try {
        window.location.href = 'about:blank';
      } catch (_) {
        // Último recurso: intentar history.back()
        history.back();
      }
    }, 100);
  });
  prompt.addEventListener('click', event => {
    if (event.target === prompt) cancel.click();
  });
  prompt.addEventListener('keydown', event => {
    if (event.key === 'Escape') cancel.click();
  });
  cancel.focus();
}

function removeExitPrompt() {
  const prompt = document.getElementById('exitPrompt');
  if (prompt) prompt.remove();
}
// Alias usados por las funciones nuevas de pages.js
window.toast = showToast;
window.mostrarToast = showToast;

// ── Service Worker (PWA offline + instalable en Android) ───
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registrado', reg.scope);
        // En móvil la app queda abierta mucho tiempo: se busca versión nueva al volver a ella
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(err => console.warn('SW no registrado:', err));
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.__deferredPrompt = e;
  if (typeof showInstallBanner === 'function') showInstallBanner();
  else console.warn('showInstallBanner no está definida');
});

function showInstallBanner() {
  if (localStorage.getItem('ap_install_dismissed')) return;
  const b = document.createElement('div');
  b.className = 'install-banner show';
  b.innerHTML =
    '<i class="fas fa-mobile-screen-button" style="font-size:22px;color:#60a5fa"></i>' +
    '<div>Instala la app en tu móvil' +
      '<div style="font-size:12px;opacity:.7">Funciona sin conexión</div></div>' +
    '<button class="btn btn-primary btn-sm" id="installBtn">Instalar</button>' +
    '<button id="dismissInstall" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px"><i class="fas fa-times"></i></button>';
  document.body.appendChild(b);

  document.getElementById('installBtn').onclick = async () => {
    if (window.__deferredPrompt) {
      window.__deferredPrompt.prompt();
      const { outcome } = await window.__deferredPrompt.userChoice;
      if (outcome === 'accepted') showToast('¡App instalada! Búscala en tu escritorio', 'success');
      window.__deferredPrompt = null;
    } else {
      showToast('En Android: menú ⋮ → "Instalar aplicación"', 'info');
    }
    b.remove();
  };
  document.getElementById('dismissInstall').onclick = () => {
    localStorage.setItem('ap_install_dismissed', '1');
    b.remove();
  };
}

// ── Indicador online / offline ─────────────────────────────
window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);
window.addEventListener('autopuerta:sync-state', updateSyncStatus);

// Única definición de updateSyncStatus (antes había dos y la segunda pisaba a la primera)
function updateSyncStatus() {
  const el = document.getElementById('syncStatus');
  if (!el || !el.querySelector('span')) return;
  const me = (window.authState && window.authState.user && window.authState.user.id) || undefined;
  let pending = 0, failed = 0;
  try {      // cola de db.js (solo la del usuario actual)
    const info = window.dbSyncInfo ? window.dbSyncInfo() : null;
    if (info) { pending += info.pending.length; failed += info.failed.length; }
  } catch (e) {}
  try {      // mediciones hechas sin cobertura
    const c = window.MedicionesOutbox ? window.MedicionesOutbox.counts(me) : null;
    if (c) { pending += c.pending; failed += c.failed; }
  } catch (e) {}
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.title = 'Ver estado de sincronización';
  if (failed) {
    el.className = 'sync-status error';
    el.querySelector('span').textContent = `⚠ ${failed} sin enviar · revisar`;
  } else if (!navigator.onLine) {
    el.className = 'sync-status offline';
    el.querySelector('span').textContent = pending ? `Sin conexión · ${pending} pendiente(s)` : 'Sin conexión';
  } else if (pending) {
    el.className = 'sync-status pending';
    el.querySelector('span').textContent = `Pendientes de sincronizar: ${pending}`;
  } else {
    el.className = 'sync-status online';
    el.querySelector('span').textContent = 'Conectado';
  }
}

// ── Centro de sincronización: ver lo pendiente/rechazado y reintentar o descartar ──
function openSyncCenter() {
  const info = window.dbSyncInfo ? window.dbSyncInfo() : { pending: [], failed: [] };
  const me = (window.authState && window.authState.user && window.authState.user.id) || undefined;
  const med = window.MedicionesOutbox ? window.MedicionesOutbox.counts(me) : { pending: 0, failed: 0 };
  const label = it => (it.action === 'delete' ? 'Borrar' : 'Guardar') + ' · ' + it.store + (it.recordId ? ' · ' + it.recordId : '');
  const failedRows = info.failed.map(it =>
    '<div style="padding:8px 0;border-bottom:1px solid var(--border,#e2e8f0)"><strong>' + escapeHtml(label(it)) + '</strong>' +
    '<div style="font-size:12px;color:var(--danger,#dc2626)">' + escapeHtml(it.error || '') + '</div>' +
    '<div style="margin-top:6px;display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="__syncCenter.retry(\'' + escapeHtml(it.queueId) + '\')">Reintentar</button>' +
    '<button class="btn btn-danger btn-sm" onclick="__syncCenter.discard(\'' + escapeHtml(it.queueId) + '\')">Descartar</button></div></div>').join('');
  const parts = [];
  if (info.pending.length) parts.push('<p><i class="fas fa-cloud-arrow-up"></i> <strong>' + info.pending.length + '</strong> cambio(s) esperando conexión. Se enviarán solos al volver la señal.</p>');
  if (failedRows) parts.push('<p><i class="fas fa-triangle-exclamation"></i> <strong>' + info.failed.length + '</strong> cambio(s) rechazados por el servidor:</p>' + failedRows);
  if (med.pending || med.failed) parts.push('<p><i class="fas fa-ruler-combined"></i> Mediciones: <strong>' + med.pending + '</strong> pendientes' + (med.failed ? ', <strong>' + med.failed + '</strong> sin enviar' : '') +
    '. <button class="btn btn-outline btn-sm" onclick="closeModal();MEDICIONES.registro()">Ver mediciones</button></p>');
  if (!parts.length) parts.push('<p><i class="fas fa-circle-check" style="color:var(--success,#16a34a)"></i> Todo está sincronizado.</p>');
  openModal('Estado de sincronización', parts.join(''),
    '<button class="btn btn-outline" onclick="__syncCenter.now()"><i class="fas fa-rotate"></i> Reintentar ahora</button><button class="btn btn-primary" onclick="closeModal()">Cerrar</button>');
}
window.__syncCenter = {
  retry: id => { window.dbSyncFailedRetry(id); setTimeout(openSyncCenter, 400); },
  discard: id => window.confirmDelete('este cambio sin enviar (se perderá)', () => { window.dbSyncFailedDiscard(id); openSyncCenter(); }),
  now: async () => {
    try { await window.dbFlushSyncQueue?.(); await window.MedicionesOutbox?.run(); } catch (e) {}
    openSyncCenter();
  }
};
window.openSyncCenter = openSyncCenter;
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#syncStatus')) openSyncCenter(); });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'syncStatus') { e.preventDefault(); openSyncCenter(); } });

// Función para verificar ITV solo cuando el usuario ya haya concedido permisos
async function checkVehiculoAlerts() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const vehiculos = await dbGetAll('vehiculos');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  vehiculos.forEach(v => {
    if (v.itv) {
      const itvDate = new Date(v.itv);
      itvDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((itvDate - hoy) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 5) {
        new Notification("⚠️ ITV Próxima: " + v.matricula, {
          body: "El vehículo " + v.marca + " " + v.modelo + " vence la ITV en " + diffDays + " días.",
          icon: "./icons/icon-192.png"
        });
      }
    }
  });
}

// En móvil el menú es una barra inferior fija: no hace falta abrirlo automáticamente.

// ── Menú móvil de globos ───────────────────────────────────
const isMobileView = () => window.innerWidth <= 900;

// En móvil la pantalla de globos es el inicio: dentro de una sección, la X vuelve a ella.
function setBubblesMenu() {
  const fab = document.getElementById('menuFab');
  const onSection = isMobileView() && !!window.currentPage && window.currentPage !== 'dashboard';
  document.body.classList.toggle('on-section', onSection);
  if (!fab) return;
  fab.classList.toggle('fab-hidden', !onSection);
  fab.classList.add('is-open');
  fab.setAttribute('aria-label', 'Volver al inicio');
  fab.innerHTML = '<i class="fas fa-xmark"></i><span>Inicio</span>';
}

function setupMenuFab() {
  if (document.getElementById('menuFab')) return;
  const fab = document.createElement('button');
  fab.id = 'menuFab';
  fab.type = 'button';
  fab.className = 'menu-fab';
  document.body.appendChild(fab);
  setBubblesMenu();
  fab.addEventListener('click', () => navigateTo('dashboard'));
}

// Globos de acceso rápido al principio del inicio (solo móvil)
window.renderHomeBubbles = function (container) {
  container.querySelector('.home-bubbles')?.remove();
  if (!isMobileView()) return;
  const grid = document.createElement('div');
  grid.className = 'home-bubbles';
  document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
    if (item.dataset.page === 'dashboard') return;
    const locked = item.hidden;
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'home-bubble' + (locked ? ' locked' : '');
    bubble.dataset.page = item.dataset.page;
    if (locked) { bubble.disabled = true; bubble.setAttribute('aria-disabled', 'true'); }
    bubble.innerHTML = item.querySelector('i').outerHTML + '<span>' + item.querySelector('span').textContent + '</span>';
    const badge = item.querySelector('.nav-badge');
    if (badge) bubble.insertAdjacentHTML('beforeend', '<span class="nav-badge" style="background:#e11d48;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px">' + badge.textContent + '</span>');
    if (!locked) bubble.onclick = () => navigateTo(bubble.dataset.page);
    grid.appendChild(bubble);
  });
  container.prepend(grid);
};

// Globos inhabilitados: no hacen nada al pulsarlos
document.addEventListener('click', e => {
  const item = e.target.closest('.nav-item[hidden]');
  if (item) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

window.addEventListener('resize', () => setBubblesMenu());
// ── Cierre de modales (excluye overlays de gestión) ────────
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    if (['overlayUbicaciones', 'overlayPuertas', 'overlayRevision', 'overlayRonda',
         'modal-revision-overlay'].includes(m.id)) return;
    m.classList.remove('active', 'open');
    m.style.display = '';
  });
  // La hoja de medidas gestiona su propio cierre (Esc / botón Atrás → MEDICIONES.cerrarSuperior)
  document.body.classList.remove('modal-open');
}
window.addEventListener('load', closeAllModals);
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllModals();
});

// Ubicaciones, puertas y rutas de un cliente: ver js/central.js

// ==========================================
// GESTIÓN DE PUERTAS (Clientes)
// ==========================================

// Helper: días hasta una fecha (negativo si ya pasó). Parseo LOCAL de YYYY-MM-DD
// (si se usa new Date('YYYY-MM-DD') se interpreta en UTC y con Math.ceil
//  una fecha que es HOY puede contar como 1 día: bug del dashboard de revisiones)
function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const m = String(fechaStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const f = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  f.setHours(0, 0, 0, 0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((f - hoy) / (1000 * 60 * 60 * 24));
}

// ==========================================
// REVISIONES DE PUERTAS
// ==========================================

let revisionPuertaActual = null;

async function abrirRevision(puertaId) {
  const puerta = await dbGet('puertas', puertaId);
  if (!puerta) return alert('Puerta no encontrada');
  const cliente=puerta.clienteId ? await dbGet('clientes',puerta.clienteId) : null;
  if(String(cliente?.nombre||'').toLocaleUpperCase().includes('DOTICS')){
    return window.abrirRevisionDotics({clienteId:cliente.id,puertaId,ubicacionIds:puerta.ubicacionId?[puerta.ubicacionId]:null});
  }
  revisionPuertaActual = puerta;

  const tipo = getTipoPuerta(puerta.tipo);
  if (!tipo) return alert('Tipo de puerta no reconocido: ' + puerta.tipo);

  const checklistHTML = tipo.checklist.map((item, i) => `
    <div class="rev-item" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.15)">
      <span style="flex:1;min-width:140px">${escapeHtml(item)}</span>
      <select id="rev_estado_${i}" style="width:140px">
        <option value="">— Sin revisar —</option>
        <option value="ok">✅ Correcto</option>
        <option value="desgaste">⚠️ Desgaste</option>
        <option value="correctivo">🔴 Necesita correctivo</option>
      </select>
      <input type="text" id="rev_hallazgo_${i}" placeholder="Observación (opcional)" style="flex:1;min-width:120px">
    </div>
  `).join('');

  const empleados = window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const empOpts = empleados.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'overlayRevision';
  overlay.dataset.puerta = puertaId;
  overlay.className = 'modal-overlay open';

  overlay.innerHTML =
    '<div class="modal modal-ubic">' +
      '<div class="modal-header">' +
        '<h3>🔧 Revisión · ' + escapeHtml(puerta.nombre) + ' (' + tipo.nombre + ')</h3>' +
        '<button class="modal-close" onclick="cerrarRevision()"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ubic-form">' +
          '<label style="font-size:12px;color:var(--text-muted)">Fecha de revisión</label>' +
          '<input type="date" id="rev_fecha" value="' + new Date().toISOString().slice(0, 10) + '">' +
          '<label style="font-size:12px;color:var(--text-muted)">Técnico</label>' +
          '<select id="rev_tecnico">' + empOpts + '</select>' +
        '</div>' +
        '<h4 style="margin:16px 0 4px">Checklist · ' + tipo.nombre + '</h4>' +
        checklistHTML +
        '<div class="ubic-form" style="margin-top:16px">' +
          '<label style="font-size:12px;color:var(--text-muted)">Estado de la puerta tras la revisión</label>' +
          '<select id="rev_estado_final">' +
            '<option value="operativa">🟢 Operativa</option>' +
            '<option value="averiada">🔴 Averiada</option>' +
            '<option value="fuera_servicio">⚪ Fuera de servicio</option>' +
          '</select>' +
          '<input type="text" id="rev_correctivo" placeholder="Correctivos realizados (opcional)">' +
          '<textarea id="rev_notas" rows="2" placeholder="Notas generales (opcional)"></textarea>' +
          '<button class="btn btn-primary" onclick="guardarRevision()">💾 Guardar revisión</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  if (window.isTechnician?.()) {
    const technician = window.authState.employee;
    const select = document.getElementById('rev_tecnico');
    if (select && technician) {
      select.value = technician.id;
      select.disabled = true;
    }
  }
}

function cerrarRevision() {
  document.getElementById('overlayRevision')?.remove();
  revisionPuertaActual = null;
}

async function guardarRevision() {
  const puerta = revisionPuertaActual;
  if (!puerta) return;

  const tipo = getTipoPuerta(puerta.tipo);
  const fecha = document.getElementById('rev_fecha').value;
  if (!fecha) return alert('La fecha de revisión es obligatoria');

  const items = [];
  let sinRevisar = 0;
  tipo.checklist.forEach((concepto, i) => {
    const estado   = document.getElementById('rev_estado_' + i)?.value || '';
    const hallazgo = document.getElementById('rev_hallazgo_' + i)?.value.trim() || '';
    if (!estado) sinRevisar++;
    items.push({ concepto, estado, hallazgo });
  });

  if (sinRevisar > 0) {
    if (!confirm(`Quedan ${sinRevisar} punto(s) del checklist sin marcar. ¿Guardar igualmente?`)) return;
  }

  const estadoFinal = document.getElementById('rev_estado_final').value;
  const tecnicoId   = document.getElementById('rev_tecnico').value || null;
  const empleados = window.isTechnician?.()
    ? (window.authState.employee ? [window.authState.employee] : [])
    : await dbGetAll('empleados');
  const tecnicoNombre = empleados.find(e => e.id === tecnicoId)?.nombre || null;
  const cliente = puerta.clienteId ? await dbGet('clientes', puerta.clienteId) : null;
  const ubicacion = puerta.ubicacionId ? await dbGet('ubicaciones', puerta.ubicacionId) : null;

  const revision = {
    id: 'REV-' + Date.now(),
    puertaId: puerta.id,
    clienteId: puerta.clienteId,
    fecha,
    tecnicoId,
    tecnicoNombre,
    items,
    hallazgos: items.filter(i => i.hallazgo).map(i => `${i.concepto}: ${i.hallazgo}`).join(' | '),
    correctivo: document.getElementById('rev_correctivo').value.trim(),
    estadoTrasRevision: estadoFinal,
    notas: JSON.stringify({
      form: 'PUERTA_REVISION_V1',
      clienteId: cliente?.id ? String(cliente.id) : null,
      cliente: cliente?.nombre || '',
      ubicacionId: ubicacion?.id ? String(ubicacion.id) : null,
      ubicacion: ubicacion?.denominacion || '',
      // claves antiguas: las siguen leyendo el historial y los PDF
      cadenaId: cliente?.central && cliente?.id ? String(cliente.id) : null,
      cadena: cliente?.central ? (cliente?.nombre || '') : '',
      tecnicos: tecnicoNombre || '',
      observaciones: document.getElementById('rev_notas').value.trim()
    }),
    createdAt: new Date().toISOString()
  };

  await dbAdd('revisiones', revision);

  // La próxima revisión sale de la periodicidad de la puerta (tabla por uso/criterio)
  let proxima = null;
  try {
    const act = await window.Central.reprogramarPuerta(puerta, fecha, estadoFinal);
    proxima = act.proximaRevision;
  } catch (error) {
    console.error('No se pudo reprogramar la puerta:', error);
    showToast(error.message || 'La revisión se guardó pero no se pudo reprogramar la puerta', 'warning');
  }

  cerrarRevision();
  showToast('Revisión registrada' + (proxima ? ' · Próx.: ' + proxima : ''));
  actualizarBadgeRevisiones();
  if (currentPage === 'revisionesProgramadas' || currentPage === 'revisionesCliente') {
    const main = document.getElementById('mainContent');
    if (window.render_revisionesCliente) window.render_revisionesCliente(main);
  }
}

// ==========================================
// HISTÓRICO DE PUERTAS Y REVISIONES (Cliente)
// ==========================================

async function verHistoricoPuertas(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');

  const puertas = await dbGetByIndex('puertas', 'clienteId', clienteId);
  const todasRevs = await dbGetAll('revisiones');
  const empleados = await dbGetAll('empleados');
  const ubicNombres = Object.fromEntries((await dbGetAll('ubicaciones')).map(u => [u.id, u.denominacion]));

  const nombreTecnico = id => {
    const e = empleados.find(x => x.id === id);
    return e ? e.nombre : '—';
  };

  const estadosIcon = { operativa: '🟢', averiada: '🔴', fuera_servicio: '⚪' };
  const estadoItemIcon = { ok: '✅', desgaste: '⚠️', correctivo: '🔴' };

  let bodyHTML = '';

  if (!puertas.length) {
    bodyHTML = '<p class="ubic-vacio">Este cliente aún no tiene puertas registradas.</p>';
  } else {
    puertas.sort((a, b) => a.nombre.localeCompare(b.nombre));

    bodyHTML = puertas.map(p => {
      const revs = todasRevs
        .filter(r => r.puertaId === p.id)
        .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

      const tipo = getTipoPuerta(p.tipo);
      const dias = diasHasta(p.proximaRevision);
      let aviso = '';
      if (dias !== null) {
        if (dias < 0)       aviso = ' <span style="color:#ef4444">🔴 Atrasada ' + Math.abs(dias) + 'd</span>';
        else if (dias <= 3) aviso = ' <span style="color:#f97316">🟠 En ' + dias + 'd</span>';
        else if (dias <= 7) aviso = ' <span style="color:#22c55e">🟢 En ' + dias + 'd</span>';
      }

      const historialHTML = revs.length ? revs.map(r => `
        <div style="border-left:3px solid var(--border,#334155); padding:8px 12px; margin:8px 0 8px 8px;">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px">
            <strong>📅 ${r.fecha}</strong>
            <span>${estadosIcon[r.estadoTrasRevision] || ''} Tras revisión: ${r.estadoTrasRevision}</span>
          </div>
          <small style="color:var(--text-muted)">👷 ${escapeHtml(nombreTecnico(r.tecnicoId))}</small>
          <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px">
            ${(r.items || []).map(i => `<span style="font-size:12px;background:rgba(148,163,184,.12);padding:2px 8px;border-radius:10px">${estadoItemIcon[i.estado] || '⬜'} ${escapeHtml(i.concepto)}</span>`).join('')}
          </div>
          ${r.hallazgos ? `<div style="margin-top:6px;font-size:13px">🔎 ${escapeHtml(r.hallazgos)}</div>` : ''}
          ${r.correctivo ? `<div style="margin-top:4px;font-size:13px">🔧 ${escapeHtml(r.correctivo)}</div>` : ''}
          ${r.notas && r.notas !== 'Ronda de revisiones' ? `<div style="margin-top:4px;font-size:13px;color:var(--text-muted)">📝 ${escapeHtml(r.notas)}</div>` : ''}
        </div>
      `).join('') : '<p style="color:var(--text-muted);font-size:13px;margin:8px 0 8px 12px">Sin revisiones registradas todavía.</p>';

      return `
      <details style="border:1px solid rgba(148,163,184,.2); border-radius:8px; margin-bottom:8px; padding:10px 12px">
        <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px">
          <span><strong>${escapeHtml(p.nombre)}</strong> <small style="color:var(--text-muted)">· ${tipo ? tipo.nombre : p.tipo}${p.ubicacionId && ubicNombres[p.ubicacionId] ? ' · 📍 ' + escapeHtml(ubicNombres[p.ubicacionId]) : ''}</small></span>
          <span style="font-size:13px">
            ${estadosIcon[p.estado] || ''} ${p.estado} · Próx: ${p.proximaRevision || '—'}${aviso}
            <small style="color:var(--text-muted)">(${revs.length} rev.)</small>
          </span>
        </summary>
        <div style="margin-top:8px">${historialHTML}</div>
      </details>`;
    }).join('');
  }

  openModal(
    '🕓 Histórico de puertas · ' + cliente.nombre,
    '<div style="max-height:60vh;overflow-y:auto">' + bodyHTML + '</div>',
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>'
  );
}

// ═══════════════════════════════════════════════════════════
// Exponer shell de navegación (DESPUÉS de definirlas)
// ═══════════════════════════════════════════════════════════
window.pages = window.pages || {};
window.pages.setupNavigation = setupNavigation;
window.pages.setupMobileMenu = setupMobileMenu;
window.navigateTo = navigateTo;
window.getCurrentPage = () => currentPage;
window.showToast = showToast;
window.diasHasta = diasHasta;
window.closeAllModals = closeAllModals;

// ═══════════════════════════════════════════════════════════
// FIN app.js — no registrar el SW aquí (se hace en registerServiceWorker)
// ═══════════════════════════════════════════════════════════

// ── Red de seguridad: nunca pasar HTMLElement a filtros de PostgREST ──
(function() {
  const sbClient = window.sb || window.supabase;
  if (!sbClient) return;
  const origFrom = sbClient.from.bind(sbClient);
  sbClient.from = function(table) {
    const q = origFrom(table);
    ['eq','in','or','gte','lte','neq'].forEach(op => {
      const orig = q[op]?.bind(q);
      if (!orig) return;
      q[op] = (...args) => orig(...args.map(a => {
        if (a && typeof a === 'object' && (a.tagName || a.target)) {
          console.warn(`⚠️ ${table}.${op}() recibió elemento DOM — normalizado automáticamente`);
          return a.value ?? a.target?.value ?? null;
        }
        return a;
      }));
    });
    return q;
  };
})();