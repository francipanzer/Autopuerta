// ── App Shell ──────────────────────────────────────────────
let currentPage = 'dashboard';
let currentCadenId = null;   // ← cadena activa (la usan render_rutas / showRutaForm)
let lastNavArg = null;
let skipHistoryOnce = false;
window.currentCadenId = null;
window.currentPage = 'dashboard';

function syncCurrentCadenaId(id = null) {
  const resolvedId = id ?? currentCadenId ?? localStorage.getItem('cadenaId') ?? null;
  const normalizedId = resolvedId === null || resolvedId === undefined || resolvedId === '' ? null : String(resolvedId);

  currentCadenId = normalizedId;
  window.currentCadenId = normalizedId;

  if (normalizedId) localStorage.setItem('cadenaId', normalizedId);
  else localStorage.removeItem('cadenaId');

  return normalizedId;
}
window.getCurrentCadenId = () => syncCurrentCadenaId();
window.setCurrentCadenId = (id) => syncCurrentCadenaId(id);

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
  if (store === 'incidencias') window.refreshIncidenciasBadge?.();
  const page = document.querySelector('.nav-item.active')?.dataset.page || currentPage || 'dashboard';
  const storeToPage = {
    'empleados': 'empleados',
    'clientes': 'clientes',
    'partesTrabajo': 'partesTrabajo',
    'tableros': 'tableros',
    'tarjetasTablero': 'tableros',
    'incidencias': 'incidencias',
    'vehiculos': 'vehiculos',
    'presupuestos': 'presupuestos',
    'almacen': 'almacen',
    'articulos': 'almacen',
    'ubicaciones': 'clientes',
    'puertas': 'clientes',
    'cadenas': 'cadenas',
    'rutas': 'rutas',
    'revisiones': 'revisionesProgramadas',
    'tiposPuerta': 'configuracion',
    'informes': 'informesKms',
    'jornadas': 'informesKms'
  };
  const alsoRefresh = {
    cadenas: ['revisionesProgramadas'],
    rutas: ['revisionesProgramadas'],
    puertas: ['revisionesProgramadas'],
    revisiones: ['clientes']
  };

  const targetPage = storeToPage[store];
  const shouldRefresh = targetPage === page || (alsoRefresh[store] || []).includes(page);
  if (!shouldRefresh || !targetPage || typeof window['render_' + page] !== 'function') return;

  const target = page === 'rutas' ? (window.getCurrentCadenId() || localStorage.getItem('cadenaId')) : document.getElementById('mainContent');
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
  registerServiceWorker();   // único punto de registro del SW
  checkVehiculoAlerts();     // ← ahora sí se ejecuta
}

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

  if (page === 'rutas' && arg) {
    window.setCurrentCadenId(arg);
  } else if (page === 'rutas') {
    const stored = window.getCurrentCadenId() || localStorage.getItem('cadenaId');
    if (stored) window.setCurrentCadenId(stored);
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

// ── Badge de pendientes en el nav ──────────────────────────
async function actualizarBadgeRevisiones() {
  if (typeof getPendientesRevision !== 'function' || !window.setNavBadge) return;

  try {
    const p = await getPendientesRevision();
    window.setNavBadge('revisionesProgramadas', p.length);
  } catch (e) {
    console.warn('[badge] getPendientesRevision falló:', e.message);
  }
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML || '';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('open');
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
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado', reg.scope))
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

function updateSyncStatus() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  let pending = 0;
  try {
    const queue = JSON.parse(localStorage.getItem('autopuerta_sync_queue') || '[]');
    pending = Array.isArray(queue) ? queue.length : 0;
  } catch (e) {}
  if (!navigator.onLine) {
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
  document.body.classList.remove('modal-open');
}
window.addEventListener('load', closeAllModals);
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllModals();
});

// ==========================================
// GESTIÓN DE UBICACIONES (Clientes)
// ==========================================
let ubicClienteActual = null;

async function gestionarUbicaciones(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');
  ubicClienteActual = clienteId;
  abrirModalUbicaciones(cliente);
}

