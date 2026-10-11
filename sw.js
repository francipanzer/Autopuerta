const CACHE_NAME = 'autopuerta-v44'; // nuevo icono

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  INSTALL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const assets = [
        './',
        'index.html',
        'css/styles.css',
        'manifest.json',                                  // âž• aÃ±adido
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
        // âš ï¸ QUITADOS los js/*.js: ahora se cachean solos bajo demanda
        //    con network-first (ver fetch). AsÃ­ nunca instalas JS viejo.
      ];
      return cache.addAll(assets);
    })
      .then(() => self.skipWaiting())                     // âž• CLAVE: activa sin esperar
      .catch(err => console.warn('[SW] install parcial:', err)) // âž• no revienta en silencio
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  ACTIVATE (limpieza de caches viejas)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())                    // âž• toma el control YA
  );
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PUSH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Valgom', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { page: data.page || '' },
    tag: data.page || 'valgom'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const page = e.notification.data && e.notification.data.page;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) {
        c.postMessage({ type: 'valgom-navigate', page });
        return c.focus();
      }
    }
    return self.clients.openWindow('./' + (page ? '?page=' + encodeURIComponent(page) : ''));
  }));
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  FETCH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (event.request.method !== 'GET') return;

  // âž• AÃ‘ADIDO: Supabase SIEMPRE directo a red, jamÃ¡s por cachÃ©.
  //    Tus datos en la nube no deben leerse nunca de una copia vieja.
  if (url.hostname.endsWith('.supabase.co')) return;

  const isHtml = event.request.mode === 'navigate'
    || event.request.headers.get('accept')?.includes('text/html');
  const isCode = /\.(js|css)$/i.test(url.pathname);       // ðŸ”§ separado del resto
  const isMedia = /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(url.pathname);

  const networkFirst = () =>
    fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request));

  const cacheFirst = () =>
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
    );

  if (isHtml)      event.respondWith(networkFirst());     // siempre Ãºltima versiÃ³n
  else if (isCode) event.respondWith(networkFirst());     // ðŸ”§ ANTES cache-first â†’ causa del bug
  else if (isMedia) event.respondWith(cacheFirst());      // iconos/fuentes: cache-first OK
  else             event.respondWith(networkFirst());
});