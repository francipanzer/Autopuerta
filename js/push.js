// Notificaciones push (administradores): activar/desactivar en este dispositivo.
(function () {
  const VAPID_PUBLIC_KEY = 'BEiNXiLGXK9aVd01sTyKCej9dc3LA9-cmbeU-F-jvRjxSC6GDeZcHCvtCzi4cZw5OeSLFgB42FmyPahXEveXh10';

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function getSubscription() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado en el navegador.');
    const reg = await navigator.serviceWorker.ready;
    const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe(options);
      } catch (err) {
        console.error('[Push] subscribe', err);
        const brave = !!(navigator.brave && await navigator.brave.isBrave?.().catch(() => false));
        throw new Error(brave
          ? 'Brave bloquea los avisos: activa "Usar Google Services para mensajes push" en brave://settings/privacy y reinicia.'
          : 'Este navegador no ha podido registrar los avisos (servicio push bloqueado). Prueba con Chrome/Edge normal (no incógnito), sin VPN ni bloqueadores, o desde el móvil con la app instalada.');
      }
    }
    const json = sub.toJSON();
    const { error } = await window.supabaseDB.rpc('save_push_subscription', {
      p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth
    });
    if (error) throw error;
  }

  async function disable() {
    const sub = await getSubscription();
    if (!sub) return;
    await window.supabaseDB.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }

  async function refreshButton(button) {
    if (!button) return;
    const sub = await getSubscription().catch(() => null);
    const active = !!sub && Notification.permission === 'granted';
    button.dataset.active = active ? '1' : '0';
    const homeAction = button.classList.contains('home-notifications-btn');
    const label = homeAction ? 'Avisos' : (active ? 'Desactivar avisos' : 'Activar avisos');
    button.innerHTML = (active
      ? '<i class="fas fa-bell-slash"></i>'
      : '<i class="fas fa-bell"></i>') + (homeAction ? '<span>Avisos</span>' : ' ' + label);
    button.title = active ? 'Desactivar avisos' : 'Activar avisos';
    button.setAttribute('aria-label', button.title);
  }

  window.initPushButton = function () {
    document.querySelectorAll('#pushToggle, .push-toggle-btn').forEach(initOne);
  };

  function initOne(button) {
    if (!(window.isAdmin?.() || window.isTechnician?.())) { button.hidden = true; return; }
    button.hidden = false;
    const homeAction = button.classList.contains('home-notifications-btn');
    button.innerHTML = homeAction
      ? '<i class="fas fa-bell"></i><span>Avisos</span>'
      : '<i class="fas fa-bell"></i> Activar avisos';
    button.title = 'Activar avisos';
    button.setAttribute('aria-label', button.title);
    if (!supported()) {
      button.innerHTML = '<i class="fas fa-bell"></i>' + (homeAction ? '<span>Avisos</span>' : ' Activar avisos');
      button.title = 'Avisos no disponibles';
      button.setAttribute('aria-label', button.title);
      button.onclick = () => showToast('Este navegador no admite avisos. En iPhone: Compartir > "Añadir a pantalla de inicio" y abre la app desde ese icono. En Android usa Chrome.', 'error');
      return;
    }
    refreshButton(button);
    button.onclick = async () => {
      button.disabled = true;
      try {
        if (button.dataset.active === '1') { await disable(); showToast('Avisos desactivados en este dispositivo'); }
        else { await enable(); showToast('Avisos activados en este dispositivo'); }
      } catch (err) {
        console.error(err);
        showToast(err.message || 'No se pudo cambiar el aviso', 'error');
      } finally {
        button.disabled = false;
        refreshButton(button);
      }
    };
  }

  // Al tocar una notificación: ir a la pantalla correspondiente
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'valgom-navigate' && e.data.page && window.canAccessPage?.(e.data.page)) {
        window.navigateTo?.(e.data.page);
      }
    });
  }
  window.addEventListener('valgom:authenticated', () => {
    const page = new URLSearchParams(location.search).get('page');
    if (page && window.canAccessPage?.(page)) {
      history.replaceState(null, '', location.pathname);
      window.navigateTo?.(page);
    }
  });
})();