function abrirModalUbicaciones(cliente) {
  cerrarModalUbicaciones();

  const overlay = document.createElement('div');
  overlay.id = 'overlayUbicaciones';
  overlay.dataset.cliente = cliente.id;
  overlay.className = 'modal-overlay open';

  overlay.innerHTML =
    '<div class="modal modal-ubic">' +
      '<div class="modal-header">' +
        '<h3>Ubicaciones · ' + escapeHtml(cliente.nombre) + '</h3>' +
        '<button class="modal-close" onclick="cerrarModalUbicaciones()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ubic-form">' +
          '<input type="text" id="ub_denominacion" placeholder="Nombre (ej: Nave Alcalá)">' +
          '<input type="text" id="ub_direccion" placeholder="Dirección completa">' +
          '<input type="text" id="ub_notas" placeholder="Notas (acceso, horario...) opcional">' +
          '<button class="btn btn-primary" onclick="guardarUbicacion()">+ Añadir ubicación</button>' +
        '</div>' +
        '<div id="listaUbicaciones" style="margin-top:16px"></div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') guardarUbicacion(); });
  });

  pintarListaUbicaciones();
}

function cerrarModalUbicaciones() {
  document.getElementById('overlayUbicaciones')?.remove();
  ubicClienteActual = null;
}

function getUbicClienteActual() {
  return document.getElementById('overlayUbicaciones')?.dataset.cliente || ubicClienteActual;
}

async function pintarListaUbicaciones() {
  const cont = document.getElementById('listaUbicaciones');
  if (!cont) return;

  const lista = await dbGetByIndex('ubicaciones', 'clienteId', getUbicClienteActual());

  if (!lista.length) {
    cont.innerHTML = '<p class="ubic-vacio">Este cliente aún no tiene ubicaciones. Añade la primera arriba.</p>';
    return;
  }

  cont.innerHTML = lista.map(u => `
    <div class="ubic-item">
      <div>
        <strong>${escapeHtml(u.denominacion)}</strong><br>
        <small>${escapeHtml(u.direccion || '')}</small>
        ${u.notas ? '<br><small style="color:var(--text-muted)">📝 ' + escapeHtml(u.notas) + '</small>' : ''}
      </div>
      <button class="btn btn-sm btn-danger" onclick="eliminarUbicacion('${u.id}')">Eliminar</button>
    </div>
  `).join('');
}

async function guardarUbicacion() {
  const den  = document.getElementById('ub_denominacion').value.trim();
  const dir  = document.getElementById('ub_direccion').value.trim();
  const nota = document.getElementById('ub_notas').value.trim();

  if (!den) return alert('El nombre de la ubicación es obligatorio');

  await dbAdd('ubicaciones', {
    id: 'UBI-' + Date.now(),
    clienteId: getUbicClienteActual(),
    denominacion: den,
    direccion: dir,
    notas: nota
  });

  document.getElementById('ub_denominacion').value = '';
  document.getElementById('ub_direccion').value = '';
  document.getElementById('ub_notas').value = '';
  document.getElementById('ub_denominacion').focus();

  pintarListaUbicaciones();
}

async function eliminarUbicacion(id) {
  if (!confirm('¿Eliminar esta ubicación?')) return;
  await dbDelete('ubicaciones', id);
  pintarListaUbicaciones();
}

// ==========================================
// GESTIÓN DE PUERTAS (Clientes)
// ==========================================

// Helper: días hasta una fecha (negativo si ya pasó)
function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaStr); f.setHours(0, 0, 0, 0);
  return Math.ceil((f - hoy) / (1000 * 60 * 60 * 24));
}

let puertaClienteActual = null;

async function gestionarPuertas(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');
  puertaClienteActual = clienteId;
  abrirModalPuertas(cliente);
}

function abrirModalPuertas(cliente) {
  cerrarModalPuertas();

  const opciones = Object.entries(TIPOS_PUERTA)
    .map(([k, v]) => `<option value="${k}">${v.nombre}</option>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.id = 'overlayPuertas';
  overlay.dataset.cliente = cliente.id;
  overlay.className = 'modal-overlay open';

  overlay.innerHTML =
    '<div class="modal modal-ubic">' +
      '<div class="modal-header">' +
        '<h3>Puertas · ' + escapeHtml(cliente.nombre) + '</h3>' +
        '<button class="modal-close" onclick="cerrarModalPuertas()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="ubic-form">' +
          '<input type="text" id="pu_nombre" placeholder="Nombre / matrícula (ej: Nave 1 - Acceso A)">' +
          '<select id="pu_tipo">' + opciones + '</select>' +
          '<select id="pu_estado">' +
            '<option value="operativa">🟢 Operativa</option>' +
            '<option value="averiada">🔴 Averiada</option>' +
            '<option value="fuera_servicio">⚪ Fuera de servicio</option>' +
          '</select>' +
          '<select id="pu_ubicacion"><option value="">Sin ubicación</option></select>' +
          '<input type="text" id="pu_notas" placeholder="Notas (opcional)">' +
          '<button class="btn btn-primary" onclick="guardarPuerta()">+ Añadir puerta</button>' +
        '</div>' +
        '<div id="listaPuertas" style="margin-top:16px"></div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  cargarUbicacionesEnSelect(cliente.id);
  pintarListaPuertas();
}

function cerrarModalPuertas() {
  document.getElementById('overlayPuertas')?.remove();
  puertaClienteActual = null;
}

function getPuertaClienteActual() {
  return document.getElementById('overlayPuertas')?.dataset.cliente || puertaClienteActual;
}

async function cargarUbicacionesEnSelect(clienteId) {
  const sel = document.getElementById('pu_ubicacion');
  if (!sel) return;
  const ubs = await dbGetByIndex('ubicaciones', 'clienteId', clienteId);
  sel.innerHTML = '<option value="">Sin ubicación</option>' +
    ubs.map(u => `<option value="${u.id}">${escapeHtml(u.denominacion)}</option>`).join('');
}

async function pintarListaPuertas() {
  const cont = document.getElementById('listaPuertas');
  if (!cont) return;

  const lista = await dbGetByIndex('puertas', 'clienteId', getPuertaClienteActual());

  if (!lista.length) {
    cont.innerHTML = '<p class="ubic-vacio">Este cliente aún no tiene puertas registradas.</p>';
    return;
  }

  lista.sort((a, b) => (a.proximaRevision || '9999').localeCompare(b.proximaRevision || '9999'));

  const estados = {
    operativa: '🟢 Operativa',
    averiada: '🔴 Averiada',
    fuera_servicio: '⚪ Fuera de servicio'
  };

  cont.innerHTML = lista.map(p => {
    const tipo = getTipoPuerta(p.tipo);
    const dias = diasHasta(p.proximaRevision);
    let aviso = '';
    if (dias !== null) {
      if (dias < 0)       aviso = ' <span style="color:#ef4444">🔴 Atrasada ' + Math.abs(dias) + 'd</span>';
      else if (dias <= 3) aviso = ' <span style="color:#f97316">🟠 Revisar en ' + dias + 'd</span>';
      else if (dias <= 7) aviso = ' <span style="color:#22c55e">🟢 Próxima en ' + dias + 'd</span>';
    }
    return `
    <div class="ubic-item">
      <div>
        <strong>${escapeHtml(p.nombre)}</strong>
        <small>· ${tipo ? tipo.nombre : p.tipo}</small><br>
        <small>${estados[p.estado] || p.estado}</small><br>
        <small>Próx. revisión: ${p.proximaRevision || '—'}${aviso}</small>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-primary" onclick="abrirRevision('${p.id}')">🔧 Revisar</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarPuerta('${p.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

async function guardarPuerta() {
  const nombre = document.getElementById('pu_nombre').value.trim();
  const tipo   = document.getElementById('pu_tipo').value;
  const estado = document.getElementById('pu_estado').value;
  const ubId   = document.getElementById('pu_ubicacion').value;
  const notas  = document.getElementById('pu_notas').value.trim();

  if (!nombre) return alert('El nombre de la puerta es obligatorio');

  const hoy = new Date().toISOString().slice(0, 10);

  try {
    await dbAdd('puertas', {
      id: 'PRT-' + Date.now(),
      nombre,
      tipo,
      clienteId: getPuertaClienteActual(),
      ubicacionId: ubId || null,
      estado,
      notas,
      ultimaRevision: null,
      proximaRevision: calcularProximaRevisionPuerta(tipo, null),
      createdAt: hoy
    });
  } catch (err) {
    console.error('[guardarPuerta]', err);
    showToast('No se pudo guardar la puerta: ' + (err?.message || err), 'error');
    return;
  }

  document.getElementById('pu_nombre').value = '';
  document.getElementById('pu_notas').value = '';
  document.getElementById('pu_nombre').focus();

  pintarListaPuertas();
}

async function eliminarPuerta(id) {
  if (!confirm('¿Eliminar esta puerta? (No borra sus revisiones históricas)')) return;
  await dbDelete('puertas', id);
  pintarListaPuertas();
}

// ==========================================
// REVISIONES DE PUERTAS
// ==========================================

let revisionPuertaActual = null;

async function abrirRevision(puertaId) {
  const puerta = await dbGet('puertas', puertaId);
  if (!puerta) return alert('Puerta no encontrada');
  const cliente=puerta.clienteId ? await dbGet('clientes',puerta.clienteId) : null;
  const cadenaId=cliente?.cadenaId??cliente?.cadenaid;
  const cadena=cadenaId ? await dbGet('cadenas',cadenaId) : null;
  if(cadena?.nombre?.trim().toLocaleUpperCase()==='DOTICS'||cliente?.nombre?.trim().toLocaleUpperCase()==='DOTICS'){
    return window.openDoticsMaintenanceForm(cadena?.id||cliente.id,puertaId);
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
        '<button class="modal-close" onclick="cerrarRevision()">×</button>' +
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

  const revision = {
    id: 'REV-' + Date.now(),
    puertaId: puerta.id,
    clienteId: puerta.clienteId,
    fecha,
    tecnicoId,
    items,
    hallazgos: items.filter(i => i.hallazgo).map(i => `${i.concepto}: ${i.hallazgo}`).join(' | '),
    correctivo: document.getElementById('rev_correctivo').value.trim(),
    estadoTrasRevision: estadoFinal,
    notas: document.getElementById('rev_notas').value.trim(),
    createdAt: new Date().toISOString()
  };

  await dbAdd('revisiones', revision);

  const puertaActualizada = {
    ...puerta,
    ultimaRevision: fecha,
    estado: estadoFinal,
    proximaRevision: null
  };
  if (window.isTechnician?.()) {
    const { data: nextRevision, error } = await window.supabaseDB.rpc('update_door_revision_schedule', {
      p_id: String(puerta.id),
      p_last_revision: fecha,
      p_state: estadoFinal
    });
    if (error) throw error;
    puertaActualizada.proximaRevision = nextRevision;
    await dbPut('puertas', puertaActualizada);
  } else {
    const client = puerta.clienteId ? await dbGet('clientes', puerta.clienteId) : null;
    const routeId = client?.rutaId ?? client?.rutaid;
    const route = routeId ? await dbGet('rutas', routeId) : null;
    const frequency = Number(route?.frecuenciaMeses ?? route?.frecuenciameses) || 6;
    puertaActualizada.proximaRevision = calcularProximaRevision(fecha, frequency);
    await dbPut('puertas', puertaActualizada);
  }

  cerrarRevision();
  showToast('Revisión registrada · Próx.: ' + puertaActualizada.proximaRevision);
  // Refrescar la página actual si es revisionesProgramadas o gestionarPuertas
  if (currentPage === 'revisionesProgramadas') {
    const main = document.getElementById('mainContent');
    if (window.render_revisionesProgramadas) {
      window.render_revisionesProgramadas(main);
    }
  } else {
    pintarListaPuertas();
  }
}

// ==========================================
// RONDA DE REVISIONES (hoja de trabajo por ruta)
// ==========================================

let rondaPuertas = [];

// ===== REEMPLAZO: abrirRondaRevisiones (2 niveles: Rutas → Detalle) =====
// Reemplaza la función actual en pages.js / app.js (donde esté definida)

async function abrirRondaRevisiones(rutaId = null) {
  const hoy = new Date();
  const puertas = await dbGetAll('puertas');
  const clientes = await dbGetAll('clientes');
  const rutas = await dbGetAll('rutas');

  // Si NO viene rutaId → mostrar nivel 1 (listado de rutas)
  if (rutaId === null) {
    return renderNivel1Rutas(rutas, puertas, clientes);
  }

  // Si viene rutaId → mostrar nivel 2 (detalle de esa ruta)
  return renderNivel2Detalle(rutaId, puertas, clientes, hoy);
}

// ── NIVEL 1: Listado de rutas clickeables ──
function renderNivel1Rutas(rutas, puertas, clientes) {
  const pendientes = puertas.filter(p => {
    if (!p.proximaRevision) return false;
    const treintaDias = new Date(); treintaDias.setDate(new Date().getDate() + 30);
    return new Date(p.proximaRevision) <= treintaDias;
  });

  // Contar puertas pendientes por ruta
  const conteoPorRuta = {};
  pendientes.forEach(p => {
    const cliente = clientes.find(c => c.id === p.clienteId);
    const rutaId = cliente ? (cliente.rutaId || null) : null;
    if (rutaId) {
      conteoPorRuta[rutaId] = (conteoPorRuta[rutaId] || 0) + 1;
    }
  });

  let html = `
    <div class="review-header" style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 24px 0;">
      <h2 style="margin:0;font-size:1.4rem;color:#1e293b;">📋 Informe de Revisión</h2>
      <button class="btn btn-primary" onclick="goHome()">← Volver</button>
    </div>
    <p style="color:#64748b;font-size:0.9rem;margin-bottom:20px;">Selecciona una ruta para ver las puertas pendientes de revisión</p>
    <div class="review-rutas-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
  `;

  for (const ruta of rutas) {
    const numPendientes = conteoPorRuta[ruta.id] || 0;
    // Solo mostrar rutas con puertas pendientes (o todas si prefieres)
    html += `
      <div class="review-ruta-card" onclick="abrirRondaRevisiones('${ruta.id}')"
           style="padding:16px;border:2px solid #e2e8f0;border-radius:12px;cursor:pointer;transition:all 0.2s;background:#fff;"
           onmouseover="this.style.borderColor='#3b82f6';this.style.boxShadow='0 4px 12px rgba(59,130,246,0.15)'"
           onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
        <div style="font-size:1.05rem;font-weight:600;color:#1e293b;">🗺️ ${escapeHtml(ruta.nombre)}</div>
        <div style="font-size:0.85rem;color:#64748b;margin-top:4px;">
          ${numPendientes > 0
            ? `<span style="color:#ef4444;font-weight:600;">⚠️ ${numPendientes} puerta(s) pendiente(s)</span>`
            : '✅ Sin pendientes'}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  document.getElementById('app').innerHTML = html;
}

// ── NIVEL 2: Detalle de una ruta (reutiliza tu tabla actual) ──
async function renderNivel2Detalle(rutaId, puertas, clientes, hoy) {
  const ruta = await dbGetAll('rutas').then(r => r.find(x => x.id === rutaId));
  const clientesRuta = clientes.filter(c => c.rutaId === rutaId);
  const clientesIds = new Set(clientesRuta.map(c => c.id));

  // Puertas pendientes de esta ruta
  const treintaDias = new Date(hoy); treintaDias.setDate(hoy.getDate() + 30);
  const pendientes = puertas.filter(p => {
    if (!p.proximaRevision) return false;
    if (!clientesIds.has(p.clienteId)) return false;
    return new Date(p.proximaRevision) <= treintaDias;
  });

  // Agrupar por cliente
  const grupos = {};
  pendientes.forEach(p => {
    if (!grupos[p.clienteId]) grupos[p.clienteId] = [];
    grupos[p.clienteId].push(p);
  });

  const numClientes = Object.keys(grupos).length;
  if (numClientes === 0) {
    showToast('✅ No hay revisiones pendientes para esta ruta.', 'info');
    return renderNivel1Rutas(await dbGetAll('rutas'), puertas, clientes);
  }

  let html = `
    <div class="review-header" style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 24px 0;">
      <h2 style="margin:0;font-size:1.3rem;color:#1e293b;">🗺️ ${escapeHtml(ruta?.nombre || 'Ruta')} <span style="font-size:0.9rem;color:#64748b;">(${pendientes.length} puerta(s))</span></h2>
      <button class="btn btn-primary" onclick="abrirRondaRevisiones()">← Volver a rutas</button>
    </div>
  `;

  Object.entries(grupos).forEach(([clienteId, lista]) => {
    const cliente = clientes.find(c => c.id === clienteId);
    const nombreCliente = cliente ? cliente.nombre : 'Cliente desconocido';
    const direccion = cliente ? (cliente.direccion || '') : '';
    const lat = cliente?.lat;
    const lng = cliente?.lng;
    const mapUrl = (lat && lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(direccion || nombreCliente)}`;

    html += `
      <div class="rd-grupo" data-cliente="${clienteId}" style="margin-bottom:28px;">
        <!-- Header del cliente con dirección y Maps -->
        <h4 style="display:flex;align-items:center;gap:8px;margin:0 0 12px 0;color:#1e293b;">
          <i class="fas fa-store" style="color:#3b82f6;"></i> ${escapeHtml(nombreCliente)}
          <span class="badge" style="background:#dbeafe;color:#2563eb;">${lista.length} puerta(s)</span>
        </h4>
        <!-- Dirección con icono + botón Maps -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;padding:8px 12px;background:#f8fafc;border-radius:8px;">
          <span style="font-size:16px;flex-shrink:0;">📍</span>
          <span style="font-size:0.85rem;color:#475569;">${escapeHtml(direccion || 'Sin dirección')}</span>
          <span style="margin-left:auto;">
            <a href="${mapUrl}" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;color:#3b82f6;text-decoration:none;padding:4px 10px;border:1px solid #3b82f6;border-radius:6px;cursor:pointer;transition:all 0.2s;"
               onmouseover="this.style.background='#3b82f6';this.style.color='#fff'"
               onmouseout="this.style.background='transparent';this.style.color='#3b82f6'">
              🗺️ Maps
            </a>
          </span>
        </div>
        <!-- Tabla de puertas (tu código actual) -->
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead>
            <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
              <th style="text-align:left;padding:8px 10px;width:35%;">Puerta</th>
              <th style="text-align:left;padding:8px 10px;">Tipo</th>
              <th style="text-align:left;padding:8px 10px;">Últ. Revisión</th>
              <th style="text-align:left;padding:8px 10px;">Próx. Revisión</th>
              <th style="text-align:left;padding:8px 10px;">Estado</th>
              <th style="text-align:center;padding:8px 10px;">Acción</th>
            </tr>
          </thead>
          <tbody>
    `;

    lista.forEach((puerta, idx) => {
      const diasRestantes = Math.ceil((new Date(puerta.proximaRevision) - hoy) / 86400000);
      const estadoColor = diasRestantes < 0 ? '#ef4444' : diasRestantes <= 7 ? '#f59e0b' : '#22c55e';
      const estadoTexto = diasRestantes < 0 ? `Vencida (${Math.abs(diasRestantes)}d)` :
                          diasRestantes <= 7 ? `Próxima (${diasRestantes}d)` : `OK`;

      html += `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 10px;">${escapeHtml(puerta.nombre || 'Puerta ' + puerta.id)}</td>
          <td style="padding:8px 10px;color:#64748b;">${escapeHtml(puerta.tipo || '—')}</td>
          <td style="padding:8px 10px;color:#64748b;">${puerta.ultimaRevision ? new Date(puerta.ultimaRevision).toLocaleDateString('es-ES') : '—'}</td>
          <td style="padding:8px 10px;color:#64748b;">${puerta.proximaRevision ? new Date(puerta.proximaRevision).toLocaleDateString('es-ES') : '—'}</td>
          <td style="padding:8px 10px;color:${estadoColor};font-weight:600;">${estadoTexto}</td>
          <td style="text-align:center;padding:8px 10px;">
            <button onclick="abrirRevision('${puerta.id}')" style="padding:4px 12px;border:1px solid #3b82f6;border-radius:6px;background:#fff;color:#3b82f6;cursor:pointer;font-size:0.8rem;">
              Revisar
            </button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  });

  document.getElementById('app').innerHTML = html;
}

// ── Mostrar textarea si hallazgo está marcado ──
window.rdToggleDetalle = function (checkbox) {
  const fila = checkbox.closest('tr');
  const textarea = fila.querySelector('.rd-detalle-input');
  textarea.style.display = checkbox.checked ? 'block' : 'none';
  rdValidar();
};

// ── Validar: activar final solo si TODAS las puertas tienen los 3 campos ──
window.rdValidar = function () {
  const checks = [...document.querySelectorAll('.rd-hallazgo-check')];
  if (checks.length === 0) return;

  let todasRevisadas = true;
  checks.forEach(cb => {
    const puerta = cb.dataset.puerta;
    const correctivo = document.querySelector(`.rd-correctivo-check[data-puerta="${puerta}"]`);
    const resultado = document.querySelector(`.rd-resultado-select[data-puerta="${puerta}"]`);
    if (!cb.checked || !correctivo?.checked || !resultado?.value) todasRevisadas = false;
  });

  const final = document.getElementById('rd-check-final');
  const btn = document.getElementById('rd-btn-guardar');
  const label = document.getElementById('rd-final-label');
  if (!final || !btn || !label) return;

  final.disabled = !todasRevisadas;
  label.style.opacity = todasRevisadas ? '1' : '.5';
  label.style.color = todasRevisadas ? '#16a34a' : '#dc2626';
  label.style.background = todasRevisadas ? '#f0fdf4' : '#fef2f2';
  btn.disabled = !(todasRevisadas && final.checked);
};

window.cerrarModalRevision = function () {
  document.getElementById('modal-revision-overlay')?.remove();
};

// ── Guardar: nueva fecha (+6 meses) + datos revisados ──
window.guardarRondaRevision = async function () {
  const checkFinal = document.getElementById('rd-check-final');
  if (!checkFinal || !checkFinal.checked) {
    showToast('⚠️ Debes marcar el checklist final para cerrar la revisión.', 'error');
    return;
  }

  const detalles = {}, correctivos = {}, resultados = {};
  document.querySelectorAll('.rd-correctivo-check').forEach(i => correctivos[i.dataset.puerta] = i.checked);
  document.querySelectorAll('.rd-resultado-select').forEach(i => resultados[i.dataset.puerta] = i.value);
  document.querySelectorAll('.rd-detalle-input').forEach(i => detalles[i.dataset.puerta] = i.value.trim());

  const nuevaFecha = new Date();
  nuevaFecha.setMonth(nuevaFecha.getMonth() + 6);
  const iso = nuevaFecha.toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);

  const puertas = await dbGetAll('puertas');
  const treintaDias = new Date(); treintaDias.setDate(treintaDias.getDate() + 30);
  let actualizadas = 0;

  for (const p of puertas) {
    if (!p.proximaRevision || new Date(p.proximaRevision) > treintaDias) continue;
    await dbPut('puertas', {
      ...p,
      proximaRevision: iso,
      ultimaRevision: hoy,
      hallazgo: detalles[p.id] ?? p.hallazgo,
      correctivo: correctivos[p.id] ? 'Sí' : p.correctivo,
      resultado: resultados[p.id] || p.resultado
    });
    actualizadas++;
  }

  console.log(`✅ ${actualizadas} puertas actualizadas. Próxima revisión: ${iso}`);
  cerrarModalRevision();
  showToast(`✅ ${actualizadas} puerta(s) cerradas · Próx.: ${iso}`, 'success');
  actualizarBadgeRevisiones();
};

// ==========================================
// HISTÓRICO DE PUERTAS Y REVISIONES (Cliente)
// ==========================================

async function verHistoricoPuertas(clienteId) {
  const cliente = await dbGet('clientes', clienteId);
  if (!cliente) return alert('Cliente no encontrado');

  const puertas = await dbGetByIndex('puertas', 'clienteId', clienteId);
  const todasRevs = await dbGetAll('revisiones');
  const empleados = await dbGetAll('empleados');

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
          <span><strong>${escapeHtml(p.nombre)}</strong> <small style="color:var(--text-muted)">· ${tipo ? tipo.nombre : p.tipo}</small></span>
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
window.getCurrentCadenId = () => syncCurrentCadenaId();
window.setCurrentCadenId = (id) => syncCurrentCadenaId(id);
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